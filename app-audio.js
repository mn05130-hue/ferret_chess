"use strict";

/*
 * bgmconfig.js의 상황별 경로를 실제 타이틀·게임 audio 요소에 연결하고 결과 공포 효과음을 담당합니다.
 * HTMLAudioElement의 재생 상태, range 입력, localStorage 값을 항상 동기화하고,
 * 브라우저 자동 재생 거부는 예외로 처리해 화면 진행 자체가 막히지 않게 합니다.
 * 정전기 효과는 별도 음원 없이 Web Audio API 노드로 매번 짧게 합성합니다.
 */
// 상황 전환과 실제 pause 상태를 구분해, 사용자가 직접 끈 BGM만 다음 상황에서도 꺼진 채 유지합니다.
let gameMusicManuallyPaused = false;

/**
 * 타이틀 음악의 실제 재생 여부를 버튼 클래스, aria-pressed, 라벨에 동기화합니다.
 * @param {boolean} playing audio.play()가 성공해 현재 재생 중인지 여부
 */
function setTitleMusicUi(playing) {
  titleMusicButton.classList.toggle("is-playing", playing);
  titleMusicButton.setAttribute("aria-pressed", String(playing));
  titleMusicButton.setAttribute("aria-label", playing ? "타이틀 배경음악 정지" : "타이틀 배경음악 재생");
  titleMusicLabel.textContent = playing ? "BGM 끄기" : "BGM 켜기";
}

/**
 * 게임 음악의 실제 재생 여부를 버튼 클래스와 접근성 라벨에 동기화합니다.
 * @param {boolean} playing audio.play()가 성공해 현재 재생 중인지 여부
 */
function setGameMusicUi(playing) {
  gameMusicButton.classList.toggle("is-playing", playing);
  gameMusicButton.setAttribute("aria-pressed", String(playing));
  gameMusicButton.setAttribute("aria-label", playing ? "게임 배경음악 정지" : "게임 배경음악 재생");
}

/**
 * 설정값을 유효한 음악 경로 배열로 정리합니다. 한 문자열도 한 곡짜리 목록으로 사용할 수 있습니다.
 * @param {string|readonly string[]|undefined|null} setting bgmconfig.js의 한 상황 설정값
 * @returns {string[]} 공백과 잘못된 값을 제거한 음악 경로 목록
 */
function normalizeMusicTracks(setting) {
  const values = Array.isArray(setting) ? setting : [setting];
  return values
    .filter(value => typeof value === "string" && value.trim())
    .map(value => value.trim());
}

/**
 * 트랙 목록에서 곡을 고르되 여러 후보가 있으면 현재 곡을 제외해 연속 중복을 줄입니다.
 * @param {string|readonly string[]} setting 선택할 수 있는 오디오 파일 경로
 * @param {string} currentTrack 현재 audio의 src 속성에 들어 있는 상대 경로
 * @returns {string} 무작위로 선택한 한 트랙 경로. 유효한 경로가 없으면 빈 문자열
 */
function chooseMusicTrack(setting, currentTrack = "") {
  const tracks = normalizeMusicTracks(setting);
  if (!tracks.length) return "";
  const alternatives = tracks.filter(track => track !== currentTrack);
  const candidates = alternatives.length ? alternatives : tracks;
  let randomValue;
  if (window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    randomValue = values[0] / 4294967296;
  } else {
    randomValue = Math.random();
  }
  return candidates[Math.floor(randomValue * candidates.length)];
}

/**
 * localStorage의 음량을 0~100 범위로 검증하고 잘못된 값은 기본값으로 대체합니다.
 * @param {{storageKey: string, defaultVolume: number}} settings 저장 키와 기본 음량
 * @returns {number} audio와 range에 적용할 검증된 0~100 값
 */
function readStoredVolume({ storageKey, defaultVolume }) {
  try {
    const storedValue = window.localStorage.getItem(storageKey);
    const storedVolume = Number(storedValue);
    if (storedValue !== null && Number.isFinite(storedVolume) && storedVolume >= 0 && storedVolume <= 100) {
      return storedVolume;
    }
  } catch {
    // 저장소를 사용할 수 없는 환경에서는 기본 음량을 사용합니다.
  }
  return defaultVolume;
}

