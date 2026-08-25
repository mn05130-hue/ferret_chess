"use strict";

// Scheduling, director state, speaker selection, and event intake.
class HorrorChatEngine {
  /**
   * 외부 콜백·시청자·시드·난이도를 저장하고 큐, 디렉터, 중복 검사 통계를 초기화합니다.
   */
  constructor(options) {
    this.viewers = options.viewers;
    this.onMessage = options.onMessage;
    this.onStateChange = options.onStateChange || (() => {});
    this.seed = Number(options.seed) >>> 0;
    this.random = new SeededRandom(this.seed);
    this.difficulty = Math.min(3, Math.max(1, Number(options.difficulty) || 1));
    this.syntheticEvents = options.syntheticEvents !== false;
    this.externalContext = options.externalContext || {
      startedAt: Date.now(),
      initiallyFocused: typeof document === "undefined" ? true : document.hasFocus()
    };

    this.simTime = 0;
    this.tension = 0;
    this.state = "AMBIENT";
    this.lastEventAt = 0;
    this.burstUntil = 0;
    this.aftermathUntil = 0;
    this.queue = [];
    this.ambientQueued = false;
    this.futureEvent = null;
    this.timer = null;
    this.paused = false;
    this.running = false;
    this.lastSpeakerId = null;
    this.intentLastAt = new Map();
    this.recentOutputs = [];
    this.recentTemplates = [];
    this.recentSignatures = [];
    this.recentSemanticMessages = [];
    this.scene = { topic: "어제 얘기", food: "치킨", thing: "마이크", day: "어제" };
    this.debug = {
      speakerSelections: [],
      filterRejects: { exact: 0, template: 0, signature: 0, similarity: 0 },
      fallbackCount: 0,
      outputCount: 0,
      shortCount: 0,
      anomalyCount: 0,
      totalWords: 0,
      formalLeaks: 0,
      stateTransitions: [{ at: 0, state: "AMBIENT" }]
    };

    this.assignViewerModels();
  }

  /**
   * 시청자마다 일반 페르소나와 이상 권한을 배정하고 발화 추적 필드를 준비합니다.
   */
  assignViewerModels() {
    const personaKeys = this.random.shuffle(Object.keys(PERSONAS));
    const permissions = this.random.shuffle([...ANOMALY_PERMISSIONS]);
    let anomalyIndex = 0;
    this.viewers.forEach((viewer, index) => {
      viewer.personaKey = personaKeys[index % personaKeys.length];
      viewer.memorySlots = {};
      viewer.lastSpokeAt = -60000 - index * 1000;
      viewer.lastObservedAt = -60000;
      viewer.engineSpeechCount = 0;
      viewer.anomalyLevel = viewer.anomalous ? 1 : 0;
      viewer.anomalyPermission = viewer.anomalous
        ? permissions[anomalyIndex++ % permissions.length]
        : null;
    });
  }

  /* ---------- 수명 주기 ---------- */

  /**
   * 초기 채팅을 큐에 넣고 가상 방송 사건과 주기 tick을 시작합니다.
   */
  start() {
    if (this.running) return;
    this.running = true;
    this.planFutureEvent();
    this.bootstrapMessages();
    this.enqueueAmbient(900);
    this.timer = window.setInterval(() => this.tick(), TUNING.tickMs);
  }

  /**
   * 엔진 실행 플래그를 내리고 예약된 interval을 해제합니다.
   */
  stop() {
    this.running = false;
    window.clearInterval(this.timer);
    this.timer = null;
    this.queue.length = 0;
  }

  /**
   * 탭 비활성화나 모달 표시 중 발화 생성을 일시정지하거나 다시 시작합니다.
   */
  setPaused(paused) {
    this.paused = Boolean(paused);
  }

  /**
   * 시뮬레이션 시간을 전진시키며 사건 실행, 상태 갱신, 만료 요청 처리, 다음 발화를 수행합니다.
   */
  tick() {
    if (!this.running || this.paused) return;
    this.simTime += TUNING.tickMs;
    const decayRate = Math.log(2) / TUNING.tensionHalfLifeMs;
    this.tension *= Math.exp(-decayRate * TUNING.tickMs);

    if (this.futureEvent && this.futureEvent.scheduledAt <= this.simTime) {
      const event = this.futureEvent;
      this.futureEvent = null;
      this.emitEvent(event.type, event.slots, event.intensity);
      this.planFutureEvent();
    }

    this.updateDirectorState();

    const due = [];
    while (this.queue.length && this.queue[0].scheduledAt <= this.simTime) due.push(this.queue.shift());
    due.sort((left, right) => right.priority - left.priority || left.scheduledAt - right.scheduledAt);
    due.forEach(request => {
      if (request.source === "ambient") this.ambientQueued = false;
      this.processRequest(request);
    });

    if (!this.ambientQueued) this.enqueueAmbient();
  }

  /**
   * 긴장도와 burst/aftermath/lull 시간을 바탕으로 현재 채팅 분위기 상태를 결정합니다.
   */
  updateDirectorState() {
    let nextState = "AMBIENT";
    if (this.simTime < this.burstUntil) nextState = "BURST";
    else if (this.simTime < this.aftermathUntil) nextState = "AFTERMATH";
    else if (this.simTime - this.lastEventAt > TUNING.lullAfterMs) nextState = "LULL";
    else if (this.tension > TUNING.tenseThreshold) nextState = "TENSE";

    if (nextState !== this.state) {
      this.state = nextState;
      this.debug.stateTransitions.push({ at: this.simTime, state: nextState });
      this.debug.stateTransitions = this.debug.stateTransitions.slice(-30);
      this.onStateChange({ state: nextState, tension: this.tension });
    }
  }

