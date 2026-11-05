const form = document.querySelector("#lock-form");
const passwordInput = document.querySelector("#password");
const confirmInput = document.querySelector("#confirm-password");
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
  try {
    currentHost = new URL(tab.url).hostname.toLowerCase();
  } catch {
    currentHost = null;
  }

  hostLabel.textContent = currentHost || "此頁面無法鎖定";
  form.hidden = !currentHost || !["http:", "https:"].includes(new URL(tab.url).protocol);
  await renderLocks();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";

  if (passwordInput.value !== confirmInput.value) {
    message.textContent = "兩次輸入的密碼不一致。";
    confirmInput.focus();
    return;
  }

  const salt = randomHex(16);
  const hash = await hashPassword(passwordInput.value, salt);
  const result = await chrome.runtime.sendMessage({
    type: "create-lock",
    host: currentHost,
    salt,
    hash
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
    : "設定密碼後，造訪網站時會要求輸入密碼";
}

function formatRemaining(milliseconds) {
  const minutes = Math.max(0, Math.ceil(milliseconds / 60000));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0 ? `${hours} 小時 ${remainingMinutes} 分` : `${remainingMinutes} 分鐘`;
}

function randomHex(length) {
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const saltBytes = Uint8Array.from(salt.match(/.{2}/g), (byte) => parseInt(byte, 16));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: 210000 },
    key,
    256
  );
  return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, "0")).join("");
}