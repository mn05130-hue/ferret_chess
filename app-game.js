"use strict";

/*
 * 화면 이동과 게임 수명 주기를 담당합니다.
 * 진입 화면 → 타이틀 → 게임 → 하루/스테이지 결과 → 최종 결과의 전환을 제어하고,
 * 시청자 기록 열기·강퇴 판정·새 스테이지 생성·채팅 엔진 시작 및 정리를 연결합니다.
 * 화면을 떠날 때는 해당 화면의 타이머, 오디오, 엔진, 접근성 상태를 함께 정리합니다.
 */
/**
 * 최초 로드에서는 타이틀과 게임을 비활성화하고 닉네임을 입력받을 진입 화면만 표시합니다.
 */
function showEntryScreen() {
  window.clearTimeout(entryTransitionTimer);
  entryTransitionTimer = undefined;
  gameOver = true;
  entryScreen.hidden = false;
  entryScreen.setAttribute("aria-hidden", "false");
  entryScreen.classList.remove("is-leaving");
  entryGate.disabled = false;
  titleScreen.hidden = true;
  titleScreen.setAttribute("aria-hidden", "true");
  gameScreen.inert = true;
  gameScreen.setAttribute("aria-hidden", "true");
  stopTitleMusic();
  stopGameMusic();
  stopAmbientHorrorSfx();
  requestAnimationFrame(() => playerNicknameInput.focus());
}

/**
 * 첫 화면에서 닉네임을 검증한 뒤 제출 제스처 안에서 음악 재생과 타이틀 전환을 시작합니다.
 */
function enterTitleFromEntry() {
  if (entryGate.disabled || !commitPlayerNickname()) return;
  entryGate.disabled = true;
  entryScreen.setAttribute("aria-hidden", "true");
  entryScreen.classList.add("is-leaving");

  // showTitle() 내부의 play()가 이 클릭 이벤트의 사용자 활성화 권한을 그대로 사용합니다.
  showTitle(false);

  entryTransitionTimer = window.setTimeout(() => {
    entryScreen.hidden = true;
    entryScreen.classList.remove("is-leaving");
    entryGate.disabled = false;
    entryTransitionTimer = undefined;
    storyStart.focus();
  }, 720);
}

/**
 * 진행 중인 타이머·엔진·오버레이·음악을 정리하고 안전하게 타이틀 화면으로 돌아갑니다.
 * @param {boolean} shouldFocus true이면 전환 뒤 스토리 시작 버튼에 초점을 옮김
 */
function showTitle(shouldFocus = true) {
  window.clearTimeout(interferenceTimer);
  window.clearTimeout(corruptedChatTimer);
  interferenceTimer = undefined;
  corruptedChatTimer = undefined;
  gameOver = true;
  stageReviewOpen = false;
  if (tutorialOpen) closeTutorial();
  stopGuidedTutorialPractice();
  clearAnomalyChatEffect();
  clearStandardResultReveal();
  clearThreatCountdown();
  clearStreamApparition();
  stopStoryClock();
  chatEngine?.stop();
  chatEngine = null;
  chatApp.classList.remove("interference-mosaic", "interference-color", "wrong-kick", "corrupted-chat-hit");
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
  stopAmbientHorrorSfx();
  stopGameMusic();
  prepareTitleMusic();
  if (shouldFocus) requestAnimationFrame(() => storyStart.focus());
}

/**
 * 닉네임 검증 후 선택 모드를 저장하고 타이틀에서 게임 화면으로 전환합니다.
 * @param {"endless"|"story"} mode 시작할 게임 모드 식별자
 */
function enterGame(mode = GAME_MODES.ENDLESS, options = {}) {
  if (!commitPlayerNickname()) return;
  gameMode = mode;
  dailyChallengeActive = mode === GAME_MODES.ENDLESS && Boolean(options.dailyChallenge);
  activeSeedOverride = dailyChallengeActive ? options.seed : fixedSeed;
  chatApp.dataset.gameMode = gameMode;
  primeScareAudio();
  stopTitleMusic();
  titleScreen.hidden = true;
  titleScreen.setAttribute("aria-hidden", "true");
  gameScreen.inert = false;
  gameScreen.setAttribute("aria-hidden", "false");
  startGame();
  // startGame()이 currentStage를 1로 초기화한 뒤 올바른 1일차/무한 모드 곡을 재생합니다.
  prepareGameMusic();
}

