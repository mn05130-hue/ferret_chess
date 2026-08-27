"use strict";

/*
 * 채팅 생성 속도와 시청자 성격 모델을 정의합니다.
 * 수치를 조정하면 모든 스테이지의 발화 빈도·중복 허용·말투 강도가 함께 바뀝니다.
 */
// 디렉터 상태 전환, 요청 만료, 유사도 필터, 상태별 채팅 간격을 중앙 관리합니다.
const TUNING = Object.freeze({
  // 채팅 엔진의 내부 시계를 갱신하는 주기(ms)입니다. 작을수록 상태 변화가 더 자주 계산됩니다.
  tickMs: 100,

  // 긴장도가 현재 값의 절반으로 자연 감소하는 데 걸리는 시간(ms)입니다.
  tensionHalfLifeMs: 1000,

  // 감소 중인 긴장도가 이 값을 넘으면 평상시(AMBIENT) 대신 긴장(TENSE) 상태를 선택합니다.
  tenseThreshold: 0.4,

  // 방송 사건으로 채팅이 폭주하는 BURST 상태를 유지하는 시간(ms)입니다.
  burstDurationMs: 2000,

  // BURST 종료 후 여운이 남는 AFTERMATH 상태를 유지하는 시간(ms)입니다.
  aftermathDurationMs: 15000,

  // 마지막 방송 사건 이후 이 시간(ms) 동안 새 사건이 없으면 한산한 LULL 상태로 들어갑니다.
  lullAfterMs: 25000,

  // REACT/LAUGH 요청이 이 시간(ms)보다 오래되면 뒤늦은 반응인 RECALL 의도로 바꿉니다.
  requestExpiryMs: 2500,

  // 이상 시청자가 가질 수 있는 최대 이상 단계입니다. 단계가 높을수록 이상 발화가 자주 나옵니다.
  maxAnomalyLevel: 3,

  // 스테이지 시작 후 이상 시청자의 첫 이상 발화가 도착하는 최소~최대 대기시간(ms)입니다.
  anomalyArrivalIntervalMs: [12000, 20000],

  // 첫 발화 이후 이상 시청자가 다음 이상 발화를 만드는 기본 최소~최대 간격(ms)입니다.
  anomalyIntervalMs: [5000, 10000],

  // 이상 단계가 1 오를 때마다 발화 빈도 배율에 더하는 값입니다. 현재 값이면 단계마다 2%씩 증가합니다.
  anomalyLevelFrequencyStep: 0.02,

  // 이상 채팅 한 건이 전담 유형 대신 GLITCH 난독화 채팅으로 선택될 확률입니다. 0.5는 50%입니다.
  glitchChance: 0.2,

  // 단계와 난수 계산으로 간격이 짧아져도 절대 이 값(ms)보다 빠르게 이상 발화를 만들지 않습니다.
  minimumAnomalyIntervalMs: 5000,

  // 중복·금지 조건으로 문장 생성에 실패했을 때 다른 문장을 다시 뽑는 최대 횟수입니다.
  maxGenerationRetries: 3,

  // 최근 문장과의 2-gram Jaccard 유사도가 이 값을 넘으면 중복 문장으로 판정합니다.
  similarityThreshold: 0.5,

  // 같은 발화 의도를 연속 선택할 때 원래 가중치가 완전히 회복되는 데 걸리는 시간(ms)입니다.
  intentCooldownMs: 1000,

  // 디렉터 상태별 일반 채팅 생성 간격의 [최소, 최대] 값(ms)입니다.
  // AMBIENT=평상시, TENSE=긴장, BURST=폭주, AFTERMATH=사건 직후, LULL=한산함입니다.
  intervals: {
    AMBIENT: [3000, 6000],
    TENSE: [2000, 3000],
    BURST: [500, 1000],
    AFTERMATH: [4000, 8000],
    LULL: [5400, 8200]
  },

  /*
   * 상태별 발화 의도 선택 가중치입니다. 숫자는 확률 자체가 아니라 같은 상태 안에서 비교되는 상대 비중입니다.
   * CHAT=잡담, QUESTION=질문, AGREE=동의, REACT=반응, NAG=훈수, FOOD=음식,
   * STORY=경험담, GREET=인사, LAUGH=웃음, TEASE=놀림, RECALL=과거 언급,
   * COMPLAIN=불평, SUSPICION=의심을 뜻합니다.
   */
  stateIntents: {
    // 평상시에는 잡담·질문·동의가 중심이고 다양한 주제를 비교적 고르게 섞습니다.
    AMBIENT:   { CHAT: 26, QUESTION: 16, AGREE: 15, REACT: 12, NAG: 10, FOOD: 8, STORY: 8, GREET: 5 },

    // 긴장 상태에서는 즉각적인 반응과 웃음, 동의, 놀림의 비중을 높입니다.
    TENSE:     { REACT: 34, LAUGH: 24, AGREE: 20, TEASE: 14, CHAT: 8 },

    // 폭주 상태에서는 짧게 쏟아낼 수 있는 웃음·반응·놀림만 선택합니다.
    BURST:     { LAUGH: 52, REACT: 30, TEASE: 18 },

    // 사건 직후에는 방금 상황을 놀리거나 회상하는 후속 반응을 주로 만듭니다.
    AFTERMATH: { TEASE: 28, RECALL: 24, LAUGH: 20, AGREE: 16, CHAT: 12 },

    // 한산할 때는 대화를 다시 시작할 잡담·질문·음식·경험담을 늘리고 의심을 소량 섞습니다.
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
 *
 *    성격 자체를 조절하는 필드는 다음과 같습니다.
 *      label           화면과 진단 결과에 표시하는 성격 이름
 *      desire          이 성격의 시청자가 발언 후보로 선택될 기본 배율
 *      cooldownMs      같은 시청자가 다시 말할 때까지 기다리는 최소 시간
 *      shortChance     긴 문장 대신 초단문을 고를 확률
 *      tensionResponse 긴장도가 발언 욕구에 미치는 영향의 배율
 *      fit             채팅 의도별 적합도. 값이 클수록 해당 주제를 자주 말함
 * ======================================================================== */
// 각 페르소나는 의도 적합도와 말투 변형 확률을 가져 서로 다른 채팅 습관을 만듭니다.
const PERSONAS = Object.freeze({
  // 소심이: 위험 신호에 민감하고 동의·걱정·잔소리 계열 반응을 자주 보냅니다.
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
  // 훈수꾼: 플레이 방식과 방송 상태를 지적하거나 조언하는 반응에 치우칩니다.
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
  // 장난꾼: 웃음과 놀림을 빠르게 보내 채팅 폭주를 주도합니다.
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
  // 찐팬: 지난 방송을 기억하고 스트리머의 이야기에 적극적으로 몰입합니다.
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
  // 의심꾼: 이상한 상황이나 다른 시청자의 말을 쉽게 믿지 않고 확인하려 합니다.
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
