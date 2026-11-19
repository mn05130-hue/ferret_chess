"use strict";

const TUTORIAL_STEPS = Object.freeze([
  { title: "게시글 읽기", copy: "제목·닉네임·날짜·생성번호를 훑고, 수상한 글은 열어서 본문을 읽으세요.",
    example: "예 · 제목이 없거나, 날짜가 00일이거나, 생성번호가 00000인 글" },
  { title: "이상한 단서 찾기", copy: "상세 화면의 운영 규정과 대조 자료를 열어 본문의 문구를 비교하세요. 겉정보가 이상해도 본문에 위반 근거가 없으면 유지하세요.",
    example: "예 · 본문이 아직 공개되지 않은 공지 문구를 그대로 인용하면 삭제" },
  { title: "의심 표시와 글 삭제", copy: "애매한 글은 의심 표시를 남겨 두세요. 정상으로 판단한 글은 유지 표시를, 이상하다고 판단한 글은 삭제를 선택하세요.",
    example: "의심 표시 → 기록 확인 → 글 삭제" },
  { title: "게시판 복구", copy: "상태가 보통 또는 약함으로 떨어지면 복구하세요. 끊긴 뒤에는 정상 글도 깨져 보입니다.",
    example: "좋음 → 보통 → 약함 → 끊김" },
  { title: "첫날 목표", copy: "첫날에는 이상 게시글 두 건이 올라옵니다. 오전 2시에 내 처리와 정답을 글 한 건씩 비교할 수 있습니다.",
    example: "1일차 · 이상 글 두 건" }
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
  let copy = "두 번째 이상 글은 근거를 비교해 직접 판단하세요.";
  if (!tutorialPracticeProgress.normalLog) {
    step = 1;
    copy = `${normalViewer?.name || "표시된 정상 계정"}의 게시글을 열어 작성자 기록을 확인하세요.`;
  } else if (tutorialPracticeProgress.anomalyCatches < 1) {
    step = 2;
    copy = "본문과 운영 규정을 대조해 첫 이상 글을 찾아 삭제하세요.";
  } else if (!tutorialPracticeProgress.reconnect) {
    step = 3;
    copy = "연결 상태가 ‘보통’ 또는 ‘약함’일 때 복구 버튼을 누르세요.";
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

function notifyTutorialPostDeleted(post) {
  if (!tutorialPracticeActive || !post.anomalous) return;
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
