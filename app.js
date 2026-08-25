"use strict";

// Event bindings and initial boot sequence.
messageList.addEventListener("click", event => {
  const username = event.target.closest(".username[data-viewer-id]");
  if (username) openViewerPanel(username.dataset.viewerId);
});

messageForm.addEventListener("submit", event => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text || gameOver || stageReviewOpen) return;
  const myViewer = { name: myNickname, badge: "🐹", badgeClass: "robot", color: "#66d5b2" };
  appendElement(createMessage(myViewer, text, true));
  messageInput.value = "";
  updateComposerState();
  closeEmojiPanel();
});

messageInput.addEventListener("input", updateComposerState);
newMessageButton.addEventListener("click", () => scrollToLatest("smooth"));
panelClose.addEventListener("click", closeViewerPanel);
kickButton.addEventListener("click", kickSelectedViewer);
streamApparition.addEventListener("click", banishStreamApparition);
titleMusicButton.addEventListener("click", () => {
  if (titleMusic.paused) playTitleMusic();
  else stopTitleMusic(false);
});
gameMusicButton.addEventListener("click", () => {
  if (gameMusic.paused) playGameMusic();
  else stopGameMusic(false);
});
titleVolume.addEventListener("input", () => {
  applyVolume(titleMusic, titleVolume, titleVolumeValue, AUDIO_SETTINGS.title, titleVolume.value);
});
gameVolume.addEventListener("input", () => {
  applyVolume(gameMusic, gameVolume, gameVolumeValue, AUDIO_SETTINGS.game, gameVolume.value);
});
playerNicknameInput.addEventListener("input", () => setNicknameError());
gameStart.addEventListener("click", () => enterGame(GAME_MODES.ENDLESS));
storyStart.addEventListener("click", () => enterGame(GAME_MODES.STORY));
gameRetry.addEventListener("click", startGame);
gameRestart.addEventListener("click", () => showTitle());
stageContinue.addEventListener("click", continueFromStageResult);
storyContinue.addEventListener("click", continueFromStoryResult);

viewerBackdrop.addEventListener("click", event => {
  if (event.target === viewerBackdrop) closeViewerPanel();
});

emojiButton.addEventListener("click", () => {
  const willOpen = emojiPanel.hidden;
  emojiPanel.hidden = !willOpen;
  emojiButton.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) emojiPanel.querySelector("button")?.focus();
});

emojiPanel.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  insertAtCursor(button.textContent);
  closeEmojiPanel();
});

rewardButton.addEventListener("click", () => {
  if (rewardButton.classList.contains("claimed")) return;
  rewardButton.classList.add("claimed");
  rewardButton.disabled = true;
  rewardLabel.textContent = "받기 완료";
  showToast("통나무 파워 100개를 받았습니다.");
});

messageList.addEventListener("scroll", () => {
  if (isNearLatest()) newMessageButton.hidden = true;
}, { passive: true });

collapseButton.addEventListener("click", () => {
  browserBar.classList.toggle("collapsed");
  collapseButton.setAttribute("aria-label", browserBar.classList.contains("collapsed") ? "상단 바 펼치기" : "상단 바 접기");
  requestAnimationFrame(() => scrollToLatest());
});

document.querySelector(".address-menu").addEventListener("click", () => showToast(`채팅 시드: ${currentSeed}`));
document.querySelector("#support-button").addEventListener("click", () => showToast("지금은 후원할 수 없습니다."));
document.querySelector("#voice-button").addEventListener("click", () => showToast("알 수 없는 잡음이 들립니다…"));
document.querySelector("#chat-tab").addEventListener("click", () => scrollToLatest("smooth"));
helpButton.addEventListener("click", () => {
  showToast(gameMode === GAME_MODES.STORY
    ? "오후 7시부터 오전 2시까지 조사하세요. 모든 판정은 하루가 끝날 때 공개됩니다."
    : "이상 채팅을 제한시간 안에 처리하세요. 스테이지가 오를수록 시간이 짧아집니다.");
});

document.addEventListener("pointerdown", event => {
  if (!emojiPanel.hidden && !emojiPanel.contains(event.target) && !emojiButton.contains(event.target)) closeEmojiPanel();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeEmojiPanel();
    closeViewerPanel();
  }
});

document.addEventListener("visibilitychange", syncEnginePause);

initializePlayerNickname();
initializeAudioVolumes();
showTitle(false);
