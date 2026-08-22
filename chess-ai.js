(() => {
  "use strict";

  const Engine = window.FerretChessEngine;
  const {
    VALUE,
    cloneGame,
    coords,
    applyMove,
    legalMovesFor,
    isInCheck,
    getDrawReason
  } = Engine;

  const MATE_SCORE = 1_000_000;
  const SEARCH_DEPTH = 3;

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

  function evaluatePosition(state, aiColor) {
    const enemyColor = aiColor === "w" ? "b" : "w";
    let score = 0;

    Object.entries(state.board).forEach(([square, piece]) => {
      const material = piece.type === "k" ? 0 : VALUE[piece.type];
      const value = material + positionalScore(square, piece);
      score += piece.color === aiColor ? value : -value;
    });

    const myMobility = legalMovesFor(state, aiColor).length;
    const enemyMobility = legalMovesFor(state, enemyColor).length;
    score += (myMobility - enemyMobility) * 2;
    if (isInCheck(state, enemyColor)) score += 35;
    if (isInCheck(state, aiColor)) score -= 35;
    return score;
  }

  function moveOrderScore(state, move) {
    const movingPiece = state.board[move.from];
    let score = 0;
    if (move.capture) {
      score += VALUE[move.capture.type] * 10;
      score -= VALUE[movingPiece.type];
    }
    if (move.promotion) score += VALUE.q * 8;
    if (move.castle) score += 150;

    const simulation = cloneGame(state);
    applyMove(simulation, move);
    if (isInCheck(simulation, simulation.turn)) score += 80;
    return score;
  }

  function orderedMoves(state, color) {
    return legalMovesFor(state, color).sort(
      (a, b) => moveOrderScore(state, b) - moveOrderScore(state, a)
    );
  }

  function minimax(state, depth, alpha, beta, aiColor, ply) {
    const color = state.turn;
    const moves = orderedMoves(state, color);

    if (!moves.length) {
      if (isInCheck(state, color)) {
        return color === aiColor ? -MATE_SCORE + ply : MATE_SCORE - ply;
      }
      return 0;
    }
    if (getDrawReason(state)) return 0;
    if (depth === 0) return evaluatePosition(state, aiColor);

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

  function chooseMove(state, color, depth = SEARCH_DEPTH) {
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

  window.FerretChessAI = Object.freeze({ chooseMove, SEARCH_DEPTH });
})();
