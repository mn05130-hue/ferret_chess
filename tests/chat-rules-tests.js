"use strict";

const cases = [];

function test(name, run) {
  cases.push({ name, run });
}

function assertEqual(actual, expected, message = "") {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    throw new Error(`${message ? `${message} · ` : ""}예상 ${expectedText}, 실제 ${actualText}`);
  }
}

test("무한 모드는 모든 스테이지에 이상 시청자 1명만 둔다", () => {
  [1, 2, 10, 999].forEach(stage => assertEqual(FERRET_CHAT_RULES.getAnomalyCount("endless", stage), 1));
});

test("스토리 일차별 이상 시청자 수는 2,2,3,3,4,4,5다", () => {
  assertEqual(
    Array.from({ length: 7 }, (_, index) => FERRET_CHAT_RULES.getAnomalyCount("story", index + 1)),
    [2, 2, 3, 3, 4, 4, 5]
  );
});

test("스토리 이상도는 1,1,2,2,3,4,5로 상승한다", () => {
  assertEqual(
    Array.from({ length: 7 }, (_, index) => FERRET_CHAT_RULES.getAnomalyLevel("story", index + 1)),
    [1, 1, 2, 2, 3, 4, 5]
  );
});

test("일차별 유형은 노골적 단서에서 모방·시스템 침입으로 전환된다", () => {
  assertEqual(FERRET_CHAT_RULES.getAnomalyPermissions("story", 1), ["PROPHECY", "OBSERVER"]);
  assertEqual(FERRET_CHAT_RULES.getAnomalyPermissions("story", 3), ["OBSERVER", "MEMORY"]);
  assertEqual(FERRET_CHAT_RULES.getAnomalyPermissions("story", 5), ["MIMIC"]);
  assertEqual(FERRET_CHAT_RULES.getAnomalyPermissions("story", 6), ["INTRUDER"]);
  assertEqual(FERRET_CHAT_RULES.getAnomalyPermissions("story", 7), ["PROPHECY", "OBSERVER", "MEMORY", "MIMIC", "INTRUDER"]);
});

test("모든 일차의 허용 유형에는 해당 이상도에서 선택 가능한 대사가 있다", () => {
  for (let day = 1; day <= 7; day += 1) {
    const level = FERRET_CHAT_RULES.getAnomalyLevel("story", day);
    FERRET_CHAT_RULES.getAnomalyPermissions("story", day).forEach(permission => {
      const available = ANOMALY_LINES[permission].filter(entry => entry.level <= level);
      if (!available.length) throw new Error(`${day}일차 ${permission} 유형에 level ${level} 이하 대사가 없습니다.`);
    });
  }
});

test("정상·이상 강퇴의 점수와 체력 변화가 규칙과 일치한다", () => {
  assertEqual(FERRET_CHAT_RULES.getViewerKickOutcome(true), { scoreDelta: 150, healthDelta: 0 });
  assertEqual(FERRET_CHAT_RULES.getViewerKickOutcome(false), { scoreDelta: -75, healthDelta: -1 });
});

test("이상 시청자 미처리와 정상 연결 재시도는 체력을 1 잃는다", () => {
  assertEqual(FERRET_CHAT_RULES.getMissedAnomalyOutcome(), { scoreDelta: -100, healthDelta: -1 });
  assertEqual(FERRET_CHAT_RULES.getFalseReconnectOutcome(), { scoreDelta: 0, healthDelta: -1 });
});

test("스토리 하루 판정은 포획·미처리·오판을 한 번만 합산한다", () => {
  assertEqual(
    FERRET_CHAT_RULES.calculateStoryDayOutcome({ caught: 2, missed: 1, wrong: 1, health: 3, score: 100 }),
    { damage: 2, appliedDamage: 2, health: 1, score: 225 }
  );
});

test("연결 끊김 캐릭터 상태는 disconnected에서만 활성화된다", () => {
  assertEqual(["good", "normal", "weak", "disconnected"].map(FERRET_CHAT_RULES.isDisconnectedConnectionStage), [false, false, false, true]);
});

test("오늘의 도전 시드는 같은 날짜에 고정되고 날짜가 바뀌면 달라진다", () => {
  const first = FERRET_CHAT_RULES.getDailyChallengeSeed("2026-08-29");
  assertEqual(first, FERRET_CHAT_RULES.getDailyChallengeSeed("2026-08-29"));
  if (first === FERRET_CHAT_RULES.getDailyChallengeSeed("2026-08-30")) throw new Error("서로 다른 날짜의 시드가 같습니다.");
});

const results = document.querySelector("#results");
let failures = 0;
cases.forEach(({ name, run }) => {
  const item = document.createElement("li");
  try {
    run();
    item.className = "pass";
    item.textContent = `PASS · ${name}`;
  } catch (error) {
    failures += 1;
    item.className = "fail";
    item.textContent = `FAIL · ${name} · ${error.message}`;
  }
  results.append(item);
});

const summary = document.querySelector("#summary");
summary.className = failures ? "failed" : "passed";
summary.textContent = failures
  ? `${cases.length}개 중 ${failures}개 실패`
  : `${cases.length}개 규칙 테스트 통과`;
document.title = failures ? `FAIL (${failures}) · Ferret Chat 규칙 테스트` : "PASS · Ferret Chat 규칙 테스트";