/**
 * range 값을 오디오 볼륨과 화면 퍼센트에 적용하고 선택적으로 저장소에 기록합니다.
 * @param {HTMLAudioElement} audio 실제 volume을 변경할 오디오
 * @param {HTMLInputElement} input 값을 동기화할 range 입력
 * @param {HTMLOutputElement} output 퍼센트를 표시할 출력 요소
 * @param {{storageKey: string}} settings 저장에 사용할 음량 설정
 * @param {number|string} value 새 0~100 음량
 * @param {boolean} persist localStorage에도 기록할지 여부
 */
function applyVolume(audio, input, output, settings, value, persist = true) {
  const volume = Math.min(100, Math.max(0, Number(value)));
  audio.volume = volume / 100;
  input.value = String(volume);
  output.value = `${Math.round(volume)}%`;
  output.textContent = output.value;
  if (!persist) return;
  try {
    window.localStorage.setItem(settings.storageKey, String(volume));
  } catch {
    // 저장소가 차단되어도 현재 세션의 음량 조절은 유지합니다.
  }
}

/**
 * 타이틀과 게임의 저장된 음량을 읽어 최초 UI와 audio 요소를 일치시킵니다.
 */
function initializeAudioVolumes() {
  applyVolume(titleMusic, titleVolume, titleVolumeValue, AUDIO_SETTINGS.title, readStoredVolume(AUDIO_SETTINGS.title) , false);
  applyVolume(gameMusic, gameVolume, gameVolumeValue, AUDIO_SETTINGS.game, readStoredVolume(AUDIO_SETTINGS.game), false);
  initializeAmbientHorrorSfx();
}

/**
 * 설정된 공포 효과음마다 재사용할 audio 객체를 만들고 게임 음량에 맞춥니다.
 */
function initializeAmbientHorrorSfx() {
  stopAmbientHorrorSfx();
  ambientHorrorSfxPlayers = normalizeMusicTracks(ASSET_CONFIG.soundEffects?.ambientHorror)
    .map(path => {
      const audio = new Audio(path);
      audio.preload = "auto";
      return { path, audio };
    });
  ambientHorrorSfxQueue = [];
  lastAmbientHorrorSfxPath = "";
  syncAmbientHorrorSfxVolume();
}

/**
 * 효과음이 BGM보다 묻히지 않도록 게임 음량에 배율을 적용합니다.
 */
function syncAmbientHorrorSfxVolume() {
  const volume = Math.min(1, gameMusic.volume * AMBIENT_HORROR_SFX_VOLUME_SCALE);
  ambientHorrorSfxPlayers.forEach(({ audio }) => { audio.volume = volume; });
}

/**
 * 최소~최대 범위에서 다음 효과음까지의 무작위 대기 시간을 계산합니다.
 * @param {readonly number[]} range [최소, 최대] 밀리초 범위
 * @returns {number} setTimeout에 전달할 밀리초
 */
function getAmbientHorrorSfxDelay(range) {
  const [minimum, maximum] = range;
  return Math.round(minimum + Math.random() * (maximum - minimum));
}

/**
 * 세 효과음을 모두 한 번씩 사용하기 전에는 같은 파일을 다시 뽑지 않습니다.
 * @returns {{path: string, audio: HTMLAudioElement}|null} 다음 재생 항목
 */
function takeNextAmbientHorrorSfx() {
  if (!ambientHorrorSfxQueue.length) {
    ambientHorrorSfxQueue = [...ambientHorrorSfxPlayers];
  }
  if (!ambientHorrorSfxQueue.length) return null;

  const candidates = ambientHorrorSfxQueue.filter(({ path }) => path !== lastAmbientHorrorSfxPath);
  const pool = candidates.length ? candidates : ambientHorrorSfxQueue;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  ambientHorrorSfxQueue.splice(ambientHorrorSfxQueue.indexOf(picked), 1);
  lastAmbientHorrorSfxPath = picked.path;
  return picked;
}