  /* ---------- 큐 ---------- */

  /**
   * 새 발화 요청을 시간순 큐에 추가하고 디버그용 최대 큐 크기를 기록합니다.
   */
  enqueue(request) {
    this.queue.push({ priority: 1, threadId: null, ...request });
    this.queue.sort((left, right) => left.scheduledAt - right.scheduledAt || right.priority - left.priority);
  }

  /**
   * 현재 디렉터 상태에 적합한 일반 발화 요청을 지정 지연 뒤 큐에 넣습니다.
   */
  enqueueAmbient(delay) {
    if (this.ambientQueued) return;
    const interval = TUNING.intervals[this.state];
    const wait = (delay ?? this.random.range(interval[0], interval[1])) / this.difficulty;
    this.enqueue({
      intent: this.chooseIntent(this.state),
      scheduledAt: this.simTime + wait,
      source: "ambient",
      priority: 1,
      slotHints: {}
    });
    this.ambientQueued = true;
  }

  /**
   * 상태별 의도 가중치와 최근 사용 쿨다운을 결합해 다음 발화 의도를 선택합니다.
   */
  chooseIntent(state) {
    const weights = TUNING.stateIntents[state];
    const entries = Object.entries(weights).map(([intent, weight]) => {
      const elapsed = this.simTime - (this.intentLastAt.get(intent) ?? -60000);
      const cooldownFactor = Math.min(1, Math.max(.18, elapsed / TUNING.intentCooldownMs));
      return { value: intent, weight: weight * cooldownFactor };
    });
    return this.random.weighted(entries);
  }

  /**
   * 외부 또는 합성 방송 사건을 장면 상태에 반영하고 여러 반응 채팅을 예약합니다.
   */
  emitEvent(type, slots = {}, intensityOverride) {
    const preset = SYNTHETIC_EVENTS.find(event => event.type === type);
    const intensity = Math.min(1, Math.max(0, intensityOverride ?? preset?.intensity ?? .5));
    const mergedSlots = { ...(preset?.slots || {}), ...slots };
    this.scene = { ...this.scene, ...mergedSlots };
    this.lastEventAt = this.simTime;
    this.tension = Math.min(1, this.tension + intensity);

    if (intensity >= .7) {
      this.burstUntil = Math.max(this.burstUntil, this.simTime + TUNING.burstDurationMs);
      this.aftermathUntil = this.burstUntil + TUNING.aftermathDurationMs;
    }

    const count = 2 + Math.ceil(intensity * 3);
    for (let index = 0; index < count; index += 1) {
      const intent = intensity >= .7
        ? this.random.weighted([
            { value: "LAUGH", weight: 5 },
            { value: "REACT", weight: 3 },
            { value: "TEASE", weight: 2 }
          ])
        : this.random.weighted([
            { value: "REACT", weight: 4 },
            { value: "AGREE", weight: 3 },
            { value: "QUESTION", weight: 2 }
          ]);
      this.enqueue({
        intent,
        eventRef: { type, happenedAt: this.simTime },
        slotHints: mergedSlots,
        scheduledAt: this.simTime + this.random.range(80, 1150) / Math.sqrt(this.difficulty),
        source: "event",
        priority: intensity >= .7 ? 3 : 2
      });
    }
    this.updateDirectorState();
  }

  /**
   * 합성 사건 모드에서 다음 방송 사건과 발생 시각을 미리 선택합니다.
   */
  planFutureEvent() {
    if (!this.syntheticEvents || this.futureEvent) return;
    const event = this.random.pick(SYNTHETIC_EVENTS);
    this.futureEvent = {
      ...event,
      slots: { ...event.slots },
      scheduledAt: this.simTime + this.random.range(8500, 15000) / this.difficulty
    };
  }

  /* ---------- 화자 선택 ---------- */

  /**
   * 활성 시청자의 페르소나 적합도·침묵 시간·쿨다운·긴장 반응을 계산해 화자를 고릅니다.
   */
  chooseSpeaker(intent, forcedSpeakerId) {
    if (forcedSpeakerId) return this.viewers.find(viewer => viewer.id === forcedSpeakerId && viewer.active);
    const active = this.viewers.filter(viewer => viewer.active);
    if (!active.length) return null;
    const alternatives = active.filter(viewer => viewer.id !== this.lastSpeakerId);
    const candidates = alternatives.length ? alternatives : active;

    const scored = candidates.map(viewer => {
      const persona = PERSONAS[viewer.personaKey];
      const elapsed = Math.max(0, this.simTime - viewer.lastSpokeAt);
      const fit = persona.fit[intent] ?? 1;
      const cooldown = Math.min(1, elapsed / persona.cooldownMs);
      const silence = Math.min(2.25, 1 + elapsed / 60000);
      const tension = 1 + this.tension * (persona.tensionResponse - 1);
      const weight = persona.desire * fit * Math.max(.04, cooldown) * silence * tension;
      return { viewer, weight, factors: { desire: persona.desire, fit, cooldown, silence, tension } };
    });

    const selected = this.random.weighted(scored.map(entry => ({ value: entry.viewer, weight: entry.weight })));
    this.debug.speakerSelections.push({
      at: this.simTime,
      intent,
      selected: selected?.id,
      candidates: scored.map(entry => ({
        id: entry.viewer.id,
        weight: Number(entry.weight.toFixed(3)),
        ...entry.factors
      }))
    });
    this.debug.speakerSelections = this.debug.speakerSelections.slice(-20);
    return selected;
  }

}
