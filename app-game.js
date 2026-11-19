"use strict";

/* 진입 화면과 타이틀 전환, 새 게임과 라운드 시작을 관리합니다. */

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
  requestAnimationFrame(() => playerNicknameInput.focus({ preventScroll: true }));
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
  clearStandardResultReveal();
  clearRoundTimers();
  chatEngine?.stop();
  chatEngine = null;
  chatApp.classList.remove("interference-mosaic", "interference-color", "wrong-kick", "corrupted-chat-hit");
  closePostPanel();
  setResultOverlayOpen(stageOverlay, false);
  resetStoryNightReveal();
  setResultOverlayOpen(gameOverlay, false);
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
        remainingAnomalies,
        roundRemainingMs: getRoundRemainingMs()
      };
    },
    lifecycle() {
      return {
        activeEngineCount: ACTIVE_CHAT_ENGINE_INSTANCES.size,
        engineRunning: Boolean(chatEngine?.running),
        enginePaused: Boolean(chatEngine?.paused),
        engineTimerActive: chatEngine?.timer != null,
        roundClockActive: roundClockInterval != null,
        storyClockActive: gameMode === GAME_MODES.STORY && roundClockInterval != null,
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

function createStageChatEngine() {
  const deterministicEpoch = activeSeedOverride === null
    ? Date.now()
    : Date.UTC(2026, 0, 1) + (currentSeed % 86400) * 1000;
  const difficulty = FERRET_CHAT_RULES.getPostRate(currentStage);
  const anomalyLevel = FERRET_CHAT_RULES.getAnomalyLevel(gameMode, currentStage);
  const { anomalyArrivalIntervalMs: baseArrivalInterval, tickMs } = TUNING;
  // 라운드 시간의 마지막 20%는 이미 올라온 글을 읽을 수 있도록 비워 둡니다.
  const arrivalBudgetMs = getRoundDurationMs() * .8 / remainingAnomalies - tickMs;
  const arrivalScale = Math.min(1 / difficulty, arrivalBudgetMs / baseArrivalInterval[1]);
  const anomalyArrivalIntervalMs = baseArrivalInterval.map(interval => interval * arrivalScale);

  return new window.HorrorChatEngine({
    viewers,
    seed: currentSeed,
    difficulty,
    anomalyArrivalIntervalMs,
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
}

/**
 * 스테이지/하루의 시청자·엔진·화면·타이머를 초기화하고 해당 모드 진행을 시작합니다.
 */
function startStage() {
  window.clearTimeout(corruptedChatTimer);
  corruptedChatTimer = undefined;
  chatApp.classList.remove("corrupted-chat-hit");
  clearStandardResultReveal();
  clearRoundTimers();
  chatEngine?.stop();
  stopAmbientHorrorSfx();
  currentSeed = createStageSeed();
  remainingAnomalies = getAnomalyCountForStage(currentStage);
  viewers = createViewers(currentSeed, remainingAnomalies);
  dayBanishedApparitions = 0;
  dayMissedApparitions = 0;
  boardPosts.clear();
  publishedAnomalyAuthors.clear();
  roundElapsedMs = 0;
  newMessageButton.hidden = true;
  gameOver = false;
  stageReviewOpen = false;
  gameScreen.inert = false;
  // 결과·괴이 전용 곡이 재생 중이었다면 현재 모드와 일차의 기본 플레이 곡으로 복귀합니다.
  prepareGameplayMusicForCurrentStage();
  messageList.replaceChildren();
  setResultOverlayOpen(stageOverlay, false);
  resetStoryNightReveal();
  closePostPanel();
  updateHud();
  chatApp.dataset.directorState = "AMBIENT";
  updateStreamState("AMBIENT");
  apparitionRandom = createRoundRandom((currentSeed ^ 0xa5317e29) >>> 0);

  chatEngine = createStageChatEngine();
  chatEngine.start();

  if (gameMode === GAME_MODES.STORY) {
    appendSystemMessage(`${currentStage}일차 · 오후 7:00. ${STORY_DAY_INTROS[currentStage - 1]}`);
    appendSystemMessage("삭제 결과는 오전 2시에 한꺼번에 공개됩니다.");
  } else {
    const durationSeconds = ROUND_DURATION_MS / 1000;
    appendSystemMessage(`${dailyChallengeActive ? "오늘의 도전 · " : ""}스테이지 ${currentStage} 시작. ${durationSeconds}초 안에 이상 게시글을 찾아 삭제하세요.`);
  }
  startRoundClock();
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
  health = MAX_HEALTH;
  score = 0;
  currentStage = 1;
  caughtAnomalies = 0;
  missedAnomalies = 0;
  wrongKicks = 0;
  falseReconnects = 0;
  banishedApparitions = 0;
  missedApparitions = 0;
  storyVictory = false;
  lastDamageReason = "missed";
  chatApp.dataset.gameMode = gameMode;
  chatApp.classList.remove("interference-mosaic", "interference-color", "wrong-kick");
  setResultOverlayOpen(gameOverlay, false);
  startStage();
}
