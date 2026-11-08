// Tujuan file: Menjembatani API Desktop yang diizinkan dari proses utama ke antarmuka Electron.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("zraDesktop", {
  getState: () => ipcRenderer.invoke("app:get-state"),
  saveSettings: (settings) => ipcRenderer.invoke("app:save-settings", settings),
  createApiKey: () => ipcRenderer.invoke("api-key:create"),
  clearDatabase: () => ipcRenderer.invoke("database:clear"),
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  deleteHistoryItem: (itemId) => ipcRenderer.invoke("history:delete-item", itemId),
  publishMobileUpdate: (metadata) => ipcRenderer.invoke("updates:publish", metadata),
  releaseDevice: (deviceId) => ipcRenderer.invoke("devices:release", deviceId),
  blockDevice: (deviceId) => ipcRenderer.invoke("devices:block", deviceId),
  unblockDevice: (deviceId) => ipcRenderer.invoke("devices:unblock", deviceId),
  getChatMessages: (deviceId) => ipcRenderer.invoke("chat:get-messages", deviceId),
  sendChatMessage: (payload) => ipcRenderer.invoke("chat:send", payload),
  deleteChatMessage: (payload) => ipcRenderer.invoke("chat:delete-message", payload),
  clearDeviceChat: (deviceId) => ipcRenderer.invoke("chat:clear-device", deviceId),
  sendChatApiKey: (deviceId) => ipcRenderer.invoke("chat:send-api-key", deviceId),
  verifyChatMessage: (messageId) => ipcRenderer.invoke("chat:verify", { messageId }),
  getAgentStatus: () => ipcRenderer.invoke("agent:status"),
  toggleAgent: (enable) => ipcRenderer.invoke("agent:toggle", enable),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggle-maximize"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  startTunnel: () => ipcRenderer.invoke("agent:start-tunnel"),
  getGroqKey: () => ipcRenderer.invoke("groqKey:get"),
  saveGroqKey: (key) => ipcRenderer.invoke("groqKey:save", key),
  chatLlm: (prompt) => ipcRenderer.invoke("llm:chat", prompt),
  onMaximizeStateChanged: (callback) => {
    const listener = (_event, maximized) => callback(maximized);
    ipcRenderer.on("window:maximize-state", listener);
    return () => ipcRenderer.removeListener("window:maximize-state", listener);
  },
  onStateChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("app:state-changed", listener);
    return () => ipcRenderer.removeListener("app:state-changed", listener);
  },
  onTunnelUrlReady: (callback) => {
    const listener = (_event, url) => callback(url);
    ipcRenderer.on("tunnel-url-ready", listener);
    return () => ipcRenderer.removeListener("tunnel-url-ready", listener);
  },
});
