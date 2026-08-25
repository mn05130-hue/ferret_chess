"use strict";

// Title/game music and story scare audio.
/**
 * 타이틀 음악의 실제 재생 여부를 버튼 클래스, aria-pressed, 라벨에 동기화합니다.
 */
function setTitleMusicUi(playing) {
  titleMusicButton.classList.toggle("is-playing", playing);
  titleMusicButton.setAttribute("aria-pressed", String(playing));
  titleMusicButton.setAttribute("aria-label", playing ? "타이틀 배경음악 정지" : "타이틀 배경음악 재생");
  titleMusicLabel.textContent = playing ? "BGM 끄기" : "BGM 켜기";
}

/**
 * 게임 음악의 실제 재생 여부를 버튼 클래스와 접근성 라벨에 동기화합니다.
 */
function setGameMusicUi(playing) {
  gameMusicButton.classList.toggle("is-playing", playing);
  gameMusicButton.setAttribute("aria-pressed", String(playing));
  gameMusicButton.setAttribute("aria-label", playing ? "게임 배경음악 정지" : "게임 배경음악 재생");
}

/**
 * 트랙 목록에서 곡을 고르되 가능하면 현재 재생 중인 곡과 다른 항목을 선택합니다.
 */
function chooseMusicTrack(tracks) {
  let randomValue;
  if (window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    randomValue = values[0] / 4294967296;
  } else {
    randomValue = Math.random();
  }
  return tracks[Math.floor(randomValue * tracks.length)];
}

/**
 * localStorage의 음량을 0~100 범위로 검증하고 잘못된 값은 기본값으로 대체합니다.
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
}

/**
 * 필요하면 타이틀 곡을 선택한 뒤 브라우저 재생 정책 실패까지 안전하게 처리합니다.
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
  titleMusic.src = chooseMusicTrack(TITLE_MUSIC_TRACKS);
  titleMusic.load();
  playTitleMusic();
}

/**
 * 필요하면 게임 곡을 선택하고 재생 성공 여부에 맞춰 버튼 상태를 갱신합니다.
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
 */
function stopGameMusic(reset = true) {
  gameMusic.pause();
  if (reset) gameMusic.currentTime = 0;
  setGameMusicUi(false);
}

/**
 * 게임 진입 시 곡을 준비하고 사용자 상호작용 뒤 자동 재생을 시도합니다.
 */
function prepareGameMusic() {
  stopGameMusic();
  gameMusic.src = chooseMusicTrack(GAME_MUSIC_TRACKS);
  gameMusic.load();
  playGameMusic();
}

/**
 * 스토리 공포 효과 전에 AudioContext를 만들어 첫 효과음의 지연을 줄입니다.
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
 * Web Audio 노드로 짧은 정전기 노이즈와 저주파 충격음을 합성한 뒤 자원을 해제합니다.
 */
function emitStaticNoise() {
  if (!scareAudioContext || scareAudioContext.state !== "running") return;
  try {
    const duration = .72;
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
    const peak = .24 * gameMusic.volume;
    filter.type = "bandpass";
    filter.frequency.value = 1750;
    filter.Q.value = .65;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + .015);
    gain.gain.setValueAtTime(peak * .35, now + .17);
    gain.gain.setValueAtTime(peak, now + .29);
    gain.gain.setValueAtTime(peak * .25, now + .48);
    gain.gain.linearRampToValueAtTime(0, now + duration);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(scareAudioContext.destination);
    source.start(now);
  } catch {
    // 오디오 API를 사용할 수 없어도 시각 연출은 그대로 진행합니다.
  }
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
