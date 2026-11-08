// Tujuan file: Menjalankan tugas latar belakang browser extension dan menangani pesan antarbagian.
const STATE_KEY = "recordingState";
const MAX_STEPS = 100;

async function readState() {
  const result = await chrome.storage.session.get(STATE_KEY);
  return result[STATE_KEY] ?? null;
}

async function writeState(state) {
  await chrome.storage.session.set({ [STATE_KEY]: state });
}

async function notifyState(state) {
  try { await chrome.runtime.sendMessage({ type: "STATE_CHANGED", state }); } catch { /* Popup may be closed. */ }
}

async function injectRecorder(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["recorder.js"] });
    return true;
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "GET_STATE") {
      sendResponse({ state: await readState() });
      return;
    }

    if (message?.type === "START_RECORDING") {
      const tabId = Number(message.tabId);
      const tab = await chrome.tabs.get(tabId);
      const currentUrl = new URL(tab.url ?? "");
      if (!["http:", "https:"].includes(currentUrl.protocol)) throw new Error("Buka halaman HTTP atau HTTPS terlebih dahulu.");
      const origin = currentUrl.origin;
      const hasPermission = await chrome.permissions.contains({ origins: [`${origin}/*`] });
      if (!hasPermission) throw new Error("Izin akses untuk origin ini belum diberikan.");
      const state = {
        recording: true,
        tabId,
        origin,
        startUrl: `${currentUrl.origin}${currentUrl.pathname}`,
        startedAt: new Date().toISOString(),
        steps: [],
        warning: "",
      };
      await writeState(state);
      if (!(await injectRecorder(tabId))) {
        await writeState({ ...state, recording: false, warning: "Recorder tidak dapat dipasang di halaman ini." });
        throw new Error("Gagal memasang recorder pada halaman ini.");
      }
      await notifyState(state);
      sendResponse({ state });
      return;
    }

    if (message?.type === "STOP_RECORDING") {
      const state = await readState();
      if (state) {
        state.recording = false;
        state.stoppedAt = new Date().toISOString();
        await writeState(state);
        await notifyState(state);
      }
      sendResponse({ state });
      return;
    }

    if (message?.type === "CLEAR_RECORDING") {
      await chrome.storage.session.remove(STATE_KEY);
      await notifyState(null);
      sendResponse({ state: null });
      return;
    }

    if (message?.type === "RECORDED_STEP") {
      const state = await readState();
      const senderTabId = sender.tab?.id;
      const senderOrigin = sender.url ? new URL(sender.url).origin : "";
      const step = message.step;
      if (!state?.recording || senderTabId !== state.tabId || senderOrigin !== state.origin || !step || state.steps.length >= MAX_STEPS) {
        sendResponse({ accepted: false });
        return;
      }
      if (!["fill", "click", "submit"].includes(step.action) || typeof step.selector !== "string" || step.selector.length > 300) {
        sendResponse({ accepted: false });
        return;
      }
      const safeStep = { action: step.action, selector: step.selector };
      if (step.action === "fill" && ["email", "username", "password", "name", "optional"].includes(step.valueRef)) safeStep.valueRef = step.valueRef;
      if (step.action === "click" && typeof step.label === "string") safeStep.label = step.label.slice(0, 80);
      if (step.action === "submit") safeStep.submit = true;
      state.steps.push(safeStep);
      await writeState(state);
      await notifyState(state);
      sendResponse({ accepted: true });
    }
  })().catch((error) => sendResponse({ error: error?.message ?? "Permintaan gagal." }));
  return true;
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  const state = await readState();
  if (!state?.recording || state.tabId !== tabId) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    const current = new URL(tab.url ?? "");
    if (current.origin !== state.origin) {
      state.recording = false;
      state.warning = "Perekaman dihentikan karena halaman berpindah origin.";
      await writeState(state);
      await notifyState(state);
      return;
    }
    await injectRecorder(tabId);
  } catch {
    state.recording = false;
    state.warning = "Perekaman dihentikan karena halaman tidak dapat diakses.";
    await writeState(state);
  }
});
