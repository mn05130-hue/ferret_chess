(() => {
  "use strict";

  const Engine = window.FerretChessEngine;
  const ChessAI = window.FerretChessAI;
  const { VARIANT, createGame, applyMove, legalMovesFor, useSkill, getDrawReason } = Engine;
  const tests = [];

  function test(name, run) {
    tests.push({ name, run });
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function equal(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message} (expected: ${expected}, actual: ${actual})`);
    }
  }

  function moveFor(state, from, to, predicate = () => true) {
    return legalMovesFor(state, state.turn).find(move =>
      move.from === from && (move.attackTo || move.to) === to && predicate(move)
    );
  }

  function play(state, from, to, predicate) {
    const move = moveFor(state, from, to, predicate);
    assert(move, `${from}→${to} 합법 수를 찾지 못했습니다.`);
    applyMove(state, move, false);
    return move;
  }

  function setBoard(state, board, turn = "w") {
    state.board = board;
    state.turn = turn;
    state.castling = { wK: false, wQ: false, bK: false, bQ: false };
    state.enPassant = null;
    state.lastMove = null;
    state.lastActionResult = null;
    state.halfmoveClock = 0;
    state.variantWinner = null;
    state.variantWinReason = null;
  }

  test("표준 초기 배치는 기물 32개와 백 합법 수 20개를 가진다", () => {
    const state = createGame();
    equal(Object.keys(state.board).length, 32, "초기 기물 수가 다릅니다.");
    equal(legalMovesFor(state, "w").length, 20, "초기 합법 수가 다릅니다.");
  });

  test("킹사이드 캐슬링 조건이 충족되면 e1→g1이 생성된다", () => {
    const state = createGame();
    delete state.board.f1;
    delete state.board.g1;
    const castle = moveFor(state, "e1", "g1", move => move.castle === "K");
    assert(castle, "킹사이드 캐슬링이 생성되지 않았습니다.");
    applyMove(state, castle);
    equal(state.board.g1?.type, "k", "킹이 g1에 도착하지 않았습니다.");
    equal(state.board.f1?.type, "r", "룩이 f1에 도착하지 않았습니다.");
  });

  test("앙파상 가능 수가 생성되고 잡힌 폰이 제거된다", () => {
    const state = createGame();
    play(state, "e2", "e4");
    play(state, "a7", "a6");
    play(state, "e4", "e5");
    play(state, "d7", "d5");
    const enPassant = moveFor(state, "e5", "d6", move => move.enPassant);
    assert(enPassant, "앙파상 수가 생성되지 않았습니다.");
    applyMove(state, enPassant);
    equal(state.board.d5, undefined, "앙파상으로 잡힌 폰이 남아 있습니다.");
    equal(state.board.d6?.type, "p", "백 폰이 d6에 도착하지 않았습니다.");
  });

  test("마지막 랭크에 도착한 폰은 퀸으로 승격한다", () => {
    const state = createGame();
    setBoard(state, {
      e1: { color: "w", type: "k" },
      e8: { color: "b", type: "k" },
      a7: { color: "w", type: "p" }
    });
    const promotion = moveFor(state, "a7", "a8", move => move.promotion === "q");
    assert(promotion, "승격 수가 생성되지 않았습니다.");
    applyMove(state, promotion);
    equal(state.board.a8?.type, "q", "승격 결과가 퀸이 아닙니다.");
  });

  test("킹을 노출하는 핀 기물의 이동은 합법 수에서 제외된다", () => {
    const state = createGame();
    setBoard(state, {
      e1: { color: "w", type: "k" },
      e2: { color: "w", type: "r" },
      e8: { color: "b", type: "r" },
      a8: { color: "b", type: "k" }
    });
    assert(!moveFor(state, "e2", "f2"), "핀된 룩이 킹을 노출하며 이동할 수 있습니다.");
  });

  test("같은 초기 포지션이 세 번째 등장하면 3회 반복 무승부다", () => {
    const state = createGame();
    for (let cycle = 0; cycle < 2; cycle += 1) {
      play(state, "g1", "f3");
      play(state, "g8", "f6");
      play(state, "f3", "g1");
      play(state, "f6", "g8");
    }
    equal(getDrawReason(state), "threefold", "3회 반복을 감지하지 못했습니다.");
  });

  test("halfmoveClock 100은 50수 규칙 무승부다", () => {
    const state = createGame();
    state.halfmoveClock = 100;
    equal(getDrawReason(state), "fiftyMove", "50수 규칙을 감지하지 못했습니다.");
  });

  test("킹만 남은 표준 포지션은 기물 부족 무승부다", () => {
    const state = createGame();
    setBoard(state, {
      e1: { color: "w", type: "k" },
      e8: { color: "b", type: "k" }
    });
    equal(getDrawReason(state), "insufficientMaterial", "기물 부족을 감지하지 못했습니다.");
  });

  test("언덕의 왕에서 킹이 중앙에 도착하면 즉시 승리한다", () => {
    const state = createGame(VARIANT.KING_OF_THE_HILL);
    setBoard(state, {
      e3: { color: "w", type: "k" },
      a8: { color: "b", type: "k" }
    });
    play(state, "e3", "e4");
    equal(state.variantWinner, "w", "언덕 점령 승자가 기록되지 않았습니다.");
    equal(state.variantWinReason, "hill", "언덕 점령 승리 사유가 다릅니다.");
  });

  test("3-체크에서 세 번째 체크가 승리로 기록된다", () => {
    const state = createGame(VARIANT.THREE_CHECK);
    setBoard(state, {
      a1: { color: "w", type: "k" },
      e1: { color: "w", type: "r" },
      e8: { color: "b", type: "k" }
    });
    state.checksGiven.w = 2;
    play(state, "e1", "e7");
    equal(state.checksGiven.w, 3, "백의 체크 횟수가 증가하지 않았습니다.");
    equal(state.variantWinner, "w", "세 번째 체크의 승자가 기록되지 않았습니다.");
  });

  test("냉병기 전술 공격은 공격자를 유지하고 고정 피해를 적용한다", () => {
    const state = createGame(VARIANT.TACTICAL);
    setBoard(state, {
      a1: { color: "w", type: "p", hp: 5, maxHp: 5 },
      b1: { color: "b", type: "p", hp: 5, maxHp: 5 }
    });
    const attack = moveFor(state, "a1", "b1", move => move.action === "attack");
    assert(attack, "전술 공격이 생성되지 않았습니다.");
    const result = applyMove(state, attack, false);
    equal(result.damage, 2, "보병의 고정 피해가 다릅니다.");
    equal(state.board.a1?.color, "w", "공격자가 원래 칸에서 이동했습니다.");
    equal(state.board.b1?.hp, 3, "대상의 HP가 올바르게 감소하지 않았습니다.");
  });

  test("별빛 수호막은 다음 적 행동의 피해를 막은 뒤 만료된다", () => {
    const state = createGame(VARIANT.TACTICAL);
    setBoard(state, {
      a1: { color: "w", type: "p", hp: 5, maxHp: 5 },
      c1: { color: "w", type: "p", hp: 5, maxHp: 5 },
      b1: { color: "b", type: "p", hp: 5, maxHp: 5 }
    });
    const skill = useSkill(state, "w", "a1");
    assert(skill, "수호막 스킬을 사용하지 못했습니다.");
    play(state, "c1", "c2");
    const attack = moveFor(state, "b1", "a1", move => move.action === "attack");
    assert(attack, "수호막 대상을 향한 공격이 생성되지 않았습니다.");
    const result = applyMove(state, attack, false);
    assert(result.blocked, "수호막이 피해를 차단하지 않았습니다.");
    equal(state.board.a1?.hp, 5, "보호된 기물의 HP가 감소했습니다.");
    equal(state.effects.shield, null, "적 행동 후 수호막이 만료되지 않았습니다.");
  });

  test("냉병기 전술에서 장군 HP가 0이 되면 공격자가 승리한다", () => {
    const state = createGame(VARIANT.TACTICAL);
    setBoard(state, {
      a1: { color: "w", type: "p", hp: 5, maxHp: 5 },
      b1: { color: "b", type: "g", hp: 1, maxHp: 9 }
    });
    play(state, "a1", "b1", move => move.action === "attack");
    equal(state.variantWinner, "w", "장군 격파 승자가 기록되지 않았습니다.");
    equal(state.variantWinReason, "generalDefeated", "장군 격파 사유가 다릅니다.");
  });

  test("AI 탐색은 현재 포지션의 합법 수를 반환한다", () => {
    const state = createGame();
    setBoard(state, {
      e1: { color: "w", type: "k" },
      a1: { color: "w", type: "r" },
      e8: { color: "b", type: "k" },
      h8: { color: "b", type: "r" }
    }, "b");
    const legalMoves = legalMovesFor(state, "b");
    const choice = ChessAI.chooseMove(state, "b", 4, ["custom-position"]);
    assert(choice, "AI가 수를 반환하지 않았습니다.");
    assert(legalMoves.some(move =>
      move.from === choice.from && move.to === choice.to && move.attackTo === choice.attackTo
    ), "AI가 합법 수가 아닌 수를 반환했습니다.");
  });

  const resultList = document.querySelector("#results");
  const summary = document.querySelector("#summary");
  let passed = 0;

  tests.forEach(({ name, run }) => {
    const item = document.createElement("li");
    try {
      run();
      passed += 1;
      item.className = "pass";
      item.textContent = `통과 · ${name}`;
    } catch (error) {
      item.className = "fail";
      item.textContent = `실패 · ${name} · ${error instanceof Error ? error.message : String(error)}`;
    }
    resultList.append(item);
  });

  const failed = tests.length - passed;
  document.documentElement.dataset.testStatus = failed ? "failed" : "passed";
  summary.textContent = `${tests.length}개 중 ${passed}개 통과${failed ? ` · ${failed}개 실패` : ""}`;
  console.info(`[Ferret Chess Tests] ${summary.textContent}`);
})();
