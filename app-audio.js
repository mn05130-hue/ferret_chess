"use strict";

/*
 * 타이틀·게임 배경음악과 결과 공포 효과음을 담당합니다.
 * HTMLAudioElement의 재생 상태, range 입력, localStorage 값을 항상 동기화하고,
 * 브라우저 자동 재생 거부는 예외로 처리해 화면 진행 자체가 막히지 않게 합니다.
 * 정전기 효과는 별도 음원 없이 Web Audio API 노드로 매번 짧게 합성합니다.
 */
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
 * 트랙 목록에서 곡을 고르되 가능하면 현재 재생 중인 곡과 다른 항목을 선택합니다.
 * @param {readonly string[]} tracks 선택할 수 있는 오디오 파일 경로
 * @returns {string} 무작위로 선택한 한 트랙 경로
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
  titleMusic.src = chooseMusicTrack(TITLE_MUSIC_TRACKS);
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
 * 게임 진입 시 곡을 준비하고 사용자 상호작용 뒤 자동 재생을 시도합니다.
 */
function prepareGameMusic() {
  stopGameMusic();
  gameMusic.src = chooseMusicTrack(GAME_MUSIC_TRACKS);
  gameMusic.load();
  playGameMusic();
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
