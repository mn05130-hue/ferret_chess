"use strict";

// Title/game music and story scare audio.
function setTitleMusicUi(playing) {
  titleMusicButton.classList.toggle("is-playing", playing);
  titleMusicButton.setAttribute("aria-pressed", String(playing));
  titleMusicButton.setAttribute("aria-label", playing ? "타이틀 배경음악 정지" : "타이틀 배경음악 재생");
  titleMusicLabel.textContent = playing ? "BGM 끄기" : "BGM 켜기";
}

function setGameMusicUi(playing) {
  gameMusicButton.classList.toggle("is-playing", playing);
  gameMusicButton.setAttribute("aria-pressed", String(playing));
  gameMusicButton.setAttribute("aria-label", playing ? "게임 배경음악 정지" : "게임 배경음악 재생");
}

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

function initializeAudioVolumes() {
  applyVolume(titleMusic, titleVolume, titleVolumeValue, AUDIO_SETTINGS.title, readStoredVolume(AUDIO_SETTINGS.title), false);
  applyVolume(gameMusic, gameVolume, gameVolumeValue, AUDIO_SETTINGS.game, readStoredVolume(AUDIO_SETTINGS.game), false);
}

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

function stopTitleMusic(reset = true) {
  titleMusic.pause();
  if (reset) titleMusic.currentTime = 0;
  setTitleMusicUi(false);
}

function prepareTitleMusic() {
  stopTitleMusic();
  titleMusic.src = chooseMusicTrack(TITLE_MUSIC_TRACKS);
  titleMusic.load();
  playTitleMusic();
}

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

function stopGameMusic(reset = true) {
  gameMusic.pause();
  if (reset) gameMusic.currentTime = 0;
  setGameMusicUi(false);
}

function prepareGameMusic() {
  stopGameMusic();
  gameMusic.src = chooseMusicTrack(GAME_MUSIC_TRACKS);
  gameMusic.load();
  playGameMusic();
}

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

function playStaticScare() {
  if (!scareAudioContext) return;
  if (scareAudioContext.state === "suspended") {
    scareAudioContext.resume().then(emitStaticNoise).catch(() => {});
    return;
  }
  emitStaticNoise();
}
