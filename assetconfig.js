"use strict";

/*
 * 화면에 직접 표시되는 이미지 파일 경로를 관리하는 설정 파일입니다.
 *
 * 작성 방법
 * - 프로젝트 안 파일은 index.html 기준 상대 경로로 입력합니다. 예: "assets/logo.png"
 * - 폴더 구분자는 Windows에서도 역슬래시(\) 대신 슬래시(/) 사용을 권장합니다.
 * - 빈 문자열("")을 입력하면 해당 이미지 또는 배경을 숨깁니다.
 * - 배경 음악 파일은 bgmconfig.js에서, 짧은 효과음 파일은 soundEffects에서 설정합니다.
 * - 배경 음악 파일은 bgmconfig.js에서, 짧은 효과음 파일은 soundEffects에서 설정합니다.
 */
const ASSET_CONFIG = Object.freeze({
  // 닉네임을 입력하는 최초 접속 화면의 상단 로고입니다.
  entry: Object.freeze({
    logo: "assets/splash-logo.png"
  }),

  // 게임 모드를 고르는 타이틀 화면 전체 배경입니다.
  title: Object.freeze({
    background: "assets/gudok-bangsong-cover.png"
  }),

  // 실제 방송 영상 영역의 기본/연결 끊김 배경과 그 위에 겹쳐지는 캐릭터입니다.
  stream: Object.freeze({
    background: "assets/gameScrenn.png",
    // 연결이 끊긴 동안 표시할 방송 화면입니다.
    disconnectedBackground: "assets/gameScrenn_abnormal.png",
    character: "assets/beojji_horror_stage_overlay.gif"
  }),

  // 실제 게임 진행 중 무작위로 재생할 짧은 공포 효과음입니다.
  soundEffects: Object.freeze({
    ambientHorror: Object.freeze([
      "assets/sfx/sfx_horror_creak.wav",
      "assets/sfx/sfx_horror_notification.wav",
      "assets/sfx/sfx_horror_static.wav"
    ])
  }),

  /*
   * 결과 오버레이의 전체 화면 배경입니다.
   * waitingBackground은 검은 대기 연출 동안, revealedBackground은 결과 카드가 공개된 뒤 사용합니다.
   * 빈 문자열은 기존 검은색·노이즈 배경을 그대로 유지하며, 원하는 이미지가 있을 때만 경로를 입력합니다.
   */
  results: Object.freeze({
    // 무한 모드에서 한 스테이지의 성공 또는 실패를 정산하는 화면입니다.
    stage: Object.freeze({
      waitingBackground: "",
      revealedBackground: ""
    }),

    // 스토리 모드에서 매일 오전 2시에 판정을 공개하는 화면입니다.
    storyDay: Object.freeze({
      waitingBackground: "assets/gameScrenn_abnormal.png",
      revealedBackground: "assets/stage_result_horror_suspense.gif"
    }),

    // 체력 소진 또는 스토리 7일 생존 뒤 표시되는 최종 결과 화면입니다.
    final: Object.freeze({
      waitingBackground: "",
      revealedBackground: "assets/stage_result_horror_suspense.gif"
      revealedBackground: "assets/stage_result_horror_suspense.gif"
    })
  })
});