function renderPostDetail(post) {
  const body = getPostBody(post);
  viewerName.textContent = getPostTitle(body);
  postBody.textContent = body;
  postAuthor.textContent = `${post.author.name} · ${post.time}`;
  viewerHistory.replaceChildren();
  const records = post.author.history.filter(record => record.postId !== post.id
    && !boardPosts.get(record.postId)?.deleted);
  postHistoryEmpty.hidden = records.length > 0;
  for (const record of records.slice(-6).reverse()) {
    const item = document.createElement("li");
    item.textContent = apparitionActive && apparitionExpired
      ? createUnknownChatText(record.body, post.author) : record.body;
    viewerHistory.append(item);
  }
}

function openPostPanel(postId, trigger) {
  if (gameOver || stageReviewOpen || tutorialOpen) return;
  const post = boardPosts.get(postId);
  if (!post || post.deleted) return;
  selectedPostId = postId;
  postPanelTrigger = trigger;
  renderPostDetail(post);
  chatEngine?.observeViewer(post.author.id);
  notifyTutorialViewerObserved(post.author);
  viewerBackdrop.classList.add("open");
  viewerBackdrop.setAttribute("aria-hidden", "false");
  suspectButton.setAttribute("aria-pressed", String(post.suspected));
  suspectButton.textContent = post.suspected ? "의심 해제" : "의심 표시";
  viewerBackdrop.querySelector(".viewer-panel").scrollTop = 0;
  keepPostButton.hidden = gameMode !== GAME_MODES.STORY;
  keepPostButton.setAttribute("aria-pressed", String(post.kept));
  panelClose.focus({ preventScroll: true });
}

function closeViewerPanel() {
  const wasOpen = selectedPostId !== null;
  selectedPostId = null;
  viewerBackdrop.classList.remove("open");
  viewerBackdrop.setAttribute("aria-hidden", "true");
  if (wasOpen) {
    const focusTarget = postPanelTrigger?.isConnected ? postPanelTrigger : messageList;
    focusTarget.focus({ preventScroll: true });
  }
  postPanelTrigger = null;
}

function toggleSelectedPostSuspect() {
  if (gameOver || stageReviewOpen || tutorialOpen) return;
  const post = boardPosts.get(selectedPostId);
  if (!post || post.deleted) return;
  post.suspected = !post.suspected;
  messageList.querySelector(`[data-post-id="${post.id}"]`)?.classList.toggle("suspected-message", post.suspected);
  suspectButton.setAttribute("aria-pressed", String(post.suspected));
  suspectButton.textContent = post.suspected ? "의심 해제" : "의심 표시";
}

/**
 * 모든 진행 시스템을 중단하고 누적 결과에 맞는 최종 게임오버/승리 카드를 구성합니다.
 */
function endGame() {
  gameOver = true;
  stageReviewOpen = false;
  if (tutorialOpen) closeTutorial();
  stopGuidedTutorialPractice();
  clearAnomalyChatEffect();
  clearStandardResultReveal();
  clearThreatCountdown(false);
  clearStreamApparition();
  stopStoryClock();
  chatEngine?.stop();
  stopAmbientHorrorSfx();
  closeViewerPanel();
  stageOverlay.classList.remove("open");
  stageOverlay.setAttribute("aria-hidden", "true");
  resetStoryNightReveal();

  if (gameMode === GAME_MODES.ENDLESS) recordEndlessProgress(score, currentStage);

  const storyMode = gameMode === GAME_MODES.STORY;
  prepareResultMusic(storyMode && storyVictory ? "victory" : "gameOver");
  if (storyMode && storyVictory) {
    resultKicker.textContent = "SEVEN NIGHTS SURVIVED";
    resultTitle.textContent = "새벽의 관리자가 되었습니다";
    resultCopy.textContent = `일주일 동안 게시판을 지켰습니다. 이상 게시글 ${caughtAnomalies}건을 삭제했습니다.`;
  } else {
    resultKicker.textContent = storyMode
      ? "BOARD LOST BEFORE DAWN"
      : dailyChallengeActive ? "DAILY SIGNAL DESTROYED" : "SIGNAL DESTROYED";
    if (lastDamageReason === "wrong-kick") {
      resultTitle.textContent = "게시판 운영이 중단됐습니다";
      resultCopy.textContent = `정상 게시글을 반복해서 삭제해 체력을 모두 잃었습니다. 총 오판 ${wrongKicks}회.`;
    } else if (lastDamageReason === "false-reconnect") {
      resultTitle.textContent = "스스로 신호를 끊었습니다";
      resultCopy.textContent = `정상 상태에서 반복해서 복구를 눌러 체력을 모두 잃었습니다. 총 ${falseReconnects}회 오판했습니다.`;
    } else if (lastDamageReason === "apparition") {
      resultTitle.textContent = "끊어진 화면 너머에 남았습니다";
      resultCopy.textContent = `게시판 동기화를 잘못 조작해 체력을 모두 잃었습니다. 총 ${missedApparitions}회 실패했습니다.`;
    } else {
      resultTitle.textContent = "이상 게시글을 놓쳤습니다";
      resultCopy.textContent = `이상 게시글 ${missedAnomalies}건를 놓쳐 체력을 모두 잃었습니다.`;
    }
  }
  finalScore.textContent = `${String(score).padStart(4, "0")}점`;
  finalStage.textContent = String(currentStage);
  finalProgressLabel.textContent = storyMode ? "생존 일차" : "도달 스테이지";
  gameOverlay.classList.add("open");
  gameOverlay.setAttribute("aria-hidden", "false");
  beginStandardResultReveal(gameOverlay, resultCard, [gameRetry, gameRestart], gameRestart);
}

