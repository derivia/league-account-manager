const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lam", {
  isDesktop: true,
  appVersion: () => ipcRenderer.invoke("get-app-version"),
  getVersions: () => ipcRenderer.invoke("get-versions"),
  downloadUpdate: (assetApiUrl) => ipcRenderer.invoke("download-update", assetApiUrl),
  installUpdate: (exePath) => ipcRenderer.invoke("install-update", exePath),
  onDownloadProgress: (cb) => {
    const handler = (_e, p) => cb(p);
    ipcRenderer.on("download-progress", handler);
    return () => ipcRenderer.removeListener("download-progress", handler);
  },

  getRiotPath: () => ipcRenderer.invoke("get-riot-path"),
  pickRiotPath: () => ipcRenderer.invoke("pick-riot-path"),
  listProfiles: () => ipcRenderer.invoke("list-profiles"),
  profileExists: (name) => ipcRenderer.invoke("profile-exists", name),
  saveProfile: (name) => ipcRenderer.invoke("save-profile", name),
  renameProfile: (oldName, newName) => ipcRenderer.invoke("rename-profile", oldName, newName),
  deleteProfile: (name) => ipcRenderer.invoke("delete-profile", name),
  switchProfile: (name) => ipcRenderer.invoke("switch-profile", name),
  onSwitchProgress: (cb) => {
    const handler = (_e, stage) => cb(stage);
    ipcRenderer.on("switch-progress", handler);
    return () => ipcRenderer.removeListener("switch-progress", handler);
  },

  winMinimize: () => ipcRenderer.send("win-minimize"),
  winClose: () => ipcRenderer.send("win-close"),
});
