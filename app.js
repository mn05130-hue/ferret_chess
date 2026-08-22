(() => {
  "use strict";

  const Engine = window.FerretChessEngine;
  const ChessAI = window.FerretChessAI;
  const Cutscenes = window.FerretChessCutscenes;
  const {
    FILES,
    PIECE_NAME,
    PIECE_SYMBOL,
    createGame,
    applyMove,
    legalMovesFor,
    isInCheck,
    getDrawReason
  } = Engine;

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
  const DIFFICULTY_DEPTH = Object.freeze({ low: 1, medium: 2, high: 3 });

  let game = createGame();
  let selected = null;
  let selectedMoves = [];
  let hintSquares = [];
  let aiTimer = null;
  let hintTimer = null;
  let modalReturnFocus = null;
  let aiDepth = DIFFICULTY_DEPTH.medium;
  let presenting = false;
  let gameSession = 0;

  function selectedAiDepth() {
    const selectedDifficulty = document.querySelector('input[name="difficulty"]:checked');
    return DIFFICULTY_DEPTH[selectedDifficulty?.value] || DIFFICULTY_DEPTH.medium;
  }

  function legalMovesFrom(square) {
    return legalMovesFor(game, game.turn).filter(move => move.from === square);
  }

  function renderBoard() {
    boardElement.replaceChildren();
    for (let displayRow = 0; displayRow < 8; displayRow += 1) {
      for (let displayColumn = 0; displayColumn < 8; displayColumn += 1) {
        // 캐릭터가 서로 마주 보는 좌우 진행 방향을 의도적으로 유지한다.
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

  function cutsceneRequestsFor(move, moverColor) {
    const requests = [];
    if (move.castle) {
      requests.push({
        id: "castle",
        side: moverColor,
        copy: `${move.castle === "K" ? "킹사이드" : "퀸사이드"} 캐슬링으로 킹과 룩이 함께 이동했습니다.`
      });
    }
    if (move.promotion) requests.push({ id: "promotion", side: moverColor });

    const defender = game.turn;
    const checked = isInCheck(game, defender);
    const checkmated = checked && legalMovesFor(game, defender).length === 0;
    if (checkmated) {
      requests.push({
        id: "checkmate",
        side: moverColor,
        copy: `${moverColor === "w" ? "쩨비" : "버찌"}의 마지막 수가 승부를 결정했습니다.`
      });
    } else if (checked && !game.over) {
      requests.push({ id: "check", side: moverColor });
    }
    return requests;
  }

  function focusScreen(screen) {
    window.requestAnimationFrame(() => screen.focus({ preventScroll: true }));
  }

  async function playMoveCutscenes(move, moverColor, session) {
    const requests = cutsceneRequestsFor(move, moverColor);
    if (!requests.length || session !== gameSession) return;

    presenting = true;
    hintButton.disabled = true;
    gameScreen.inert = true;
    try {
      await Cutscenes.playSequence(requests);
    } finally {
      if (session !== gameSession) return;
      presenting = false;
      gameScreen.inert = !gameScreen.classList.contains("active");
      hintButton.disabled = game.over || game.thinking || game.turn !== "w";
      if (gameScreen.classList.contains("active")) focusScreen(gameScreen);
    }
  }

  async function handleSquare(square) {
    if (game.over || game.thinking || presenting || game.turn !== "w") return;
    const piece = game.board[square];
    const chosenMove = selectedMoves.find(move => move.to === square);
    hintSquares = [];

    if (selected && chosenMove) {
      const session = gameSession;
      applyMove(game, chosenMove);
      selected = null;
      selectedMoves = [];
      renderBoard();
      const ended = updateStatus();
      await playMoveCutscenes(chosenMove, "w", session);
      if (session === gameSession && !ended) queueAiMove();
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

  function finishAsDraw(reason) {
    const labels = {
      fiftyMove: "50수 규칙 · 무승부",
      threefold: "같은 포지션 3회 반복 · 무승부",
      insufficientMaterial: "체크메이트 불가능 · 기물 부족 무승부"
    };
    game.over = true;
    hintButton.disabled = true;
    statusElement.textContent = labels[reason];
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

    const drawReason = getDrawReason(game);
    if (drawReason) {
      finishAsDraw(drawReason);
      return true;
    }

    if (game.thinking) statusElement.textContent = "버찌가 생각 중…";
    else if (game.turn === "w") statusElement.textContent = isInCheck(game, "w") ? "쩨비 체크!" : "쩨비의 차례";
    else statusElement.textContent = isInCheck(game, "b") ? "버찌 체크!" : "버찌의 차례";
    return false;
  }

  function queueAiMove() {
    const session = gameSession;
    game.thinking = true;
    hintButton.disabled = true;
    updateStatus();
    window.clearTimeout(aiTimer);
    aiTimer = window.setTimeout(async () => {
      if (session !== gameSession) return;
      const move = ChessAI.chooseMove(game, "b", aiDepth);
      if (!move || session !== gameSession) {
        game.thinking = false;
        updateStatus();
        return;
      }

      applyMove(game, move);
      game.thinking = false;
      hintButton.disabled = true;
      renderBoard();
      const ended = updateStatus();
      await playMoveCutscenes(move, "b", session);
      if (session === gameSession && !ended) hintButton.disabled = false;
    }, 650);
  }

  function resetGame() {
    gameSession += 1;
    window.clearTimeout(aiTimer);
    window.clearTimeout(hintTimer);
    Cutscenes.cancelAll();
    presenting = false;
    game = createGame();
    selected = null;
    selectedMoves = [];
    hintSquares = [];
    hintButton.disabled = false;
    gameScreen.inert = !gameScreen.classList.contains("active");
    renderBoard();
    updateStatus();
  }

  function switchScreen(showGame) {
    if (!showGame) {
      gameSession += 1;
      window.clearTimeout(aiTimer);
      window.clearTimeout(hintTimer);
      Cutscenes.cancelAll();
      presenting = false;
    }

    theatre.classList.add("curtain-call");
    window.setTimeout(() => {
      titleScreen.classList.toggle("active", !showGame);
      gameScreen.classList.toggle("active", showGame);
      titleScreen.setAttribute("aria-hidden", String(showGame));
      gameScreen.setAttribute("aria-hidden", String(!showGame));
      titleScreen.inert = showGame;
      gameScreen.inert = !showGame;
      if (showGame) {
        aiDepth = selectedAiDepth();
        resetGame();
      }
      focusScreen(showGame ? gameScreen : titleScreen);
      window.setTimeout(() => theatre.classList.remove("curtain-call"), 80);
    }, 520);
  }

  function showHint() {
    if (game.over || game.thinking || presenting || game.turn !== "w") return;
    const session = gameSession;
    const move = ChessAI.chooseMove(game, "w");
    if (!move || session !== gameSession) return;
    hintSquares = [move.from, move.to];
    renderBoard();
    statusElement.textContent = "초록색 두 칸을 살펴봐!";
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => {
      if (session !== gameSession) return;
      hintSquares = [];
      renderBoard();
      updateStatus();
    }, 2200);
  }

  const modalContent = {
    how: {
      title: "게임 방법",
      html: "<p>쩨비는 왼쪽의 흰색 기물로 먼저 움직입니다. 말을 누른 뒤 초록색으로 표시된 칸을 선택하세요.</p><p>버찌의 킹을 체크메이트하면 공연의 주인공이 됩니다.</p><p>스테일메이트, 같은 포지션 3회 반복, 기물 부족 또는 폰 이동과 잡기 없이 양쪽이 각각 50번 움직이면 무승부입니다.</p>"
    },
    credits: {
      title: "크레딧 · 팬게임 표기",
      html: "<p>《버찌 체스》는 버찌를 테마로 만든 비공식 팬게임입니다.</p><p>캐릭터와 원작의 권리는 각 권리자에게 있습니다.</p>"
    }
  };

  function openModal(kind) {
    const content = modalContent[kind];
    if (!content) return;
    modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalTitle.textContent = content.title;
    modalCopy.innerHTML = content.html;
    modal.inert = false;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    closeModalButton.focus();
  }

  function closeModal() {
    if (!modal.classList.contains("open")) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    modal.inert = true;
    if (modalReturnFocus?.isConnected && !modalReturnFocus.closest("[inert]")) {
      modalReturnFocus.focus({ preventScroll: true });
    }
    modalReturnFocus = null;
  }

  document.querySelector("#start-game").addEventListener("click", () => switchScreen(true));
  document.querySelector("#back-title").addEventListener("click", () => switchScreen(false));
  restartButton.addEventListener("click", resetGame);
  hintButton.addEventListener("click", showHint);
  document.querySelectorAll("[data-modal]").forEach(button => {
    button.addEventListener("click", () => openModal(button.dataset.modal));
  });
  closeModalButton.addEventListener("click", closeModal);
  modal.addEventListener("click", event => { if (event.target === modal) closeModal(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeModal(); });

  renderBoard();
  updateStatus();
})();