function toggleKeepSelectedPost() {
  if (gameMode !== GAME_MODES.STORY || gameOver || stageReviewOpen || tutorialOpen) return;
  const post = boardPosts.get(selectedPostId);
  if (!post || post.deleted) return;
  post.kept = !post.kept;
  const row = messageList.querySelector(`[data-post-id="${post.id}"]`);
  if (row) row.querySelector(".post-metadata").textContent = getPostMetadata(post);
  keepPostButton.setAttribute("aria-pressed", String(post.kept));
  if (post.kept) closeViewerPanel();
}

function deleteSelectedPost() {
  if (gameOver || stageReviewOpen || tutorialOpen) return;
  const post = boardPosts.get(selectedPostId);
  if (!post || post.deleted) return;
  post.deleted = true;
  post.kept = false;
  messageList.querySelector(`[data-post-id="${post.id}"]`)?.remove();
  closeViewerPanel();

  if (gameMode === GAME_MODES.STORY) {
    notifyTutorialPostDeleted(post);
    appendSystemMessage("게시글을 삭제했습니다. 판정은 오전 2시에 공개됩니다.");
    return;
  }

  const outcome = FERRET_CHAT_RULES.getViewerKickOutcome(post.anomalous);
  score = Math.max(0, score + outcome.scoreDelta);

  if (post.anomalous) {
    remainingAnomalies -= 1;
    caughtAnomalies += 1;
    recordDiscoveredAnomaly(post.author.anomalyPermission);
    updateHud();
    finishStage({
      success: true,
      title: "이상 게시글 삭제",
      copy: `${post.author.name}의 이상 게시글을 삭제했습니다.`,
      evidence: getPostEvidenceSummary(post)
    });
    return;
  }

  health = Math.max(0, health + outcome.healthDelta);
  wrongKicks += 1;
  lastDamageReason = "wrong-kick";
  appendSystemMessage("정상 게시글을 삭제해 체력이 1 감소했습니다.", true);
  triggerScreenInterference("mosaic");
  updateHud();
  if (health === 0) {
    finishStage({
      success: false,
      title: "체력 소진",
      copy: "정상 게시글을 반복해서 삭제해 체력을 모두 잃었습니다.",
      evidence: getPostEvidenceSummary(post)
    });
  }
}

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
    state() {
      return {
        mode: gameMode,
        dailyChallenge: dailyChallengeActive,
        health,
        score,
        currentStage,
        remainingAnomalies
      };
    },
    lifecycle() {
      return {
        activeEngineCount: ACTIVE_CHAT_ENGINE_INSTANCES.size,
        engineRunning: Boolean(chatEngine?.running),
        enginePaused: Boolean(chatEngine?.paused),
        engineTimerActive: chatEngine?.timer != null,
        storyClockActive: storyClockInterval != null,
        threatTimerActive: threatInterval != null,
        apparitionSpawnScheduled: apparitionSpawnTimer != null,
        apparitionTimerActive: apparitionInterval != null
      };
    },
    finishDay() {
      if (gameMode === GAME_MODES.STORY) finishStoryDay();
    },
    spawnApparition: spawnStreamApparition,
    missApparition: expireStreamApparition,
    apparition() {
      return {
        stage: connectionWidget.dataset.connectionStage,
        active: apparitionActive,
        banished: banishedApparitions,
        missed: missedApparitions,
        falseReconnects,
        dayBanished: dayBanishedApparitions,
        dayMissed: dayMissedApparitions
      };
    },
    restart: startGame
  };
}

