(() => {
  "use strict";

  /* ==========================================================================
   * 1. 튜닝 상수
   * ======================================================================== */
  const TUNING = Object.freeze({
    tickMs: 100,
    tensionHalfLifeMs: 12000,
    tenseThreshold: 0.4,
    burstDurationMs: 3000,
    aftermathDurationMs: 8000,
    lullAfterMs: 30000,
    requestExpiryMs: 2000,
    maxAnomalyLevel: 4,
    formalFromLevel: 3,        // 이 이상도부터 정중형 원문을 그대로 출력
    anomalySpeechStep: 3,
    maxGenerationRetries: 3,
    similarityThreshold: 0.7,
    intentCooldownMs: 4200,
    intervals: {
      AMBIENT: [2000, 4300],
      TENSE: [750, 1600],
      BURST: [260, 680],
      AFTERMATH: [900, 2100],
      LULL: [2400, 4800]
    },
    stateIntents: {
      AMBIENT: { CHAT: 40, ADVICE: 25, QUESTION: 20, EXCLAIM: 15 },
      TENSE: { WARNING: 45, OBSERVE: 30, ADVICE: 20, CHAT: 5 },
      BURST: { SCREAM: 50, EXCLAIM: 30, WARNING: 20 },
      AFTERMATH: { HINDSIGHT: 35, TEASE: 30, REVIEW: 25, ADVICE: 10 },
      LULL: { CHAT: 50, STREAM_QUESTION: 25, OFF_TOPIC: 25 }
    }
  });

  /* ==========================================================================
   * 2. 성격 정의
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
  const PERSONAS = Object.freeze({
    COWARD: {
      label: "겁쟁이",
      desire: 1.1,
      cooldownMs: 2600,
      shortChance: 0.62,
      tensionResponse: 1.55,
      fit: { WARNING: 3, SCREAM: 3, QUESTION: .8, OBSERVE: .6, ADVICE: .25, TEASE: .15 },
      style: {
        trim: .55, particle: .62, ending: .40, spacing: .42, punctuation: .88,
        abbrev: .25, emote: .70, typo: .12,
        emotePool: ["ㅠㅠ", "ㅠ", "ㄷㄷ", "ㅠㅠㅠ"]
      }
    },
    COACH: {
      label: "훈수꾼",
      desire: 1.15,
      cooldownMs: 2300,
      shortChance: 0.45,
      tensionResponse: 1.15,
      fit: { ADVICE: 3, REVIEW: 2.2, HINDSIGHT: 2, OBSERVE: 1.1, QUESTION: .35, TEASE: .45 },
      style: {
        trim: .70, particle: .85, ending: .78, spacing: .50, punctuation: .95,
        abbrev: .35, emote: .10, typo: .04,
        emotePool: ["ㅇㅇ", "ㄹㅇ"]
      }
    },
    JOKER: {
      label: "장난꾼",
      desire: 1.05,
      cooldownMs: 2100,
      shortChance: 0.68,
      tensionResponse: 1.35,
      fit: { TEASE: 3, EXCLAIM: 1.7, CHAT: 1.2, OFF_TOPIC: 1.3, WARNING: .3, ADVICE: .4 },
      style: {
        trim: .60, particle: .72, ending: .60, spacing: .48, punctuation: .92,
        abbrev: .48, emote: .82, typo: .08,
        emotePool: ["ㅋㅋㅋ", "ㅋㅋㅋㅋㅋ", "ㅋㅋ", "ㅋㅋㅋㅋㅋㅋㅋ"]
      }
    },
    IMMERSIVE: {
      label: "몰입형",
      desire: .95,
      cooldownMs: 3000,
      shortChance: 0.38,
      tensionResponse: 1.25,
      fit: { OBSERVE: 3, QUESTION: 1.6, WARNING: 1.3, REVIEW: 1.4, ADVICE: .65, TEASE: .25 },
      style: {
        trim: .35, particle: .45, ending: .50, spacing: .28, punctuation: .80,
        abbrev: .15, emote: .30, typo: .04,
        emotePool: ["ㄷㄷ", "...", "ㅇㅇ"]
      }
    },
    SKEPTIC: {
      label: "의심꾼",
      desire: .92,
      cooldownMs: 3400,
      shortChance: 0.42,
      tensionResponse: 1.05,
      fit: { SUSPICION: 3, QUESTION: 1.5, OBSERVE: 1.2, REVIEW: 1.1, WARNING: .65, TEASE: .55 },
      style: {
        trim: .45, particle: .58, ending: .55, spacing: .32, punctuation: .85,
        abbrev: .22, emote: .28, typo: .04,
        emotePool: ["...", "?", "ㅇㅇ"]
      }
    }
  });

  /* ==========================================================================
   * 3. 템플릿 — [templateId, 정중형(이상도 3+), 채팅형(평소)]
   *    채팅형은 어절 2~4개를 넘기지 마세요. 여기가 길면 뭘 해도 딱딱합니다.
   * ======================================================================== */
  const TEMPLATES = Object.freeze({
    CHAT: [
      ["chat-room",     "{location|은/는} 분위기가 정말 무섭습니다.",      "{location} 분위기 미쳤다"],
      ["chat-sound",    "이 게임은 소리를 들을수록 더 무섭습니다.",         "소리 키우니까 더 무섭네"],
      ["chat-progress", "오늘은 엔딩까지 볼 수 있을 것 같습니다.",          "오늘 엔딩 각"],
      ["chat-silence",  "갑자기 조용해져서 더 불안합니다.",                 "조용한 게 더 무서움"],
      ["chat-bgm",      "배경음이 계속 신경 쓰입니다.",                     "브금 계속 거슬리네"],
      ["chat-late",     "늦은 시간에 보니 더 무섭습니다.",                  "이 시간에 보니까 더함"]
    ],
    ADVICE: [
      ["advice-direction", "{direction|을/를} 먼저 확인해야 합니다.",        "{direction} 먼저 봐"],
      ["advice-item",      "{item|을/를} 아껴 사용하는 것이 좋겠습니다.",     "{item} 아껴라"],
      ["advice-save",      "{location}에 들어가기 전에 저장해야 합니다.",     "들어가기 전에 저장"],
      ["advice-door",      "지나온 문을 닫고 이동하는 것이 좋겠습니다.",      "문 닫고 가"],
      ["advice-slow",      "조금 천천히 이동하는 것이 좋겠습니다.",           "좀 천천히 가"],
      ["advice-crouch",    "앉아서 이동하면 소리가 줄어듭니다.",              "앉아서 가면 소리 줄음"]
    ],
    QUESTION: [
      ["question-target", "{target|은/는} 아까도 {location}에 있었습니까?",   "{target} 아까도 있었나"],
      ["question-sound",  "방금 {direction}에서 소리가 들리지 않았습니까?",    "방금 {direction} 소리 안 남?"],
      ["question-item",   "{item|은/는} 이미 사용한 것입니까?",               "{item} 쓴 거야?"],
      ["question-path",   "이 길로 가는 것이 맞습니까?",                     "이 길 맞아?"],
      ["question-saw",    "방금 그 장면을 본 사람이 있습니까?",               "방금 본 사람"],
      ["question-again",  "이 장소는 이미 지나온 것 아닙니까?",               "여기 아까 온 데 아닌가"]
    ],
    EXCLAIM: [
      ["exclaim-target", "{target|이/가} 갑자기 나타나서 정말 놀랐습니다!",    "{target} 갑자기 나왔어"],
      ["exclaim-close",  "방금은 정말 위험했습니다!",                        "방금 진짜 위험했다"],
      ["exclaim-sound",  "소리가 너무 커서 깜짝 놀랐습니다!",                 "소리 너무 컸어"],
      ["exclaim-scene",  "이 장면은 분위기가 정말 무섭습니다!",               "이 장면 미쳤다"],
      ["exclaim-heart",  "심장이 내려앉는 줄 알았습니다!",                   "심장 나갈 뻔했다"],
      ["exclaim-jump",   "의자에서 일어날 뻔했습니다!",                      "의자에서 튀어나올 뻔"]
    ],
    WARNING: [
      ["warning-approach", "{direction}에서 {target|이/가} 다가오고 있습니다!", "{direction}에서 {target} 온다"],
      ["warning-distance", "지금은 {target}에게서 떨어지는 것이 좋겠습니다!",   "{target}한테서 떨어져"],
      ["warning-location", "지금 {location|으로/로} 들어가면 안 됩니다!",       "{location} 들어가지 마"],
      ["warning-behind",   "뒤를 확인하고 바로 도망쳐야 합니다!",              "뒤 뒤 뒤"],
      ["warning-hide",     "지금 바로 숨어야 합니다!",                       "빨리 숨어"],
      ["warning-light",    "불빛을 끄는 것이 좋겠습니다!",                    "불 꺼 빨리"]
    ],
    OBSERVE: [
      ["observe-motion",   "{direction}에서 {target|이/가} 움직인 것 같습니다.", "{direction}에서 {target} 움직인다"],
      ["observe-position", "{target|은/는} 아까 {location}에 있지 않았습니까?",  "{target} 아까 {location}에 없었는데"],
      ["observe-change",   "방금 {location}의 모습이 달라진 것 같습니다.",       "{location} 뭔가 바뀐 거 같은데"],
      ["observe-sound",    "{direction}에서 발소리가 들리는 것 같습니다.",       "{direction}에서 발소리 났다"],
      ["observe-corner",   "{location} 구석에 무언가 보입니다.",                "{location} 구석 봐"],
      ["observe-shadow",   "벽에 그림자가 지나간 것 같습니다.",                 "벽에 그림자 지나갔어"]
    ],
    SCREAM: [
      ["scream-run",    "지금 바로 도망쳐야 합니다!",    "튀어"],
      ["scream-behind", "바로 뒤에 무언가가 있습니다!",  "뒤에 있어"],
      ["scream-no",     "그쪽으로 가면 안 됩니다!",      "가지마"],
      ["scream-shock",  "정말 깜짝 놀랐습니다!",        "아 깜짝이야"],
      ["scream-close",  "거의 잡힐 뻔했습니다!",        "잡힐 뻔했다"],
      ["scream-go",     "빨리 나가야 합니다!",          "빨리 나가"]
    ],
    HINDSIGHT: [
      ["hindsight-run",  "아까 바로 도망쳤어야 했습니다.",                  "아까 튀었어야지"],
      ["hindsight-seen", "조금 전에 {direction|을/를} 확인했어야 했습니다.",  "{direction} 봤어야 했는데"],
      ["hindsight-door", "그 문을 열지 않는 것이 좋았습니다.",               "그 문 열지 말랬잖아"],
      ["hindsight-item", "아까 {item|을/를} 챙겼어야 했습니다.",             "{item} 챙겼어야 했는데"],
      ["hindsight-told", "여러 사람이 이미 말했던 내용입니다.",              "아까부터 말했는데"],
      ["hindsight-turn", "그때 돌아섰어야 했습니다.",                       "그때 돌았어야 했어"]
    ],
    TEASE: [
      ["tease-shock",   "방금 놀라는 모습이 정말 재미있었습니다.",     "방금 리액션 봐"],
      ["tease-return",  "또 같은 장소로 돌아온 것 같습니다.",          "또 같은 데 왔어"],
      ["tease-brave",   "이번에는 도망치지 않을 수 있습니까?",         "이번엔 안 튈 수 있어?"],
      ["tease-monster", "{target}도 방송을 보러 온 것 같습니다.",      "{target}도 방송 보러 왔네"],
      ["tease-scared",  "생각보다 많이 놀란 것 같습니다.",             "생각보다 겁 많은 거 같은데"],
      ["tease-again",   "같은 곳에서 또 놀라고 있습니다.",             "같은 데서 또 놀란다"]
    ],
    REVIEW: [
      ["review-cause", "방금은 {direction|을/를} 늦게 확인해서 위험했습니다.",        "{direction} 늦게 봐서 그런다"],
      ["review-route", "다음에는 {location|으로/로} 바로 가지 않는 것이 좋겠습니다.", "다음에 {location} 바로 가지 마"],
      ["review-item",  "{item|을/를} 먼저 사용했다면 피할 수 있었습니다.",           "{item} 먼저 썼으면 됐는데"],
      ["review-close", "조금만 늦었으면 잡혔을 것 같습니다.",                       "조금만 늦었으면 잡혔다"],
      ["review-luck",  "이번에는 운이 좋았던 것 같습니다.",                         "이번엔 운 좋았어"],
      ["review-sound", "소리를 먼저 들었다면 피할 수 있었습니다.",                   "소리 먼저 들었으면 됐는데"]
    ],
    STREAM_QUESTION: [
      ["stream-end",     "오늘 이 게임의 엔딩까지 볼 예정입니까?",     "오늘 엔딩까지 가?"],
      ["stream-next",    "다음 방송에서도 공포 게임을 할 예정입니까?",  "다음에도 공포겜 해?"],
      ["stream-light",   "화면 밝기를 조금 올려 줄 수 있습니까?",      "밝기 좀 올려줘"],
      ["stream-headset", "이어폰을 끼고 플레이하고 있습니까?",         "이어폰 끼고 해?"],
      ["stream-hours",   "오늘 방송은 몇 시까지 진행합니까?",          "오늘 몇 시까지 해?"],
      ["stream-part",    "이 게임은 몇 번째 방송입니까?",              "이거 몇 편이야?"]
    ],
    OFF_TOPIC: [
      ["off-snack", "이 방송을 보면서 야식을 먹고 있습니다.",        "야식 먹으면서 본다"],
      ["off-time",  "시간이 벌써 이렇게 늦은 줄 몰랐습니다.",         "벌써 시간 이렇게 됐네"],
      ["off-sleep", "이 방송을 보고 나면 잠들기 어려울 것 같습니다.",  "오늘 잠 다 잤다"],
      ["off-chat",  "오늘 채팅창도 평소보다 조용한 것 같습니다.",      "채팅 오늘 조용하네"],
      ["off-work",  "내일 일정이 있어서 곧 자야 합니다.",             "내일 일정 있어서 곧 자야 한다"],
      ["off-eyes",  "화면이 어두워서 눈이 아픕니다.",                 "화면 어두워서 눈 아프다"]
    ],
    SUSPICION: [
      ["suspicion-target", "{target|이/가} 일부러 플레이어를 기다리는 것 같습니다.", "{target} 일부러 기다리는 거 같은데"],
      ["suspicion-repeat", "방금 같은 장면을 이미 본 것 같습니다.",                "이 장면 아까 봤는데"],
      ["suspicion-chat",   "채팅에 조금 이상한 사람이 있는 것 같습니다.",           "채팅에 이상한 사람 있는 거 같은데"],
      ["suspicion-room",   "이 방의 구조가 계속 바뀌는 것 같습니다.",              "방 구조 계속 바뀐다"],
      ["suspicion-count",  "시청자 수가 조금 전과 다릅니다.",                     "시청자 수 아까랑 다르다"],
      ["suspicion-name",   "같은 닉네임이 두 번 보이는 것 같습니다.",              "같은 닉 두 개 있는데"]
    ]
  });

  /* ==========================================================================
   * 4. 초단문 풀 — 전체 발화의 절반 이상이 여기서 나갑니다.
   *    의도당 최소 10개를 유지하세요. 부족하면 필터가 막아 긴 문장으로 밀립니다.
   * ======================================================================== */
  const SHORT_LINES = Object.freeze({
    CHAT: ["무섭네", "분위기 뭐임", "오늘 꿀잼", "ㄷㄷ", "와 분위기", "이거 뭐야",
           "ㅋㅋㅋ", "브금 좋다", "무서워", "분위기 실화", "하 진짜", "잘 보고 있음"],
    ADVICE: ["왼쪽 봐", "문 닫아", "일단 저장", "배터리 아껴", "뒤부터 봐", "천천히 가",
             "불 켜", "숨어", "아이템 챙겨", "맵 봐", "앉아서 가", "소리 줄여"],
    QUESTION: ["방금 봄?", "저거 뭐야", "길 맞아?", "있었나?", "뭐임?", "방금 뭐였음",
               "저건 뭐지", "다들 봤음?", "소리 들림?", "어디로 감?", "여기 왔었나"],
    EXCLAIM: ["와", "미쳤다", "ㄷㄷㄷ", "헉", "헐", "어우", "아니", "와 진짜",
              "ㅁㅊ", "심장 나감", "깜짝이야", "와 놀랐다", "개무섭"],
    WARNING: ["뒤 뒤", "도망쳐", "오지 마", "문 닫아", "튀어", "가지마", "위험",
              "뒤에!!", "멈춰", "숨어 빨리", "왼쪽 왼쪽", "안돼", "불 꺼"],
    OBSERVE: ["뭐 지나감", "움직였어", "방금 소리", "저기 봐", "뭔가 있음", "그림자 봄",
              "저거 아까 없었는데", "방금 움직임", "위 봐", "구석", "벽 봐"],
    SCREAM: ["아아악", "뛰어", "안돼", "뒤에!!", "으악", "튀어튀어", "아 진짜",
             "ㅁㅊㅁㅊ", "심장", "악", "나가 빨리", "헐헐헐"],
    HINDSIGHT: ["아깝다", "늦었음", "그럴 줄", "아까 뛰지", "그러게", "말했잖아",
                "아까 봤어야", "에휴", "거봐", "내가 뭐랬어"],
    TEASE: ["ㅋㅋㅋㅋ", "또 속음", "겁먹었네", "귀신도 웃겠다", "리액션 ㅋㅋ",
            "ㅋㅋㅋㅋㅋㅋ", "쫄았네", "또 저기 감", "반응 봐", "무섭냐고"],
    REVIEW: ["판단 늦음", "길 잘못 감", "거의 잡힘", "다시 해보자", "아까가 문제",
             "루트 꼬임", "운 좋았다", "타이밍 늦음", "그래도 살았네"],
    STREAM_QUESTION: ["오늘 엔딩 봄?", "다음 겜 뭐임", "밝기 가능?", "안 무서움?",
                      "몇 시까지 함?", "이거 몇 편임", "마이크 좀", "이어폰 씀?"],
    OFF_TOPIC: ["배고프다", "벌써 이 시간", "잠 다 잤다", "채팅 조용하네", "나 내일 출근",
                "치킨 시킴", "눈 아파", "누워서 보는 중", "불 켜고 봄"],
    SUSPICION: ["뭔가 이상함", "또 반복됨", "쟤 뭐임", "방 구조 바뀜", "아까랑 다른데",
                "채팅 이상해", "저 사람 뭐지", "데자뷰", "이거 아까 봤는데"]
  });

  const SLOT_POOLS = Object.freeze({
    direction: ["왼쪽", "오른쪽", "뒤쪽", "복도 끝"],
    target: ["그림자", "인형", "괴물", "문"],
    location: ["복도", "지하실", "계단", "어두운 방"],
    item: ["손전등", "열쇠", "배터리", "회복 아이템"]
  });

  const SYNTHETIC_EVENTS = Object.freeze([
    { type: "SHADOW_MOVED",     intensity: .45, slots: { direction: "왼쪽",    target: "그림자",  location: "복도" } },
    { type: "DOOR_OPENED",      intensity: .58, slots: { direction: "뒤쪽",    target: "문",      location: "어두운 방" } },
    { type: "LOUD_NOISE",       intensity: .72, slots: { direction: "오른쪽",  target: "무언가",  location: "계단" } },
    { type: "LIGHTS_OUT",       intensity: .82, slots: { direction: "복도 끝", target: "그림자",  location: "지하실" } },
    { type: "MONSTER_APPEARED", intensity: .95, slots: { direction: "뒤쪽",    target: "괴물",    location: "복도" } }
  ]);

  /* ==========================================================================
   * 5. 표기 변형 자원
   *    반드시 IIFE 안에, 클래스보다 위에 있어야 합니다.
   * ======================================================================== */

  // 채팅 어미. 문장부호를 뗀 상태에서 매칭하므로 패턴에 부호를 넣지 마세요.
  // 위에서부터 순서대로 검사해 첫 매칭 하나만 적용합니다.
  const CHAT_ENDINGS = Object.freeze([
    [/거 같은데$/,   "듯"],
    [/거 같아$/,     "듯"],
    [/것 같다$/,     "듯"],
    [/있는데$/,      "있음"],
    [/없는데$/,      "없음"],
    [/했는데$/,      "했음"],
    [/움직인다$/,    "움직임"],
    [/온다$/,        "옴"],
    [/간다$/,        "감"],
    [/한다$/,        "함"],
    [/된다$/,        "됨"],
    [/났다$/,        "남"],
    [/났어$/,        "남"],
    [/본다$/,        "봄"],
    [/봤어$/,        "봄"],
    [/했어$/,        "함"],
    [/였어$/,        "임"],
    [/이야$/,        "임"],
    [/거야$/,        "거임"],
    [/맞아$/,        "맞음"],
    [/있어$/,        "있음"],
    [/없어$/,        "없음"],
    [/줄어든다$/,    "줄음"],
    [/아프다$/,      "아픔"],
    [/무섭다$/,      "무서움"],
    [/무서워$/,      "무서움"],
    [/미쳤다$/,      "미침"],
    [/위험했다$/,    "위험했음"],
    [/컸어$/,        "큼"],
    [/잡혔다$/,      "잡힘"],
    [/같다$/,        "듯"]
  ]);

  // 초성/밈 축약. 항목마다 abbrev 확률로 개별 판정합니다.
  // 어절 단위 전체 치환만 두세요. 부분 치환은 "ㅁㅊ다" 같은 어색한 결과를 냅니다.
  const ABBREVIATIONS = Object.freeze([
    [/정말/g,     "ㄹㅇ"],
    [/진짜/g,     "ㄹㅇ"],
    [/미쳤다/g,   "ㅁㅊ"],
    [/미침/g,     "ㅁㅊ"],
    [/괜찮아/g,   "ㄱㅊ"],
    [/그렇지/g,   "ㅇㅈ"],
    [/인정/g,     "ㅇㅈ"],
    [/감사/g,     "ㄱㅅ"],
    [/다음에/g,   "담에"],
    [/아니야/g,   "ㄴㄴ"],
    [/그러니까/g, "ㄱㄴㄲ"]
  ]);

  const TYPO_PAIRS = Object.freeze([
    ["지금", "지굼"], ["왼쪽", "왼쫀"], ["무서", "무셔"], ["뒤", "듸"],
    ["빨리", "빨ㄹ"], ["같이", "가치"], ["어디", "어됴"], ["그거", "그ㄱ"]
  ]);

  const CHOSEONG = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  const JUNGSEONG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";

  // "아" → "ㅇㅏ" 처럼 첫 글자를 자모로 흘리는 오타. 실제 채팅에서 흔합니다.
  function spillFirstSyllable(text) {
    if (!text) return text;
    const code = text.charCodeAt(0) - 0xac00;
    if (code < 0 || code > 11171) return text;
    if (code % 28 !== 0) return text;              // 받침 있으면 건드리지 않음
    const cho = Math.floor(code / 588);
    const jung = Math.floor((code % 588) / 28);
    return CHOSEONG[cho] + JUNGSEONG[jung] + text.slice(1);
  }

  /* ==========================================================================
   * 6. 시드 난수
   * ======================================================================== */
  class SeededRandom {
    constructor(seed) {
      this.state = (Number(seed) >>> 0) || 0x6d2b79f5;
    }

    next() {
      this.state += 0x6d2b79f5;
      let value = this.state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    }

    range(min, max) {
      return min + this.next() * (max - min);
    }

    pick(items) {
      return items[Math.floor(this.next() * items.length)];
    }

    shuffle(items) {
      const output = [...items];
      for (let index = output.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(this.next() * (index + 1));
        [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
      }
      return output;
    }

    weighted(entries) {
      const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
      if (!total) return entries[0]?.value;
      let cursor = this.range(0, total);
      for (const entry of entries) {
        cursor -= Math.max(0, entry.weight);
        if (cursor <= 0) return entry.value;
      }
      return entries.at(-1)?.value;
    }
  }

  /* ==========================================================================
   * 7. 엔진
   * ======================================================================== */
  class HorrorChatEngine {
    constructor(options) {
      this.viewers = options.viewers;
      this.onMessage = options.onMessage;
      this.onStateChange = options.onStateChange || (() => {});
      this.seed = Number(options.seed) >>> 0;
      this.random = new SeededRandom(this.seed);
      this.syntheticEvents = options.syntheticEvents !== false;
      this.externalContext = options.externalContext || {
        startedAt: Date.now(),
        initiallyFocused: typeof document === "undefined" ? true : document.hasFocus()
      };

      this.simTime = 0;
      this.tension = 0;
      this.state = "AMBIENT";
      this.lastEventAt = 0;
      this.burstUntil = 0;
      this.aftermathUntil = 0;
      this.queue = [];
      this.ambientQueued = false;
      this.futureEvent = null;
      this.timer = null;
      this.paused = false;
      this.running = false;
      this.lastSpeakerId = null;
      this.intentLastAt = new Map();
      this.recentOutputs = [];
      this.recentTemplates = [];
      this.recentSignatures = [];
      this.recentSemanticMessages = [];
      this.scene = { direction: "왼쪽", target: "문", location: "복도", item: "손전등" };
      this.debug = {
        speakerSelections: [],
        filterRejects: { exact: 0, template: 0, signature: 0, similarity: 0 },
        fallbackCount: 0,
        outputCount: 0,
        shortCount: 0,
        totalWords: 0,
        formalLeaks: 0,
        stateTransitions: [{ at: 0, state: "AMBIENT" }]
      };

      this.assignViewerModels();
    }

    assignViewerModels() {
      const personaKeys = this.random.shuffle(Object.keys(PERSONAS));
      const anomalyPermissions = this.random.shuffle(["PROPHECY", "OBSERVER", "PROPHECY"]);
      let anomalyIndex = 0;
      this.viewers.forEach((viewer, index) => {
        viewer.personaKey = personaKeys[index % personaKeys.length];
        viewer.memorySlots = {};
        viewer.lastSpokeAt = -60000 - index * 1000;
        viewer.lastObservedAt = -60000;
        viewer.engineSpeechCount = 0;
        viewer.anomalyLevel = viewer.anomalous ? 1 : 0;
        viewer.anomalyPermission = viewer.anomalous
          ? anomalyPermissions[anomalyIndex++ % anomalyPermissions.length]
          : null;
      });
    }

    /* ---------- 수명 주기 ---------- */

    start() {
      if (this.running) return;
      this.running = true;
      this.planFutureEvent();
      this.bootstrapMessages();
      this.enqueueAmbient(900);
      this.timer = window.setInterval(() => this.tick(), TUNING.tickMs);
    }

    stop() {
      this.running = false;
      window.clearInterval(this.timer);
      this.timer = null;
      this.queue.length = 0;
    }

    setPaused(paused) {
      this.paused = Boolean(paused);
    }

    tick() {
      if (!this.running || this.paused) return;
      this.simTime += TUNING.tickMs;
      const decayRate = Math.log(2) / TUNING.tensionHalfLifeMs;
      this.tension *= Math.exp(-decayRate * TUNING.tickMs);

      if (this.futureEvent && this.futureEvent.scheduledAt <= this.simTime) {
        const event = this.futureEvent;
        this.futureEvent = null;
        this.emitEvent(event.type, event.slots, event.intensity);
        this.planFutureEvent();
      }

      this.updateDirectorState();

      const due = [];
      while (this.queue.length && this.queue[0].scheduledAt <= this.simTime) due.push(this.queue.shift());
      due.sort((left, right) => right.priority - left.priority || left.scheduledAt - right.scheduledAt);
      due.forEach(request => {
        if (request.source === "ambient") this.ambientQueued = false;
        this.processRequest(request);
      });

      if (!this.ambientQueued) this.enqueueAmbient();
    }

    updateDirectorState() {
      let nextState = "AMBIENT";
      if (this.simTime < this.burstUntil) nextState = "BURST";
      else if (this.simTime < this.aftermathUntil) nextState = "AFTERMATH";
      else if (this.simTime - this.lastEventAt > TUNING.lullAfterMs) nextState = "LULL";
      else if (this.tension > TUNING.tenseThreshold) nextState = "TENSE";

      if (nextState !== this.state) {
        this.state = nextState;
        this.debug.stateTransitions.push({ at: this.simTime, state: nextState });
        this.debug.stateTransitions = this.debug.stateTransitions.slice(-30);
        this.onStateChange({ state: nextState, tension: this.tension });
      }
    }

    /* ---------- 큐 ---------- */

    enqueue(request) {
      this.queue.push({ priority: 1, threadId: null, ...request });
      this.queue.sort((left, right) => left.scheduledAt - right.scheduledAt || right.priority - left.priority);
    }

    enqueueAmbient(delay) {
      if (this.ambientQueued) return;
      const interval = TUNING.intervals[this.state];
      const wait = delay ?? this.random.range(interval[0], interval[1]);
      this.enqueue({
        intent: this.chooseIntent(this.state),
        scheduledAt: this.simTime + wait,
        source: "ambient",
        priority: 1,
        slotHints: {}
      });
      this.ambientQueued = true;
    }

    chooseIntent(state) {
      const weights = TUNING.stateIntents[state];
      const entries = Object.entries(weights).map(([intent, weight]) => {
        const elapsed = this.simTime - (this.intentLastAt.get(intent) ?? -60000);
        const cooldownFactor = Math.min(1, Math.max(.18, elapsed / TUNING.intentCooldownMs));
        return { value: intent, weight: weight * cooldownFactor };
      });
      return this.random.weighted(entries);
    }

    emitEvent(type, slots = {}, intensityOverride) {
      const preset = SYNTHETIC_EVENTS.find(event => event.type === type);
      const intensity = Math.min(1, Math.max(0, intensityOverride ?? preset?.intensity ?? .5));
      const mergedSlots = { ...(preset?.slots || {}), ...slots };
      this.scene = { ...this.scene, ...mergedSlots };
      this.lastEventAt = this.simTime;
      this.tension = Math.min(1, this.tension + intensity);

      if (intensity >= .7) {
        this.burstUntil = Math.max(this.burstUntil, this.simTime + TUNING.burstDurationMs);
        this.aftermathUntil = this.burstUntil + TUNING.aftermathDurationMs;
      }

      const count = 2 + Math.ceil(intensity * 3);
      for (let index = 0; index < count; index += 1) {
        const intent = intensity >= .7
          ? this.random.weighted([
              { value: "SCREAM", weight: 5 },
              { value: "EXCLAIM", weight: 3 },
              { value: "WARNING", weight: 2 }
            ])
          : this.random.weighted([
              { value: "OBSERVE", weight: 4 },
              { value: "WARNING", weight: 3 },
              { value: "QUESTION", weight: 2 }
            ]);
        this.enqueue({
          intent,
          eventRef: { type, happenedAt: this.simTime },
          slotHints: mergedSlots,
          scheduledAt: this.simTime + this.random.range(80, 1150),
          source: "event",
          priority: intensity >= .7 ? 3 : 2
        });
      }
      this.updateDirectorState();
    }

    planFutureEvent() {
      if (!this.syntheticEvents || this.futureEvent) return;
      const event = this.random.pick(SYNTHETIC_EVENTS);
      this.futureEvent = {
        ...event,
        slots: { ...event.slots },
        scheduledAt: this.simTime + this.random.range(8500, 14500)
      };
    }

    /* ---------- 화자 선택 ---------- */

    chooseSpeaker(intent, forcedSpeakerId) {
      if (forcedSpeakerId) return this.viewers.find(viewer => viewer.id === forcedSpeakerId && viewer.active);
      const active = this.viewers.filter(viewer => viewer.active);
      if (!active.length) return null;
      const alternatives = active.filter(viewer => viewer.id !== this.lastSpeakerId);
      const candidates = alternatives.length ? alternatives : active;

      const scored = candidates.map(viewer => {
        const persona = PERSONAS[viewer.personaKey];
        const elapsed = Math.max(0, this.simTime - viewer.lastSpokeAt);
        const fit = persona.fit[intent] ?? 1;
        const cooldown = Math.min(1, elapsed / persona.cooldownMs);
        const silence = Math.min(2.25, 1 + elapsed / 60000);
        const tension = 1 + this.tension * (persona.tensionResponse - 1);
        const weight = persona.desire * fit * Math.max(.04, cooldown) * silence * tension;
        return { viewer, weight, factors: { desire: persona.desire, fit, cooldown, silence, tension } };
      });

      const selected = this.random.weighted(scored.map(entry => ({ value: entry.viewer, weight: entry.weight })));
      this.debug.speakerSelections.push({
        at: this.simTime,
        intent,
        selected: selected?.id,
        candidates: scored.map(entry => ({
          id: entry.viewer.id,
          weight: Number(entry.weight.toFixed(3)),
          ...entry.factors
        }))
      });
      this.debug.speakerSelections = this.debug.speakerSelections.slice(-20);
      return selected;
    }

    /* ---------- 발화 처리 ---------- */

    processRequest(originalRequest, options = {}) {
      const request = { ...originalRequest };
      if (this.simTime - request.scheduledAt > TUNING.requestExpiryMs
          && ["WARNING", "SCREAM"].includes(request.intent)) {
        request.intent = "HINDSIGHT";       // 뒷북 의도로 변환
      }

      const viewer = this.chooseSpeaker(request.intent, request.forcedSpeakerId);
      if (!viewer) return;

      let utterance;
      for (let attempt = 0; attempt < TUNING.maxGenerationRetries; attempt += 1) {
        const candidate = this.generateCandidate(viewer, request);
        const rejection = this.findRejection(candidate);
        if (!rejection || options.skipFilters) {
          utterance = candidate;
          break;
        }
        this.debug.filterRejects[rejection] += 1;
      }

      if (!utterance) {
        this.debug.fallbackCount += 1;
        utterance = this.generateShortCandidate(viewer, request.intent, request.slotHints, true);
      }

      this.recordUtterance(viewer, request, utterance, options);
    }

    /* ---------- 내용 생성 ---------- */

    generateCandidate(viewer, request) {
      const anomalyOverride = this.createAnomalyOverride(viewer, request);
      if (anomalyOverride) return anomalyOverride;

      const persona = PERSONAS[viewer.personaKey];
      const level = viewer.anomalous ? viewer.anomalyLevel : 0;
      const useFormal = level >= TUNING.formalFromLevel;

      // 이상도가 높을수록 짧은 반응을 덜 씁니다 (혼자 문장을 쓰게 만들기 위해)
      const anomalyFactor = 1 - level / TUNING.maxAnomalyLevel;
      const shortChance = Math.min(.92, persona.shortChance * (1 + this.tension * 1.5) * anomalyFactor);
      if (!useFormal && this.random.next() < shortChance) {
        return this.generateShortCandidate(viewer, request.intent, request.slotHints);
      }

      const templates = TEMPLATES[request.intent] || TEMPLATES.CHAT;
      const [templateId, formalTemplate, chatTemplate] = this.random.pick(templates);
      const slots = {};

      const fill = source => source.replace(/\{([^}|]+)(?:\|([^}]+))?\}/g, (_, slotName, particle) => {
        const value = slots[slotName] ?? this.resolveSlot(slotName, request.slotHints, viewer);
        slots[slotName] = value;
        return particle ? this.attachParticle(value, particle) : value;
      });

      const chatFilled = fill(chatTemplate);
      const formalFilled = fill(formalTemplate);

      // 정중형은 변형기를 통과시키지 않습니다. 그게 이상 시청자의 정체입니다.
      const text = useFormal ? formalFilled : this.transformStyle(chatFilled, viewer);

      return {
        text,
        // 유사도 필터는 반드시 변형 이전 형태로 비교해야 합니다.
        standardText: formalFilled,
        templateId,
        signature: this.signature(templateId, slots),
        slots,
        short: false
      };
    }

    generateShortCandidate(viewer, intent, slotHints = {}, fallback = false) {
      const pool = SHORT_LINES[intent] || SHORT_LINES.EXCLAIM;
      const unusedPool = fallback ? pool.filter(line => !this.recentOutputs.includes(line)) : pool;
      let text = this.random.pick(unusedPool.length ? unusedPool : pool);
      const baseText = text;

      if (fallback && this.recentOutputs.includes(text)) {
        text += this.random.next() < .5 ? "!" : "?";
      }

      const style = PERSONAS[viewer.personaKey].style;
      if (!fallback && !viewer.anomalous && style.emote > .6 && this.random.next() < .35) {
        text += this.random.pick(style.emotePool);
      }

      return {
        text,
        standardText: baseText,
        templateId: `short:${intent}:${pool.indexOf(baseText)}`,
        signature: `short:${intent}:${baseText}`,
        slots: { ...slotHints },
        short: true
      };
    }

    createAnomalyOverride(viewer, request) {
      if (!viewer.anomalous || viewer.anomalyLevel < 2) return null;
      const chance = { 2: .22, 3: .5, 4: .78 }[viewer.anomalyLevel];
      if (this.random.next() >= chance) return null;

      const useFormal = viewer.anomalyLevel >= TUNING.formalFromLevel;
      const dress = standardText => useFormal ? standardText : this.transformStyle(standardText, viewer);

      if (viewer.anomalyPermission === "PROPHECY" && this.futureEvent) {
        const target = this.futureEvent.slots.target || "무언가";
        const direction = this.futureEvent.slots.direction || "뒤쪽";
        const seconds = Math.max(1, Math.ceil((this.futureEvent.scheduledAt - this.simTime) / 1000));
        const standardText = `${seconds}초 뒤에 ${direction}에서 ${this.attachParticle(target, "이/가")} 나타날 것입니다.`;
        return {
          text: dress(standardText),
          standardText,
          templateId: "anomaly:prophecy",
          signature: `anomaly:prophecy:${target}:${direction}:${seconds}`,
          slots: { target, direction },
          short: false,
          anomalyEvidence: "PROPHECY"
        };
      }

      if (viewer.anomalyPermission === "OBSERVER") {
        const elapsedSeconds = Math.floor(this.simTime / 1000);
        const startedAt = new Date(this.externalContext.startedAt);
        const time = `${String(startedAt.getHours()).padStart(2, "0")}시 ${String(startedAt.getMinutes()).padStart(2, "0")}분`;
        const standardText = this.random.next() < .5
          ? `방송을 시작한 지 정확히 ${elapsedSeconds}초가 지났습니다.`
          : `당신이 이 창을 연 시각은 ${time}입니다.`;
        return {
          text: dress(standardText),
          standardText,
          templateId: "anomaly:observer",
          signature: `anomaly:observer:${Math.floor(elapsedSeconds / 5)}`,
          slots: {},
          short: false,
          anomalyEvidence: "OBSERVER"
        };
      }
      return null;
    }

    resolveSlot(name, hints, viewer) {
      const value = hints?.[name]
        ?? viewer.memorySlots[name]
        ?? this.scene[name]
        ?? this.random.pick(SLOT_POOLS[name] || ["무언가"]);
      viewer.memorySlots[name] = value;
      return value;
    }

    attachParticle(value, pair) {
      const lastCharacter = String(value).at(-1);
      const code = lastCharacter?.charCodeAt(0) ?? 0;
      const isHangul = code >= 0xac00 && code <= 0xd7a3;
      const finalConsonant = isHangul ? (code - 0xac00) % 28 : 0;
      if (pair === "으로/로") {
        return `${value}${finalConsonant !== 0 && finalConsonant !== 8 ? "으로" : "로"}`;
      }
      const [withConsonant, withoutConsonant] = pair.split("/");
      return `${value}${finalConsonant ? withConsonant : withoutConsonant}`;
    }

    /* ---------- 표기 변형기 ---------- */

    transformStyle(input, viewer) {
      const persona = PERSONAS[viewer.personaKey];
      const style = persona.style;
      // 이상도가 올라갈수록 모든 변형 확률이 0으로 수렴합니다.
      const factor = viewer.anomalous
        ? Math.max(0, 1 - viewer.anomalyLevel / TUNING.maxAnomalyLevel)
        : 1;
      const roll = probability => this.random.next() < probability * factor;
      let text = input;

      // 1) 주어구 절단 — 길이를 줄이는 가장 강력한 수단
      let words = text.split(/\s+/).filter(Boolean);
      if (words.length >= 4 && roll(style.trim)) {
        words = words.slice(1);
        text = words.join(" ");
      }

      // 2) 조사 생략 — 어절마다 개별 판정
      text = text.replace(
        /([가-힣]{1,6}?)(은|는|이|가|을|를|에서|으로|에게)(?=\s|$)/g,
        (match, stem) => roll(style.particle) ? stem : match
      );

      // 3) 채팅 어미 — 문장부호를 뗀 상태로 검사, 첫 매칭 하나만
      if (roll(style.ending)) {
        const hasQuestion = /\?$/.test(text);
        let core = text.replace(/[.!?]+$/, "");
        for (const [pattern, replacement] of CHAT_ENDINGS) {
          if (pattern.test(core)) {
            core = core.replace(pattern, replacement);
            break;
          }
        }
        text = core + (hasQuestion ? "?" : "");
      }

      // 4) 초성/밈 축약 — 항목마다 개별 판정
      for (const [pattern, replacement] of ABBREVIATIONS) {
        if (pattern.test(text) && roll(style.abbrev)) text = text.replace(pattern, replacement);
      }

      // 5) 띄어쓰기 붕괴 — 띄어쓰기마다 개별 판정
      const parts = text.split(/\s+/).filter(Boolean);
      text = parts.reduce(
        (acc, word, index) => index === 0 ? word : acc + (roll(style.spacing) ? "" : " ") + word,
        ""
      );

      // 6) 문장부호 제거 — 물음표는 채팅에서도 살아남으므로 보존
      if (roll(style.punctuation)) text = text.replace(/[.!]+$/g, "");

      // 7) 이모트 — 성격별 풀에서, 앞쪽 항목이 자주 나오도록 가중
      if (roll(style.emote) && style.emotePool?.length) {
        const pool = style.emotePool;
        const skewed = Math.abs(this.random.next() - this.random.next());
        text += pool[Math.min(pool.length - 1, Math.floor(skewed * pool.length))];
      }

      // 8) 물음표 / 느낌표 늘리기
      if (/[?!]$/.test(text) && roll(style.emote * .6)) text += text.at(-1);

      // 9) 오타
      if (roll(style.typo)) {
        if (this.random.next() < .4) {
          text = spillFirstSyllable(text);
        } else {
          const [from, to] = this.random.pick(TYPO_PAIRS);
          text = text.replace(from, to);
        }
      }

      // 개발용 안전망 — 정중형이 새어 나오면 즉시 알려줍니다.
      if (factor > 0 && /습니다|습니까|십시오/.test(text)) {
        this.debug.formalLeaks += 1;
        console.warn("[말투] 정중형 누출:", input, "→", text);
      }

      return text.trim();
    }

    /* ---------- 중복 필터 ---------- */

    findRejection(candidate) {
      if (this.recentOutputs.includes(candidate.text)) return "exact";
      if (this.recentTemplates.slice(-8).includes(candidate.templateId)) return "template";
      if (this.recentSignatures.slice(-25).includes(candidate.signature)) return "signature";
      // 변형 이전 형태끼리 비교해야 표기만 다른 같은 문장을 잡을 수 있습니다.
      const normalized = this.normalizeForSimilarity(candidate.standardText);
      const isSimilar = this.recentSemanticMessages
        .slice(-15)
        .some(previous => this.jaccardBigrams(normalized, previous) > TUNING.similarityThreshold);
      if (isSimilar) return "similarity";
      return null;
    }

    normalizeForSimilarity(text) {
      return text.normalize("NFKD").replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();
    }

    jaccardBigrams(left, right) {
      const toBigrams = value => {
        const set = new Set();
        for (let index = 0; index < value.length - 1; index += 1) set.add(value.slice(index, index + 2));
        return set;
      };
      const leftSet = toBigrams(left);
      const rightSet = toBigrams(right);
      if (!leftSet.size && !rightSet.size) return 1;
      let intersection = 0;
      leftSet.forEach(value => { if (rightSet.has(value)) intersection += 1; });
      return intersection / (leftSet.size + rightSet.size - intersection || 1);
    }

    signature(templateId, slots) {
      return `${templateId}:${Object.entries(slots).map(([key, value]) => `${key}=${value}`).join("|")}`;
    }

    /* ---------- 기록 및 출력 ---------- */

    recordUtterance(viewer, request, utterance, options) {
      viewer.lastSpokeAt = this.simTime;
      viewer.engineSpeechCount += 1;

      if (!options.historyOnly) {
        this.lastSpeakerId = viewer.id;
        this.intentLastAt.set(request.intent, this.simTime);
        this.recentOutputs.push(utterance.text);
        this.recentTemplates.push(utterance.templateId);
        this.recentSignatures.push(utterance.signature);
        this.recentSemanticMessages.push(this.normalizeForSimilarity(utterance.standardText));
        this.recentOutputs = this.recentOutputs.slice(-40);
        this.recentTemplates = this.recentTemplates.slice(-12);
        this.recentSignatures = this.recentSignatures.slice(-25);
        this.recentSemanticMessages = this.recentSemanticMessages.slice(-15);
        this.debug.outputCount += 1;
        this.debug.totalWords += utterance.text.split(/\s+/).filter(Boolean).length;
        if (utterance.short) this.debug.shortCount += 1;
      }

      if (viewer.anomalous && !options.historyOnly && this.state !== "BURST"
          && viewer.engineSpeechCount % TUNING.anomalySpeechStep === 0) {
        viewer.anomalyLevel = Math.min(TUNING.maxAnomalyLevel, viewer.anomalyLevel + 1);
      }

      this.onMessage({
        viewer,
        text: utterance.text,
        standardText: utterance.standardText,
        intent: request.intent,
        state: this.state,
        tension: this.tension,
        anomalyEvidence: utterance.anomalyEvidence || null,
        historyOnly: Boolean(options.historyOnly),
        behavior: options.behavior || "smooth"
      });
    }

    bootstrapMessages() {
      this.viewers.forEach(viewer => {
        this.processRequest(
          { intent: "CHAT", scheduledAt: this.simTime, forcedSpeakerId: viewer.id, slotHints: {}, source: "bootstrap" },
          { historyOnly: true, skipFilters: true, behavior: "auto" }
        );
      });
      this.random.shuffle(this.viewers).forEach(viewer => {
        this.processRequest(
          { intent: this.chooseIntent("AMBIENT"), scheduledAt: this.simTime, forcedSpeakerId: viewer.id, slotHints: {}, source: "bootstrap" },
          { behavior: "auto" }
        );
      });
      this.random.shuffle(this.viewers.filter(viewer => viewer.anomalous)).slice(0, 2).forEach(viewer => {
        this.processRequest(
          { intent: "OBSERVE", scheduledAt: this.simTime, forcedSpeakerId: viewer.id, slotHints: {}, source: "bootstrap" },
          { behavior: "auto" }
        );
      });
    }

    observeViewer(viewerId) {
      const viewer = this.viewers.find(candidate => candidate.id === viewerId && candidate.active);
      if (!viewer?.anomalous || this.state === "BURST" || this.paused) return;
      if (this.simTime - viewer.lastObservedAt < 5000) return;
      viewer.lastObservedAt = this.simTime;
      viewer.anomalyLevel = Math.min(TUNING.maxAnomalyLevel, viewer.anomalyLevel + 1);
    }

    /* ---------- 디버그 ---------- */

    getDebugSnapshot() {
      const outputs = this.debug.outputCount || 1;
      return {
        seed: this.seed,
        simTime: this.simTime,
        tension: Number(this.tension.toFixed(4)),
        state: this.state,
        queueLength: this.queue.length,
        style: {
          averageWords: Number((this.debug.totalWords / outputs).toFixed(2)),
          shortRatio: Number((this.debug.shortCount / outputs).toFixed(2)),
          fallbackRatio: Number((this.debug.fallbackCount / outputs).toFixed(2)),
          formalLeaks: this.debug.formalLeaks
        },
        nextFutureEvent: this.futureEvent
          ? { type: this.futureEvent.type, scheduledAt: this.futureEvent.scheduledAt, slots: { ...this.futureEvent.slots } }
          : null,
        viewers: this.viewers.map(viewer => ({
          id: viewer.id,
          name: viewer.name,
          persona: viewer.personaKey,
          active: viewer.active,
          anomalous: viewer.anomalous,
          anomalyPermission: viewer.anomalyPermission,
          anomalyLevel: viewer.anomalyLevel,
          speechCount: viewer.engineSpeechCount
        })),
        debug: JSON.parse(JSON.stringify(this.debug))
      };
    }
  }

  window.HorrorChatEngine = HorrorChatEngine;
  window.HORROR_CHAT_TUNING = TUNING;
  window.HORROR_CHAT_PERSONAS = PERSONAS;
})();