// What the newsroom page may ask of the desktop app, and nothing more:
// window.ck exists only inside the app (the browser version has none).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ck", {
  info: () => ipcRenderer.invoke("ck:info"),
  // GitHub's device sign-in: returns the short code to show; the app opens the page
  connectGitHub: () => ipcRenderer.invoke("ck:connect-github"),
  onGitHubConnected: (fn) => ipcRenderer.on("ck:github-connected", () => fn()),
  // wake the computer five minutes before the evening run ("HH:MM")
  scheduleWake: (time) => ipcRenderer.invoke("ck:schedule-wake", time),
  cancelWake: () => ipcRenderer.invoke("ck:cancel-wake"),
  // work on another paper: the app starts its engine again for it
  switchPaper: (id) => ipcRenderer.invoke("ck:switch-paper", id),
  // updates: where they stand, look for one now, put a downloaded one in (restarts the app)
  updateStatus: () => ipcRenderer.invoke("ck:update-status"),
  checkUpdate: () => ipcRenderer.invoke("ck:check-update"),
  applyUpdate: () => ipcRenderer.invoke("ck:apply-update"),
  onUpdate: (fn) => ipcRenderer.on("ck:update", (_e, u) => fn(u)),
});