/**
 * 결과나 타이틀이 아닌 실제 게임 진행 중에만 효과음을 예약할 수 있는지 확인합니다.
 * @returns {boolean} 효과음 재생 가능 여부
 */
function canPlayAmbientHorrorSfx() {
  return !document.hidden && !gameOver && !stageReviewOpen && !tutorialOpen
    && !gameScreen.inert && gameScreen.getAttribute("aria-hidden") === "false";
}

/**
 * 다음 공포 효과음 한 건을 예약합니다.
 * @param {boolean} initial 스테이지 시작 직후의 짧은 대기 범위를 사용할지 여부
 */
function scheduleAmbientHorrorSfx(initial = false) {
  window.clearTimeout(ambientHorrorSfxTimer);
  ambientHorrorSfxTimer = undefined;
  if (!canPlayAmbientHorrorSfx() || !ambientHorrorSfxPlayers.length) return;

  const range = initial
    ? AMBIENT_HORROR_SFX_INITIAL_DELAY_RANGE_MS
    : AMBIENT_HORROR_SFX_DELAY_RANGE_MS;
  ambientHorrorSfxTimer = window.setTimeout(() => {
    ambientHorrorSfxTimer = undefined;
    if (!canPlayAmbientHorrorSfx()) return;

    const picked = takeNextAmbientHorrorSfx();
    if (picked) {
      ambientHorrorSfxPlayers.forEach(({ audio }) => {
        audio.pause();
        try { audio.currentTime = 0; } catch { /* 아직 메타데이터가 없어도 다음 재생은 계속 시도합니다. */ }
      });
      picked.audio.play().catch(() => {});
    }
    scheduleAmbientHorrorSfx();
  }, getAmbientHorrorSfxDelay(range));
}

/**
 * 현재 효과음과 예약을 정리합니다.
 */
function stopAmbientHorrorSfx() {
  window.clearTimeout(ambientHorrorSfxTimer);
  ambientHorrorSfxTimer = undefined;
  ambientHorrorSfxPlayers.forEach(({ audio }) => {
    audio.pause();
    try { audio.currentTime = 0; } catch { /* 로드 전 audio는 위치를 바꿀 수 없습니다. */ }
  });
}

/**
 * 탭 표시 여부와 게임 진행 상태가 바뀔 때 효과음 예약도 같은 상태로 맞춥니다.
 */
function syncAmbientHorrorSfx() {
  if (!canPlayAmbientHorrorSfx()) {
    stopAmbientHorrorSfx();
    return;
  }
  syncAmbientHorrorSfxVolume();
  if (ambientHorrorSfxTimer === undefined) scheduleAmbientHorrorSfx();
}

/**
 * 필요하면 타이틀 곡을 선택한 뒤 브라우저 재생 정책 실패까지 안전하게 처리합니다.
 * @returns {Promise<void>} 재생 시도와 UI 동기화가 끝날 때 완료되는 Promise
 */
async function playTitleMusic() {
  try {
    await titleMusic.play();
    if (titleScreen.hidden) {
      titleMusic.pause();
      return;
    }
    setTitleMusicUi(true);
  } catch {
    setTitleMusicUi(false);
  }
}

/**
 * 타이틀 음악을 멈추고 선택에 따라 재생 위치도 처음으로 되돌립니다.
 * @param {boolean} reset true이면 currentTime도 0으로 되돌림
 */
function stopTitleMusic(reset = true) {
  titleMusic.pause();
  if (reset) titleMusic.currentTime = 0;
  setTitleMusicUi(false);
}

/**
 * 타이틀 진입 시 트랙을 미리 선택하고 현재 재생 상태를 UI에 표시합니다.
 */
function prepareTitleMusic() {
  stopTitleMusic(false);
  const nextTrack = chooseMusicTrack(BGM_CONFIG.title, titleMusic.getAttribute("src") || "");
  if (!nextTrack) {
    titleMusic.removeAttribute("src");
    titleMusic.load();
    return;
  }
  titleMusic.src = nextTrack;
  titleMusic.load();
  playTitleMusic();
}