/**
 * 고정 시드 테스트에서는 스테이지 번호를 혼합하고 일반 플레이에서는 새 시드를 만듭니다.
 * @returns {number} 현재 스테이지의 시청자와 엔진을 결정할 32비트 시드
 */
function createStageSeed() {
  if (activeSeedOverride !== null) {
    return (activeSeedOverride + Math.imul(currentStage, 0x9e3779b9)) >>> 0;
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
  clearAnomalyChatEffect();
  clearStandardResultReveal();
  clearThreatCountdown(false);
  clearStreamApparition();
  stopStoryClock();
  chatEngine?.stop();
  stopAmbientHorrorSfx();
  currentSeed = createStageSeed();
  remainingAnomalies = getAnomalyCountForStage(currentStage);
  viewers = createViewers(currentSeed, remainingAnomalies);
  dayBanishedApparitions = 0;
  dayMissedApparitions = 0;
  boardPosts.clear();
  publishedAnomalyAuthors.clear();
  storyElapsedMs = 0;
  newMessageButton.hidden = true;
  gameOver = false;
  stageReviewOpen = false;
  gameScreen.inert = false;
  // 결과·괴이 전용 곡이 재생 중이었다면 현재 모드와 일차의 기본 플레이 곡으로 복귀합니다.
  prepareGameplayMusicForCurrentStage();
  messageList.replaceChildren();
  stageOverlay.classList.remove("open");
  stageOverlay.setAttribute("aria-hidden", "true");
  resetStoryNightReveal();
  closeViewerPanel();
  updateHud();
  chatApp.dataset.directorState = "AMBIENT";
  updateStreamState("AMBIENT");
  apparitionRandom = createRoundRandom((currentSeed ^ 0xa5317e29) >>> 0);

  const deterministicEpoch = activeSeedOverride === null
    ? Date.now()
    : Date.UTC(2026, 0, 1) + (currentSeed % 86400) * 1000;
  const difficulty = Math.min(2.8, 1 + (currentStage - 1) * .12);
  const anomalyLevel = FERRET_CHAT_RULES.getAnomalyLevel(gameMode, currentStage);

  chatEngine = new window.HorrorChatEngine({
    viewers,
    seed: currentSeed,
    difficulty,
    anomalyLevel,
    anomalyPermissions: FERRET_CHAT_RULES.getAnomalyPermissions(gameMode, currentStage),
    syntheticEvents: true,
    externalContext: { startedAt: deterministicEpoch, initiallyFocused: document.hasFocus() },
    onMessage: handleEngineMessage,
    onStateChange({ state, tension }) {
      chatApp.dataset.directorState = state;
      chatApp.style.setProperty("--chat-tension", tension.toFixed(3));
      updateStreamState(state);
    }
  });
  chatEngine.start();

  if (gameMode === GAME_MODES.STORY) {
    appendSystemMessage(`${currentStage}일차 · 오후 7:00. ${STORY_DAY_INTROS[currentStage - 1]}`);
    appendSystemMessage("삭제 결과는 오전 2시에 한꺼번에 공개됩니다.");
    startStoryClock();
  } else {
    const graceSeconds = (getStageGraceMs() / 1000).toFixed(1).replace(".0", "");
    appendSystemMessage(`${dailyChallengeActive ? "오늘의 도전 · " : ""}스테이지 ${currentStage} 시작. 이상 게시글은 등장 후 ${graceSeconds}초 안에 삭제하세요.`);
  }
  requestAnimationFrame(() => scrollToLatest());
  exposeDebugApi();
  scheduleStreamApparition(true);
  scheduleAmbientHorrorSfx(true);
  maybeOpenStoryTutorial();
}

/**
 * 새 게임의 체력·점수·누적 통계를 초기화한 뒤 첫 스테이지를 시작합니다.
 */
function startGame() {
  window.clearTimeout(interferenceTimer);
  interferenceTimer = undefined;
  gameOver = true;
  stageReviewOpen = false;
  if (tutorialOpen) closeTutorial();
  stopGuidedTutorialPractice();
  clearStandardResultReveal();
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
  falseReconnects = 0;
  banishedApparitions = 0;
  missedApparitions = 0;
  dayBanishedApparitions = 0;
  dayMissedApparitions = 0;
  storyVictory = false;
  lastDamageReason = "missed";
  chatApp.dataset.gameMode = gameMode;
  chatApp.classList.remove("interference-mosaic", "interference-color", "wrong-kick");
  gameOverlay.classList.remove("open");
  gameOverlay.setAttribute("aria-hidden", "true");
  resetStoryNightReveal();
  startStage();
}
