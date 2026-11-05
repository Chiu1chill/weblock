const LOCK_DURATION_MS = 12 * 60 * 60 * 1000;
const ALARM_PREFIX = "weblock-expire-";

chrome.runtime.onInstalled.addListener(() => refreshLocks());
chrome.runtime.onStartup.addListener(() => refreshLocks());

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith(ALARM_PREFIX)) refreshLocks();
});

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0 || !details.url.startsWith("http")) return;

  const { locks = {} } = await chrome.storage.local.get("locks");
  const hostname = new URL(details.url).hostname.toLowerCase();
  const isLocked = Object.entries(locks).some(([host, lock]) =>
    lock.expiresAt > Date.now() &&
    (hostname === host || hostname.endsWith(`.${host}`))
  );

  if (isLocked) {
    await chrome.storage.session.set({ [String(details.tabId)]: details.url });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(String(tabId));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;

  (async () => {
    if (message.type === "create-lock") {
      await createLock(message.host, message.salt, message.hash);
      return { ok: true };
    }

    if (message.type === "get-target") {
      const key = String(message.tabId);
      const target = (await chrome.storage.session.get(key))[key];
      return { target: target || null };
    }

    if (message.type === "verify-password") {
      return verifyPassword(message.tabId, message.password);
    }

    return { ok: false, error: "Unknown request." };
  })()
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function createLock(host, salt, hash) {
  const normalizedHost = String(host).toLowerCase();
  if (!isValidHostname(normalizedHost) || !salt || !hash) {
    throw new Error("Invalid website or password data.");
  }

  const { locks = {} } = await chrome.storage.local.get("locks");
  const ruleId = locks[normalizedHost]?.ruleId ??
    Math.max(0, ...Object.values(locks).map((lock) => lock.ruleId || 0)) + 1;

  locks[normalizedHost] = {
    salt,
    hash,
    ruleId,
    expiresAt: Date.now() + LOCK_DURATION_MS
  };

  await chrome.storage.local.set({ locks });
  await refreshLocks();
}

function isValidHostname(host) {
  try {
    return host.length > 0 && new URL(`https://${host}`).hostname === host;
  } catch {
    return false;
  }
}

async function refreshLocks() {
  const { locks = {} } = await chrome.storage.local.get("locks");
  const now = Date.now();
  let changed = false;

  for (const [host, lock] of Object.entries(locks)) {
    if (lock.expiresAt <= now) {
      delete locks[host];
      changed = true;
    }
  }

  if (changed) await chrome.storage.local.set({ locks });

  const rules = Object.entries(locks).map(([host, lock]) => ({
    id: lock.ruleId,
    priority: 1,
    action: {
      type: "redirect",
      redirect: { extensionPath: "/app.html?mode=unlock" }
    },
    condition: {
      urlFilter: `||${host}^`,
      resourceTypes: ["main_frame"],
      excludedInitiatorDomains: [chrome.runtime.id]
    }
  }));

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingRules.map((rule) => rule.id),
    addRules: rules
  });

  const alarms = await chrome.alarms.getAll();
  await Promise.all(
    alarms
      .filter((alarm) => alarm.name.startsWith(ALARM_PREFIX))
      .map((alarm) => chrome.alarms.clear(alarm.name))
  );

  for (const lock of Object.values(locks)) {
    chrome.alarms.create(`${ALARM_PREFIX}${lock.ruleId}`, {
      when: lock.expiresAt
    });
  }
}

async function verifyPassword(tabId, password) {
  const key = String(tabId);
  const { [key]: target } = await chrome.storage.session.get(key);
  if (!target) return { ok: false, error: "找不到要開啟的網站，請重新載入。" };

  const hostname = new URL(target).hostname.toLowerCase();
  const { locks = {} } = await chrome.storage.local.get("locks");
  const lockHost = Object.keys(locks).find((host) =>
    hostname === host || hostname.endsWith(`.${host}`)
  );
  const lock = lockHost && locks[lockHost];

  if (!lock || lock.expiresAt <= Date.now()) {
    await refreshLocks();
    return { ok: true, target };
  }

  const candidate = await hashPassword(password, lock.salt);
  if (!constantTimeEqual(candidate, lock.hash)) {
    return { ok: false, error: "密碼不正確。" };
  }

  return { ok: true, target };
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(salt), iterations: 210000 },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

function hexToBytes(hex) {
  return Uint8Array.from(hex.match(/.{2}/g) || [], (byte) => parseInt(byte, 16));
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}