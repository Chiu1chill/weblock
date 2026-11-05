const form = document.querySelector("#unlock-form");
const passwordInput = document.querySelector("#password");
const targetHost = document.querySelector("#target-host");
const errorMessage = document.querySelector("#error-message");
let currentTabId;

passwordInput.addEventListener("paste", (event) => event.preventDefault());
passwordInput.addEventListener("drop", (event) => event.preventDefault());
passwordInput.addEventListener("beforeinput", (event) => {
  if (event.inputType === "insertFromPaste" || event.inputType === "insertFromDrop") {
    event.preventDefault();
  }
});

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