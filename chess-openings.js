(() => {
  "use strict";

  const BOOK_LINES = Object.freeze([
    Object.freeze({
      name: "루이 로페즈",
      moves: Object.freeze(["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4", "g8f6", "e1g1", "f8e7"])
    }),
    Object.freeze({
      name: "이탈리안 게임",
      moves: Object.freeze(["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "d2d3", "g8f6", "e1g1", "d7d6"])
    }),
    Object.freeze({
      name: "스코치 게임",
      moves: Object.freeze(["e2e4", "e7e5", "g1f3", "b8c6", "d2d4", "e5d4", "f3d4", "g8f6", "b1c3", "f8b4"])
    }),
    Object.freeze({
      name: "시실리안 디펜스",
      moves: Object.freeze(["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "a7a6"])
    }),
    Object.freeze({
      name: "프렌치 디펜스",
      moves: Object.freeze(["e2e4", "e7e6", "d2d4", "d7d5", "b1c3", "g8f6", "e4e5", "f6d7"])
    }),
    Object.freeze({
      name: "카로칸 디펜스",
      moves: Object.freeze(["e2e4", "c7c6", "d2d4", "d7d5", "e4e5", "c8f5", "g1f3", "e7e6"])
    }),
    Object.freeze({
      name: "퀸스 갬빗 디클라인드",
      moves: Object.freeze(["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "c1g5", "f8e7"])
    }),
    Object.freeze({
      name: "슬라브 디펜스",
      moves: Object.freeze(["d2d4", "d7d5", "c2c4", "c7c6", "g1f3", "g8f6", "b1c3", "d5c4"])
    }),
    Object.freeze({
      name: "킹스 인디언 디펜스",
      moves: Object.freeze(["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7", "e2e4", "d7d6"])
    }),
    Object.freeze({
      name: "님조 인디언 디펜스",
      moves: Object.freeze(["d2d4", "g8f6", "c2c4", "e7e6", "b1c3", "f8b4", "e2e3", "e8g8"])
    }),
    Object.freeze({
      name: "런던 시스템",
      moves: Object.freeze(["d2d4", "d7d5", "g1f3", "g8f6", "c1f4", "e7e6", "e2e3", "f8d6"])
    }),
    Object.freeze({
      name: "잉글리시 오프닝",
      moves: Object.freeze(["c2c4", "e7e5", "b1c3", "g8f6", "g2g3", "d7d5", "c4d5", "f6d5"])
    }),
    Object.freeze({
      name: "레티 오프닝",
      moves: Object.freeze(["g1f3", "d7d5", "c2c4", "e7e6", "g2g3", "g8f6", "f1g2", "f8e7"])
    })
  ]);

  const OPENING_NAMES = Object.freeze([
    Object.freeze({ name: "킹스 폰 오프닝", moves: Object.freeze(["e2e4"]) }),
    Object.freeze({ name: "오픈 게임", moves: Object.freeze(["e2e4", "e7e5"]) }),
    Object.freeze({ name: "루이 로페즈", moves: Object.freeze(["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"]) }),
    Object.freeze({ name: "이탈리안 게임", moves: Object.freeze(["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"]) }),
    Object.freeze({ name: "스코치 게임", moves: Object.freeze(["e2e4", "e7e5", "g1f3", "b8c6", "d2d4"]) }),
    Object.freeze({ name: "시실리안 디펜스", moves: Object.freeze(["e2e4", "c7c5"]) }),
    Object.freeze({ name: "프렌치 디펜스", moves: Object.freeze(["e2e4", "e7e6"]) }),
    Object.freeze({ name: "카로칸 디펜스", moves: Object.freeze(["e2e4", "c7c6"]) }),
    Object.freeze({ name: "퀸스 폰 오프닝", moves: Object.freeze(["d2d4"]) }),
    Object.freeze({ name: "퀸스 갬빗", moves: Object.freeze(["d2d4", "d7d5", "c2c4"]) }),
    Object.freeze({ name: "퀸스 갬빗 디클라인드", moves: Object.freeze(["d2d4", "d7d5", "c2c4", "e7e6"]) }),
    Object.freeze({ name: "슬라브 디펜스", moves: Object.freeze(["d2d4", "d7d5", "c2c4", "c7c6"]) }),
    Object.freeze({ name: "킹스 인디언 디펜스", moves: Object.freeze(["d2d4", "g8f6", "c2c4", "g7g6"]) }),
    Object.freeze({ name: "님조 인디언 디펜스", moves: Object.freeze(["d2d4", "g8f6", "c2c4", "e7e6", "b1c3", "f8b4"]) }),
    Object.freeze({ name: "런던 시스템", moves: Object.freeze(["d2d4", "d7d5", "g1f3", "g8f6", "c1f4"]) }),
    Object.freeze({ name: "잉글리시 오프닝", moves: Object.freeze(["c2c4"]) }),
    Object.freeze({ name: "레티 오프닝", moves: Object.freeze(["g1f3"]) })
  ]);

  function isPrefix(prefix, moves) {
    return prefix.length <= moves.length && prefix.every((move, index) => moves[index] === move);
  }

  function moveKey(move) {
    return `${move.from}${move.to}${move.promotion || ""}`;
  }

  function identifyOpening(history) {
    if (!history.length) return "오프닝 대기 중";
    let match = null;
    OPENING_NAMES.forEach(opening => {
      if (isPrefix(opening.moves, history) && (!match || opening.moves.length > match.moves.length)) match = opening;
    });
    return match?.name || "자유로운 전개";
  }

  function chooseBookMove(state, color, history = []) {
    if (state.turn !== color) return null;
    const nextKeys = [];
    BOOK_LINES.forEach(line => {
      if (!isPrefix(history, line.moves) || history.length >= line.moves.length) return;
      const key = line.moves[history.length];
      if (!nextKeys.includes(key)) nextKeys.push(key);
    });
    if (!nextKeys.length) return null;

    const legalMoves = globalThis.FerretChessEngine.legalMovesFor(state, color);
    const candidates = nextKeys
      .map(key => legalMoves.find(move => moveKey(move) === key))
      .filter(Boolean);
    if (!candidates.length) return null;

    const signature = `${color}:${history.join(":")}`;
    let hash = 2166136261;
    for (let index = 0; index < signature.length; index += 1) {
      hash ^= signature.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return candidates[(hash >>> 0) % candidates.length];
  }

  globalThis.FerretChessOpenings = Object.freeze({ BOOK_LINES, chooseBookMove, identifyOpening, moveKey });
})();
