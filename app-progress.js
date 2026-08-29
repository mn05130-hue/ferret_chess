"use strict";

/* 플레이 결과와 발견한 이상 유형을 다음 방문에도 남기는 작은 진행 저장소입니다. */
const PLAYER_PROGRESS_STORAGE_KEY = "ferret-chess-progress-v1";
const DEFAULT_PLAYER_PROGRESS = Object.freeze({
  bestEndlessScore: 0,
  bestEndlessStage: 0,
  storyClears: 0,
  discoveredTypes: [],
  tutorialCompleted: false
});

let playerProgress = { ...DEFAULT_PLAYER_PROGRESS, discoveredTypes: [] };

function normalizePlayerProgress(value) {
  const knownTypes = Object.keys(FERRET_CHAT_RULES.ANOMALY_TYPE_LABELS).filter(type => type !== "GLITCH");
  const discoveredTypes = Array.isArray(value?.discoveredTypes)
    ? [...new Set(value.discoveredTypes.filter(type => knownTypes.includes(type)))]
    : [];
  return {
    bestEndlessScore: Math.max(0, Math.floor(Number(value?.bestEndlessScore) || 0)),
    bestEndlessStage: Math.max(0, Math.floor(Number(value?.bestEndlessStage) || 0)),
    storyClears: Math.max(0, Math.floor(Number(value?.storyClears) || 0)),
    discoveredTypes,
    tutorialCompleted: Boolean(value?.tutorialCompleted)
  };
}

function savePlayerProgress() {
  try {
    window.localStorage.setItem(PLAYER_PROGRESS_STORAGE_KEY, JSON.stringify(playerProgress));
  } catch {
    // 저장소가 차단돼도 현재 플레이 세션은 계속 진행합니다.
  }
}

function renderPlayerProgress() {
  recordBestScore.textContent = playerProgress.bestEndlessScore.toLocaleString("ko-KR");
  recordBestStage.textContent = String(playerProgress.bestEndlessStage);
  recordStoryClears.textContent = String(playerProgress.storyClears);
  recordDiscoveredTypes.textContent = `${playerProgress.discoveredTypes.length}/5`;
  const discoveredLabels = playerProgress.discoveredTypes
    .map(type => FERRET_CHAT_RULES.ANOMALY_TYPE_LABELS[type])
    .filter(Boolean);
  recordDiscoveredTypes.title = discoveredLabels.length
    ? `발견: ${discoveredLabels.join(", ")}`
    : "아직 발견한 이상 유형이 없습니다.";
}

function initializePlayerProgress() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(PLAYER_PROGRESS_STORAGE_KEY) || "null");
    playerProgress = normalizePlayerProgress(stored);
  } catch {
    playerProgress = normalizePlayerProgress(null);
  }
  renderPlayerProgress();
}

function recordEndlessProgress(currentScore, reachedStage) {
  playerProgress.bestEndlessScore = Math.max(
    playerProgress.bestEndlessScore,
    Math.max(0, Math.floor(Number(currentScore) || 0))
  );
  playerProgress.bestEndlessStage = Math.max(
    playerProgress.bestEndlessStage,
    Math.max(0, Math.floor(Number(reachedStage) || 0))
  );
  savePlayerProgress();
  renderPlayerProgress();
}

function recordStoryClear() {
  playerProgress.storyClears += 1;
  savePlayerProgress();
  renderPlayerProgress();
}

function recordDiscoveredAnomaly(type) {
  if (!type || type === "GLITCH" || !FERRET_CHAT_RULES.ANOMALY_TYPE_LABELS[type]) return;
  if (playerProgress.discoveredTypes.includes(type)) return;
  playerProgress.discoveredTypes.push(type);
  savePlayerProgress();
  renderPlayerProgress();
}

function hasCompletedTutorial() {
  return playerProgress.tutorialCompleted;
}

function markTutorialCompleted() {
  if (playerProgress.tutorialCompleted) return;
  playerProgress.tutorialCompleted = true;
  savePlayerProgress();
}
