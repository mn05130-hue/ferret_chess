"use strict";

/*
 * 모든 기능 모듈이 로드된 뒤 실행되는 최종 진입점입니다.
 * DOM 이벤트를 기능 함수에 연결하고 저장된 설정을 복원한 다음 최초 진입 화면을 표시합니다.
 */

// 첫 화면의 단 한 번의 클릭으로 오디오 권한을 얻고 타이틀 전환을 시작합니다.
entryGate.addEventListener("click", enterTitleFromEntry);

// 채팅 닉네임을 클릭하면 해당 시청자의 최근 발화 기록을 엽니다.
messageList.addEventListener("click", event => {
  const username = event.target.closest(".username[data-viewer-id]");
  if (username) openViewerPanel(username.dataset.viewerId);
});

// 사용자가 작성한 채팅은 엔진 시청자와 구분되는 ownMessage로 렌더링합니다.
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

// 게임 중 자주 쓰는 단일 동작 버튼과 음량 입력을 대응 함수에 연결합니다.
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

// 모달 바깥 영역을 누르면 시청자 패널만 닫고 게임은 계속 진행합니다.
viewerBackdrop.addEventListener("click", event => {
  if (event.target === viewerBackdrop) closeViewerPanel();
});

// 이모지 패널은 접근성 상태 aria-expanded와 hidden 값을 항상 함께 갱신합니다.
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

// 보상은 한 게임에서 한 번만 수령할 수 있도록 버튼 자체를 비활성화합니다.
rewardButton.addEventListener("click", () => {
  if (rewardButton.classList.contains("claimed")) return;
  rewardButton.classList.add("claimed");
  rewardButton.disabled = true;
  rewardLabel.textContent = "받기 완료";
  showToast("통나무 파워 100개를 받았습니다.");
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

// 아직 별도 화면이 없는 보조 메뉴는 토스트로 현재 동작 결과를 안내합니다.
document.querySelector(".address-menu").addEventListener("click", () => showToast(`채팅 시드: ${currentSeed}`));
document.querySelector("#support-button").addEventListener("click", () => showToast("지금은 후원할 수 없습니다."));
document.querySelector("#voice-button").addEventListener("click", () => showToast("알 수 없는 잡음이 들립니다…"));
document.querySelector("#chat-tab").addEventListener("click", () => scrollToLatest("smooth"));
helpButton.addEventListener("click", () => {
  showToast(gameMode === GAME_MODES.STORY
    ? "오후 7시부터 오전 2시까지 조사하세요. 모든 판정은 하루가 끝날 때 공개됩니다."
    : "이상 채팅을 제한시간 안에 처리하세요. 스테이지가 오를수록 시간이 짧아집니다.");
});

// 패널 외부 클릭과 Escape 키를 공통 닫기 동작으로 처리합니다.
document.addEventListener("pointerdown", event => {
  if (!emojiPanel.hidden && !emojiPanel.contains(event.target) && !emojiButton.contains(event.target)) closeEmojiPanel();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeEmojiPanel();
    closeViewerPanel();
  }
});

// 백그라운드 탭에서는 채팅 생성과 게임 타이머가 서로 어긋나지 않도록 일시정지합니다.
document.addEventListener("visibilitychange", syncEnginePause);

// 저장값 복원 → 음량 적용 → 클릭형 진입 화면 순서로 초기화해 자동 재생 정책을 안전하게 통과합니다.
initializePlayerNickname();
initializeAudioVolumes();
showEntryScreen();
