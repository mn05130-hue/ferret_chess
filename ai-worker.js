"use strict";

importScripts("chess-engine.js?v=3", "chess-ai.js?v=2");

self.addEventListener("message", event => {
  const { requestId, session, purpose, game, color, depth } = event.data || {};
  if (!requestId || !game || !color) return;

  try {
    const move = globalThis.FerretChessAI.chooseMove(game, color, depth);
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
