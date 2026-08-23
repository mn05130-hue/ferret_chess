(() => {
  "use strict";

  const Engine = globalThis.FerretChessEngine;
  const Openings = globalThis.FerretChessOpenings;
  const {
    VALUE,
    VARIANT,
    HILL_SQUARES,
    TACTICAL_UNITS,
    cloneGame,
    coords,
    applyMove,
    legalMovesFor,
    isInCheck,
    getDrawReason
  } = Engine;

  const MATE_SCORE = 1_000_000;
  const SEARCH_DEPTH = 3;
  const TACTICAL_VALUE = Object.freeze({
    p: 240,
    s: 285,
    h: 400,
    a: 350,
    l: 365,
    c: 430,
    g: 12000
  });

  function tacticalPieceValue(piece) {
    const stats = TACTICAL_UNITS[piece.type];
    if (!stats) return 0;
    const hpRatio = Math.max(0, piece.hp) / piece.maxHp;
    return (TACTICAL_VALUE[piece.type] || 200) * (.35 + hpRatio * .65);
  }

  function mobilityCount(state, color, knownMobility) {
    return knownMobility?.[color] ?? legalMovesFor(state, color).length;
  }

  function evaluateTacticalPosition(state, aiColor, knownMobility = null) {
    const enemyColor = aiColor === "w" ? "b" : "w";
    let score = 0;
    Object.entries(state.board).forEach(([square, piece]) => {
      const [file, rank] = coords(square);
      const direction = piece.color === "w" ? 1 : -1;
      const progress = piece.color === "w" ? rank - 1 : 8 - rank;
      const center = 7 - (Math.abs(file - 3.5) + Math.abs(rank - 4.5));
      let value = tacticalPieceValue(piece);
      if (["p", "s", "h", "c"].includes(piece.type)) value += progress * 4;
      if (["h", "l", "c", "g"].includes(piece.type)) value += center * 2;
      if (piece.type === "a") value += (direction > 0 ? 8 - rank : rank - 1) * 2;
      score += piece.color === aiColor ? value : -value;
    });

    const myActions = mobilityCount(state, aiColor, knownMobility);
    const enemyActions = mobilityCount(state, enemyColor, knownMobility);
    score += (myActions - enemyActions) * 2.5;

    const shielded = state.effects?.shield && state.board[state.effects.shield.square];
    if (shielded) score += (shielded.color === aiColor ? 1 : -1) * tacticalPieceValue(shielded) * .2;
    const frozen = state.effects?.freeze && state.board[state.effects.freeze.square];
    if (frozen) score += (frozen.color === aiColor ? -1 : 1) * tacticalPieceValue(frozen) * .22;
    return score;
  }

  function positionalScore(square, piece) {
    const [file, rank] = coords(square);
    const center = 7 - (Math.abs(file - 3.5) + Math.abs(rank - 4.5));

    if (piece.type === "p") {
      const advancement = piece.color === "w" ? rank - 2 : 7 - rank;
      return advancement * 8 + center * 2;
    }
    if (piece.type === "n") return center * 10;
    if (piece.type === "b") return center * 5;
    if (["r", "q"].includes(piece.type)) return center * 2;
    if (piece.type === "k") {
      const homeRank = piece.color === "w" ? 1 : 8;
      if (square === `g${homeRank}` || square === `c${homeRank}`) return 35;
    }
    return 0;
  }

  function evaluatePosition(state, aiColor, knownMobility = null) {
    if (state.variant === VARIANT.TACTICAL) return evaluateTacticalPosition(state, aiColor, knownMobility);
    const enemyColor = aiColor === "w" ? "b" : "w";
    let score = 0;

    Object.entries(state.board).forEach(([square, piece]) => {
      const material = piece.type === "k" ? 0 : VALUE[piece.type];
      const value = material + positionalScore(square, piece);
      score += piece.color === aiColor ? value : -value;
    });

    const myMobility = mobilityCount(state, aiColor, knownMobility);
    const enemyMobility = mobilityCount(state, enemyColor, knownMobility);
    score += (myMobility - enemyMobility) * 2;
    if (isInCheck(state, enemyColor)) score += 35;
    if (isInCheck(state, aiColor)) score -= 35;

    if (state.variant === VARIANT.THREE_CHECK) {
      score += ((state.checksGiven[aiColor] || 0) - (state.checksGiven[enemyColor] || 0)) * 450;
    }
    if (state.variant === VARIANT.KING_OF_THE_HILL) {
      const hillDistance = color => {
        const kingSquare = Object.keys(state.board).find(square => state.board[square].color === color && state.board[square].type === "k");
        if (!kingSquare) return 8;
        const [kingFile, kingRank] = coords(kingSquare);
        return Math.min(...HILL_SQUARES.map(square => {
          const [hillFile, hillRank] = coords(square);
          const fileDistance = Math.abs(kingFile - hillFile);
          const rankDistance = Math.abs(kingRank - hillRank);
          if (!fileDistance && !rankDistance) return 0;
          return !fileDistance || !rankDistance || fileDistance === rankDistance ? 1 : 2;
        }));
      };
      score += (hillDistance(enemyColor) - hillDistance(aiColor)) * 90;
    }

    const shielded = state.effects?.shield;
    if (shielded) {
      const piece = state.board[shielded.square];
      if (piece) score += (piece.color === aiColor ? 1 : -1) * (VALUE[piece.type] || 100) * .22;
    }
    const frozen = state.effects?.freeze;
    if (frozen) {
      const piece = state.board[frozen.square];
      if (piece) score += (piece.color === aiColor ? -1 : 1) * (VALUE[piece.type] || 100) * .28;
    }
    return score;
  }

  function variantWinScore(state, aiColor, ply) {
    if (!state.variantWinner) return null;
    return state.variantWinner === aiColor ? MATE_SCORE - ply : -MATE_SCORE + ply;
  }

  function moveOrderScore(state, move) {
    const movingPiece = state.board[move.from];
    let score = 0;
    if (state.variant === VARIANT.TACTICAL) {
      if (move.capture) {
        const targetValue = tacticalPieceValue(move.capture);
        const expectedDamage = TACTICAL_UNITS[movingPiece.type]?.damage || 1;
        score += targetValue * 5 + expectedDamage * 35;
        if (move.capture.type === "g") score += MATE_SCORE / 2;
        if (expectedDamage >= move.capture.hp) score += targetValue * 4;
      }
      if (move.action === "moveAttack") score += 55;
      if (move.ranged) score += 20;

      const simulation = cloneGame(state);
      applyMove(simulation, move);
      if (simulation.variantWinner === movingPiece.color) score += MATE_SCORE;
      return score;
    }
    if (move.capture) {
      score += VALUE[move.capture.type] * 10;
      score -= VALUE[movingPiece.type];
    }
    if (move.promotion) score += VALUE.q * 8;
    if (move.castle) score += 150;

    const simulation = cloneGame(state);
    applyMove(simulation, move);
    if (simulation.variantWinner === movingPiece.color) score += MATE_SCORE;
    if (isInCheck(simulation, simulation.turn)) score += 80;
    return score;
  }

  function orderedMoves(state, color) {
    return legalMovesFor(state, color).sort(
      (a, b) => moveOrderScore(state, b) - moveOrderScore(state, a)
    );
  }

  function noMoveScore(state, color, aiColor, ply) {
    if (state.variant === VARIANT.TACTICAL) {
      return evaluatePosition(state, aiColor, { [color]: 0 });
    }
    if (state.variant !== VARIANT.STANDARD) return 0;
    if (isInCheck(state, color)) {
      return color === aiColor ? -MATE_SCORE + ply : MATE_SCORE - ply;
    }
    return 0;
  }

  function minimax(state, depth, alpha, beta, aiColor, ply) {
    const variantScore = variantWinScore(state, aiColor, ply);
    if (variantScore !== null) return variantScore;

    const color = state.turn;
    const drawReason = getDrawReason(state);

    if (depth === 0 || drawReason) {
      const moves = legalMovesFor(state, color);
      if (!moves.length) return noMoveScore(state, color, aiColor, ply);
      if (drawReason) return 0;
      return evaluatePosition(state, aiColor, { [color]: moves.length });
    }

    const moves = orderedMoves(state, color);
    if (!moves.length) return noMoveScore(state, color, aiColor, ply);

    if (color === aiColor) {
      let bestScore = -Infinity;
      for (const move of moves) {
        const next = cloneGame(state);
        applyMove(next, move);
        const score = minimax(next, depth - 1, alpha, beta, aiColor, ply + 1);
        bestScore = Math.max(bestScore, score);
        alpha = Math.max(alpha, bestScore);
        if (alpha >= beta) break;
      }
      return bestScore;
    }

    let bestScore = Infinity;
    for (const move of moves) {
      const next = cloneGame(state);
      applyMove(next, move);
      const score = minimax(next, depth - 1, alpha, beta, aiColor, ply + 1);
      bestScore = Math.min(bestScore, score);
      beta = Math.min(beta, bestScore);
      if (alpha >= beta) break;
    }
    return bestScore;
  }

  function chooseMove(state, color, depth = SEARCH_DEPTH, history = []) {
    if (state.variantWinner) return null;
    const bookMove = state.variant === VARIANT.STANDARD
      ? Openings?.chooseBookMove(state, color, history)
      : null;
    if (bookMove) return bookMove;

    const moves = orderedMoves(state, color);
    if (!moves.length) return null;

    let bestMove = moves[0];
    let bestScore = -Infinity;
    let alpha = -Infinity;
    const beta = Infinity;

    for (const move of moves) {
      const next = cloneGame(state);
      applyMove(next, move);
      const score = minimax(next, depth - 1, alpha, beta, color, 1);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      alpha = Math.max(alpha, bestScore);
    }
    return bestMove;
  }

  globalThis.FerretChessAI = Object.freeze({ chooseMove, SEARCH_DEPTH });
})();
