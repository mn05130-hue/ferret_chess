"use strict";

// Screens, viewer actions, stage lifecycle, and game startup.
/**
 * 진행 중인 타이머·엔진·오버레이·음악을 정리하고 안전하게 타이틀 화면으로 돌아갑니다.
 */
function showTitle(shouldFocus = true) {
  window.clearTimeout(interferenceTimer);
  window.clearTimeout(corruptedChatTimer);
  interferenceTimer = undefined;
  corruptedChatTimer = undefined;
  gameOver = true;
  stageReviewOpen = false;
  clearThreatCountdown();
  clearStreamApparition();
  stopStoryClock();
  chatEngine?.stop();
  chatEngine = null;
  chatApp.classList.remove("interference-mosaic", "interference-color", "wrong-kick", "corrupted-chat-hit");
  closeEmojiPanel();
  closeViewerPanel();
  stageOverlay.classList.remove("open");
  stageOverlay.setAttribute("aria-hidden", "true");
  resetStoryNightReveal();
  gameOverlay.classList.remove("open");
  gameOverlay.setAttribute("aria-hidden", "true");
  gameScreen.inert = true;
  gameScreen.setAttribute("aria-hidden", "true");
  titleScreen.hidden = false;
  titleScreen.setAttribute("aria-hidden", "false");
  stopGameMusic();
  prepareTitleMusic();
  if (shouldFocus) requestAnimationFrame(() => storyStart.focus());
}

/**
 * 닉네임 검증 후 선택 모드를 저장하고 타이틀에서 게임 화면으로 전환합니다.
 */
function enterGame(mode = GAME_MODES.ENDLESS) {
  if (!commitPlayerNickname()) return;
  gameMode = mode;
  chatApp.dataset.gameMode = gameMode;
  if (gameMode === GAME_MODES.STORY) primeScareAudio();
  stopTitleMusic();
  titleScreen.hidden = true;
  titleScreen.setAttribute("aria-hidden", "true");
  gameScreen.inert = false;
  gameScreen.setAttribute("aria-hidden", "false");
  prepareGameMusic();
  startGame();
}

/**
 * 활성 시청자를 찾아 최근 발화 이력을 모달에 렌더링하고 강퇴 대상을 지정합니다.
 */
function openViewerPanel(viewerId) {
  if (gameOver || stageReviewOpen) return;
  const viewer = viewers.find(candidate => candidate.id === viewerId && candidate.active);
  if (!viewer) return;
  selectedViewerId = viewerId;
  viewerName.textContent = viewer.name;
  viewerName.style.color = viewer.color;
  viewerHistory.replaceChildren();
  viewer.history.slice(-6).forEach(text => {
    const item = document.createElement("li");
    item.textContent = text;
    viewerHistory.append(item);
  });
  chatEngine?.observeViewer(viewerId);
  viewerBackdrop.classList.add("open");
  viewerBackdrop.setAttribute("aria-hidden", "false");
  kickButton.focus();
}

/**
 * 선택된 시청자를 해제하고 기록 모달을 접근성 트리에서도 닫습니다.
 */
function closeViewerPanel() {
  selectedViewerId = null;
  viewerBackdrop.classList.remove("open");
  viewerBackdrop.setAttribute("aria-hidden", "true");
}

/**
 * 강퇴된 시청자의 기존 메시지를 블라인드 문구로 바꾸고 재선택할 수 없게 합니다.
 */
function markViewerAsKicked(viewer, replacementText = "블라인드 처리 된 시청자입니다.") {
  document.querySelectorAll(`.message[data-viewer-id="${viewer.id}"]`).forEach(message => {
    message.classList.add("blinded-message");
    message.classList.remove("corrupted-message");
    message.removeAttribute("data-viewer-id");

    const messageText = message.querySelector(".message-text");
    if (messageText) {
      messageText.textContent = replacementText;
      messageText.removeAttribute("data-echo");
    }

    const username = message.querySelector(".username");
    if (username) {
      username.disabled = true;
      username.removeAttribute("data-viewer-id");
    }
  });
}

/**
 * 모든 진행 시스템을 중단하고 누적 결과에 맞는 최종 게임오버/승리 카드를 구성합니다.
 */