/**
 * 필요하면 게임 곡을 선택하고 재생 성공 여부에 맞춰 버튼 상태를 갱신합니다.
 * @returns {Promise<void>} 재생 시도와 UI 동기화가 끝날 때 완료되는 Promise
 */
async function playGameMusic() {
  try {
    await gameMusic.play();
    if (!titleScreen.hidden) {
      gameMusic.pause();
      return;
    }
    setGameMusicUi(true);
  } catch {
    setGameMusicUi(false);
  }
}

/**
 * 게임 음악을 멈추고 선택에 따라 다음 시작을 위해 재생 위치를 초기화합니다.
 * @param {boolean} reset true이면 currentTime도 0으로 되돌림
 */
function stopGameMusic(reset = true) {
  gameMusic.pause();
  if (reset) gameMusic.currentTime = 0;
  setGameMusicUi(false);
}

/**
 * 게임 audio를 새 상황에 맞는 곡으로 교체합니다.
 * 빈 배열인 상황은 현재 BGM을 유지하고, 사용자가 BGM을 꺼 둔 상태라면 전환 후에도 재생하지 않습니다.
 * @param {string} scene 개발자 도구와 중복 전환 방지에 사용할 상황 이름
 * @param {string|readonly string[]} setting bgmconfig.js에서 읽은 경로 또는 경로 목록
 * @param {{forcePlay?: boolean, restart?: boolean}} options 강제 재생 및 동일 상황 재시작 여부
 * @returns {boolean} 유효한 설정을 찾아 상황을 적용했는지 여부
 */
function switchGameMusicScene(scene, setting, { forcePlay = false, restart = false } = {}) {
  const tracks = normalizeMusicTracks(setting);
  if (!tracks.length) return false;

  const currentTrack = gameMusic.getAttribute("src") || "";
  const sameScene = gameMusic.dataset.bgmScene === scene && tracks.includes(currentTrack);
  const shouldPlay = forcePlay || !gameMusicManuallyPaused;

  if (sameScene) {
    if (restart) {
      try { gameMusic.currentTime = 0; } catch { /* 아직 메타데이터가 없으면 load 후 0초에서 시작합니다. */ }
    }
    if (shouldPlay) playGameMusic();
    return true;
  }

  const nextTrack = chooseMusicTrack(tracks, currentTrack);
  stopGameMusic(false);
  if (currentTrack !== nextTrack) {
    gameMusic.src = nextTrack;
    gameMusic.load();
  } else {
    try { gameMusic.currentTime = 0; } catch { /* 동일 파일이면 가능한 경우에만 처음으로 되돌립니다. */ }
  }
  gameMusic.dataset.bgmScene = scene;
  if (shouldPlay) playGameMusic();
  return true;
}

/**
 * 현재 모드와 일차를 기준으로 기본 플레이 상황의 음악 설정을 반환합니다.
 * 스토리 일차 경로가 비어 있으면 무한 모드 기본 경로를 안전한 대체값으로 사용합니다.
 * @returns {{scene: string, tracks: string|readonly string[]}} 적용할 상황 이름과 경로 목록
 */
function getGameplayMusicScene() {
  if (gameMode === GAME_MODES.STORY) {
    const storyTracks = normalizeMusicTracks(BGM_CONFIG.storyDays?.[currentStage]);
    return {
      scene: `story-day-${currentStage}`,
      tracks: storyTracks.length ? storyTracks : BGM_CONFIG.endless
    };
  }
  return { scene: "endless", tracks: BGM_CONFIG.endless };
}

/**
 * 현재 무한 모드 또는 스토리 일차의 기본 BGM으로 전환합니다.
 * @param {{forcePlay?: boolean, restart?: boolean}} options 최초 게임 진입 때 사용할 재생 옵션
 */
