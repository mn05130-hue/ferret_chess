"use strict";

const TUTORIAL_STEPS = Object.freeze([
  Object.freeze({
    title: "시청자 기록 확인",
    copy: "채팅 닉네임을 누르면 그 시청자의 최근 기록을 볼 수 있습니다. 한 문장보다 반복되는 말투와 서로 맞지 않는 기억을 비교하세요.",
    example: "닉네임 선택 → 최근 기록 비교"
  }),
  Object.freeze({
    title: "방송 밖 정보는 단서",
    copy: "방 안의 작은 변화, 말하지 않은 과거, 아직 일어나지 않은 알림을 아는 시청자는 이상 연결일 가능성이 높습니다.",
    example: "관찰형 단서 · “아까 네 뒤에 나 있었어”"
  }),
  Object.freeze({
    title: "의심 표시 후 관찰",
    copy: "확신이 없다면 바로 강퇴하지 말고 ‘의심 표시’를 사용하세요. 표시된 계정은 채팅에서 강조되며 나중에 다시 기록을 확인할 수 있습니다.",
    example: "의심 → 추가 관찰 → 강제 퇴장"
  }),
  Object.freeze({
    title: "연결 상태 복구",
    copy: "연결이 보통 또는 약함으로 바뀌었을 때 재연결하세요. 좋음 상태에서 누르면 오판이며, 끊긴 뒤에는 정상 채팅도 오염돼 보입니다.",
    example: "좋음 → 보통 → 약함 → 끊김"
  }),
  Object.freeze({
    title: "첫날 목표",
    copy: "첫날에는 명백한 이상 시청자 2명만 등장합니다. 차단 결과는 오전 2시에 근거와 함께 공개되며, 이후 날짜에는 단서가 점점 교묘해집니다.",
    example: "1일차 · 이상 연결 2명 · 결과에서 근거 확인"
  })
]);

function renderTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialStepIndex];
  tutorialProgress.textContent = `${tutorialStepIndex + 1} / ${TUTORIAL_STEPS.length}`;
  tutorialTitle.textContent = step.title;
  tutorialCopy.textContent = step.copy;
  tutorialExample.textContent = step.example;
  tutorialNext.textContent = tutorialStepIndex === TUTORIAL_STEPS.length - 1 ? "게임 시작" : "다음";
}

function openTutorial({ automatic = false } = {}) {
  if (tutorialOpen) return;
  tutorialOpen = true;
  tutorialOpenedAutomatically = automatic;
  tutorialStepIndex = 0;
  tutorialReturnFocus = document.activeElement;
  tutorialSkip.textContent = automatic ? "나중에 보기" : "닫기";
  renderTutorialStep();
  tutorialBackdrop.classList.add("open");
  tutorialBackdrop.setAttribute("aria-hidden", "false");
  syncEnginePause();
  requestAnimationFrame(() => tutorialNext.focus());
}

function closeTutorial({ completed = false } = {}) {
  if (!tutorialOpen) return;
  tutorialOpen = false;
  tutorialBackdrop.classList.remove("open");
  tutorialBackdrop.setAttribute("aria-hidden", "true");
  const shouldStartPractice = completed && tutorialOpenedAutomatically
    && gameMode === GAME_MODES.STORY && currentStage === 1 && !gameOver;
  tutorialOpenedAutomatically = false;
  if (shouldStartPractice) startGuidedTutorialPractice();
  else if (completed) markTutorialCompleted();
  syncEnginePause();
  storyLastTick = performance.now();
  tutorialReturnFocus?.focus?.();
  tutorialReturnFocus = null;
}

function advanceTutorial() {
  if (!tutorialOpen) return;
  if (tutorialStepIndex >= TUTORIAL_STEPS.length - 1) {
    closeTutorial({ completed: true });
    return;
  }
  tutorialStepIndex += 1;
  renderTutorialStep();
}

function maybeOpenStoryTutorial() {
  if (gameMode !== GAME_MODES.STORY || currentStage !== 1 || hasCompletedTutorial()) return;
  requestAnimationFrame(() => openTutorial({ automatic: true }));
}

function renderGuidedTutorialObjective() {
  if (!tutorialPracticeActive) return;
  const normalViewer = viewers.find(viewer => viewer.id === tutorialPracticeNormalViewerId);
  let step = 4;
  let copy = "두 번째 이상 시청자는 근거를 비교해 직접 판단하세요.";
  if (!tutorialPracticeProgress.normalLog) {
    step = 1;
    copy = `${normalViewer?.name || "표시된 정상 계정"}의 닉네임을 눌러 이전 기록을 확인하세요.`;
  } else if (tutorialPracticeProgress.anomalyCatches < 1) {
    step = 2;
    copy = "방송 밖 정보를 노골적으로 말하는 첫 이상 시청자를 찾아 차단하세요.";
  } else if (!tutorialPracticeProgress.reconnect) {
    step = 3;
    copy = "연결 상태가 ‘보통’ 또는 ‘약함’일 때 재연결 버튼을 누르세요.";
  }
  tutorialObjectiveProgress.textContent = `실습 ${step}/4`;
  tutorialObjectiveCopy.textContent = copy;
  tutorialObjective.hidden = false;
}

function startGuidedTutorialPractice() {
  tutorialPracticeActive = true;
  tutorialPracticeProgress = { normalLog: false, anomalyCatches: 0, reconnect: false };
  tutorialPracticeNormalViewerId = viewers.find(viewer => !viewer.anomalous && viewer.active)?.id || null;
  renderGuidedTutorialObjective();
}

function stopGuidedTutorialPractice({ completed = false } = {}) {
  tutorialPracticeActive = false;
  tutorialPracticeNormalViewerId = null;
  tutorialObjective.hidden = true;
  if (completed) {
    markTutorialCompleted();
    showToast("첫날 실습을 마쳤습니다. 이제 기록과 근거를 직접 비교하세요.");
  }
}

function notifyTutorialViewerObserved(viewer) {
  if (!tutorialPracticeActive || viewer?.id !== tutorialPracticeNormalViewerId) return;
  tutorialPracticeProgress.normalLog = true;
  renderGuidedTutorialObjective();
}

function notifyTutorialViewerKicked(viewer) {
  if (!tutorialPracticeActive || !viewer?.anomalous) return;
  tutorialPracticeProgress.anomalyCatches += 1;
  if (tutorialPracticeProgress.anomalyCatches === 1 && !tutorialPracticeProgress.reconnect && !apparitionActive) {
    spawnStreamApparition();
  }
  if (tutorialPracticeProgress.normalLog
      && tutorialPracticeProgress.anomalyCatches >= 2
      && tutorialPracticeProgress.reconnect) {
    stopGuidedTutorialPractice({ completed: true });
    return;
  }
  renderGuidedTutorialObjective();
}

function notifyTutorialConnectionRecovered() {
  if (!tutorialPracticeActive) return;
  tutorialPracticeProgress.reconnect = true;
  if (tutorialPracticeProgress.normalLog && tutorialPracticeProgress.anomalyCatches >= 2) {
    stopGuidedTutorialPractice({ completed: true });
    return;
  }
  renderGuidedTutorialObjective();
}
