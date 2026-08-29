"use strict";

/*
 * 기록·검증 계층입니다.
 * generation에서 만든 후보의 중복을 검사하고 승인 발화를 화면 콜백으로 내보내며,
 * 초기 채팅 구성과 시청자 관찰, 개발용 상태 스냅샷까지 완성합니다.
 * 이 클래스가 다시 HorrorChatEngine 이름에 할당된 뒤 chat-engine.js가 공개 API로 내보냅니다.
 */
HorrorChatEngine = class HorrorChatEngineDiagnostics extends HorrorChatEngine {
  /**
   * 정확 일치, 템플릿, 시그니처, 바이그램 유사도를 검사해 후보를 거절할 이유를 반환합니다.
   * @param {object} candidate generation이 만든 발화 후보
   * @returns {string|null} exact/template/signature/similarity 또는 통과 시 null
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
   * @param {string} text 변형 전 표준 문장
   * @returns {string} Unicode 정규화 후 공백·기호를 제거한 비교값
   */
  normalizeForSimilarity(text) {
    return text.normalize("NFKD").replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();
  }

  /**
   * 두 문자열의 2글자 집합으로 Jaccard 유사도를 계산합니다.
   * @param {string} left 첫 번째 정규화 문자열
   * @param {string} right 두 번째 정규화 문자열
   * @returns {number} 0(완전히 다름)부터 1(같음) 사이의 유사도
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
   * @param {string} templateId 선택한 템플릿의 고유 ID
   * @param {object} slots 실제 치환에 사용한 슬롯 이름과 값
   * @returns {string} 최근 시그니처 기록과 비교할 문자열 키
   */
  signature(templateId, slots) {
    return `${templateId}:${Object.entries(slots).map(([key, value]) => `${key}=${value}`).join("|")}`;
  }

  /* ---------- 기록 및 출력 ---------- */

  /**
   * 승인된 발화를 최근 기록·시청자 기록·통계에 저장하고 외부 onMessage 콜백을 호출합니다.
   * @param {object} viewer 발화를 만든 시청자
   * @param {object} request 원래 발화 의도와 예약 정보
   * @param {object} utterance 필터를 통과한 최종 후보
   * @param {object} options 초기 이력 여부와 스크롤 동작
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
          const anomalyHistory = this.createAnomalyOverride(viewer);
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
    // 이상 시청자는 초기 일반 채팅에 노출하지 않고 전용 예약 발화로 처음 등장시킵니다.
    this.random.shuffle(this.viewers.filter(viewer => !viewer.anomalous)).forEach(viewer => {
      this.processRequest(
        { intent: this.chooseIntent("AMBIENT"), scheduledAt: this.simTime, forcedSpeakerId: viewer.id, slotHints: {}, source: "bootstrap" },
        { behavior: "auto" }
      );
    });
  }

  /**
   * 게임 UI가 특정 시청자 기록을 열 때 엔진 관찰 통계와 마지막 확인 시각을 갱신합니다.
   * @param {string} viewerId 기록 모달에서 확인한 시청자 ID
   */
  observeViewer(viewerId) {
    const viewer = this.viewers.find(candidate => candidate.id === viewerId && candidate.active);
    if (!viewer?.anomalous || this.state === "BURST" || this.paused) return;
    if (this.simTime - viewer.lastObservedAt < 5000) return;
    viewer.lastObservedAt = this.simTime;
    viewer.observationCount = (viewer.observationCount || 0) + 1;
  }

  /* ---------- 디버그 ---------- */

  /**
   * 현재 디렉터·큐·사건·시청자·필터 통계를 변경 불가능한 진단용 사본으로 반환합니다.
   * @returns {object} 개발자 도구에서 검사할 수 있는 현재 엔진 상태
   */
  getDebugSnapshot() {
    const outputs = this.debug.outputCount || 1;
    return {
      seed: this.seed,
      difficulty: Number(this.difficulty.toFixed(2)),
      anomalyLevel: this.anomalyLevel,
      anomalyPermissions: [...this.anomalyPermissions],
      simTime: this.simTime,
      tension: Number(this.tension.toFixed(4)),
      state: this.state,
      queueLength: this.queue.length,
      anomalySchedule: {
        arrivalIntervalMs: [...TUNING.anomalyArrivalIntervalMs],
        nextArrivalAt: this.nextAnomalyArrivalAt,
        baseIntervalMs: [...TUNING.anomalyIntervalMs],
        glitchChance: TUNING.glitchChance,
        nextAt: this.nextAnomalyAt
      },
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
        pendingArrival: Boolean(viewer.pendingArrival),
        anomalyPermission: viewer.anomalyPermission,
        anomalyLevel: viewer.anomalyLevel,
        speechCount: viewer.engineSpeechCount
      })),
      debug: JSON.parse(JSON.stringify(this.debug))
    };
  }
};
