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

  function createBoard() {
    const board = {};
    for (let index = 0; index < 8; index += 1) {
      const file = FILES[index];
      board[`${file}1`] = { color: "w", type: BACK_RANK[index] };
      board[`${file}2`] = { color: "w", type: "p" };
      board[`${file}7`] = { color: "b", type: "p" };
      board[`${file}8`] = { color: "b", type: BACK_RANK[index] };
    }
    return board;
  }

  function createGame() {
    const state = {
      board: createBoard(),
      turn: "w",
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      enPassant: null,
      lastMove: null,
      over: false,
      thinking: false,
      moveNumber: 1,
      halfmoveClock: 0,
      repetitionCounts: {}
    };
    recordPosition(state);
    return state;
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
      lastMove: source.lastMove ? { ...source.lastMove } : null,
      repetitionCounts: { ...source.repetitionCounts }
    };
  }

  function coords(square) {
    return [FILES.indexOf(square[0]), Number(square[1])];
  }

  function squareAt(fileIndex, rank) {
    if (fileIndex < 0 || fileIndex > 7 || rank < 1 || rank > 8) return null;
    return `${FILES[fileIndex]}${rank}`;
  }

  function effectiveEnPassant(state) {
    if (!state.enPassant) return "-";
    const [file, rank] = coords(state.enPassant);
    const pawnRank = rank + (state.turn === "w" ? -1 : 1);
    const canCapture = [-1, 1].some(fileStep => {
      const square = squareAt(file + fileStep, pawnRank);
      const piece = square ? state.board[square] : null;
      return piece?.color === state.turn && piece.type === "p";
    });
    return canCapture ? state.enPassant : "-";
  }

  function positionKey(state) {
    const pieces = Object.entries(state.board)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([square, piece]) => `${square}${piece.color}${piece.type}`)
      .join(",");
    const castling = ["wK", "wQ", "bK", "bQ"]
      .filter(right => state.castling[right])
      .join("") || "-";
    return `${pieces}|${state.turn}|${castling}|${effectiveEnPassant(state)}`;
  }

  function recordPosition(state) {
    const key = positionKey(state);
    state.repetitionCounts[key] = (state.repetitionCounts[key] || 0) + 1;
  }

  function pushMove(moves, state, from, to, extras = {}) {
    const target = state.board[to];
    // 체스에서는 킹을 직접 잡지 않고 체크메이트로 끝낸다.
    if (target?.type === "k") return;
    moves.push({
      from,
      to,
      capture: target ? { ...target } : null,
      ...extras
    });
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
            pushMove(moves, state, from, to, {
              enPassant: true,
              capture: { color: color === "w" ? "b" : "w", type: "p" }
            });
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
    const kingSquare = Object.keys(state.board).find(square => {
      const piece = state.board[square];
      return piece.color === color && piece.type === "k";
    });
    if (!kingSquare) return true;
    return isSquareAttacked(state, kingSquare, color === "w" ? "b" : "w");
  }

  function disableRookCastling(state, color, square) {
    const rank = color === "w" ? 1 : 8;
    if (square === `a${rank}`) state.castling[`${color}Q`] = false;
    if (square === `h${rank}`) state.castling[`${color}K`] = false;
  }

  function applyMove(state, move) {
    const piece = state.board[move.from];
    const captured = state.board[move.to];
    if (!piece) return;

    state.halfmoveClock = piece.type === "p" || captured || move.enPassant
      ? 0
      : state.halfmoveClock + 1;

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
    recordPosition(state);
  }

  function legalMovesFor(state, color) {
    return generatePseudoMoves(state, color).filter(move => {
      const simulation = cloneGame(state);
      applyMove(simulation, move);
      return !isInCheck(simulation, color);
    });
  }

  function isInsufficientMaterial(state) {
    const nonKings = Object.entries(state.board)
      .filter(([, piece]) => piece.type !== "k");
    if (nonKings.some(([, piece]) => ["p", "r", "q"].includes(piece.type))) return false;
    if (nonKings.length === 0) return true;
    if (nonKings.length === 1) return ["b", "n"].includes(nonKings[0][1].type);
    if (nonKings.every(([, piece]) => piece.type === "b")) {
      const bishopSquareColors = new Set(nonKings.map(([square]) => {
        const [file, rank] = coords(square);
        return (file + rank) % 2;
      }));
      return bishopSquareColors.size === 1;
    }
    return false;
  }

  function getDrawReason(state) {
    if (state.halfmoveClock >= 100) return "fiftyMove";
    if ((state.repetitionCounts[positionKey(state)] || 0) >= 3) return "threefold";
    if (isInsufficientMaterial(state)) return "insufficientMaterial";
    return null;
  }

  window.FerretChessEngine = Object.freeze({
    FILES,
    PIECE_NAME,
    PIECE_SYMBOL,
    VALUE,
    createGame,
    cloneGame,
    coords,
    applyMove,
    legalMovesFor,
    isInCheck,
    getDrawReason
  });
})();
