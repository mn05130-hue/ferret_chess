"use strict";

/*
 * 화면이나 타이머에 의존하지 않는 순수 게임 규칙입니다.
 * 실제 앱과 tests/chat-rules-tests.html이 같은 함수를 사용해 밸런스 값의 불일치를 막습니다.
 */
const FERRET_CHAT_RULES = (() => {
  const STORY_ANOMALIES_BY_DAY = Object.freeze([2, 2, 3, 3, 4, 4, 5]);
  const ENDLESS_ANOMALIES_PER_STAGE = 1;
  const ANOMALY_TYPE_LABELS = Object.freeze({
    PROPHECY: "예언형",
    OBSERVER: "관찰형",
    MEMORY: "기억 오류형",
    MIMIC: "모방형",
    INTRUDER: "시스템 침입형",
    GLITCH: "신호 붕괴형"
  });
  const SCORE = Object.freeze({
    anomalyCaught: 150,
    anomalyMissed: -100,
    normalKicked: -75,
    connectionRecovered: 100
  });

  function clampStage(stage) {
    const parsed = Math.floor(Number(stage));
    return Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
  }

  function getAnomalyCount(mode, stage) {
    if (mode !== "story") return ENDLESS_ANOMALIES_PER_STAGE;
    const index = Math.min(STORY_ANOMALIES_BY_DAY.length - 1, clampStage(stage) - 1);
    return STORY_ANOMALIES_BY_DAY[index];
  }

  function getAnomalyLevel(mode, stage) {
    const progress = clampStage(stage);
    if (mode === "story") {
      if (progress <= 2) return 1;
      if (progress <= 4) return 2;
      if (progress === 5) return 3;
      if (progress === 6) return 4;
      return 5;
    }
    return Math.min(5, 1 + Math.floor((progress - 1) / 3));
  }

  function getAnomalyPermissions(mode, stage) {
    const level = getAnomalyLevel(mode, stage);
    if (mode === "story") {
      if (level === 1) return ["PROPHECY", "OBSERVER"];
      if (level === 2) return ["OBSERVER", "MEMORY"];
      if (level === 3) return ["MIMIC"];
      if (level === 4) return ["INTRUDER"];
    }
    const unlocks = ["PROPHECY", "OBSERVER"];
    if (level >= 2) unlocks.push("MEMORY");
    if (level >= 3) unlocks.push("MIMIC");
    if (level >= 4) unlocks.push("INTRUDER");
    return unlocks;
  }

  function getViewerKickOutcome(anomalous) {
    return anomalous
      ? Object.freeze({ scoreDelta: SCORE.anomalyCaught, healthDelta: 0 })
      : Object.freeze({ scoreDelta: SCORE.normalKicked, healthDelta: -1 });
  }

  function getMissedAnomalyOutcome() {
    return Object.freeze({ scoreDelta: SCORE.anomalyMissed, healthDelta: -1 });
  }

  function getFalseReconnectOutcome() {
    return Object.freeze({ scoreDelta: 0, healthDelta: -1 });
  }

  function calculateStoryDayOutcome({ caught = 0, missed = 0, wrong = 0, health = 0, score = 0 } = {}) {
    const safeCaught = Math.max(0, Math.floor(Number(caught) || 0));
    const safeMissed = Math.max(0, Math.floor(Number(missed) || 0));
    const safeWrong = Math.max(0, Math.floor(Number(wrong) || 0));
    const safeHealth = Math.max(0, Math.floor(Number(health) || 0));
    const safeScore = Math.max(0, Math.floor(Number(score) || 0));
    const damage = safeMissed + safeWrong;
    return Object.freeze({
      damage,
      appliedDamage: Math.min(safeHealth, damage),
      health: Math.max(0, safeHealth - damage),
      score: Math.max(0, safeScore
        + safeCaught * SCORE.anomalyCaught
        + safeMissed * SCORE.anomalyMissed
        + safeWrong * SCORE.normalKicked)
    });
  }

  function isDisconnectedConnectionStage(stageKey) {
    return stageKey === "disconnected";
  }

  function getDailyChallengeSeed(dateKey) {
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey)) ? String(dateKey) : "1970-01-01";
    let hash = 2166136261;
    for (const character of `ferret-chat:${normalized}`) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  return Object.freeze({
    STORY_ANOMALIES_BY_DAY,
    ENDLESS_ANOMALIES_PER_STAGE,
    MAX_STORY_ANOMALIES: Math.max(...STORY_ANOMALIES_BY_DAY),
    ANOMALY_TYPE_LABELS,
    SCORE,
    getAnomalyCount,
    getAnomalyLevel,
    getAnomalyPermissions,
    getViewerKickOutcome,
    getMissedAnomalyOutcome,
    getFalseReconnectOutcome,
    calculateStoryDayOutcome,
    isDisconnectedConnectionStage,
    getDailyChallengeSeed
  });
})();

if (typeof window !== "undefined") window.FerretChatRules = FERRET_CHAT_RULES;
