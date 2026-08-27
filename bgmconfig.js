"use strict";

/*
 * 화면과 게임 상황별 배경음악 경로를 한곳에서 관리하는 설정 파일입니다.
 *
 * 작성 방법
 * - 한 곡만 사용: ["assets/파일명.mp3"]
 * - 여러 곡 중 무작위 선택: ["assets/곡1.mp3", "assets/곡2.mp3"]
 * - 프로젝트 밖의 URL도 문자열로 넣을 수 있지만, 해당 서버가 브라우저 재생을 허용해야 합니다.
 * - 빈 배열([])을 지정하면 그 상황에서는 곡을 바꾸지 않고 직전 BGM을 유지합니다.
 *
 * 파일명에 공백이나 한글이 있어도 실제 파일명과 경로가 정확히 같으면 재생됩니다.
 */
const BGM_CONFIG = Object.freeze({
  // 닉네임 입력을 마치고 표시되는 게임 타이틀 화면입니다.
  title: Object.freeze([
    "assets/title-1.mp3",
    "assets/title-2.mp3"
  ]),

  // 시간 제한 없이 스테이지를 이어 가는 무한 모드의 기본 음악입니다.
  endless: Object.freeze([
    "assets/gameplay-1.mp3",
    "assets/gameplay-2.mp3"
  ]),

  // 스토리 모드에서는 현재 일차에 해당하는 배열만 사용합니다.
  storyDays: Object.freeze({
    1: Object.freeze(["assets/After Midnight Buffer.mp3"]),
    2: Object.freeze(["assets/Open Tab Echo.mp3"]),
    3: Object.freeze(["assets/Monitor Glow.mp3"]),
    4: Object.freeze(["assets/Offline Viewer.mp3"]),
    5: Object.freeze(["assets/After Midnight Buffer (1).mp3"]),
    6: Object.freeze(["assets/Open Tab Echo (1).mp3"]),
    7: Object.freeze(["assets/Offline Viewer (1).mp3"])
  }),

  // 검은 전환 화면이 열리는 순간부터 결과 확인이 끝날 때까지 사용할 음악입니다.
  results: Object.freeze({
    endlessClear: Object.freeze(["assets/Monitor Glow.mp3"]),
    endlessFailed: Object.freeze(["assets/Offline Viewer.mp3"]),
    storyCorrect: Object.freeze(["assets/After Midnight Buffer (1).mp3"]),
    storyWrong: Object.freeze(["assets/Offline Viewer (1).mp3"]),
    victory: Object.freeze(["assets/title-2.mp3"]),
    gameOver: Object.freeze(["assets/Offline Viewer.mp3"])
  }),

  // 방송 연결 괴이가 시작되거나 완전히 끊겼을 때 기본 플레이 음악을 잠시 대체합니다.
  anomalies: Object.freeze({
    detected: Object.freeze(["assets/After Midnight Buffer (1).mp3"]),
    disconnected: Object.freeze(["assets/Open Tab Echo (1).mp3"])
  })
});
