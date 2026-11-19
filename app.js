"use strict";

/*
 * 모든 기능 모듈이 로드된 뒤 실행되는 최종 진입점입니다.
 * DOM 이벤트를 기능 함수에 연결하고 저장된 설정을 복원한 다음 최초 진입 화면을 표시합니다.
 *
 * 실행 순서는 index.html의 script 순서를 따릅니다.
 * 1) app-config가 공유 상태와 DOM 참조를 선언합니다.
 * 2) app-chat/audio/survival/results/game이 기능 함수를 선언합니다.
 * 3) 이 파일이 사용자 이벤트를 함수에 연결합니다.
 * 4) 저장된 닉네임·음량을 복원하고 showEntryScreen으로 첫 화면을 엽니다.
 */

// 닉네임 폼의 버튼 클릭이나 Enter 제출로 오디오 권한을 얻고 타이틀 전환을 시작합니다.
entryForm.addEventListener("submit", event => {
  event.preventDefault();
  enterTitleFromEntry();
});

messageList.addEventListener("click", event => {
  const title = event.target.closest(".post-title");
  if (title) openPostPanel(title.closest("[data-post-id]").dataset.postId, title);
});

newMessageButton.addEventListener("click", () => scrollToLatest("smooth"));
panelClose.addEventListener("click", closeViewerPanel);
suspectButton.addEventListener("click", toggleSelectedPostSuspect);
kickButton.addEventListener("click", deleteSelectedPost);
reconnectButton.addEventListener("click", reconnectStreamConnection);
titleMusicButton.addEventListener("click", () => {
  if (titleMusic.paused) playTitleMusic();
  else stopTitleMusic(false);
});
gameMusicButton.addEventListener("click", () => {
  if (gameMusic.paused) {
    gameMusicManuallyPaused = false;
    playGameMusic();
  } else {
    gameMusicManuallyPaused = true;
    stopGameMusic(false);
  }
});
titleVolume.addEventListener("input", () => {
  applyVolume(titleMusic, titleVolume, titleVolumeValue, AUDIO_SETTINGS.title, titleVolume.value);
});
gameVolume.addEventListener("input", () => {
  applyVolume(gameMusic, gameVolume, gameVolumeValue, AUDIO_SETTINGS.game, gameVolume.value);
  syncAmbientHorrorSfxVolume();
});
// 입력할 때마다 기존 오류를 지우고, 등록된 특수 닉네임인지 즉시 다시 확인합니다.
playerNicknameInput.addEventListener("input", () => {
  setNicknameError();
  updateNicknameEasterEgg();
});
gameStart.addEventListener("click", () => enterGame(GAME_MODES.ENDLESS));
dailyStart.addEventListener("click", () => {
  const now = new Date();
  const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  enterGame(GAME_MODES.ENDLESS, {
    dailyChallenge: true,
    seed: FERRET_CHAT_RULES.getDailyChallengeSeed(dateKey)
  });
});
storyStart.addEventListener("click", () => enterGame(GAME_MODES.STORY));
gameRetry.addEventListener("click", startGame);
gameRestart.addEventListener("click", () => showTitle());
stageContinue.addEventListener("click", continueFromStageResult);
storyContinue.addEventListener("click", continueFromStoryResult);

// 모달 바깥 영역을 누르면 시청자 패널만 닫고 게임은 계속 진행합니다.
viewerBackdrop.addEventListener("click", event => {
  if (event.target === viewerBackdrop) closeViewerPanel();
});

// 사용자가 최신 메시지 근처로 돌아오면 불필요한 새 메시지 버튼을 숨깁니다.
messageList.addEventListener("scroll", () => {
  if (isNearLatest()) newMessageButton.hidden = true;
}, { passive: true });

// 주소창을 접은 뒤 높이가 바뀌므로 다음 프레임에 채팅 스크롤을 다시 맞춥니다.
collapseButton.addEventListener("click", () => {
  browserBar.classList.toggle("collapsed");
  collapseButton.setAttribute("aria-label", browserBar.classList.contains("collapsed") ? "상단 바 펼치기" : "상단 바 접기");
  requestAnimationFrame(() => scrollToLatest());
});

helpButton.addEventListener("click", () => {
  openTutorial();
});
tutorialNext.addEventListener("click", advanceTutorial);
tutorialSkip.addEventListener("click", () => closeTutorial());

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    if (tutorialOpen) {
      closeTutorial();
      return;
    }
    closeViewerPanel();
  }
});

// 백그라운드 탭에서는 채팅 생성과 게임 타이머가 서로 어긋나지 않도록 일시정지합니다.
document.addEventListener("visibilitychange", syncEnginePause);

// 시각 에셋 적용 → 저장값 복원 → 음량 적용 → 클릭형 진입 화면 순서로 앱을 초기화합니다.
applyVisualAssets();
initializePlayerProgress();
initializePlayerNickname();
initializeAudioVolumes();
showEntryScreen();
