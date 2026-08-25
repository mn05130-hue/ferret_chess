"use strict";

/*
 * 이상 시청자만 접근할 수 있는 공포 대사와 표기 변형 자원입니다.
 * 정상 대사 데이터와 분리해 일반 시청자에게 공포 문장이 섞이는 실수를 방지합니다.
 */
// Anomaly entries may read event timing, clocks, nicknames, and recent chat.
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
// 한 이상 시청자는 아래 권한 중 하나를 받아 일관된 공포 유형을 유지합니다.
const ANOMALY_PERMISSIONS = Object.freeze(["PROPHECY", "OBSERVER", "MEMORY", "MIMIC", "INTRUDER"]);

/* ==========================================================================
 * 7. 표기 변형 자원
 * ======================================================================== */

// 채팅 어미. 문장부호를 뗀 상태에서 매칭하므로 패턴에 부호를 넣지 마세요.
// 위에서부터 순서대로 검사해 첫 매칭 하나만 적용합니다.
// 말투 변형기가 원문 끝에 선택적으로 붙이는 실제 채팅식 어미입니다.
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
// 긴 표현을 인터넷 채팅 축약형으로 바꾸는 치환 목록입니다.
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

// 낮은 확률로 적용되는 오타와 한글 자모 분해에 필요한 테이블입니다.
const TYPO_PAIRS = Object.freeze([
  ["지금", "지굼"], ["진짜", "진쨔"], ["그거", "그ㄱ"], ["같이", "가치"],
  ["어디", "어됴"], ["빨리", "빨ㄹ"], ["먹었", "머겄"], ["재밌", "잼있"]
]);

const CHOSEONG = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const JUNGSEONG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
