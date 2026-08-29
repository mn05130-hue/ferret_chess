"use strict";

/*
 * 이상 시청자만 접근할 수 있는 공포 대사와 표기 변형 자원입니다.
 * 정상 대사 데이터와 분리해 일반 시청자에게 공포 문장이 섞이는 실수를 방지합니다.
 */
/*
 * 괴이 대사 항목의 공통 필드는 다음과 같습니다.
 * - id: 최근 사용 기록과 중복 검사를 위한 고유 식별자
 * - level: 문장이 등장하는 괴이 단계. 현재 단계에서 사용할 수 있는 가장 높은 단계만 선택됨
 * - mode: 후처리 방식. casual/formal은 말투를 다듬고 raw는 훼손을 보존함
 * - needs(context): 필요한 문맥이 준비됐는지 확인하는 선택 조건
 * - make(context): 현재 문맥으로 화면에 표시할 문자열을 만드는 함수
 * - bypass: true이면 의도적인 반복을 살리기 위해 일반 중복 필터를 건너뜀
 *
 * context에는 남은 시간(seconds), 경과량(elapsed), 전조(omen), 게임 시계
 * (nowClock/clock), 날짜(year/day), 최근 채팅(lastText), 다른 닉네임
 * (otherNick), 플레이어 닉네임(nickname)이 필요한 문장에만 전달됩니다.
 */
