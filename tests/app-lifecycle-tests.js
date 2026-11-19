"use strict";

const summary = document.querySelector("#summary");
const results = document.querySelector("#results");
const frame = document.querySelector("#app-frame");
let failures = 0;

function assert(name, condition, detail = "") {
  const item = document.createElement("li");
  item.className = condition ? "pass" : "fail";
  item.textContent = `${condition ? "PASS" : "FAIL"} · ${name}${detail ? ` · ${detail}` : ""}`;
  results.append(item);
  if (!condition) failures += 1;
}

frame.addEventListener("load", async () => {
  try {
    const appWindow = frame.contentWindow;
    const appDocument = frame.contentDocument;
    appDocument.querySelector("#player-nickname").value = "규칙테스트";
    appDocument.querySelector("#entry-form").requestSubmit();
    appDocument.querySelector("#game-start").click();

    const api = appWindow.horrorChatGame;
    assert("무한 모드 HUD와 종료 조건이 이상 글 1건으로 시작한다", api.state().remainingAnomalies === 1);
    assert("무한 모드 라운드는 60초로 시작한다",
      api.state().roundRemainingMs === 60000 && appDocument.querySelector("#round-seconds").textContent === "01:00");
    assert("첫 시작에는 실행 중인 채팅 엔진이 정확히 하나다", api.lifecycle().activeEngineCount === 1);

    const firstTitle = appDocument.querySelector(".post-title");
    const firstRow = firstTitle.closest("[data-post-id]");
    const originalTitle = firstTitle.textContent;
    firstTitle.click();
    appDocument.querySelector("#suspect-button").click();
    assert("의심 표시는 선택한 글과 버튼 상태에 함께 반영된다",
      firstRow.classList.contains("suspected-message")
        && appDocument.querySelector("#suspect-button").getAttribute("aria-pressed") === "true");
    const originalBody = appDocument.querySelector("#post-body").textContent;
    const history = [...appDocument.querySelectorAll("#viewer-history li")];
    assert("현재 글의 본문은 작성자 이력에 중복 표시하지 않는다", history.every(item => item.textContent !== originalBody));
    appDocument.querySelector("#panel-close").click();
    assert("상세 화면을 닫으면 글 제목으로 초점이 돌아간다", appDocument.activeElement === firstTitle);

    api.spawnApparition();
    firstTitle.click();
    api.missApparition();
    assert("동기화가 끊기면 목록과 열린 글 본문이 깨진다",
      firstTitle.textContent !== originalTitle && appDocument.querySelector("#post-body").textContent !== originalBody);
    appDocument.querySelector("#reconnect-button").click();
    assert("복구하면 목록과 열린 글 본문이 원문으로 돌아온다",
      firstTitle.textContent === originalTitle && appDocument.querySelector("#post-body").textContent === originalBody);

    const secondRow = appDocument.querySelectorAll(".board-post")[1];
    const beforeDelete = api.state();
    appDocument.querySelector("#kick-button").click();
    assert("정상 글을 삭제하면 선택한 글만 사라지고 체력이 1 감소한다",
      !firstRow.isConnected && secondRow.isConnected && api.state().health === beforeDelete.health - 1);

    appDocument.querySelector("#help-button").click();
    assert("게임 방법을 열면 채팅 엔진이 일시정지된다",
      appDocument.querySelector("#tutorial-backdrop").classList.contains("open") && api.lifecycle().enginePaused === true);
    appDocument.querySelector("#tutorial-skip").click();
    assert("게임 방법을 닫으면 채팅 엔진이 다시 진행된다", api.lifecycle().enginePaused === false);

    api.restart();
    api.restart();
    api.restart();
    const lifecycle = api.lifecycle();
    assert("재시작하면 이전 동기화 타이머가 정리된다", lifecycle.apparitionTimerActive === false);
    assert("연속 재시작 뒤에도 활성 채팅 엔진은 하나뿐이다", lifecycle.activeEngineCount === 1, JSON.stringify(lifecycle));
    assert("무한 모드에서 스토리 시계 interval은 남지 않는다", lifecycle.storyClockActive === false);

    const beforeRecovery = api.state();
    api.spawnApparition();
    appDocument.querySelector("#reconnect-button").click();
    const afterRecovery = api.state();
    assert("실제 연결 복구는 체력을 잃지 않고 100점을 준다",
      afterRecovery.health === beforeRecovery.health && afterRecovery.score === beforeRecovery.score + 100);

    appDocument.querySelector("#reconnect-button").click();
    const afterFalseReconnect = api.state();
    assert("정상 연결에서 재연결하면 체력이 1 감소한다", afterFalseReconnect.health === afterRecovery.health - 1);

    api.spawnApparition();
    api.missApparition();
    const disconnectedHealth = api.state().health;
    assert("복구 시간을 놓치면 연결 상태가 끊김으로 전환된다", api.apparition().stage === "disconnected");
    appDocument.querySelector("#reconnect-button").click();
    assert("끊긴 연결은 추가 체력 피해 없이 좋음 상태로 복구된다",
      api.apparition().stage === "good" && api.state().health === disconnectedHealth);

    const advanceRound = elapsed => appWindow.eval(`roundLastTick = performance.now() - ${elapsed}; updateRoundClock();`);
    const publishAnomaly = () => appWindow.eval(`(() => {
      for (let ticks = 0; ticks < 240 && publishedAnomalyAuthors.size === 0; ticks += 1) chatEngine.tick();
      return [...boardPosts.values()].find(post => post.anomalous)?.id;
    })()`);
    api.restart();
    const firstRound = api.debug();
    const anomalyId = publishAnomaly();
    appDocument.querySelector(`[data-post-id="${anomalyId}"] .post-title`).click();
    appDocument.querySelector("#kick-button").click();
    const stageOverlay = appDocument.querySelector("#stage-overlay");
    assert("이상 글을 일찍 삭제해도 라운드는 계속된다",
      api.state().score === 150 && api.state().remainingAnomalies === 0
        && api.lifecycle().roundClockActive && !stageOverlay.classList.contains("open"));

    advanceRound(api.state().roundRemainingMs - 500);
    assert("60초 전에는 판정을 시작하지 않는다",
      !stageOverlay.classList.contains("open") && appDocument.querySelector("#round-seconds").textContent === "00:01");
    advanceRound(1000);
    assert("60초가 지나면 이상 글 처리 결과가 확정된다",
      !api.lifecycle().roundClockActive && stageOverlay.classList.contains("open")
        && appDocument.querySelector("#stage-result-kicker").textContent === "STAGE 01 CLEAR");

    await new Promise(resolve => window.setTimeout(resolve, 1100));
    appDocument.querySelector("#stage-continue").click();
    const secondRound = api.debug();
    assert("두 번째 라운드는 60초를 다시 시작하고 글 생성 및 이상 글 등장 간격을 단축한다",
      api.state().currentStage === 2 && api.state().roundRemainingMs === 60000
        && secondRound.difficulty > firstRound.difficulty
        && secondRound.anomalySchedule.arrivalIntervalMs[1] < firstRound.anomalySchedule.arrivalIntervalMs[1]);
    publishAnomaly();
    const beforeMiss = api.state();
    advanceRound(60000);
    advanceRound(1000);
    assert("종료 시까지 올라온 이상 글을 미처리하면 체력과 점수가 한 번 감소한다",
      api.state().health === beforeMiss.health - 1 && api.state().score === beforeMiss.score - 100
        && appDocument.querySelector("#stage-result-kicker").textContent === "STAGE 02 FAILED");

    appDocument.querySelector("#game-restart").click();
    appDocument.querySelector("#daily-start").click();
    assert("오늘의 고정 시드도 60초 라운드를 시작한다",
      api.state().dailyChallenge && api.state().roundRemainingMs === 60000);

    appDocument.querySelector("#game-restart").click();
    appDocument.querySelector("#story-start").click();
    const storyState = api.state();
    const storyLifecycle = api.lifecycle();
    assert("스토리 첫날은 이상 글 2건으로 시작한다",
      storyState.mode === "story" && storyState.remainingAnomalies === 2);
    assert("모드 전환 뒤에도 엔진 하나와 스토리 시계 하나만 실행된다",
      storyLifecycle.activeEngineCount === 1 && storyLifecycle.storyClockActive === true,
      JSON.stringify(storyLifecycle));
    assert("스토리 첫날도 오후 7시부터 60초로 시작한다",
      storyState.roundRemainingMs === 60000 && appDocument.querySelector("#story-clock").textContent === "오후 7:00");
    advanceRound(60000);
    assert("스토리 라운드는 60초 후 오전 2시 결과를 연다",
      !api.lifecycle().roundClockActive && appDocument.querySelector("#story-clock").textContent === "오전 2:00"
        && appDocument.querySelector("#story-night-overlay").classList.contains("open"));
  } catch (error) {
    assert("테스트 페이지 실행", false, error.message);
  }

  summary.className = failures ? "failed" : "passed";
  summary.textContent = failures ? `${failures}개 수명 주기 테스트 실패` : "앱 수명 주기 테스트 통과";
  document.title = failures ? `FAIL (${failures}) · 앱 수명 주기 테스트` : "PASS · 앱 수명 주기 테스트";
});
