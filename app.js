(() => {
  "use strict";

  const FILES = "abcdefgh";
  const BACK_RANK = ["r", "n", "b", "q", "k", "b", "n", "r"];
  const PIECE_NAME = { p: "폰", n: "나이트", b: "비숍", r: "룩", q: "퀸", k: "킹" };
  const PIECE_SYMBOL = {
    w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
    b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" }
  };
  const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

  const theatre = document.querySelector("#theatre");
  const titleScreen = document.querySelector("#title-screen");
  const gameScreen = document.querySelector("#game-screen");
  const boardElement = document.querySelector("#chessboard");
  const statusElement = document.querySelector("#game-status");
  const modal = document.querySelector("#modal");
  const modalTitle = document.querySelector("#modal-title");
  const modalCopy = document.querySelector("#modal-copy");
  const closeModalButton = document.querySelector("#close-modal");
  const hintButton = document.querySelector("#hint");
  const restartButton = document.querySelector("#restart");

  let game = createGame();
  let selected = null;
  let selectedMoves = [];
  let hintSquares = [];
  let aiTimer = null;

  function createBoard() {
    const board = {};
    for (let index = 0; index < 8; index =+ 1) {
      const file = FILES[index];
      board[`${file}0`] = { color: "w", type: BACK_RANK[index] };
      board[`${file}1`] = { color: "w", type: "p" };
      board[`${file}6`] = { color: "b", type: "p" };
      board[`${file}7`] = { color: "b", type: BACK_RANK[index] };
    }
    return board;
  }

  function createGame() {
    return {
      board: createBoard(),
      turn: "w",
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      enPassant: null,
      lastMove: null,
      over: false,
      thinking: false,
      moveNumber: 1
    };
  }

  function cloneGame(source) {
    const board = {};
    Object.entries(source.board).forEach(([square, piece]) => {
      board[square] = { ...piece };
    });
    return {
      ...source,
      board,
      castling: { ...source.castling },
      lastMove: source.lastMove ? { ...source.lastMove } : null
    };
  }

  function coords(square) {
    return [FILES.indexOf(square[0]), Number(square[1])];
  }

  function squareAt(fileIndex, rank) {
    if (fileIndex < 0 || fileIndex > 7 || rank < 1 || rank > 8) return null;
    return `${FILES[fileIndex]}${rank}`;
  }

  function pushMove(moves, state, from, to, extras = {}) {
    const target = state.board[to];
    moves.push({ from, to, capture: target ? { ...target } : null, ...extras });
  }

  function generatePseudoMoves(state, color) {
    const moves = [];
    Object.entries(state.board).forEach(([from, piece]) => {
      if (piece.color !== color) return;
      const [file, rank] = coords(from);

      if (piece.type === "p") {
        const direction = color === "w" ? 1 : -1;
        const startRank = color === "w" ? 2 : 7;
        const promotionRank = color === "w" ? 8 : 1;
        const one = squareAt(file, rank + direction);
        const two = squareAt(file, rank + direction * 2);
        if (one && !state.board[one]) {
          pushMove(moves, state, from, one, rank + direction === promotionRank ? { promotion: "q" } : {});
          if (rank === startRank && two && !state.board[two]) {
            pushMove(moves, state, from, two, { doublePawn: true });
          }
        }
        [-1, 1].forEach(fileStep => {
          const to = squareAt(file + fileStep, rank + direction);
          if (!to) return;
          const target = state.board[to];
          if (target && target.color !== color) {
            pushMove(moves, state, from, to, rank + direction === promotionRank ? { promotion: "q" } : {});
          } else if (to === state.enPassant) {
            pushMove(moves, state, from, to, { enPassant: true, capture: { color: color === "w" ? "b" : "w", type: "p" } });
          }
        });
        return;
      }

      if (piece.type === "n") {
        [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]].forEach(([df, dr]) => {
          const to = squareAt(file + df, rank + dr);
          if (to && (!state.board[to] || state.board[to].color !== color)) pushMove(moves, state, from, to);
        });
        return;
      }

      if (["b", "r", "q"].includes(piece.type)) {
        const directions = [];
        if (["b", "q"].includes(piece.type)) directions.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
        if (["r", "q"].includes(piece.type)) directions.push([1, 0], [-1, 0], [0, 1], [0, -1]);
        directions.forEach(([df, dr]) => {
          let nextFile = file + df;
          let nextRank = rank + dr;
          while (true) {
            const to = squareAt(nextFile, nextRank);
            if (!to) break;
            const target = state.board[to];
            if (!target) pushMove(moves, state, from, to);
            else {
              if (target.color !== color) pushMove(moves, state, from, to);
              break;
            }
            nextFile += df;
            nextRank += dr;
          }
        });
        return;
      }

      if (piece.type === "k") {
        for (let df = -1; df <= 1; df += 1) {
          for (let dr = -1; dr <= 1; dr += 1) {
            if (!df && !dr) continue;
            const to = squareAt(file + df, rank + dr);
            if (to && (!state.board[to] || state.board[to].color !== color)) pushMove(moves, state, from, to);
          }
        }

        const homeRank = color === "w" ? 1 : 8;
        const enemy = color === "w" ? "b" : "w";
        if (from === `e${homeRank}` && !isSquareAttacked(state, from, enemy)) {
          if (state.castling[`${color}K`] && state.board[`h${homeRank}`]?.type === "r" &&
              !state.board[`f${homeRank}`] && !state.board[`g${homeRank}`] &&
              !isSquareAttacked(state, `f${homeRank}`, enemy) && !isSquareAttacked(state, `g${homeRank}`, enemy)) {
            pushMove(moves, state, from, `g${homeRank}`, { castle: "K" });
          }
          if (state.castling[`${color}Q`] && state.board[`a${homeRank}`]?.type === "r" &&
              !state.board[`b${homeRank}`] && !state.board[`c${homeRank}`] && !state.board[`d${homeRank}`] &&
              !isSquareAttacked(state, `d${homeRank}`, enemy) && !isSquareAttacked(state, `c${homeRank}`, enemy)) {
            pushMove(moves, state, from, `c${homeRank}`, { castle: "Q" });
          }
        }
      }
    });
    return moves;
  }

  function isSquareAttacked(state, target, byColor) {
    const [file, rank] = coords(target);
    const pawnRank = rank + (byColor === "w" ? -1 : 1);
    for (const df of [-1, 1]) {
      const square = squareAt(file + df, pawnRank);
      if (square && state.board[square]?.color === byColor && state.board[square]?.type === "p") return true;
    }

    for (const [df, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) {
      const square = squareAt(file + df, rank + dr);
      if (square && state.board[square]?.color === byColor && state.board[square]?.type === "n") return true;
    }

    for (const [df, dr, validTypes] of [
      [1, 0, ["r", "q"]], [-1, 0, ["r", "q"]], [0, 1, ["r", "q"]], [0, -1, ["r", "q"]],
      [1, 1, ["b", "q"]], [1, -1, ["b", "q"]], [-1, 1, ["b", "q"]], [-1, -1, ["b", "q"]]
    ]) {
      let nextFile = file + df;
      let nextRank = rank + dr;
      while (true) {
        const square = squareAt(nextFile, nextRank);
        if (!square) break;
        const piece = state.board[square];
        if (piece) {
          if (piece.color === byColor && validTypes.includes(piece.type)) return true;
          break;
        }
        nextFile += df;
        nextRank += dr;
      }
    }

    for (let df = -1; df <= 1; df += 1) {
      for (let dr = -1; dr <= 1; dr += 1) {
        if (!df && !dr) continue;
        const square = squareAt(file + df, rank + dr);
        if (square && state.board[square]?.color === byColor && state.board[square]?.type === "k") return true;
      }
    }
    return false;
  }

  function isInCheck(state, color) {
    const kingSquare = Object.keys(state.board).find(square => state.board[square].color === color && state.board[square].type === "k");
    if (!kingSquare) return true;
    return isSquareAttacked(state, kingSquare, color === "w" ? "b" : "w");
  }

  function applyMove(state, move) {
    const piece = state.board[move.from];
    const captured = state.board[move.to];
    if (!piece) return;

    delete state.board[move.from];
    if (move.enPassant) {
      const [targetFile, targetRank] = coords(move.to);
      delete state.board[squareAt(targetFile, targetRank + (piece.color === "w" ? -1 : 1))];
    }
    state.board[move.to] = { color: piece.color, type: move.promotion || piece.type };

    if (move.castle) {
      const rank = piece.color === "w" ? 1 : 8;
      const rookFrom = move.castle === "K" ? `h${rank}` : `a${rank}`;
      const rookTo = move.castle === "K" ? `f${rank}` : `d${rank}`;
      state.board[rookTo] = state.board[rookFrom];
      delete state.board[rookFrom];
    }

    if (piece.type === "k") {
      state.castling[`${piece.color}K`] = false;
      state.castling[`${piece.color}Q`] = false;
    }
    if (piece.type === "r") disableRookCastling(state, piece.color, move.from);
    if (captured?.type === "r") disableRookCastling(state, captured.color, move.to);

    state.enPassant = null;
    if (piece.type === "p" && move.doublePawn) {
      const [file, rank] = coords(move.from);
      state.enPassant = squareAt(file, rank + (piece.color === "w" ? 1 : -1));
    }

    state.lastMove = { from: move.from, to: move.to };
    if (piece.color === "b") state.moveNumber += 1;
    state.turn = piece.color === "w" ? "b" : "w";
  }

  function disableRookCastling(state, color, square) {
    const rank = color === "w" ? 1 : 8;
    if (square === `a${rank}`) state.castling[`${color}Q`] = false;
    if (square === `h${rank}`) state.castling[`${color}K`] = false;
  }

  function legalMovesFor(state, color) {
    return generatePseudoMoves(state, color).filter(move => {
      const simulation = cloneGame(state);
      applyMove(simulation, move);
      return !isInCheck(simulation, color);
    });
  }

  function legalMovesFrom(square) {
    return legalMovesFor(game, game.turn).filter(move => move.from === square);
  }

  function moveScore(state, move, color) {
    let score = move.capture ? VALUE[move.capture.type] * 12 : 0;
    if (move.promotion) score += VALUE.q * 8;
    if (move.castle) score += 180;
    const simulation = cloneGame(state);
    applyMove(simulation, move);
    const enemy = color === "w" ? "b" : "w";
    if (isInCheck(simulation, enemy)) score += 75;
    const [, targetRank] = coords(move.to);
    score += color === "w" ? targetRank * 3 : (9 - targetRank) * 3;
    score += Math.random() * 45;
    return score;
  }

  function chooseMove(color) {
    const moves = legalMovesFor(game, color);
    if (!moves.length) return null;
    return moves
      .map(move => ({ move, score: moveScore(game, move, color) }))
      .sort((a, b) => b.score - a.score)[0].move;
  }

  function renderBoard() {
    boardElement.replaceChildren();
    for (let displayRow = 0; displayRow < 8; displayRow += 1) {
      for (let displayColumn = 0; displayColumn < 8; displayColumn += 1) {
        const square = `${FILES[displayRow]}${displayColumn + 1}`;
        const piece = game.board[square];
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = `square ${(displayRow + displayColumn) % 2 ? "dark" : "light"}`;
        cell.dataset.square = square;
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-label", square);

        if (game.lastMove && (game.lastMove.from === square || game.lastMove.to === square)) cell.classList.add("last");
        if (selected === square) cell.classList.add("selected");
        const legal = selectedMoves.find(move => move.to === square);
        if (legal) cell.classList.add(legal.capture ? "capture" : "legal");
        if (hintSquares.includes(square)) cell.classList.add("hint");

        if (piece) {
          const token = document.createElement("span");
          token.className = `piece ${piece.color === "w" ? "white" : "black"} ${piece.type === "p" ? "pawn" : "major"}`;
          token.textContent = PIECE_SYMBOL[piece.color][piece.type];
          token.setAttribute("aria-hidden", "true");
          cell.append(token);
          cell.setAttribute("aria-label", `${piece.color === "w" ? "백" : "흑"} ${PIECE_NAME[piece.type]} ${square}`);
        }

        cell.addEventListener("click", () => handleSquare(square));
        boardElement.append(cell);
      }
    }
  }

  function handleSquare(square) {
    if (game.over || game.thinking || game.turn !== "w") return;
    const piece = game.board[square];
    const chosenMove = selectedMoves.find(move => move.to === square);
    hintSquares = [];

    if (selected && chosenMove) {
      applyMove(game, chosenMove);
      selected = null;
      selectedMoves = [];
      renderBoard();
      if (updateStatus()) return;
      queueAiMove();
      return;
    }

    if (piece?.color === "w") {
      selected = square;
      selectedMoves = legalMovesFrom(square);
    } else {
      selected = null;
      selectedMoves = [];
    }
    renderBoard();
  }

  function updateStatus() {
    const moves = legalMovesFor(game, game.turn);
    if (!moves.length) {
      game.over = true;
      const checked = isInCheck(game, game.turn);
      if (checked) statusElement.textContent = game.turn === "w" ? "체크메이트 · 버찌 승리" : "체크메이트 · 쩨비 승리!";
      else statusElement.textContent = "스테일메이트 · 무승부";
      hintButton.disabled = true;
      return true;
    }
    if (game.thinking) statusElement.textContent = "버찌가 생각 중…";
    else if (game.turn === "w") statusElement.textContent = isInCheck(game, "w") ? "쩨비 체크!" : "쩨비의 차례";
    else statusElement.textContent = isInCheck(game, "b") ? "버찌 체크!" : "버찌의 차례";
    return false;
  }

  function queueAiMove() {
    game.thinking = true;
    hintButton.disabled = true;
    updateStatus();
    window.clearTimeout(aiTimer);
    aiTimer = window.setTimeout(() => {
      const move = chooseMove("b");
      if (move) applyMove(game, move);
      game.thinking = false;
      hintButton.disabled = false;
      renderBoard();
      updateStatus();
    }, 650);
  }

  function resetGame() {
    window.clearTimeout(aiTimer);
    game = createGame();
    selected = null;
    selectedMoves = [];
    hintSquares = [];
    hintButton.disabled = false;
    renderBoard();
    updateStatus();
  }

  function switchScreen(showGame) {
    theatre.classList.add("curtain-call");
    window.setTimeout(() => {
      titleScreen.classList.toggle("active", !showGame);
      gameScreen.classList.toggle("active", showGame);
      titleScreen.setAttribute("aria-hidden", String(showGame));
      gameScreen.setAttribute("aria-hidden", String(!showGame));
      if (showGame) resetGame();
      window.setTimeout(() => theatre.classList.remove("curtain-call"), 80);
    }, 520);
  }

  function showHint() {
    if (game.over || game.thinking || game.turn !== "w") return;
    const move = chooseMove("w");
    if (!move) return;
    hintSquares = [move.from, move.to];
    renderBoard();
    statusElement.textContent = "초록색 두 칸을 살펴봐!";
    window.setTimeout(() => {
      hintSquares = [];
      renderBoard();
      updateStatus();
    }, 2200);
  }

  const modalContent = {
    how: {
      title: "게임 방법",
      html: "<p>쩨비는 왼쪽의 흰색 기물로 먼저 움직입니다. 말을 누른 뒤 초록색으로 표시된 칸을 선택하세요.</p><p>버찌의 킹을 체크메이트하면 공연의 주인공이 됩니다.</p>"
    },
    credits: {
      title: "크레딧 · 팬게임 표기",
      html: "<p>《버찌 체스》는 버찌를 테마로 만든 비공식 팬게임입니다.</p><p>캐릭터와 원작의 권리는 각 권리자에게 있습니다.</p>"
    }
  };

  function openModal(kind) {
    const content = modalContent[kind];
    if (!content) return;
    modalTitle.textContent = content.title;
    modalCopy.innerHTML = content.html;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    closeModalButton.focus();
  }

  function closeModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  document.querySelector("#start-game").addEventListener("click", () => switchScreen(true));
  document.querySelector("#back-title").addEventListener("click", () => switchScreen(false));
  document.querySelector("#restart").addEventListener("click", resetGame);
  hintButton.addEventListener("click", showHint);
  document.querySelectorAll("[data-modal]").forEach(button => {
    button.addEventListener("click", () => openModal(button.dataset.modal));
  });
  closeModalButton.addEventListener("click", closeModal);
  modal.addEventListener("click", event => { if (event.target === modal) closeModal(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeModal(); });

  renderBoard();
})();