function endGame() {
  gameOver = true;
  stageReviewOpen = false;
  clearThreatCountdown(false);
  clearStreamApparition();
  stopStoryClock();
  chatEngine?.stop();
  closeViewerPanel();
  stageOverlay.classList.remove("open");
  stageOverlay.setAttribute("aria-hidden", "true");
  resetStoryNightReveal();

  const storyMode = gameMode === GAME_MODES.STORY;
  if (storyMode && storyVictory) {
    resultKicker.textContent = "SEVEN NIGHTS SURVIVED";
    resultTitle.textContent = "7일을 버텨냈습니다";
    resultCopy.textContent = `매일 새벽 2시까지 방송을 지켜냈습니다. 이상 연결 ${caughtAnomalies}개를 차단했습니다.`;
  } else {
    resultKicker.textContent = storyMode ? "BROADCAST LOST BEFORE DAWN" : "SIGNAL DESTROYED";
    resultTitle.textContent = "방송을 유지하지 못했습니다";
    if (lastDamageReason === "wrong-kick") {
      resultCopy.textContent = `정상 시청자를 반복해서 오판해 체력을 모두 잃었습니다. 총 오판 ${wrongKicks}회.`;
    } else if (lastDamageReason === "apparition") {
      resultCopy.textContent = `방송 화면의 괴이를 놓쳐 체력을 모두 잃었습니다. 총 ${missedApparitions}회 놓쳤습니다.`;
    } else {
      resultCopy.textContent = `${missedAnomalies}개의 이상 신호를 놓쳐 체력을 모두 잃었습니다.`;
    }
  }
  finalScore.textContent = `${String(score).padStart(4, "0")}점`;
  finalStage.textContent = String(currentStage);
  finalProgressLabel.textContent = storyMode ? "생존 일차" : "도달 스테이지";
  gameOverlay.classList.add("open");
  gameOverlay.setAttribute("aria-hidden", "false");
  gameRestart.focus();
}

/**
 * 선택 시청자를 비활성화하고 모드에 따라 즉시 판정하거나 하루 종료까지 결과를 숨깁니다.
 */
function kickSelectedViewer() {
  const viewer = viewers.find(candidate => candidate.id === selectedViewerId && candidate.active);
  if (!viewer) return;
  viewer.active = false;
  viewer.kickedByPlayer = true;
  markViewerAsKicked(viewer);
  closeViewerPanel();

  if (gameMode === GAME_MODES.STORY) {
    appendSystemMessage(`${viewer.name}의 연결을 차단했습니다. 판정은 오전 2시에 공개됩니다.`);
    showToast("차단을 기록했습니다. 결과는 방송 종료 후 공개됩니다.");
    return;
  }

  if (viewer.anomalous) {
    remainingAnomalies -= 1;
    caughtAnomalies += 1;
    score += 150;
    appendSystemMessage(`${viewer.name}의 비정상 연결을 차단했습니다.`);
    showToast("이상 신호를 발견했습니다. +150점");
    updateHud();
    finishStage({
      success: true,
      title: "이상 시청자 차단",
      copy: `${viewer.name}의 채팅 기록에서 이상 징후를 찾아 연결을 성공적으로 차단했습니다.`
    });
  } else {
    health = Math.max(0, health - 1);
    wrongKicks += 1;
    lastDamageReason = "wrong-kick";
    score = Math.max(0, score - 75);
    appendSystemMessage(`${viewer.name}은 정상 시청자였습니다. 체력이 감소합니다.`, true);
    showToast("정상 시청자를 잘못 퇴장시켜 체력이 1 감소했습니다.");
    triggerScreenInterference("mosaic");
    chatApp.classList.remove("wrong-kick");
    requestAnimationFrame(() => chatApp.classList.add("wrong-kick"));
    window.setTimeout(() => chatApp.classList.remove("wrong-kick"), 300);
    updateHud();
    if (health === 0) {
      finishStage({
        success: false,
        title: "체력 소진",
        copy: "정상 시청자를 반복해서 잘못 차단해 체력을 모두 잃었습니다."
      });
    }
  }
}

/**
 * 입력값 존재 여부를 composer 클래스에 반영해 전송 버튼 시각 상태를 바꿉니다.
 */
function updateComposerState() {
  messageForm.classList.toggle("has-text", messageInput.value.trim().length > 0);
}

/**
 * 현재 커서와 선택 범위를 보존하면서 이모지 문자열을 입력창에 삽입합니다.
 */
function insertAtCursor(value) {
  const start = messageInput.selectionStart ?? messageInput.value.length;
  const end = messageInput.selectionEnd ?? start;
  messageInput.setRangeText(value, start, end, "end");
  messageInput.focus();
  updateComposerState();
}

/**
 * 이모지 선택창을 닫고 aria-expanded를 false로 맞춥니다.
 */
function closeEmojiPanel() {
  emojiPanel.hidden = true;
  emojiButton.setAttribute("aria-expanded", "false");
}

/**
 * 개발 검증용 엔진 상태·이벤트·괴이·재시작 기능을 window.horrorChatGame에 공개합니다.
 */
function exposeDebugApi() {
  window.horrorChatGame = {
    seed: currentSeed,
    mode: gameMode,
    emitEvent(type, slots = {}, intensity) {
      chatEngine?.emitEvent(type, slots, intensity);
    },
    pause() {
      chatEngine?.setPaused(true);
    },
    resume() {
      chatEngine?.setPaused(false);
    },
    debug() {
      return chatEngine?.getDebugSnapshot();
    },
    finishDay() {
      if (gameMode === GAME_MODES.STORY) finishStoryDay();
    },
    spawnApparition: spawnStreamApparition,
    missApparition: expireStreamApparition,
    apparition() {
      return {
        active: apparitionActive,
        banished: banishedApparitions,
        missed: missedApparitions,
        dayBanished: dayBanishedApparitions,
        dayMissed: dayMissedApparitions
      };
    },
    restart: startGame
  };
}

