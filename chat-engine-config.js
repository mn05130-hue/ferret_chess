"use strict";

/*
 * 채팅 생성 속도와 시청자 성격 모델을 정의합니다.
 * 수치를 조정하면 모든 스테이지의 발화 빈도·중복 허용·말투 강도가 함께 바뀝니다.
 */
// 디렉터 상태 전환, 요청 만료, 유사도 필터, 상태별 채팅 간격을 중앙 관리합니다.
const TUNING = Object.freeze({
  tickMs: 100,
  tensionHalfLifeMs: 10000,
  tenseThreshold: 0.4,
  burstDurationMs: 3000,
  aftermathDurationMs: 9000,
  lullAfterMs: 25000,
  requestExpiryMs: 2500,
  maxAnomalyLevel: 4,
  anomalyArrivalIntervalMs: [5000, 8000],
  anomalyIntervalMs: [3000, 7000],
  anomalyLevelFrequencyStep: 0.2,
  minimumAnomalyIntervalMs: 1200,
  maxGenerationRetries: 3,
  similarityThreshold: 0.7,
  intentCooldownMs: 4200,
  intervals: {
    AMBIENT: [1800, 4000],
    TENSE: [700, 1500],
    BURST: [220, 620],
    AFTERMATH: [800, 2000],
    LULL: [2400, 5200]
  },
  stateIntents: {
    AMBIENT:   { CHAT: 26, QUESTION: 16, AGREE: 15, REACT: 12, NAG: 10, FOOD: 8, STORY: 8, GREET: 5 },
    TENSE:     { REACT: 34, LAUGH: 24, AGREE: 20, TEASE: 14, CHAT: 8 },
    BURST:     { LAUGH: 52, REACT: 30, TEASE: 18 },
    AFTERMATH: { TEASE: 28, RECALL: 24, LAUGH: 20, AGREE: 16, CHAT: 12 },
    LULL:      { CHAT: 26, QUESTION: 20, FOOD: 18, STORY: 14, COMPLAIN: 12, RECALL: 6, SUSPICION: 4 }
  }
});

/* ==========================================================================
 * 2. 성격 정의
 *
 *    personaKey는 유지하고 label만 저스트 채팅에 맞췄습니다.
 *
 *    style 필드는 전부 "개별 항목마다" 적용되는 확률입니다.
 *      trim        문장 맨 앞 어절을 통째로 날릴 확률 (어절 4개 이상일 때만)
 *      particle    각 조사를 생략할 확률
 *      ending      채팅 어미(~임/~함/~듯/~각)로 바꿀 확률
 *      spacing     각 띄어쓰기를 붙일 확률
 *      punctuation 마침표/느낌표를 지울 확률
 *      abbrev      각 축약 대상 단어를 초성체로 바꿀 확률
 *      emote       끝에 ㅋㅋ/ㅠㅠ/ㄷㄷ를 붙일 확률
 *      typo        오타를 낼 확률
 *      emotePool   이 성격이 쓰는 이모트 (앞쪽이 자주 뽑힘)
 * ======================================================================== */
// 각 페르소나는 의도 적합도와 말투 변형 확률을 가져 서로 다른 채팅 습관을 만듭니다.
const PERSONAS = Object.freeze({
  COWARD: {
    label: "소심이",
    desire: 1.0,
    cooldownMs: 2800,
    shortChance: 0.60,
    tensionResponse: 1.35,
    fit: {
      AGREE: 2.6, NAG: 2.4, COMPLAIN: 2.0, REACT: 1.5, GREET: 1.3,
      CHAT: 1.0, QUESTION: 1.0, STORY: 1.0, FOOD: .9, RECALL: .8,
      SUSPICION: .8, LAUGH: .7, TEASE: .2
    },
    style: {
      trim: .55, particle: .62, ending: .40, spacing: .42, punctuation: .88,
      abbrev: .25, emote: .70, typo: .12,
      emotePool: ["ㅠㅠ", "ㅠ", "ㄷㄷ", "ㅎㅎ"]
    }
  },
  COACH: {
    label: "훈수꾼",
    desire: 1.15,
    cooldownMs: 2300,
    shortChance: 0.44,
    tensionResponse: 1.05,
    fit: {
      NAG: 3, COMPLAIN: 2.4, RECALL: 2.0, AGREE: 1.0, CHAT: .8,
      SUSPICION: .8, REACT: .7, TEASE: .6, STORY: .6, GREET: .6,
      QUESTION: .5, FOOD: .5, LAUGH: .3
    },
    style: {
      trim: .70, particle: .85, ending: .78, spacing: .50, punctuation: .95,
      abbrev: .35, emote: .10, typo: .04,
      emotePool: ["ㅇㅇ", "ㄹㅇ"]
    }
  },
  JOKER: {
    label: "장난꾼",
    desire: 1.1,
    cooldownMs: 2000,
    shortChance: 0.70,
    tensionResponse: 1.45,
    fit: {
      LAUGH: 3, TEASE: 3, REACT: 1.8, FOOD: 1.4, CHAT: 1.2, GREET: 1.0,
      AGREE: .8, RECALL: .8, STORY: .7, QUESTION: .6, COMPLAIN: .4,
      NAG: .3, SUSPICION: .3
    },
    style: {
      trim: .60, particle: .72, ending: .60, spacing: .48, punctuation: .92,
      abbrev: .48, emote: .85, typo: .08,
      emotePool: ["ㅋㅋㅋ", "ㅋㅋㅋㅋㅋ", "ㅋㅋ", "ㅋㅋㅋㅋㅋㅋㅋ"]
    }
  },
  IMMERSIVE: {
    label: "찐팬",
    desire: .98,
    cooldownMs: 2900,
    shortChance: 0.38,
    tensionResponse: 1.2,
    fit: {
      RECALL: 3, AGREE: 2.6, STORY: 2.0, QUESTION: 1.6, CHAT: 1.4,
      REACT: 1.4, GREET: 1.2, LAUGH: 1.0, FOOD: 1.0, SUSPICION: 1.0,
      NAG: .8, COMPLAIN: .8, TEASE: .4
    },
    style: {
      trim: .35, particle: .45, ending: .50, spacing: .28, punctuation: .80,
      abbrev: .15, emote: .32, typo: .04,
      emotePool: ["ㅎㅎ", "ㄷㄷ", "ㅇㅇ"]
    }
  },
  SKEPTIC: {
    label: "의심꾼",
    desire: .92,
    cooldownMs: 3400,
    shortChance: 0.42,
    tensionResponse: 1.0,
    fit: {
      SUSPICION: 3, QUESTION: 2.4, TEASE: 1.6, RECALL: 1.4, COMPLAIN: 1.2,
      REACT: 1.0, CHAT: .9, LAUGH: .7, NAG: .7, AGREE: .6, STORY: .6,
      FOOD: .6, GREET: .5
    },
    style: {
      trim: .45, particle: .58, ending: .55, spacing: .32, punctuation: .85,
      abbrev: .22, emote: .28, typo: .04,
      emotePool: ["...", "?", "ㅇㅇ"]
    }
  }
});
