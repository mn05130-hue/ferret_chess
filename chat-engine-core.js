"use strict";

/*
 * 채팅 엔진의 실행 골격입니다.
 * 일정한 tick마다 시뮬레이션 시간을 전진시키고, 발화 요청 큐 → 분위기 상태 →
 * 화자 선택 순서까지 담당합니다. 실제 문장 생성은 generation 확장 클래스가,
 * 기록·중복 검사·공개 진단값은 diagnostics 확장 클래스가 이어서 담당합니다.
 */
class HorrorChatEngine {
  /**
   * 외부 콜백·시청자·시드·난이도를 저장하고 큐, 디렉터, 중복 검사 통계를 초기화합니다.
   * @param {object} options 시청자 목록, 콜백, seed, 난이도, 합성 사건 설정
   */
  constructor(options) {
    // 외부 입력: 앱이 만든 시청자 배열, 출력/상태 콜백, 재현용 seed와 난이도입니다.
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

    // 디렉터 상태: 실제 시간이 아니라 tickMs 단위로 전진하는 엔진 내부 시간입니다.
    this.simTime = 0;
    this.tension = 0;
    this.state = "AMBIENT";
    this.lastEventAt = 0;
    this.burstUntil = 0;
    this.aftermathUntil = 0;
    // 예약 상태: 큐와 중복 예약 플래그를 함께 관리해 같은 종류가 두 번 쌓이지 않게 합니다.
    this.queue = [];
    this.ambientQueued = false;
    this.anomalyArrivalQueued = false;
    this.nextAnomalyArrivalAt = null;
    this.anomalyQueued = false;
    this.nextAnomalyAt = null;
    this.futureEvent = null;
    // 수명 주기 상태: interval ID, 일시정지 여부, 실행 여부입니다.
    this.timer = null;
    this.paused = false;
    this.running = false;
    // 최근 발화 기록: 연속 화자와 같은 의미의 문장이 반복되는 것을 방지합니다.
    this.lastSpeakerId = null;
    this.intentLastAt = new Map();
    this.recentOutputs = [];
    this.recentTemplates = [];
    this.recentSignatures = [];
    this.recentSemanticMessages = [];
    // 템플릿 슬롯의 현재 장면 기본값이며 emitEvent가 새 정보로 갱신합니다.
    this.scene = { topic: "어제 얘기", food: "치킨", thing: "마이크", day: "어제" };
    // 개발용 통계는 게임 규칙에 영향을 주지 않고 getDebugSnapshot에서만 공개합니다.
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
    this.enqueueAnomalyArrival();
    this.enqueueAnomaly();
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
   * @param {boolean} paused true이면 tick의 시간 전진과 발화를 멈춤
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
      if (request.source === "anomaly-arrival") {
        this.anomalyArrivalQueued = false;
        this.nextAnomalyArrivalAt = null;
        const pendingViewers = this.viewers.filter(viewer => viewer.anomalous && viewer.pendingArrival);
        const viewer = pendingViewers.length ? this.random.pick(pendingViewers) : null;
        if (!viewer) return;
        viewer.pendingArrival = false;
        viewer.active = true;
        request.forcedSpeakerId = viewer.id;
        request.forceAnomaly = true;
      }
      if (request.source === "anomaly") {
        this.anomalyQueued = false;
        this.nextAnomalyAt = null;
      }
      this.processRequest(request);
    });

    if (!this.ambientQueued) this.enqueueAmbient();
    if (!this.anomalyArrivalQueued) this.enqueueAnomalyArrival();
    if (!this.anomalyQueued) this.enqueueAnomaly();
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
   * @param {object} request intent, scheduledAt, source 등을 가진 발화 요청
   */
  enqueue(request) {
    this.queue.push({ priority: 1, threadId: null, ...request });
    this.queue.sort((left, right) => left.scheduledAt - right.scheduledAt || right.priority - left.priority);
  }

  /**
   * 현재 디렉터 상태에 적합한 일반 발화 요청을 지정 지연 뒤 큐에 넣습니다.
   * @param {number} [delay] 생략하면 현재 상태의 interval 범위에서 선택하는 지연
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
   * 아직 채팅창에 나타나지 않은 이상 시청자 한 명의 첫 발화를 설정 범위 뒤에 예약합니다.
   * @param {number} [delay] 테스트나 초기화에서 강제로 지정할 지연
   */
  enqueueAnomalyArrival(delay) {
    if (this.anomalyArrivalQueued) return;
    const hasPendingViewer = this.viewers.some(viewer => viewer.anomalous && viewer.pendingArrival);
    if (!hasPendingViewer) {
      this.nextAnomalyArrivalAt = null;
      return;
    }

    const wait = delay ?? this.random.range(...TUNING.anomalyArrivalIntervalMs);
    this.nextAnomalyArrivalAt = this.simTime + wait;
    this.enqueue({
      intent: "CHAT",
      scheduledAt: this.nextAnomalyArrivalAt,
      source: "anomaly-arrival",
      priority: 2,
      slotHints: {}
    });
    this.anomalyArrivalQueued = true;
  }

  /**
   * 활성 이상 시청자의 전용 발화를 예약합니다. 
   * 진행 난이도와 anomalyLevel이 오를수록 간격만 짧아집니다.
   * @param {number} [delay] 테스트에서 기본 간격 계산을 대체할 지연
   */
  enqueueAnomaly(delay) {
    if (this.anomalyQueued) return;
    if (this.viewers.some(viewer => viewer.anomalous && viewer.pendingArrival)) return;
    const candidates = this.viewers.filter(viewer => viewer.active && viewer.anomalous);
    if (!candidates.length) {
      this.nextAnomalyAt = null;
      return;
    }

    const viewer = this.random.pick(candidates);
    const anomalyLevel = Math.max(1, Math.min(TUNING.maxAnomalyLevel, viewer.anomalyLevel || 1));
    const levelFrequency = 1 + (anomalyLevel - 1) * TUNING.anomalyLevelFrequencyStep;
    const baseWait = delay ?? this.random.range(...TUNING.anomalyIntervalMs);
    const wait = Math.max(
      TUNING.minimumAnomalyIntervalMs,
      baseWait / (this.difficulty * levelFrequency)
    );

    this.nextAnomalyAt = this.simTime + wait;
    this.enqueue({
      intent: "CHAT",
      scheduledAt: this.nextAnomalyAt,
      forcedSpeakerId: viewer.id,
      forceAnomaly: true,
      source: "anomaly",
      priority: 2,
      slotHints: {}
    });
    this.anomalyQueued = true;
  }

  /**
   * 상태별 의도 가중치와 최근 사용 쿨다운을 결합해 다음 발화 의도를 선택합니다.
   * @param {string} state 현재 디렉터 상태
   * @returns {string} CHAT, REACT 등 다음 발화 의도
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
   * @param {string} type SYNTHETIC_EVENTS와 연결할 사건 종류
   * @param {object} slots 템플릿 자리표시자를 덮어쓸 장면 값
   * @param {number} [intensityOverride] 기본값 대신 적용할 0~1 긴장 강도
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
   * @param {string} intent 이번 발화 요청의 의도
   * @param {string} [forcedSpeakerId] 이상 예약처럼 화자를 고정할 때의 ID
   * @returns {object|null|undefined} 선택된 활성 시청자 또는 후보가 없을 때 빈 값
   */
  chooseSpeaker(intent, forcedSpeakerId) {
    if (forcedSpeakerId) return this.viewers.find(viewer => viewer.id === forcedSpeakerId && viewer.active);
    // 이상 시청자는 전용 예약에서만 등장해야 첫 발화가 확실한 이상 채팅이 됩니다.
    const active = this.viewers.filter(viewer => viewer.active && !viewer.anomalous);
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
