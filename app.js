(() => {
  "use strict";

  const initialMessages = [
    { badge: "🤖", badgeClass: "robot", name: "오수재김포", color: "#63bf92", text: "와 이거" },
    { badge: "🪙", badgeClass: "coin", name: "마춤법천지", color: "#52a4f4", text: "아흐" },
    { badge: "🪙", badgeClass: "coin", name: "마코냥", color: "#56b6de", text: "게크네" },
    { badge: "🪙", badgeClass: "coin", name: "마춤법천지", color: "#52a4f4", text: "저게 야스지" },
    { badge: "", badgeClass: "empty", name: "사다시푸딩", color: "#55a7d9", text: "아흐" },
    { badge: "🪙", badgeClass: "coin", name: "너나봐", color: "#ef4f86", text: "저건 50만원짜리다" },
    { badge: "🤖", badgeClass: "robot", name: "버츄얼트래블러", color: "#d56ab5", text: "캬" },
    { badge: "🤖", badgeClass: "robot", name: "버츄얼트래블러", color: "#d56ab5", text: "와 내장 개맛있겠다" },
    { badge: "💜", badgeClass: "heart", name: "여름의 3악장", color: "#47c9e8", text: "게글류 진짜" },
    { badge: "👑", badgeClass: "crown", name: "전공정머신", color: "#d983c7", text: "바로 버터발라서 구워버리고싶네" },
    { badge: "🍛", badgeClass: "dish", name: "오이향", color: "#55c3d5", text: "심해바닥에 붙어다니는거임?" },
    { badge: "🪙", badgeClass: "coin", name: "마코냥", color: "#56b6de", text: "거미게도 엄청 크던데" },
    { badge: "🎉", badgeClass: "party", name: "산책나간 히네리아", color: "#3f9bdc", text: "ㅋㅋㅋㅋㅋㅋㅋㅋ" },
    { badge: "🪙", badgeClass: "coin", name: "문팟팟", color: "#69d09c", text: "집게사냥 네이놈ㅋㅋㅋ" },
    { badge: "💗", badgeClass: "heart", name: "퇴근중인 모니터 7356190", color: "#f24e74", text: "게마니ㅋㅋㅋ" },
    { badge: "🪙", badgeClass: "coin", name: "GroupSound", color: "#a374e8", text: "내 고사리 스팟이라!!" },
    { badge: "🪙", badgeClass: "coin", name: "마코냥", color: "#56b6de", text: "ㅋㅋㅋㅋㅋㅋㅋㅋ" }
  ];

  const audience = [
    { badge: "🪙", badgeClass: "coin", name: "마춤법천지", color: "#52a4f4", lines: ["아흐", "와 진짜 크다", "저게 움직이네", "ㅋㅋㅋㅋㅋㅋ"] },
    { badge: "🪙", badgeClass: "coin", name: "마코냥", color: "#56b6de", lines: ["게크네", "거미게도 엄청 크던데", "오 맛있겠다", "ㅋㅋㅋㅋㅋ"] },
    { badge: "🤖", badgeClass: "robot", name: "버츄얼트래블러", color: "#d56ab5", lines: ["캬", "와 내장 개맛있겠다", "버터 준비해", "비주얼 미쳤다"] },
    { badge: "💜", badgeClass: "heart", name: "여름의 3악장", color: "#47c9e8", lines: ["게글류 진짜", "저게 바다에 산다고?", "신기하다", "헉"] },
    { badge: "👑", badgeClass: "crown", name: "전공정머신", color: "#d983c7", lines: ["바로 구워버리고싶네", "버터 발라주세요", "오늘 방송 재밌다", "크기가 장난 아닌데"] },
    { badge: "🍛", badgeClass: "dish", name: "오이향", color: "#55c3d5", lines: ["심해바닥에 붙어다니는거임?", "저건 처음 본다", "다리가 엄청 기네", "오오오"] },
    { badge: "🎉", badgeClass: "party", name: "산책나간 히네리아", color: "#3f9bdc", lines: ["ㅋㅋㅋㅋㅋㅋㅋㅋ", "표정 봐ㅋㅋㅋ", "너무 웃겨", "이게 뭐야ㅋㅋ"] },
    { badge: "🪙", badgeClass: "coin", name: "문팟팟", color: "#69d09c", lines: ["집게사냥 네이놈ㅋㅋㅋ", "오늘도 잘 보고 있어요", "맛은 궁금하네", "와아"] },
    { badge: "💗", badgeClass: "heart", name: "퇴근중인 모니터 7356190", color: "#f24e74", lines: ["게마니ㅋㅋㅋ", "퇴근길에 빵터졌네", "이건 못 참지", "ㅋㅋㅋㅋ"] },
    { badge: "🪙", badgeClass: "coin", name: "GroupSound", color: "#a374e8", lines: ["내 고사리 스팟이라!!", "채팅 왜 이렇게 웃겨", "오 이건 귀하다", "집게 진짜 세 보인다"] },
    { badge: "🪙", badgeClass: "coin", name: "너나봐", color: "#ef4f86", lines: ["저건 50만원짜리다", "오늘 콘텐츠 좋다", "와 대박", "진짜 신기하네"] },
    { badge: "", badgeClass: "empty", name: "사다시푸딩", color: "#55a7d9", lines: ["아흐", "저게 가능해?", "처음 봤어", "방송 켜길 잘했다"] }
  ];

  const NICKNAME_ADJECTIVES = [
    "금손", "즐거운", "빛나는", "신나는", "용감한", "엉뚱한",
    "행복한", "졸린", "재빠른", "유쾌한", "반짝이는", "집중한"
  ];
  const NICKNAME_NOUNS = [
    "뉴비", "유저", "스트리머", "게이머", "시청자", "랭커",
    "챌린저", "방송인", "플레이어", "구독자", "매니저", "클립러"
  ];
  const usedNicknames = new Set();
  const nicknameByIdentity = new Map();

  function createNickname(identity) {
    if (nicknameByIdentity.has(identity)) return nicknameByIdentity.get(identity);

    let nickname;
    do {
      const adjective = NICKNAME_ADJECTIVES[Math.floor(Math.random() * NICKNAME_ADJECTIVES.length)];
      const noun = NICKNAME_NOUNS[Math.floor(Math.random() * NICKNAME_NOUNS.length)];
      const number = Math.floor(1000 + Math.random() * 9000);
      nickname = `${adjective} ${noun} ${number}`;
    } while (usedNicknames.has(nickname));

    usedNicknames.add(nickname);
    nicknameByIdentity.set(identity, nickname);
    return nickname;
  }

  initialMessages.forEach(message => { message.name = createNickname(message.name); });
  audience.forEach(viewer => { viewer.name = createNickname(viewer.name); });
  const myNickname = createNickname("current-user");

  const MAX_MESSAGES = 100;
  const AUTO_CHAT_MIN_DELAY = 1200;
  const AUTO_CHAT_MAX_DELAY = 3200;

  const messageList = document.querySelector("#message-list");
  const messageForm = document.querySelector("#message-form");
  const messageInput = document.querySelector("#message-input");
  const emojiButton = document.querySelector("#emoji-button");
  const emojiPanel = document.querySelector("#emoji-panel");
  const rewardButton = document.querySelector("#reward-button");
  const rewardLabel = document.querySelector("#reward-label");
  const newMessageButton = document.querySelector("#new-message-button");
  const browserBar = document.querySelector(".browser-bar");
  const collapseButton = document.querySelector(".collapse-button");
  const toast = document.querySelector("#toast");

  let toastTimer;
  let autoChatTimer;
  let previousAudienceIndex = -1;
  let previousLine = "";

  function createMessage(message, ownMessage = false) {
    const item = document.createElement("li");
    item.className = "message";

    const badge = document.createElement("span");
    badge.className = `badge ${message.badgeClass || ""}`;
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = message.badge || "";

    const copy = document.createElement("span");
    copy.className = "message-copy";

    const username = document.createElement("span");
    username.className = "username";
    username.style.color = message.color;
    username.textContent = message.name;

    const text = document.createElement("span");
    text.className = "message-text";
    text.textContent = message.text;

    copy.append(username, text);
    item.append(badge, copy);

    if (ownMessage) item.dataset.ownMessage = "true";
    return item;
  }

  function scrollToLatest(behavior = "auto") {
    messageList.scrollTo({ top: messageList.scrollHeight, behavior });
    newMessageButton.hidden = true;
  }

  function isNearLatest() {
    return messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 54;
  }

  function appendMessage(message, ownMessage = false) {
    const wasNearLatest = isNearLatest();
    messageList.append(createMessage(message, ownMessage));

    while (messageList.childElementCount > MAX_MESSAGES) {
      const firstMessage = messageList.firstElementChild;
      const removedHeight = firstMessage.getBoundingClientRect().height;
      firstMessage.remove();
      if (!wasNearLatest) messageList.scrollTop = Math.max(0, messageList.scrollTop - removedHeight);
    }

    if (wasNearLatest) scrollToLatest("smooth");
    else newMessageButton.hidden = false;
  }

  function randomIndex(length, excludedIndex = -1) {
    if (length < 2) return 0;
    let index;
    do index = Math.floor(Math.random() * length);
    while (index === excludedIndex);
    return index;
  }

  function postAudienceMessage() {
    if (document.hidden) return;

    const audienceIndex = randomIndex(audience.length, previousAudienceIndex);
    const viewer = audience[audienceIndex];
    const availableLines = viewer.lines.filter(line => line !== previousLine);
    const text = availableLines[Math.floor(Math.random() * availableLines.length)];

    previousAudienceIndex = audienceIndex;
    previousLine = text;
    appendMessage({ ...viewer, text });
    scheduleAudienceMessage();
  }

  function scheduleAudienceMessage(delay) {
    window.clearTimeout(autoChatTimer);
    if (document.hidden) return;
    const nextDelay = delay ?? AUTO_CHAT_MIN_DELAY + Math.random() * (AUTO_CHAT_MAX_DELAY - AUTO_CHAT_MIN_DELAY);
    autoChatTimer = window.setTimeout(postAudienceMessage, nextDelay);
  }

  function renderMessages() {
    const fragment = document.createDocumentFragment();
    initialMessages.forEach(message => fragment.append(createMessage(message)));
    messageList.replaceChildren(fragment);
    requestAnimationFrame(() => scrollToLatest());
  }

  function updateComposerState() {
    messageForm.classList.toggle("has-text", messageInput.value.trim().length > 0);
  }

  function insertAtCursor(value) {
    const start = messageInput.selectionStart ?? messageInput.value.length;
    const end = messageInput.selectionEnd ?? start;
    messageInput.setRangeText(value, start, end, "end");
    messageInput.focus();
    updateComposerState();
  }

  function closeEmojiPanel() {
    emojiPanel.hidden = true;
    emojiButton.setAttribute("aria-expanded", "false");
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 1900);
  }

  messageForm.addEventListener("submit", event => {
    event.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;

    appendMessage({
      badge: "🐹",
      badgeClass: "robot",
      name: myNickname,
      color: "#66d5b2",
      text
    }, true);

    messageInput.value = "";
    updateComposerState();
    closeEmojiPanel();
  });

  messageInput.addEventListener("input", updateComposerState);

  emojiButton.addEventListener("click", () => {
    const willOpen = emojiPanel.hidden;
    emojiPanel.hidden = !willOpen;
    emojiButton.setAttribute("aria-expanded", String(willOpen));
    if (willOpen) emojiPanel.querySelector("button")?.focus();
  });

  emojiPanel.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    insertAtCursor(button.textContent);
    closeEmojiPanel();
  });

  rewardButton.addEventListener("click", () => {
    if (rewardButton.classList.contains("claimed")) return;
    rewardButton.classList.add("claimed");
    rewardButton.disabled = true;
    rewardLabel.textContent = "받기 완료";
    showToast("통나무 파워 100개를 받았어요!");
  });

  messageList.addEventListener("scroll", () => {
    if (isNearLatest()) newMessageButton.hidden = true;
  }, { passive: true });

  newMessageButton.addEventListener("click", () => scrollToLatest("smooth"));

  collapseButton.addEventListener("click", () => {
    browserBar.classList.toggle("collapsed");
    collapseButton.setAttribute("aria-label", browserBar.classList.contains("collapsed") ? "상단 바 펼치기" : "상단 바 접기");
    requestAnimationFrame(() => scrollToLatest());
  });

  document.querySelector(".address-menu").addEventListener("click", () => showToast("현재 방송 주소입니다."));
  document.querySelector("#support-button").addEventListener("click", () => showToast("후원하기 기능을 준비 중이에요."));
  document.querySelector("#voice-button").addEventListener("click", () => showToast("음성 채팅 기능을 준비 중이에요."));
  document.querySelector("#chat-tab").addEventListener("click", () => {
    scrollToLatest("smooth");
    messageInput.focus();
  });

  document.addEventListener("pointerdown", event => {
    if (!emojiPanel.hidden && !emojiPanel.contains(event.target) && !emojiButton.contains(event.target)) {
      closeEmojiPanel();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) window.clearTimeout(autoChatTimer);
    else scheduleAudienceMessage(700);
  });

  renderMessages();
  scheduleAudienceMessage(1000);
})();