const ANOMALY_LINES = Object.freeze({

  /* ---- 예언형 : 아직 일어나지 않은 방송 이벤트를 읽습니다 ---- */
  PROPHECY: [
    { id: "pro-soon",   level: 1, mode: "casual", needs: c => c.seconds != null,
      make: c => `${c.seconds}명의 사람이 널 보고있어, 창문으로 보고 있어, 문밖에서 보고있어` },
    { id: "pro-hint",   level: 1, mode: "casual",
      make: () => `지난기억나기억나기억나기억나` },
    { id: "pro-count",  level: 1, mode: "casual", needs: c => c.seconds != null,
      make: c => `${c.seconds}개의 눈이 널 바라보고있다. 네 뒤에서` },
    { id: "pro-omen",   level: 2, mode: "formal", needs: c => c.omen != null,
      make: c => `${c.seconds}초 뒤에 그들이 네 집에 도착한다.불끄지마 불끄면 걔가 방으로들어와 지금은 복도까지만 와있어 ${c.omen}` },
    { id: "pro-seen",   level: 2, mode: "formal", needs: c => c.omen != null,
      make: c => `화면에 니 뒤에 서있는거 나만보임?? 어깨위에 손올라가있는데 왜 가만히있어 ${c.omen} ` },
    { id: "pro-tick",   level: 1, mode: "raw", needs: c => c.seconds != null && c.seconds >= 3,
      make: c => `$너 지금 혼자 산다고했지 근데 왜 세명이 앉아있어 {c.seconds}... ${c.seconds - 1}... ${c.seconds - 2}...` },
    { id: "pro-know",   level: 3, mode: "formal",
      make: () => `마이크에 자꾸 다른 목소리섞임 니 목소리랑 똑같은데 반박자 늦게 따라해 ` },
    { id: "pro-repeat", level: 2, mode: "raw", needs: c => c.seconds != null,
      make: c => `창문 커튼 흔들리는거 바람아니야 안쪽에서 밀고있는거야 ${c.seconds}초. ${c.seconds}초. ${c.seconds}초.` },
    { id: "pro-nostop", level: 4, mode: "formal",
      make: () => `막을 수 없습니다. 이미 정해져 있습니다. 곧 다가옵니다. ` },
    { id: "pro-soft-event", level: 5, mode: "casual", needs: c => c.seconds != null,
      make: c => `조금 있으면 채팅 빨라질 듯 ${c.seconds}초쯤?` },
    { id: "pro-soft-sound", level: 5, mode: "casual",
      make: () => `다음 알림은 두 번 울릴 것 같은데` }
  ],

  /* ---- 관찰형 : 게임 밖 정보를 읽습니다 ---- */
  OBSERVER: [
    { id: "obs-elapsed", level: 2, mode: "casual",
      make: c => `${c.elapsed} 오늘 방송 재밌었어 이제 문 열어줘 나 밖에 오래 서있었어` },
    { id: "obs-late",    level: 2, mode: "casual",
      make: c => `지금 네 시계도 ${c.nowClock} 널 바라본다.여기있어여기있어여기있어여기있어여기있어` },
    { id: "obs-look",    level: 1, mode: "casual",
      make: () => `너 방금 여기봤지?.` },
    { id: "obs-alone",   level: 1, mode: "casual",
      make: () => `아까 네 뒤에 나 있었어. 너는 모르겠지만.` },
    { id: "obs-open",    level: 2, mode: "formal",
      make: c => `내일 우리들이 다시 오는 시각은 ${c.clock}입니다.문열어줘문열어줘문열어줘아직안열었네` },
    { id: "obs-spam",    level: 1, mode: "raw",
      make: () => `너지금나봤지너지금나봤지너지금나봤지` },
    { id: "obs-one",     level: 3, mode: "formal",
      make: () => `지금 이 방송을 보는 사람은 단, 한 명뿐입니다.` },
    { id: "obs-quiet",   level: 2, mode: "formal",
      make: () => `방 안이 조용해서 다행입니다. 당신이 어디 있는 지 알겠네요.보여?안보여?진짜안보여?나여기있는데` },
    { id: "obs-watch",   level: 1, mode: "raw",
      make: () => `보고있어 보고있어 보고있어 보고있어 불 켜진 방이구나?` },
    { id: "obs-only",    level: 3, mode: "formal",
      make: c => `${c.elapsed}일 동안 저는 당신만 보고 있었습니다.하나둘셋넷다섯여섯일곱여덟아홉지금` },
    { id: "obs-behind",  level: 1, mode: "formal",
      make: () => `뒤돌아보지마` },
    { id: "obs-blink",   level: 4, mode: "casual",
      make: () => `■■■■■■■■` },
    { id: "obs-chair",   level: 5, mode: "casual",
      make: () => `오늘 의자 높이 평소보다 조금 낮춘 듯?` },
    { id: "obs-curtain", level: 5, mode: "casual",
      make: () => `커튼 아까보다 조금 움직였네` }
  ],

  /* ---- 기억오류형 : 존재하지 않는 과거를 기억합니다 ---- */
  MEMORY: [
    { id: "mem-again",  level: 2, mode: "casual",
      make: c => `${c.year}년 전에도 똑같이 말했어 현관 도어락 삑삑거리는거 아까부터 여섯번째야 누가 계속 번호 틀리고있어` },
    { id: "mem-only",   level: 2, mode: "casual",
      make: c => `${c.day} 긴급재난방송방송을끄고모두옥상에올라가세요 ` },
    { id: "mem-behind", level: 2, mode: "casual",
      make: c => `${c.day} 네 뒤에 나 있었는데 모르더라 다시 해볼려고 ㅋㅋ` },
    { id: "mem-none",   level: 3, mode: "formal",
      make: c => `${c.day} 방송은 아무도 보지 못했습니다.천장에서 발소리나 근데 니 원룸이라며 위에 아무도 안산다며` },
    { id: "mem-ended",  level: 3, mode: "formal",
      make: c => `이 세계는 ${c.day}에 이미 한 번 끝났습니다. 방금 물소리났지 니 화장실 수도 잠겨있는데 누가 씻고있는거야 ` },
    { id: "mem-did",    level: 3, mode: "formal",
      make: c => `${c.day}에 네가 한 일 문 잠갔지? 잘했어 근데 나 아까 니 나갈때 같이 들어왔어` },
    { id: "mem-same",   level: 4, mode: "formal",
      make: c => `우리는 ${c.day}번째 같은 대화를 하고있네? 이제 채팅 그만칠게 너 어디있는지 알겠다. 근처에서 같은 소리가 들려` },
    { id: "mem-loop",   level: 2, mode: "raw",
      make: c => `${c.day} ${c.day} ${c.day} ${c.day}` },
    { id: "mem-count",  level: 4, mode: "formal",
      make: () => `이번이 몇 번째인지 세고 계십니까? 저는 잊어버렸습니다. 방금 니가 눈 감았을때 나 한발 다가갔어 다시 감아봐` },
    { id: "mem-cup",    level: 5, mode: "casual",
      make: c => `${c.day}에도 그 컵 쓰고 있었잖아` },
    { id: "mem-topic",  level: 5, mode: "casual",
      make: c => `${c.day}에도 방금이랑 똑같은 말 했었음` }
  ],

  /* ---- 모방형 : 다른 시청자를 복제합니다 ----
     복제가 목적이므로 일부 라인은 bypass로 중복 필터를 건너뜁니다. */
  MIMIC: [
    { id: "mim-echo",   level: 3, mode: "raw", bypass: true, needs: c => Boolean(c.lastText),
      make: c => c.lastText +"니 오른쪽 아니 보지마 보지마 보지마 " },
    { id: "mim-same",   level: 3, mode: "casual", needs: c => Boolean(c.otherNick),
      make: c => `${c.otherNick}님은 곧 죽을 예정입니다. 나 아까부터 계속 보였는데 ` },
    { id: "mim-double", level: 3, mode: "raw", bypass: true, needs: c => Boolean(c.lastText),
      make: c => `${c.lastText}살려줘사렺 ${c.lastText}ㅁㅣ방에 불 한번만 껐다켜봐` },
    { id: "mim-gone",   level: 4, mode: "formal", needs: c => Boolean(c.otherNick),
      make: c => `${c.otherNick}님은 여기 없습니다. 찾지 마세요.뒤돌아보지말고 숨만 참아봐 니 숨소리 멈춰도 하나 남는지 들어봐` },
    { id: "mim-name",   level: 3, mode: "raw", needs: c => Boolean(c.otherNick),
      make: c => `${c.otherNick}${c.otherNick}${c.otherNick}` },
    { id: "mim-become", level: 4, mode: "formal", needs: c => Boolean(c.otherNick),
      make: c => `${c.otherNick}님의 자리는 대체됩니다. 방에 불 한번만 껐다켜봐. 확실히 너 근처에 있는데 확인해보게` },
    { id: "mim-mine",   level: 4, mode: "casual",
      make: c => `${c.nickname}<<<는귀신입니다제발퇴장시켜주세요제발요 카메라에 니 뒤로 지나간거 뭐야 두번째야` },
    { id: "mim-soft-echo", level: 5, mode: "raw", bypass: true, needs: c => Boolean(c.lastText),
      make: c => c.lastText },
    { id: "mim-soft-agree", level: 5, mode: "casual", needs: c => Boolean(c.otherNick),
      make: c => `${c.otherNick}님 말이 맞는 듯` }
  ],

  /* ---- 시스템 침입형 : 방송 UI를 흉내냅니다 ----
     onMessage의 anomalyEvidence === "INTRUDER"를 잡아서
     닉네임을 숨기고 시스템 공지 스타일로 렌더해야 효과가 삽니다. */
  INTRUDER: [
    { id: "int-left",  level: 4, mode: "raw",
      make: () => `[알림] 시청자 1명이 사망했습니다.안들려?안들려?들리는데왜대답을안해` },
    { id: "int-nolog", level: 4, mode: "raw",
      make: () => `[경고] 방송이 끝났습니다. 모두 자리로 돌아가세요. 니 뒤에 있는거 아까부터 안움직여` },
    { id: "int-ban",   level: 4, mode: "raw",
      make: c => `[알림] ${c.nickname}님이 제거되었습니다. 여기야여기야여기봐여기라니까아직도못찾네` },
    { id: "int-timer", level: 4, mode: "raw", needs: c => c.seconds != null,
      make: c => `[시스템]  방문까지 ${c.seconds}초 남았습니다. 곧 다시 봅시다.그거 따라오는거같은데계속 같은 거리 유지함아까 그 방에도 있었어세번째야` },
    { id: "int-close", level: 4, mode: "formal",
      make: () => `이 창을 닫아도 방송은 계속됩니다. 이제까지 감사합니다. 방금 니 뒤에서 웃었어 니 목소리로 웃었어` },
    { id: "int-perm",  level: 4, mode: "raw",
      make: c => `[알림] ${c.nickname}님에게 사형투표가 진행되고 있습니다. !투표 1 을 눌러 찬성해주세요.` },
    { id: "int-soft-connection", level: 5, mode: "raw",
      make: () => `[알림] 연결 상태가 안정되었습니다.` },
    { id: "int-soft-sync", level: 5, mode: "raw",
      make: () => `[시스템] 채팅 기록 동기화 완료` }
  ],

  /* ---- 붕괴형 : 모든 유형이 낮은 확률로 공유하는 지리멸렬 풀 ----
     전담 유형으로 배정하지 마세요. mode는 전부 raw입니다.
     변형기가 손대면 의도한 깨짐이 망가집니다. */
  GLITCH: [
    { id: "gli-dots",   level: 1, mode: "raw",
      make: () => `.....................니 방문 앞에 뭐 세워져있는데 원래 있던거야?아 미안 잘못봤어 아무것도 없네` },
    { id: "gli-hello",  level: 1, mode: "raw",
      make: () => `안녕안녕안녕안녕안녕안녕 버찌야 화장실 갔을때 누구 앉아있었음???` },
    { id: "gli-where",  level: 1, mode: "raw",
      make: () => `여기가 어디죠 여기가 어디죠 여기가 오늘 방송 오래 하시네요. 저도 계속 밖에서 기다리고 있었습니다.` },
    { id: "gli-jamo",   level: 1, mode: "raw",
      make: () => `ㄴ ㅐ ㄱ ㅏ  ㅂ ㅗ ㅇ ㅕ 아. 이제 채팅 안 칠게 다 왔어.` },
    { id: "gli-space",  level: 1, mode: "raw",
      make: () => `ㅋ  ㅋ   ㅋ    ㅋ     ㅋ 나왔어나왔어나왔어아직문안닫았네?` },
    { id: "gli-help",   level: 2, mode: "raw",
      make: () => `살려 살ㄹ ㅕ 살려주세ㅇ 당신이 무엇을 보고 있는지 압니다` },
    { id: "gli-here",   level: 2, mode: "raw",
      make: () => `나는 여기 있 나는 여기 있 나는 여기 나여기있어나여기있어나여기있어왜못찾아  봤네?` },
    { id: "gli-block",  level: 2, mode: "raw",
      make: () => `██ 나가고 싶어 ██ 니 뒤에 서있는거 아까부터 그대론데 왜 아무도 말을 안해` },
    { id: "gli-cut",    level: 2, mode: "raw",
      make: () => `왜아무도내말을듣지않. 곧 소리가 납니다 놀라지 마세요 두 번째부터가 진짜입니다` },
    { id: "gli-broken", level: 2, mode: "raw",
      make: () => `ㅅ ㅏ ㄹ ㄹ ㅑ ㅈ ㅜ ㅅ ㅔ. 기다렸어 오래 기다렸어 이제 니 차례야` }
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

// 글자 분해 효과가 첫소리를 바꿀 때 선택하는 한글 초성 목록입니다.
const CHOSEONG = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
// 글자 분해 효과가 가운뎃소리를 바꿀 때 선택하는 한글 중성 목록입니다.
const JUNGSEONG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