function prepareGameplayMusicForCurrentStage(options = {}) {
  const { scene, tracks } = getGameplayMusicScene();
  switchGameMusicScene(scene, tracks, options);
}

/**
 * 게임 진입 버튼의 사용자 제스처 안에서 1일차/무한 모드 BGM을 처음부터 재생합니다.
 */
function prepareGameMusic() {
  gameMusicManuallyPaused = false;
  prepareGameplayMusicForCurrentStage({ forcePlay: true, restart: true });
}

/**
 * 결과 종류에 맞는 음악으로 교체합니다. bgmconfig.js의 results 키와 이름이 같아야 합니다.
 * @param {"endlessClear"|"endlessFailed"|"storyCorrect"|"storyWrong"|"victory"|"gameOver"} resultType 결과 종류
 */
function prepareResultMusic(resultType) {
  switchGameMusicScene(`result-${resultType}`, BGM_CONFIG.results?.[resultType]);
}

/**
 * 연결 괴이 감지 또는 완전 끊김 전용 음악으로 교체합니다.
 * @param {"detected"|"disconnected"} anomalyType 연결 이상 단계
 */
function prepareAnomalyMusic(anomalyType) {
  if(anomalyType === "detected")return;
  
  switchGameMusicScene(`anomaly-${anomalyType}`, BGM_CONFIG.anomalies?.[anomalyType]);
}

/**
 * 게임 진입 제스처 안에서 AudioContext를 만들어 정전기 효과음의 첫 재생 지연을 줄입니다.
 */
function primeScareAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    scareAudioContext ||= new AudioContextClass();
    if (scareAudioContext.state === "suspended") scareAudioContext.resume().catch(() => {});
  } catch {
    scareAudioContext = null;
  }
}

/**
 * Web Audio 노드로 지정 길이와 음량의 정전기 노이즈를 합성한 뒤 자원을 해제합니다.
 * @param {{duration?: number, peakScale?: number}} options 재생 길이와 게임 음량 대비 최대 크기
 */
function emitStaticNoise({ duration = .72, peakScale = .24 } = {}) {
  if (!scareAudioContext || scareAudioContext.state !== "running") return;
  try {
    const frameCount = Math.floor(scareAudioContext.sampleRate * duration);
    const buffer = scareAudioContext.createBuffer(1, frameCount, scareAudioContext.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) {
      const envelope = 1 - index / frameCount * .55;
      samples[index] = (Math.random() * 2 - 1) * envelope;
    }

    const source = scareAudioContext.createBufferSource();
    const filter = scareAudioContext.createBiquadFilter();
    const gain = scareAudioContext.createGain();
    const now = scareAudioContext.currentTime;
    const peak = peakScale * gameMusic.volume;
    filter.type = "bandpass";
    filter.frequency.value = 1750;
    filter.Q.value = .65;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + duration * .02);
    gain.gain.setValueAtTime(peak * .35, now + duration * .24);
    gain.gain.setValueAtTime(peak, now + duration * .40);
    gain.gain.setValueAtTime(peak * .25, now + duration * .67);
    gain.gain.linearRampToValueAtTime(0, now + duration);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(scareAudioContext.destination);
    source.start(now);
  } catch {
    // 오디오 API를 사용할 수 없어도 시각 연출은 그대로 진행합니다.
  }
}

/**
 * 이상 채팅용으로 결과 화면 효과보다 짧고 작은 정전기 소리를 재생합니다.
 */
function playChatStaticNoise() {
  if (!scareAudioContext) return;
  const play = () => emitStaticNoise({ duration: .32, peakScale: .09 });
  if (scareAudioContext.state === "suspended") {
    scareAudioContext.resume().then(play).catch(() => {});
    return;
  }
  play();
}

/**
 * 중단된 AudioContext를 재개한 후 오답 결과용 정전기 효과음을 재생합니다.
 */
function playStaticScare() {
  if (!scareAudioContext) return;
  if (scareAudioContext.state === "suspended") {
    scareAudioContext.resume().then(emitStaticNoise).catch(() => {});
    return;
  }
  emitStaticNoise();
}
