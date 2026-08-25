"use strict";

// Duplicate filtering, utterance history, bootstrap, observation, and debug state.
HorrorChatEngine = class HorrorChatEngineDiagnostics extends HorrorChatEngine {
  /**
   * 정확 일치, 템플릿, 시그니처, 바이그램 유사도를 검사해 후보를 거절할 이유를 반환합니다.
   */
  findRejection(candidate) {
    if (this.recentOutputs.includes(candidate.text)) return "exact";
    if (this.recentTemplates.slice(-8).includes(candidate.templateId)) return "template";
    if (this.recentSignatures.slice(-25).includes(candidate.signature)) return "signature";
    // 변형 이전 형태끼리 비교해야 표기만 다른 같은 문장을 잡을 수 있습니다.
    const normalized = this.normalizeForSimilarity(candidate.standardText);
    const isSimilar = this.recentSemanticMessages
      .slice(-15)
      .some(previous => this.jaccardBigrams(normalized, previous) > TUNING.similarityThreshold);
    if (isSimilar) return "similarity";
    return null;
  }

  /**
   * 공백과 문장부호를 제거하고 소문자로 바꿔 표기 차이에 흔들리지 않는 비교 문자열을 만듭니다.
   */
  normalizeForSimilarity(text) {
    return text.normalize("NFKD").replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();
  }

  /**
   * 두 문자열의 2글자 집합으로 Jaccard 유사도를 계산합니다.
   */
  jaccardBigrams(left, right) {
    const toBigrams = value => {
      const set = new Set();
      for (let index = 0; index < value.length - 1; index += 1) set.add(value.slice(index, index + 2));
      return set;
    };
    const leftSet = toBigrams(left);
    const rightSet = toBigrams(right);
    if (!leftSet.size && !rightSet.size) return 1;
    let intersection = 0;
    leftSet.forEach(value => { if (rightSet.has(value)) intersection += 1; });
    return intersection / (leftSet.size + rightSet.size - intersection || 1);
  }

  /**
   * 템플릿 ID와 정렬된 슬롯 값을 합쳐 의미가 같은 문장을 식별할 키를 만듭니다.
   */
  signature(templateId, slots) {
    return `${templateId}:${Object.entries(slots).map(([key, value]) => `${key}=${value}`).join("|")}`;
  }

  /* ---------- 기록 및 출력 ---------- */

  /**
   * 승인된 발화를 최근 기록·시청자 기록·통계에 저장하고 외부 onMessage 콜백을 호출합니다.
   */
  recordUtterance(viewer, request, utterance, options) {
    viewer.lastSpokeAt = this.simTime;
    viewer.engineSpeechCount += 1;

    if (!options.historyOnly) {
      this.lastSpeakerId = viewer.id;
      this.intentLastAt.set(request.intent, this.simTime);
      this.recentOutputs.push(utterance.text);
      this.recentTemplates.push(utterance.templateId);
      this.recentSignatures.push(utterance.signature);
      this.recentSemanticMessages.push(this.normalizeForSimilarity(utterance.standardText));
      this.recentOutputs = this.recentOutputs.slice(-40);
      this.recentTemplates = this.recentTemplates.slice(-12);
      this.recentSignatures = this.recentSignatures.slice(-25);
      this.recentSemanticMessages = this.recentSemanticMessages.slice(-15);
      this.debug.outputCount += 1;
      this.debug.totalWords += utterance.text.split(/\s+/).filter(Boolean).length;
      if (utterance.short) this.debug.shortCount += 1;
      if (utterance.anomaly) this.debug.anomalyCount += 1;
    }

    // 발화가 누적될수록 anomalyLevel이 올라가고, 다음 이상 채팅의 출현 빈도만 증가합니다.
    const anomalySpeechStep = Math.max(1, Math.round(TUNING.anomalySpeechStep / this.difficulty));
    if (viewer.anomalous && !options.historyOnly && this.state !== "BURST"
        && viewer.engineSpeechCount % anomalySpeechStep === 0) {
      viewer.anomalyLevel = Math.min(TUNING.maxAnomalyLevel, viewer.anomalyLevel + 1);
    }

    this.onMessage({
      viewer,
      text: utterance.text,
      standardText: utterance.standardText,
      intent: request.intent,
      state: this.state,
      tension: this.tension,
      anomalyEvidence: utterance.anomalyEvidence || null,
      anomalyMode: utterance.anomalyMode || null,
      anomalyLineId: utterance.anomalyLineId || null,
      historyOnly: Boolean(options.historyOnly),
      behavior: options.behavior || "smooth"
    });
  }

  /**
   * 엔진 시작 직후 채팅창이 비어 보이지 않도록 서로 다른 화자의 초기 발화를 예약합니다.
   */
  bootstrapMessages() {
    // 채팅창을 켰을 때 이미 굴러가고 있던 것처럼 보이게 하는 초기 로그
    this.viewers.forEach(viewer => {
      if (viewer.anomalous) {
        for (let index = 0; index < 3; index += 1) {
          const anomalyHistory = this.createAnomalyOverride(viewer, true);
          if (!anomalyHistory) continue;
          this.recordUtterance(
            viewer,
            { intent: "CHAT", scheduledAt: this.simTime, source: "anomaly-history" },
            anomalyHistory,
            { historyOnly: true, behavior: "auto" }
          );
        }
        return;
      }
      this.processRequest(
        { intent: "GREET", scheduledAt: this.simTime, forcedSpeakerId: viewer.id, slotHints: {}, source: "bootstrap" },
        { historyOnly: true, skipFilters: true, behavior: "auto" }
      );
    });
    this.random.shuffle(this.viewers).forEach(viewer => {
      this.processRequest(
        { intent: this.chooseIntent("AMBIENT"), scheduledAt: this.simTime, forcedSpeakerId: viewer.id, slotHints: {}, source: "bootstrap" },
        { behavior: "auto" }
      );
    });
    this.random.shuffle(this.viewers.filter(viewer => viewer.anomalous)).slice(0, 2).forEach(viewer => {
      this.processRequest(
        { intent: "CHAT", scheduledAt: this.simTime, forcedSpeakerId: viewer.id, slotHints: {}, source: "bootstrap" },
        { behavior: "auto" }
      );
    });
  }

  /**
   * 게임 UI가 특정 시청자 기록을 열 때 엔진 관찰 통계와 마지막 확인 시각을 갱신합니다.
   */
  observeViewer(viewerId) {
    const viewer = this.viewers.find(candidate => candidate.id === viewerId && candidate.active);
    if (!viewer?.anomalous || this.state === "BURST" || this.paused) return;
    if (this.simTime - viewer.lastObservedAt < 5000) return;
    viewer.lastObservedAt = this.simTime;
    viewer.anomalyLevel = Math.min(TUNING.maxAnomalyLevel, viewer.anomalyLevel + 1);
  }

  /* ---------- 디버그 ---------- */

  /**
   * 현재 디렉터·큐·사건·시청자·필터 통계를 변경 불가능한 진단용 사본으로 반환합니다.
   */
  getDebugSnapshot() {
    const outputs = this.debug.outputCount || 1;
    return {
      seed: this.seed,
      difficulty: Number(this.difficulty.toFixed(2)),
      simTime: this.simTime,
      tension: Number(this.tension.toFixed(4)),
      state: this.state,
      queueLength: this.queue.length,
      style: {
        averageWords: Number((this.debug.totalWords / outputs).toFixed(2)),
        shortRatio: Number((this.debug.shortCount / outputs).toFixed(2)),
        anomalyRatio: Number((this.debug.anomalyCount / outputs).toFixed(2)),
        fallbackRatio: Number((this.debug.fallbackCount / outputs).toFixed(2)),
        formalLeaks: this.debug.formalLeaks
      },
      nextFutureEvent: this.futureEvent
        ? {
            type: this.futureEvent.type,
            scheduledAt: this.futureEvent.scheduledAt,
            omen: this.futureEvent.omen,
            slots: { ...this.futureEvent.slots }
          }
        : null,
      viewers: this.viewers.map(viewer => ({
        id: viewer.id,
        name: viewer.name,
        persona: viewer.personaKey,
        label: PERSONAS[viewer.personaKey].label,
        active: viewer.active,
        anomalous: viewer.anomalous,
        anomalyPermission: viewer.anomalyPermission,
        anomalyLevel: viewer.anomalyLevel,
        speechCount: viewer.engineSpeechCount
      })),
      debug: JSON.parse(JSON.stringify(this.debug))
    };
  }
};
