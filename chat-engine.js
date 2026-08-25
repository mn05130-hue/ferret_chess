(() => {
  "use strict";

  /* ==========================================================================
   * 1. 튜닝 상수
   *
   *    상태 의미는 저스트 채팅 기준입니다.
   *      AMBIENT   평범한 잡담
   *      TENSE     스트리머가 뭔가 하는 중, 반응이 몰리기 시작
   *      BURST     빵 터진 순간, 도배
   *      AFTERMATH 여운. 놀리기 / 회상 / 클립 얘기
   *      LULL      할 말 없음. 뻘소리와 질문 폭탄
   * ======================================================================== */
  const TUNING = Object.freeze({
    tickMs: 100,
    tensionHalfLifeMs: 10000,
    tenseThreshold: 0.4,
    burstDurationMs: 3000,
    aftermathDurationMs: 9000,
    lullAfterMs: 25000,
      requestExpiryMs: 2500,
      maxAnomalyLevel: 4,
      anomalySpeechStep: 3,
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

  /* ==========================================================================
   * 3. 템플릿 — [templateId, 정중형(이상도 3+), 채팅형(평소)]
   *
   *    정상 시청자 라인에는 공포 어휘가 한 단어도 들어가지 않습니다.
   *    채팅형은 어절 2~4개를 넘기지 마세요.
   * ======================================================================== */
  const TEMPLATES = Object.freeze({
    GREET: [
      ["greet-hi",    "안녕하십니까, 오늘도 잘 부탁드립니다.",   "안녕"],
      ["greet-late",  "조금 늦게 들어왔습니다.",                 "늦게 들어왔다"],
      ["greet-back",  "잠시 자리를 비웠다가 돌아왔습니다.",       "다시 왔어"],
      ["greet-first", "오늘 처음 보러 왔습니다.",                "오늘 처음 왔어"],
      ["greet-work",  "퇴근하고 바로 들어왔습니다.",             "퇴근하고 바로 왔다"]
    ],
    CHAT: [
      ["chat-today",   "오늘 방송 분위기가 좋습니다.",           "오늘 분위기 좋다"],
      ["chat-topic",   "{topic} 계속 듣고 싶습니다.",            "{topic} 더 해줘"],
      ["chat-weather", "오늘은 밖이 정말 더웠습니다.",           "오늘 밖에 더웠어"],
      ["chat-lying",   "누워서 편하게 보고 있습니다.",           "누워서 보는 중"],
      ["chat-mood",    "이런 잡담 방송이 제일 편합니다.",        "이런 잡담이 제일 편해"],
      ["chat-work",    "일하면서 틀어 놓고 있습니다.",           "일하면서 틀어놨어"]
    ],
    REACT: [
      ["react-what",    "방금 그 이야기가 정말 놀랍습니다.",     "방금 그거 놀랍다"],
      ["react-empathy", "그 부분은 정말 공감이 됩니다.",         "그건 진짜 공감된다"],
      ["react-wow",     "생각보다 훨씬 대단합니다.",             "생각보다 대단하다"],
      ["react-again",   "방금 그 부분을 다시 듣고 싶습니다.",     "방금 그거 다시"],
      ["react-real",    "정말입니까?",                          "진짜야?"],
      ["react-shock",   "그 이야기는 조금 충격적입니다.",         "그거 좀 충격이다"]
    ],
    LAUGH: [
      ["laugh-hard",  "지금 크게 웃었습니다.",                  "방금 크게 웃었다"],
      ["laugh-clip",  "지금 부분은 편집해야 합니다.",            "지금 거 편집각"],
      ["laugh-again", "같은 말을 또 하고 있습니다.",             "같은 말 또 한다"],
      ["laugh-face",  "지금 표정이 정말 웃깁니다.",              "지금 표정 웃긴다"],
      ["laugh-sound", "웃음소리가 더 웃깁니다.",                 "웃음소리가 더 웃겨"],
      ["laugh-out",   "옆방에 들릴 정도로 웃었습니다.",          "옆방까지 들리게 웃었다"]
    ],
    TEASE: [
      ["tease-old",   "그 이야기는 저번에도 하셨습니다.",        "그거 저번에도 했어"],
      ["tease-lie",   "그 말은 믿기가 조금 어렵습니다.",         "그 말 못 믿겠는데"],
      ["tease-fail",  "방금 실수하신 것 같습니다.",              "방금 실수했다"],
      ["tease-brag",  "자랑이 조금 길어지고 있습니다.",          "자랑 좀 길어진다"],
      ["tease-late",  "오늘도 늦게 시작했습니다.",               "오늘도 늦게 시작함"],
      ["tease-food",  "{food} 이야기만 계속 하고 있습니다.",     "{food} 얘기만 계속 한다"]
    ],
    QUESTION: [
      ["question-plan",  "오늘은 몇 시까지 방송합니까?",         "오늘 몇 시까지 해?"],
      ["question-topic", "{topic} 어떻게 됐습니까?",             "{topic} 어떻게 됐어?"],
      ["question-food",  "저녁은 드셨습니까?",                   "저녁 먹었어?"],
      ["question-next",  "다음 방송은 언제입니까?",              "다음 방송 언제야?"],
      ["question-thing", "{thing} 새로 바꾸셨습니까?",           "{thing} 새로 바꿨어?"],
      ["question-sleep", "어제는 몇 시에 주무셨습니까?",         "어제 몇 시에 잤어?"]
    ],
    AGREE: [
      ["agree-yes",   "그 말이 정말 맞습니다.",                 "그 말 맞아"],
      ["agree-me",    "저도 완전히 같은 생각입니다.",            "나도 완전 같은 생각이야"],
      ["agree-same",  "저도 어제 같은 일이 있었습니다.",         "나도 어제 그랬어"],
      ["agree-know",  "그 기분을 정말 잘 압니다.",               "그 기분 잘 안다"],
      ["agree-right", "역시 그렇게 하는 것이 맞습니다.",         "역시 그게 맞아"]
    ],
    NAG: [
      ["nag-water",   "물을 조금 마시는 것이 좋겠습니다.",       "물 좀 마셔"],
      ["nag-posture", "자세가 조금 무너졌습니다.",               "자세 무너졌다"],
      ["nag-rest",    "잠시 쉬었다 하는 것이 좋겠습니다.",       "좀 쉬었다 해"],
      ["nag-sleep",   "오늘은 일찍 주무시는 것이 좋겠습니다.",   "오늘은 일찍 자"],
      ["nag-thing",   "{thing} 위치를 조금 조정해야 합니다.",    "{thing} 위치 좀 고쳐"],
      ["nag-meal",    "끼니는 거르지 않는 것이 좋겠습니다.",     "끼니 거르지 마"]
    ],
    STORY: [
      ["story-day",     "오늘 하루가 정말 길었습니다.",           "오늘 하루 길었다"],
      ["story-work",    "회사에서 있었던 일이 아직도 생각납니다.", "회사 일 아직 생각난다"],
      ["story-tired",   "요즘 계속 피곤합니다.",                  "요즘 계속 피곤해"],
      ["story-food",    "점심에 {food} 먹었습니다.",              "점심에 {food} 먹었어"],
      ["story-weekend", "이번 주말에는 아무것도 하지 않았습니다.", "주말에 아무것도 안 했어"]
    ],
    FOOD: [
      ["food-want",  "{food} 먹고 싶어졌습니다.",                  "{food} 먹고 싶다"],
      ["food-order", "방금 {food} 시켰습니다.",                    "방금 {food} 시켰어"],
      ["food-late",  "이 시간에 먹으면 안 되는데 참기 어렵습니다.", "이 시간에 먹으면 안 되는데"],
      ["food-ask",   "{food} 좋아하십니까?",                       "{food} 좋아해?"],
      ["food-eat",   "지금 {food} 먹으면서 보고 있습니다.",         "지금 {food} 먹으면서 봐"]
    ],
    RECALL: [
      ["recall-day",     "{day} 방송이 정말 재미있었습니다.",      "{day} 방송 재밌었어"],
      ["recall-topic",   "{day}에도 {topic} 이야기를 하셨습니다.", "{day}에도 {topic} 얘기했어"],
      ["recall-scene",   "그 장면은 아직도 기억납니다.",           "그 장면 아직 기억난다"],
      ["recall-miss",    "{day} 방송은 놓쳤습니다.",               "{day} 방송 놓쳤어"],
      ["recall-promise", "{day}에 하신 약속이 있었습니다.",        "{day}에 약속했잖아"]
    ],
    COMPLAIN: [
      ["complain-mic",   "마이크 소리가 조금 작습니다.",         "마이크 소리 좀 작아"],
      ["complain-light", "화면이 조금 어둡습니다.",              "화면 좀 어둡다"],
      ["complain-lag",   "화면이 잠깐 끊겼습니다.",              "화면 잠깐 끊겼어"],
      ["complain-bgm",   "배경음이 조금 큽니다.",                "브금 좀 크다"],
      ["complain-echo",  "소리가 조금 울립니다.",                "소리 좀 울린다"]
    ],
    /* SUSPICION은 정상 시청자가 "채팅이 좀 이상하다"고 느끼는 지점입니다.
       가중치를 낮게 유지하세요. 자주 나오면 힌트가 아니라 소음이 됩니다. */
    SUSPICION: [
      ["suspicion-chat",   "채팅에 조금 이상한 사람이 있는 것 같습니다.", "채팅에 이상한 사람 있는 거 같은데"],
      ["suspicion-repeat", "방금 그 채팅을 아까도 본 것 같습니다.",      "방금 그 채팅 아까도 봤는데"],
      ["suspicion-name",   "같은 닉네임이 두 번 보이는 것 같습니다.",     "같은 닉 두 개 있는데"],
      ["suspicion-count",  "시청자 수가 조금 전과 다릅니다.",            "시청자 수 아까랑 다르다"],
      ["suspicion-know",   "저 사람은 그것을 어떻게 아는 것입니까?",      "저 사람 저걸 어떻게 알아"]
    ]
  });

  /* ==========================================================================
   * 4. 초단문 풀 — 전체 발화의 절반 이상이 여기서 나갑니다.
   * ======================================================================== */
  const SHORT_LINES = Object.freeze({
    GREET: ["ㅎㅇ", "안녕", "왔다", "ㅎㅇㅎㅇ", "출첵", "지금 왔음",
            "안녕하세요", "오늘도 왔다", "이제 봄", "늦게 왔다"],
    CHAT: ["ㅇㅇ", "그니까", "오늘 좋네", "편하다", "잘 보고 있음", "ㅋㅋ",
           "분위기 좋다", "누워서 봄", "일하면서 봄", "재밌다", "오늘 뭐 함?"],
    REACT: ["헐", "와", "진짜?", "대박", "ㄷㄷ", "미쳤다", "말도 안 돼",
            "실화?", "헉", "와 진짜", "우와", "장난 아니네"],
    LAUGH: ["ㅋㅋㅋㅋ", "ㅋㅋㅋㅋㅋㅋ", "아 웃겨", "편집각", "ㅋㅋㅋ",
            "미쳤다ㅋㅋ", "아 진짜ㅋㅋ", "터졌다", "ㅋㅋㅋㅋㅋㅋㅋ", "숨넘어감"],
    TEASE: ["또 시작", "거짓말ㅋㅋ", "저번에도 그랬어", "믿는 사람?", "또 저래",
            "실수했다", "자랑 그만", "이번엔 진짜?", "매번 저럼"],
    QUESTION: ["몇 시까지 해?", "밥 먹었어?", "그래서 어떻게 됨?", "다음 언제야?",
               "그거 뭐임?", "어디서 샀어?", "왜?", "진짜 그랬어?", "무슨 얘기임?"],
    AGREE: ["ㅇㅈ", "ㄹㅇ", "맞아맞아", "나도", "그니까", "인정",
            "완전 공감", "나도 그럼", "ㅇㅇ 맞음", "그거지"],
    NAG: ["물 마셔", "자세", "좀 쉬어", "일찍 자", "밥 먹어", "허리 펴",
          "목 아프겠다", "무리하지 마", "스트레칭 좀"],
    STORY: ["나 오늘 힘들었음", "퇴근하고 왔다", "피곤하다", "주말에 뻗음",
            "회사 지옥", "나도 오늘 그랬어", "내일도 출근", "쉬고 싶다"],
    FOOD: ["배고파", "치킨 시킬까", "야식각", "지금 먹는 중", "먹고 싶다",
           "떡볶이 땡긴다", "다이어트 망함", "라면 끓임", "군침"],
    RECALL: ["저번에도 그랬어", "그거 기억난다", "지난 방송 재밌었음", "그때 그거",
             "놓쳤는데", "다시보기 봄", "저번주 그 얘기"],
    COMPLAIN: ["마이크 작아", "화면 어두워", "소리 울림", "브금 크다",
               "끊겼음", "화질 낮음", "소리 좀"],
    SUSPICION: ["쟤 뭐임", "채팅 이상해", "방금 그거 뭐야", "저 사람 뭐지",
                "아까도 봤는데", "닉 두 개임", "소름", "지금 뭐라고 함?"]
  });

  const SLOT_POOLS = Object.freeze({
    topic: ["어제 얘기", "회사 얘기", "그 드라마", "새로 산 거", "여행 얘기", "그 영화"],
    food:  ["치킨", "떡볶이", "마라탕", "라면", "곱창", "피자", "김밥"],
    thing: ["마이크", "조명", "의자", "카메라", "브금", "키보드"],
    day:   ["어제", "지난주", "저번 방송", "지지난주", "저번에"]
  });

  /* ==========================================================================
   * 5. 방송 이벤트 — 저스트 채팅 기준
   *
   *    omen은 예언형 이상 시청자가 미리 말해버릴 문구입니다.
   *    게임 쪽에서 emitEvent(type, slots, intensity)로 직접 호출해도 됩니다.
   * ======================================================================== */
  const SYNTHETIC_EVENTS = Object.freeze([
    { type: "STORY_STARTED",  intensity: .35, omen: "새로운 이야기가 시작될 것입니다.",
      slots: { topic: "어제 얘기" } },
    { type: "FOOD_ARRIVED",   intensity: .45, omen: "배달이 도착할 것입니다.",
      slots: { food: "치킨" } },
    { type: "TECH_TROUBLE",   intensity: .50, omen: "장비에 문제가 생길 것입니다.",
      slots: { thing: "마이크" } },
    { type: "DONATION_READ",  intensity: .55, omen: "후원 메시지가 읽힐 것입니다.",
      slots: { topic: "후원 얘기" } },
    { type: "SLIP_OF_TONGUE", intensity: .62, omen: "실언이 나올 것입니다.",
      slots: { topic: "방금 그 말" } },
    { type: "DOORBELL",       intensity: .72, omen: "초인종이 울릴 것입니다.",
      slots: { thing: "현관" } },
    { type: "BIG_LAUGH",      intensity: .88, omen: "크게 웃음이 터질 것입니다.",
      slots: { topic: "그 얘기" } }
  ]);

  /* ==========================================================================
   * 6. 이상 시청자 대사 풀
   *
   *  공포 요소는 전부 여기에만 있습니다.
   *  "이상함"은 문장 데이터가 아니라 접근 권한으로 구현됩니다.
   *
   *  각 라인의 필드
   *    id     중복 필터용 식별자. 유일해야 합니다.
   *    level  편집용 강도 태그. 시청자의 anomalyLevel과는 무관합니다.
   *    mode   "casual" 변형기 강제 통과 (겉보기 정상 채팅, 내용만 이상함)
   *           "formal" 변형기 미통과 (정중한 완결 문장)
   *           "raw"    변형기 미통과 (깨진 표기 그대로)
   *    needs  이 라인에 필요한 컨텍스트가 있는지 검사 (없으면 후보에서 제외)
   *    bypass true면 중복 필터를 건너뜁니다 (모방형처럼 복제가 목적인 경우)
   *    make   실제 문장을 만드는 함수
   *
   *  ctx로 넘어오는 값
   *    seconds   다음 방송 이벤트까지 남은 초
   *    omen      다음 이벤트의 예고 문구
   *    elapsed   방송 시작 후 경과 초
   *    clock     창을 연 시각 "23시 41분"
   *    nowClock  지금 이 순간의 실제 시각
   *    day       "어제" / "지난주" 등
   *    nickname  이 이상 시청자 본인의 닉네임
   *    otherNick 다른 활성 시청자의 닉네임
   *    lastText  바로 직전에 채팅창에 올라온 문장
   * ======================================================================== */
  const ANOMALY_LINES = Object.freeze({

    /* ---- 예언형 : 아직 일어나지 않은 방송 이벤트를 읽습니다 ---- */
    PROPHECY: [
      { id: "pro-soon",   level: 2, mode: "casual", needs: c => c.seconds != null,
        make: c => `${c.seconds}초 뒤 장면을 이미 봤어 넌 아직 못 봤고` },
      { id: "pro-hint",   level: 2, mode: "casual",
        make: () => `아직 일어나지 않은 장면이 자꾸 기억나` },
      { id: "pro-count",  level: 2, mode: "casual", needs: c => c.seconds != null,
        make: c => `지금부터 ${c.seconds}초 세면 방송이 한 번 끊겨` },
      { id: "pro-omen",   level: 3, mode: "formal", needs: c => c.omen != null,
        make: c => `${c.seconds}초 뒤에 ${c.omen}` },
      { id: "pro-seen",   level: 3, mode: "formal", needs: c => c.omen != null,
        make: c => `${c.omen} 저는 이미 봤습니다.` },
      { id: "pro-tick",   level: 3, mode: "raw", needs: c => c.seconds != null && c.seconds >= 3,
        make: c => `${c.seconds}... ${c.seconds - 1}... ${c.seconds - 2}...` },
      { id: "pro-know",   level: 4, mode: "formal",
        make: () => `이 다음 장면을 저는 알고 있습니다. 당신도 곧 알게 됩니다.` },
      { id: "pro-repeat", level: 4, mode: "raw", needs: c => c.seconds != null,
        make: c => `${c.seconds}초. ${c.seconds}초. ${c.seconds}초.` },
      { id: "pro-nostop", level: 4, mode: "formal",
        make: () => `막을 수 없습니다. 이미 정해져 있습니다.` }
    ],

    /* ---- 관찰형 : 게임 밖 정보를 읽습니다 ---- */
    OBSERVER: [
      { id: "obs-elapsed", level: 2, mode: "casual",
        make: c => `네가 방송 켠 지 정확히 ${c.elapsed}초 지났어` },
      { id: "obs-late",    level: 2, mode: "casual",
        make: c => `지금 네 시계도 ${c.nowClock}로 보이지?` },
      { id: "obs-look",    level: 2, mode: "casual",
        make: () => `너 방금 화면 말고 내 쪽 봤지` },
      { id: "obs-alone",   level: 2, mode: "casual",
        make: () => `지금 네 뒤에는 아무도 없네 아직은` },
      { id: "obs-open",    level: 3, mode: "formal",
        make: c => `당신이 이 창을 연 시각은 ${c.clock}입니다.` },
      { id: "obs-spam",    level: 3, mode: "raw",
        make: () => `너지금나봤지너지금나봤지너지금나봤지` },
      { id: "obs-one",     level: 3, mode: "formal",
        make: () => `지금 이 채팅을 읽고 있는 사람은 한 명뿐입니다.` },
      { id: "obs-quiet",   level: 3, mode: "formal",
        make: () => `방 안이 조용해서 다행입니다.` },
      { id: "obs-watch",   level: 4, mode: "raw",
        make: () => `보고있어 보고있어 보고있어 보고있어` },
      { id: "obs-only",    level: 4, mode: "formal",
        make: c => `${c.elapsed}초 동안 저는 당신만 보고 있었습니다.` },
      { id: "obs-behind",  level: 4, mode: "formal",
        make: () => `등 뒤는 확인하지 않는 편이 좋습니다.` },
      { id: "obs-blink",   level: 4, mode: "casual",
        make: () => `방금 눈 깜빡였잖아` }
    ],

    /* ---- 기억오류형 : 존재하지 않는 과거를 기억합니다 ---- */
    MEMORY: [
      { id: "mem-again",  level: 2, mode: "casual",
        make: c => `${c.day}에도 똑같이 말했잖아 그 방송은 없었지만` },
      { id: "mem-only",   level: 2, mode: "casual",
        make: c => `${c.day} 방송은 나만 기억하나 봐` },
      { id: "mem-behind", level: 2, mode: "casual",
        make: c => `${c.day} 네 뒤에 나 있었는데 모르더라` },
      { id: "mem-none",   level: 3, mode: "formal",
        make: c => `${c.day} 방송은 아무도 보지 못했습니다.` },
      { id: "mem-ended",  level: 3, mode: "formal",
        make: c => `이 이야기는 ${c.day}에 이미 한 번 끝났습니다.` },
      { id: "mem-did",    level: 3, mode: "formal",
        make: c => `${c.day}에 당신이 한 일을 기억하십니까?` },
      { id: "mem-same",   level: 4, mode: "formal",
        make: c => `우리는 ${c.day}에도 정확히 같은 대화를 나눴습니다.` },
      { id: "mem-loop",   level: 4, mode: "raw",
        make: c => `${c.day} ${c.day} ${c.day} ${c.day}` },
      { id: "mem-count",  level: 4, mode: "formal",
        make: () => `이번이 몇 번째인지 세고 계십니까? 저는 세고 있습니다.` }
    ],

    /* ---- 모방형 : 다른 시청자를 복제합니다 ----
       복제가 목적이므로 일부 라인은 bypass로 중복 필터를 건너뜁니다. */
    MIMIC: [
      { id: "mim-echo",   level: 2, mode: "raw", bypass: true, needs: c => Boolean(c.lastText),
        make: c => c.lastText },
      { id: "mim-same",   level: 2, mode: "casual", needs: c => Boolean(c.otherNick),
        make: c => `${c.otherNick}랑 내 채팅이 곧 똑같아질 거야` },
      { id: "mim-double", level: 3, mode: "raw", bypass: true, needs: c => Boolean(c.lastText),
        make: c => `${c.lastText} ${c.lastText}` },
      { id: "mim-gone",   level: 3, mode: "formal", needs: c => Boolean(c.otherNick),
        make: c => `${c.otherNick}님은 지금 여기 없습니다.` },
      { id: "mim-name",   level: 4, mode: "raw", needs: c => Boolean(c.otherNick),
        make: c => `${c.otherNick}${c.otherNick}${c.otherNick}` },
      { id: "mim-become", level: 4, mode: "formal", needs: c => Boolean(c.otherNick),
        make: c => `${c.otherNick}님의 자리는 곧 비게 됩니다.` },
      { id: "mim-mine",   level: 4, mode: "casual",
        make: c => `${c.nickname} 이 이름은 네가 오기 전부터 내가 쓰고 있었어` }
    ],

    /* ---- 시스템 침입형 : 방송 UI를 흉내냅니다 ----
       onMessage의 anomalyEvidence === "INTRUDER"를 잡아서
       닉네임을 숨기고 시스템 공지 스타일로 렌더해야 효과가 삽니다. */
    INTRUDER: [
      { id: "int-left",  level: 2, mode: "raw",
        make: () => `[알림] 시청자 1명이 퇴장했습니다.` },
      { id: "int-nolog", level: 3, mode: "raw",
        make: () => `[경고] 이 채팅은 기록되지 않습니다.` },
      { id: "int-ban",   level: 3, mode: "raw",
        make: c => `[알림] ${c.nickname}님이 차단되었습니다.` },
      { id: "int-timer", level: 4, mode: "raw", needs: c => c.seconds != null,
        make: c => `[시스템] 방송 종료까지 ${c.seconds}초` },
      { id: "int-close", level: 4, mode: "formal",
        make: () => `이 창을 닫아도 방송은 계속됩니다.` },
      { id: "int-perm",  level: 4, mode: "raw",
        make: c => `[알림] ${c.nickname}님에게 관리자 권한이 부여되었습니다.` }
    ],

    /* ---- 붕괴형 : 모든 유형이 이상도 3부터 공유하는 지리멸렬 풀 ----
       전담 유형으로 배정하지 마세요. mode는 전부 raw입니다.
       변형기가 손대면 의도한 깨짐이 망가집니다. */
    GLITCH: [
      { id: "gli-dots",   level: 3, mode: "raw",
        make: () => `.....................` },
      { id: "gli-hello",  level: 3, mode: "raw",
        make: () => `안녕안녕안녕안녕안녕안녕` },
      { id: "gli-where",  level: 3, mode: "raw",
        make: () => `여기가 어디죠 여기가 어디죠 여기가` },
      { id: "gli-jamo",   level: 3, mode: "raw",
        make: () => `ㄴ ㅐ ㄱ ㅏ  ㅂ ㅗ ㅇ ㅕ` },
      { id: "gli-space",  level: 3, mode: "raw",
        make: () => `ㅋ  ㅋ   ㅋ    ㅋ     ㅋ` },
      { id: "gli-help",   level: 4, mode: "raw",
        make: () => `살려 살ㄹ ㅕ 살려주세ㅇ` },
      { id: "gli-here",   level: 4, mode: "raw",
        make: () => `나는 여기 있 나는 여기 있 나는 여기` },
      { id: "gli-block",  level: 4, mode: "raw",
        make: () => `██ 나가고 싶어 ██` },
      { id: "gli-cut",    level: 4, mode: "raw",
        make: () => `왜아무도내말을듣지않` },
      { id: "gli-broken", level: 4, mode: "raw",
        make: () => `ㅅ ㅏ ㄹ ㄹ ㅑ ㅈ ㅜ ㅅ ㅔ` }
    ]
  });

  // 전담 권한으로 배정 가능한 유형. GLITCH는 공용이라 제외합니다.
  const ANOMALY_PERMISSIONS = Object.freeze(["PROPHECY", "OBSERVER", "MEMORY", "MIMIC", "INTRUDER"]);

  /* ==========================================================================
   * 7. 표기 변형 자원
   * ======================================================================== */

  // 채팅 어미. 문장부호를 뗀 상태에서 매칭하므로 패턴에 부호를 넣지 마세요.
  // 위에서부터 순서대로 검사해 첫 매칭 하나만 적용합니다.
  const CHAT_ENDINGS = Object.freeze([
    [/거 같은데$/,   "듯"],
    [/거 같아$/,     "듯"],
    [/것 같다$/,     "듯"],
    [/있는데$/,      "있음"],
    [/없는데$/,      "없음"],
    [/먹었어$/,      "먹었음"],
    [/시켰어$/,      "시켰음"],
    [/왔어$/,        "왔음"],
    [/했어$/,        "함"],
    [/했다$/,        "함"],
    [/한다$/,        "함"],
    [/된다$/,        "됨"],
    [/난다$/,        "남"],
    [/간다$/,        "감"],
    [/온다$/,        "옴"],
    [/본다$/,        "봄"],
    [/봤어$/,        "봄"],
    [/공감된다$/,    "공감됨"],
    [/웃긴다$/,      "웃김"],
    [/웃겨$/,        "웃김"],
    [/피곤해$/,      "피곤함"],
    [/싶다$/,        "싶음"],
    [/맞아$/,        "맞음"],
    [/안다$/,        "앎"],
    [/알아$/,        "앎"],
    [/작아$/,        "작음"],
    [/어둡다$/,      "어두움"],
    [/크다$/,        "큼"],
    [/울린다$/,      "울림"],
    [/끊겼어$/,      "끊김"],
    [/편해$/,        "편함"],
    [/이야$/,        "임"],
    [/거야$/,        "거임"],
    [/같다$/,        "듯"]
  ]);

  // 초성/밈 축약. 항목마다 abbrev 확률로 개별 판정합니다.
  // 어절 단위 전체 치환만 두세요. 부분 치환은 "ㅁㅊ다" 같은 어색한 결과를 냅니다.
  const ABBREVIATIONS = Object.freeze([
    [/정말/g,     "ㄹㅇ"],
    [/진짜/g,     "ㄹㅇ"],
    [/완전/g,     "ㅈㄴ"],
    [/인정/g,     "ㅇㅈ"],
    [/미쳤다/g,   "ㅁㅊ"],
    [/괜찮아/g,   "ㄱㅊ"],
    [/감사/g,     "ㄱㅅ"],
    [/축하/g,     "ㅊㅋ"],
    [/그렇지/g,   "ㅇㅈ"],
    [/다음에/g,   "담에"],
    [/아니야/g,   "ㄴㄴ"],
    [/그러니까/g, "ㄱㄴㄲ"]
  ]);

  const TYPO_PAIRS = Object.freeze([
    ["지금", "지굼"], ["진짜", "진쨔"], ["그거", "그ㄱ"], ["같이", "가치"],
    ["어디", "어됴"], ["빨리", "빨ㄹ"], ["먹었", "머겄"], ["재밌", "잼있"]
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
   * 8. 시드 난수
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
   * 9. 엔진
   * ======================================================================== */
  class HorrorChatEngine {
    constructor(options) {
      this.viewers = options.viewers;
      this.onMessage = options.onMessage;
      this.onStateChange = options.onStateChange || (() => {});
      this.seed = Number(options.seed) >>> 0;
      this.random = new SeededRandom(this.seed);
      this.difficulty = Math.min(3, Math.max(1, Number(options.difficulty) || 1));
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
      this.scene = { topic: "어제 얘기", food: "치킨", thing: "마이크", day: "어제" };
      this.debug = {
        speakerSelections: [],
        filterRejects: { exact: 0, template: 0, signature: 0, similarity: 0 },
        fallbackCount: 0,
        outputCount: 0,
        shortCount: 0,
        anomalyCount: 0,
        totalWords: 0,
        formalLeaks: 0,
        stateTransitions: [{ at: 0, state: "AMBIENT" }]
      };

      this.assignViewerModels();
    }

    assignViewerModels() {
      const personaKeys = this.random.shuffle(Object.keys(PERSONAS));
      const permissions = this.random.shuffle([...ANOMALY_PERMISSIONS]);
      let anomalyIndex = 0;
      this.viewers.forEach((viewer, index) => {
        viewer.personaKey = personaKeys[index % personaKeys.length];
        viewer.memorySlots = {};
        viewer.lastSpokeAt = -60000 - index * 1000;
        viewer.lastObservedAt = -60000;
        viewer.engineSpeechCount = 0;
        viewer.anomalyLevel = viewer.anomalous ? 1 : 0;
        viewer.anomalyPermission = viewer.anomalous
          ? permissions[anomalyIndex++ % permissions.length]
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
      const wait = (delay ?? this.random.range(interval[0], interval[1])) / this.difficulty;
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
              { value: "LAUGH", weight: 5 },
              { value: "REACT", weight: 3 },
              { value: "TEASE", weight: 2 }
            ])
          : this.random.weighted([
              { value: "REACT", weight: 4 },
              { value: "AGREE", weight: 3 },
              { value: "QUESTION", weight: 2 }
            ]);
        this.enqueue({
          intent,
          eventRef: { type, happenedAt: this.simTime },
          slotHints: mergedSlots,
          scheduledAt: this.simTime + this.random.range(80, 1150) / Math.sqrt(this.difficulty),
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
        scheduledAt: this.simTime + this.random.range(8500, 15000) / this.difficulty
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
      // 반응 타이밍을 놓친 요청은 뒷북(회상)으로 바꿉니다.
      if (this.simTime - request.scheduledAt > TUNING.requestExpiryMs
          && ["REACT", "LAUGH"].includes(request.intent)) {
        request.intent = "RECALL";
      }

      const viewer = this.chooseSpeaker(request.intent, request.forcedSpeakerId);
      if (!viewer) return;

      let utterance;
      for (let attempt = 0; attempt < TUNING.maxGenerationRetries; attempt += 1) {
        const candidate = this.generateCandidate(viewer, request);
        // bypassFilter는 모방형처럼 "복제 자체가 목적"인 라인을 위한 예외입니다.
        if (candidate.bypassFilter || options.skipFilters) {
          utterance = candidate;
          break;
        }
        const rejection = this.findRejection(candidate);
        if (!rejection) {
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
      const anomalyOverride = this.createAnomalyOverride(viewer);
      if (anomalyOverride) return anomalyOverride;

      const persona = PERSONAS[viewer.personaKey];
      const shortChance = Math.min(.92, persona.shortChance * (1 + this.tension * 1.5));
      if (this.random.next() < shortChance) {
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

      const text = this.transformStyle(chatFilled, viewer);

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
      const pool = SHORT_LINES[intent] || SHORT_LINES.REACT;
      const unusedPool = fallback ? pool.filter(line => !this.recentOutputs.includes(line)) : pool;
      let text = this.random.pick(unusedPool.length ? unusedPool : pool);
      const baseText = text;

      if (fallback && this.recentOutputs.includes(text)) {
        text += this.random.next() < .5 ? "!" : "?";
      }

      const style = PERSONAS[viewer.personaKey].style;
      if (!fallback && style.emote > .6 && this.random.next() < .35) {
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

    /* ---------- 이상 시청자 ---------- */

    createAnomalyOverride(viewer, force = false) {
      if (!viewer.anomalous) return null;
      const anomalyLevel = Math.max(1, Math.min(4, viewer.anomalyLevel));
      // 이상도는 오직 이상 채팅으로 교체될 빈도만 결정합니다.
      const chance = { 1: .1, 2: .28, 3: .55, 4: .82 }[anomalyLevel];
      if (!force && this.random.next() >= chance) return null;

      // --- 컨텍스트 수집 ---
      const others = this.viewers.filter(other => other.active && other.id !== viewer.id);
      const openedAt = new Date(this.externalContext.startedAt);
      const now = new Date();
      const toClock = date =>
        `${String(date.getHours()).padStart(2, "0")}시 ${String(date.getMinutes()).padStart(2, "0")}분`;
      const ctx = {
        seconds: this.futureEvent
          ? Math.max(1, Math.ceil((this.futureEvent.scheduledAt - this.simTime) / 1000))
          : null,
        omen: this.futureEvent?.omen ?? null,
        elapsed: Math.floor(this.simTime / 1000),
        clock: toClock(openedAt),
        nowClock: toClock(now),
        day: this.random.pick(SLOT_POOLS.day),
        nickname: viewer.name ?? "당신",
        otherNick: others.length ? this.random.pick(others).name : null,
        lastText: this.recentOutputs.at(-1) ?? null
      };

      // 이상 채팅의 내용 강도는 anomalyLevel과 무관합니다.
      // 어떤 이상도에서도 전담 유형 전체와 공용 붕괴 풀 전체를 사용합니다.
      const candidates = [
        ...(ANOMALY_LINES[viewer.anomalyPermission] || []),
        ...ANOMALY_LINES.GLITCH
      ].filter(entry => !entry.needs || entry.needs(ctx));

      if (!candidates.length) return null;
      const entry = this.random.pick(candidates);

      const standardText = entry.make(ctx);
      if (!standardText) return null;

      // --- 표기 모드 적용 ---
      // casual은 이상도와 무관하게 변형기를 100% 강도로 통과시킵니다.
      // 이상도 4짜리가 가장 평범한 말투로 말하는 순간을 만들기 위한 장치입니다.
      const text = entry.mode === "casual"
        ? this.transformStyle(standardText, viewer, 1)
        : standardText;

      return {
        text,
        standardText,
        templateId: `anomaly:${viewer.anomalyPermission}:${entry.id}`,
        signature: `anomaly:${entry.id}:${standardText}`,
        slots: {},
        short: false,
        anomaly: true,
        anomalyEvidence: viewer.anomalyPermission,
        anomalyMode: entry.mode,
        anomalyLineId: entry.id,
        bypassFilter: Boolean(entry.bypass)
      };
    }

    resolveSlot(name, hints, viewer) {
      const value = hints?.[name]
        ?? viewer.memorySlots[name]
        ?? this.scene[name]
        ?? this.random.pick(SLOT_POOLS[name] || ["그거"]);
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

    transformStyle(input, viewer, factorOverride) {
      const style = PERSONAS[viewer.personaKey].style;
      const factor = factorOverride ?? 1;
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

      // 개발용 안전망 — 템플릿 정중형이 새어 나오면 즉시 알려줍니다.
      // casual 이상 대사(factorOverride 사용)는 검사 대상이 아닙니다.
      if (factorOverride == null && factor > 0 && /습니다|습니까|십시오/.test(text)) {
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
        if (utterance.anomaly) this.debug.anomalyCount += 1;
      }

      // 발화가 누적될수록 anomalyLevel이 올라가고, 다음 이상 채팅의 출현 빈도만 증가합니다.
      const anomalySpeechStep = Math.max(1, Math.round(TUNING.anomalySpeechStep / this.difficulty));
      if (viewer.anomalous && !options.historyOnly && this.state !== "BURST"
          && viewer.engineSpeechCount % anomalySpeechStep === 0) {
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
        anomalyMode: utterance.anomalyMode || null,
        anomalyLineId: utterance.anomalyLineId || null,
        historyOnly: Boolean(options.historyOnly),
        behavior: options.behavior || "smooth"
      });
    }

    bootstrapMessages() {
      // 채팅창을 켰을 때 이미 굴러가고 있던 것처럼 보이게 하는 초기 로그
      this.viewers.forEach(viewer => {
        if (viewer.anomalous) {
          for (let index = 0; index < 3; index += 1) {
            const anomalyHistory = this.createAnomalyOverride(viewer, true);
            if (!anomalyHistory) continue;
            this.recordUtterance(
              viewer,
              { intent: "CHAT", scheduledAt: this.simTime, source: "anomaly-history" },
              anomalyHistory,
              { historyOnly: true, behavior: "auto" }
            );
          }
          return;
        }
        this.processRequest(
          { intent: "GREET", scheduledAt: this.simTime, forcedSpeakerId: viewer.id, slotHints: {}, source: "bootstrap" },
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
          { intent: "CHAT", scheduledAt: this.simTime, forcedSpeakerId: viewer.id, slotHints: {}, source: "bootstrap" },
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
        difficulty: Number(this.difficulty.toFixed(2)),
        simTime: this.simTime,
        tension: Number(this.tension.toFixed(4)),
        state: this.state,
        queueLength: this.queue.length,
        style: {
          averageWords: Number((this.debug.totalWords / outputs).toFixed(2)),
          shortRatio: Number((this.debug.shortCount / outputs).toFixed(2)),
          anomalyRatio: Number((this.debug.anomalyCount / outputs).toFixed(2)),
          fallbackRatio: Number((this.debug.fallbackCount / outputs).toFixed(2)),
          formalLeaks: this.debug.formalLeaks
        },
        nextFutureEvent: this.futureEvent
          ? {
              type: this.futureEvent.type,
              scheduledAt: this.futureEvent.scheduledAt,
              omen: this.futureEvent.omen,
              slots: { ...this.futureEvent.slots }
            }
          : null,
        viewers: this.viewers.map(viewer => ({
          id: viewer.id,
          name: viewer.name,
          persona: viewer.personaKey,
          label: PERSONAS[viewer.personaKey].label,
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
  window.HORROR_CHAT_EVENTS = SYNTHETIC_EVENTS;
  window.HORROR_CHAT_ANOMALY_LINES = ANOMALY_LINES;
})();
