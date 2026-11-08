// Tujuan file: Mengatur interaksi pada popup browser extension.
const statusNode = document.querySelector("#status");
const profileNode = document.querySelector("#profile");
const stepCountNode = document.querySelector("#step-count");
const noticeNode = document.querySelector("#notice");
const startButton = document.querySelector("#start");
const stopButton = document.querySelector("#stop");
const copyButton = document.querySelector("#copy");
const clearButton = document.querySelector("#clear");

let profileJson = "";

function buildProfile(state) {
  return {
    format: "zra-login-profile",
    version: 1,
    origin: state.origin,
    startUrl: state.startUrl,
    recordedAt: state.startedAt,
    steps: state.steps,
  };
}

function render(state) {
  if (!state) {
    statusNode.textContent = "Siap merekam";
    profileNode.value = "";
    profileJson = "";
    stepCountNode.textContent = "0 langkah";
    startButton.disabled = false;
    stopButton.disabled = true;
    copyButton.disabled = true;
    return;
  }
  const count = state.steps?.length ?? 0;
  statusNode.textContent = state.recording ? "Sedang merekam · origin dikunci" : state.warning || "Rekaman selesai";
  stepCountNode.textContent = `${count} langkah`;
  startButton.disabled = state.recording;
  stopButton.disabled = !state.recording;
  profileJson = state.recording ? "" : JSON.stringify(buildProfile(state), null, 2);
  profileNode.value = profileJson;
  copyButton.disabled = state.recording || count === 0;
}

async function send(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (result?.error) throw new Error(result.error);
  return result;
}

startButton.addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Buka target HTTP/HTTPS sebelum mulai merekam.");
    const allowed = await chrome.permissions.request({ origins: [`${url.origin}/*`] });
    if (!allowed) throw new Error("Izin origin tidak diberikan.");
    const result = await send({ type: "START_RECORDING", tabId: tab.id });
    render(result.state);
    noticeNode.textContent = "Rekam hanya satu origin. Isi form seperti biasa; isi ketikan tidak disimpan.";
  } catch (error) {
    statusNode.textContent = error.message;
  }
});

stopButton.addEventListener("click", async () => {
  try {
    const result = await send({ type: "STOP_RECORDING" });
    render(result.state);
  } catch (error) { statusNode.textContent = error.message; }
});

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(profileJson);
    noticeNode.textContent = "Profil login tersalin. Tempel di app mobile.";
  } catch {
    profileNode.focus();
    profileNode.select();
    noticeNode.textContent = "Profil dipilih. Salin manual lalu tempel di app mobile.";
  }
});

clearButton.addEventListener("click", async () => {
  try {
    await send({ type: "CLEAR_RECORDING" });
    render(null);
    noticeNode.textContent = "Data rekaman sesi ini sudah dihapus.";
  } catch (error) { statusNode.textContent = error.message; }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "STATE_CHANGED") render(message.state);
});

send({ type: "GET_STATE" }).then((result) => render(result.state)).catch((error) => { statusNode.textContent = error.message; });
