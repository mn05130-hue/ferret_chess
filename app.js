"use strict";

/* 입력 이벤트를 연결하고 저장된 설정을 복원합니다. index.html에서 마지막으로 로드합니다. */

// 접속과 모드 선택
entryForm.addEventListener("submit", event => {
  event.preventDefault();
  enterTitleFromEntry();
});
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

// 게시글 목록과 상세 패널
messageList.addEventListener("click", event => {
  const title = event.target.closest(".post-title");
  if (title) openPostPanel(title.closest("[data-post-id]").dataset.postId, title);
});

newMessageButton.addEventListener("click", () => scrollToLatest("smooth"));
closePostButton.addEventListener("click", closePostPanel);
suspectButton.addEventListener("click", toggleSelectedPostSuspect);
keepPostButton.addEventListener("click", toggleKeepSelectedPost);
deletePostButton.addEventListener("click", deleteSelectedPost);

postDetailBackdrop.addEventListener("click", event => {
  if (event.target === postDetailBackdrop) closePostPanel();
});

// 사용자가 최신 메시지 근처로 돌아오면 불필요한 새 글 버튼을 숨깁니다.
messageList.addEventListener("scroll", () => {
  if (isNearLatest()) newMessageButton.hidden = true;
}, { passive: true });

// 주소창을 접은 뒤 높이가 바뀌므로 다음 프레임에 게시글 스크롤을 다시 맞춥니다.
collapseButton.addEventListener("click", () => {
  browserBar.classList.toggle("collapsed");
  collapseButton.setAttribute("aria-label", browserBar.classList.contains("collapsed") ? "상단 바 펼치기" : "상단 바 접기");
  requestAnimationFrame(() => scrollToLatest());
});

reconnectButton.addEventListener("click", reconnectStreamConnection);

// 타이틀과 플레이 중 음량 설정
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

// 라운드 결과와 스토리 복기
stageContinue.addEventListener("click", continueFromStageResult);
storyContinue.addEventListener("click", continueFromStoryResult);
storyReviewFilter.addEventListener("click", toggleStoryReviewFilter);
storyReviewPrev.addEventListener("click", () => moveStoryReview(-1));
storyReviewNext.addEventListener("click", () => moveStoryReview(1));

// 도움말, 키보드 입력, 일시정지
helpButton.addEventListener("click", () => {
  openTutorial();
});
tutorialNext.addEventListener("click", advanceTutorial);
tutorialSkip.addEventListener("click", () => closeTutorial());

document.addEventListener("keydown", event => {
  if (event.key === "Tab" && selectedPostId !== null && !tutorialOpen) {
    const first = closePostButton;
    let last = deletePostButton;
    if (deletePostButton.disabled) last = keepPostButton.hidden ? suspectButton : keepPostButton;
    const focusOutside = !postDetailBackdrop.contains(document.activeElement);
    if (focusOutside || document.activeElement === (event.shiftKey ? first : last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }
  if (event.key === "Escape") {
    if (tutorialOpen) {
      closeTutorial();
      return;
    }
    closePostPanel();
  }
});

// 백그라운드 탭에서는 채팅 생성과 게임 타이머가 서로 어긋나지 않도록 일시정지합니다.
document.addEventListener("visibilitychange", syncEnginePause);

// 시각 에셋 적용 → 저장값 복원 → 음량 적용 → 클릭형 진입 화면 순서로 앱을 초기화합니다.
applyVisualAssets();
renderBoardRules(document.querySelector("#board-rules-list"));
initializePlayerProgress();
initializePlayerNickname();
initializeAudioVolumes();
showEntryScreen();
