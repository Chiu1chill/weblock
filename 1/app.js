if (new URLSearchParams(location.search).get("mode") === "unlock") {
  document.body.classList.replace("popup-page", "gate-page");
  document.querySelector("#popup-view").hidden = true;
  document.querySelector("#gate-view").hidden = false;
  initializeUnlock();
} else {
  initializePopup();
}

function initializePopup() {
  const form = document.querySelector("#lock-form");
  const hostLabel = document.querySelector("#current-host");
  const siteState = document.querySelector("#site-state");
  const message = document.querySelector("#message");
  const lockList = document.querySelector("#lock-list");
  const emptyState = document.querySelector("#empty-state");
  const lockCount = document.querySelector("#lock-count");
  let currentHost = null;

  initialize();

  async function initialize() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let tabUrl;
    try {
      tabUrl = new URL(tab.url);
      currentHost = tabUrl.hostname.toLowerCase();
    } catch {
      currentHost = null;
    }

    hostLabel.textContent = currentHost || "此頁面無法鎖定";
    form.hidden = !currentHost || !["http:", "https:"].includes(tabUrl?.protocol);
    await renderLocks();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "";

    const result = await chrome.runtime.sendMessage({
      type: "create-lock",
      host: currentHost
    });

    if (!result?.ok) {
      message.textContent = result?.error || "無法建立鎖定。";
      return;
    }

    form.reset();
    message.textContent = `${currentHost} 已鎖定 12 小時。`;
    await renderLocks();
  });

  async function renderLocks() {
    const { locks = {} } = await chrome.storage.local.get("locks");
    const activeLocks = Object.entries(locks)
      .filter(([, lock]) => lock.expiresAt > Date.now())
      .sort(([hostA], [hostB]) => hostA.localeCompare(hostB));

    lockList.replaceChildren();
    lockCount.textContent = String(activeLocks.length);
    emptyState.hidden = activeLocks.length > 0;

    for (const [host, lock] of activeLocks) {
      const item = document.createElement("li");
      item.className = "lock-item";

      const details = document.createElement("div");
      details.className = "lock-details";
      const name = document.createElement("strong");
      name.textContent = host;
      const time = document.createElement("span");
      time.textContent = `剩餘 ${formatRemaining(lock.expiresAt - Date.now())}`;
      details.append(name, time);

      item.append(details);
      lockList.append(item);
    }

    const currentLock = locks[currentHost];
    siteState.textContent = currentLock?.expiresAt > Date.now()
      ? `已鎖定，${formatRemaining(currentLock.expiresAt - Date.now())}後自動解除`
      : "鎖定網站後，造訪時會要求輸入固定密碼";
  }
}

function initializeUnlock() {
  const form = document.querySelector("#unlock-form");
  const passwordInput = document.querySelector("#unlock-password");
  const fixedPassword = document.querySelector("#fixed-password");
  const targetHost = document.querySelector("#target-host");
  const errorMessage = document.querySelector("#error-message");
  let currentTabId;

  for (const eventName of ["copy", "cut", "paste", "drop"]) {
    passwordInput.addEventListener(eventName, (event) => event.preventDefault());
  }
  passwordInput.addEventListener("beforeinput", (event) => {
    if (event.inputType.startsWith("insertFrom") || event.inputType === "deleteByCut") {
      event.preventDefault();
    }
  });
  fixedPassword.addEventListener("copy", (event) => event.preventDefault());
  fixedPassword.addEventListener("cut", (event) => event.preventDefault());

  initialize();

  async function initialize() {
    const tab = await chrome.tabs.getCurrent();
    currentTabId = tab?.id;
    let target = null;

    for (let attempt = 0; attempt < 20 && !target; attempt += 1) {
      const response = await chrome.runtime.sendMessage({
        type: "get-target",
        tabId: currentTabId
      });
      target = response?.target;
      if (!target) await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if (target) {
      targetHost.textContent = new URL(target).hostname;
      fixedPassword.textContent = WEBLOCK_FIXED_PASSWORD;
      form.hidden = false;
      passwordInput.focus();
      return;
    }

    targetHost.textContent = "無法取得原始網站，請關閉此分頁後重新造訪。";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorMessage.textContent = "";

    const response = await chrome.runtime.sendMessage({
      type: "verify-password",
      tabId: currentTabId,
      password: passwordInput.value
    });

    if (!response?.ok) {
      errorMessage.textContent = response?.error || "驗證失敗，請再試一次。";
      passwordInput.select();
      return;
    }

    location.replace(response.target);
  });
}

function formatRemaining(milliseconds) {
  const minutes = Math.max(0, Math.ceil(milliseconds / 60000));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0 ? `${hours} 小時 ${remainingMinutes} 分` : `${remainingMinutes} 分鐘`;
}
