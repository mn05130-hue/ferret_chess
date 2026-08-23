"use strict";

importScripts("chess-engine.js?v=9", "chess-openings.js?v=1", "chess-ai.js?v=8");

self.addEventListener("message", event => {
  const { requestId, session, purpose, game, color, depth, history } = event.data || {};
  if (!requestId || !game || !color) return;

  try {
    const move = globalThis.FerretChessAI.chooseMove(game, color, depth, history);
    self.postMessage({ requestId, session, purpose, move });
  } catch (error) {
    self.postMessage({
      requestId,
      session,
      purpose,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