/**
 * 고정 시드 테스트에서는 스테이지 번호를 혼합하고 일반 플레이에서는 새 시드를 만듭니다.
 */
function createStageSeed() {
  if (fixedSeed !== null) {
    return (fixedSeed + Math.imul(currentStage, 0x9e3779b9)) >>> 0;
  }
  return createSeed();
}

/**
 * 스테이지/하루의 시청자·엔진·화면·타이머를 초기화하고 해당 모드 진행을 시작합니다.
 */
function startStage() {
  window.clearTimeout(corruptedChatTimer);
  corruptedChatTimer = undefined;
  chatApp.classList.remove("corrupted-chat-hit");
  clearThreatCountdown(false);
  clearStreamApparition();
  stopStoryClock();
  chatEngine?.stop();
  currentSeed = createStageSeed();
  viewers = createViewers(currentSeed);
  remainingAnomalies = ANOMALIES_PER_STAGE;
  dayBanishedApparitions = 0;
  dayMissedApparitions = 0;
  selectedViewerId = null;
  gameOver = false;
  stageReviewOpen = false;
  messageList.replaceChildren();
  stageOverlay.classList.remove("open");
  stageOverlay.setAttribute("aria-hidden", "true");
  resetStoryNightReveal();
  closeViewerPanel();
  updateHud();
  chatApp.dataset.directorState = "AMBIENT";
  updateStreamState("AMBIENT");
  streamViewerCount.textContent = (1200 + currentSeed % 401).toLocaleString("ko-KR");
  apparitionRandom = createRoundRandom((currentSeed ^ 0xa5317e29) >>> 0);

  const deterministicEpoch = fixedSeed === null
    ? Date.now()
    : Date.UTC(2026, 0, 1) + (currentSeed % 86400) * 1000;
  const difficulty = Math.min(2.8, 1 + (currentStage - 1) * .12);

  chatEngine = new window.HorrorChatEngine({
    viewers,
    seed: currentSeed,
    difficulty,
    syntheticEvents: true,
    externalContext: { startedAt: deterministicEpoch, initiallyFocused: document.hasFocus() },
    onMessage: handleEngineMessage,
    onStateChange({ state, tension }) {
      chatApp.dataset.directorState = state;
      chatApp.style.setProperty("--chat-tension", tension.toFixed(3));
      updateStreamState(state);
    }
  });
  viewers.filter(viewer => viewer.anomalous).forEach(viewer => {
    viewer.anomalyLevel = Math.min(4, 2 + Math.floor((currentStage - 1) / 4));
  });
  chatEngine.start();

  if (gameMode === GAME_MODES.STORY) {
    appendSystemMessage(`${currentStage}일차 · 오후 7:00. ${STORY_DAY_INTROS[currentStage - 1]}`);
    appendSystemMessage("차단 결과는 숨겨지며 오전 2시에 한꺼번에 공개됩니다.");
    startStoryClock();
  } else {
    const graceSeconds = (getStageGraceMs() / 1000).toFixed(1).replace(".0", "");
    appendSystemMessage(`스테이지 ${currentStage} 시작. 이상 채팅은 ${graceSeconds}초 안에 처리하세요.`);
  }
  requestAnimationFrame(() => scrollToLatest());
  exposeDebugApi();
  scheduleStreamApparition(true);
}

/**
 * 새 게임의 체력·점수·누적 통계를 초기화한 뒤 첫 스테이지를 시작합니다.
 */
function startGame() {
  window.clearTimeout(interferenceTimer);
  interferenceTimer = undefined;
  gameOver = true;
  stageReviewOpen = false;
  clearThreatCountdown(false);
  clearStreamApparition();
  stopStoryClock();
  chatEngine?.stop();
  health = MAX_HEALTH;
  score = 0;
  currentStage = 1;
  caughtAnomalies = 0;
  missedAnomalies = 0;
  wrongKicks = 0;
  banishedApparitions = 0;
  missedApparitions = 0;
  dayBanishedApparitions = 0;
  dayMissedApparitions = 0;
  storyVictory = false;
  lastDamageReason = "missed";
  chatApp.dataset.gameMode = gameMode;
  chatApp.classList.remove("interference-mosaic", "interference-color", "wrong-kick");
  rewardButton.classList.remove("claimed");
  rewardButton.disabled = false;
  rewardLabel.textContent = "100 받기";
  gameOverlay.classList.remove("open");
  gameOverlay.setAttribute("aria-hidden", "true");
  resetStoryNightReveal();
  startStage();
}
