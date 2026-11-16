const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { execFile, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { setupUpdater } = require("./updater.js");

const SESSION_FILENAME = "RiotGamesPrivateSettings.yaml";
const RIOT_PROCESSES = [
  "RiotClientServices.exe",
  "RiotClientUx.exe",
  "LeagueClientUx.exe",
  "LeagueClient.exe",
];
const COMMON_RIOT_PATHS = [
  "C:\\Riot Games\\Riot Client\\RiotClientServices.exe",
  `${process.env["ProgramFiles"] || "C:\\Program Files"}\\Riot Games\\Riot Client\\RiotClientServices.exe`,
  `${process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)"}\\Riot Games\\Riot Client\\RiotClientServices.exe`,
];

function riotDataDir() {
  return path.join(process.env.LOCALAPPDATA || "", "Riot Games", "Riot Client", "Data");
}

function riotConfigDir() {
  return path.join(process.env.LOCALAPPDATA || "", "Riot Games", "Riot Client", "Config");
}

function liveSessionFile() {
  return path.join(riotDataDir(), SESSION_FILENAME);
}

// The YAML "stay signed in" file alone only holds UI state - the actual
// refresh token lives in the Sessions folder, and RiotClientSettings.yaml
// tracks which account it belongs to. All three have to travel together.
const SESSION_PARTS = [
  { key: "private-settings.yaml", live: () => liveSessionFile(), required: true },
  { key: "sessions", live: () => path.join(riotDataDir(), "Sessions"), required: false },
  { key: "client-settings.yaml", live: () => path.join(riotConfigDir(), "RiotClientSettings.yaml"), required: false },
];

function configFile() {
  return path.join(app.getPath("userData"), "config.json");
}

function profilesDir() {
  return path.join(app.getPath("userData"), "profiles");
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile(), "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(cfg), "utf8");
}

function detectRiotClientPath() {
  return COMMON_RIOT_PATHS.find((p) => fs.existsSync(p)) || "";
}

function killRiotProcesses() {
  return Promise.all(
    RIOT_PROCESSES.map(
      (name) =>
        new Promise((resolve) => {
          execFile("taskkill", ["/F", "/IM", name], () => resolve());
        }),
    ),
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fileHash(filePath) {
  try {
    return crypto.createHash("sha1").update(fs.readFileSync(filePath)).digest("hex");
  } catch {
    return null;
  }
}

// Copies src -> dest (file or directory), retrying while the destination
// is locked by a Riot process that hasn't released its file handle yet
// after being killed.
async function copyWithRetry(src, dest, attempts = 8, delayMs = 400) {
  for (let i = 0; i < attempts; i++) {
    try {
      fs.rmSync(dest, { recursive: true, force: true });
      fs.cpSync(src, dest, { recursive: true });
      return;
    } catch (err) {
      if (i === attempts - 1) throw err;
      await sleep(delayMs);
    }
  }
}

const BOUNDS_FILE = () => path.join(app.getPath("userData"), "window-bounds.json");

function loadBounds() {
  try {
    return JSON.parse(fs.readFileSync(BOUNDS_FILE(), "utf-8"));
  } catch {
    return null;
  }
}

function saveBounds(win) {
  try {
    fs.writeFileSync(BOUNDS_FILE(), JSON.stringify(win.getBounds()));
  } catch {}
}

let mainWindow = null;

function createWindow() {
  const saved = loadBounds();
  const win = new BrowserWindow({
    width: saved?.width || 420,
    height: saved?.height || 620,
    x: saved?.x,
    y: saved?.y,
    minWidth: 360,
    minHeight: 460,
    title: "League Account Manager",
    frame: false,
    show: false,
    backgroundColor: "#0e1015",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.on("resize", () => saveBounds(win));
  win.on("move", () => saveBounds(win));
  win.once("ready-to-show", () => win.show());
  win.loadFile(path.join(__dirname, "index.html"));

  ipcMain.on("win-minimize", () => win.minimize());
  ipcMain.on("win-close", () => win.close());

  setupUpdater(win);
  mainWindow = win;
  return win;
}

function sendProgress(stage) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("switch-progress", stage);
  }
}

ipcMain.handle("get-riot-path", () => {
  const cfg = readConfig();
  if (cfg.riotClientPath) return { path: cfg.riotClientPath, autoDetected: false };
  const detected = detectRiotClientPath();
  if (detected) {
    writeConfig({ ...cfg, riotClientPath: detected });
    return { path: detected, autoDetected: true };
  }
  return { path: "", autoDetected: false };
});

ipcMain.handle("pick-riot-path", async () => {
  const result = await dialog.showOpenDialog({
    title: "Locate RiotClientServices.exe",
    properties: ["openFile"],
    filters: [{ name: "Riot Client", extensions: ["exe"] }],
  });
  if (result.canceled || !result.filePaths[0]) return { path: "", warning: "" };
  const picked = result.filePaths[0];
  writeConfig({ ...readConfig(), riotClientPath: picked });
  const warning = path.basename(picked).toLowerCase() === "riotclientservices.exe"
    ? ""
    : `"${path.basename(picked)}" doesn't look like RiotClientServices.exe - switching may not work.`;
  return { path: picked, warning };
});

function markerFile(profileName) {
  return path.join(profilesDir(), profileName, SESSION_PARTS[0].key);
}

ipcMain.handle("list-profiles", () => {
  const liveHash = fileHash(liveSessionFile());
  try {
    return fs
      .readdirSync(profilesDir(), { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(markerFile(e.name)))
      .map((e) => {
        const stat = fs.statSync(markerFile(e.name));
        return {
          name: e.name,
          savedAt: stat.mtimeMs,
          active: liveHash !== null && liveHash === fileHash(markerFile(e.name)),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
});

ipcMain.handle("profile-exists", (_e, name) => fs.existsSync(path.join(profilesDir(), name.trim())));

ipcMain.handle("save-profile", (_e, name) => {
  if (!name || !name.trim()) return { ok: false, error: "Name is required." };
  const requiredPart = SESSION_PARTS.find((p) => p.required);
  if (!fs.existsSync(requiredPart.live())) {
    return {
      ok: false,
      error: "No active Riot session found. Log in with \"Stay signed in\" checked first.",
    };
  }
  const dest = path.join(profilesDir(), name.trim());
  fs.mkdirSync(dest, { recursive: true });
  for (const part of SESSION_PARTS) {
    const src = part.live();
    if (fs.existsSync(src)) fs.cpSync(src, path.join(dest, part.key), { recursive: true });
  }
  return { ok: true };
});

ipcMain.handle("rename-profile", (_e, oldName, newName) => {
  const trimmed = (newName || "").trim();
  if (!trimmed) return { ok: false, error: "Name is required." };
  if (trimmed === oldName) return { ok: true };
  const from = path.join(profilesDir(), oldName);
  const to = path.join(profilesDir(), trimmed);
  if (fs.existsSync(to)) return { ok: false, error: `"${trimmed}" already exists.` };
  try {
    fs.renameSync(from, to);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("delete-profile", (_e, name) => {
  try {
    fs.rmSync(path.join(profilesDir(), name), { recursive: true, force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("switch-profile", async (_e, name) => {
  const riotClientPath = readConfig().riotClientPath;
  if (!riotClientPath) return { ok: false, error: "Riot Client location not set." };
  if (!fs.existsSync(markerFile(name))) return { ok: false, error: "Profile not found." };

  sendProgress("closing");
  await killRiotProcesses();
  await sleep(600);

  sendProgress("copying");
  fs.mkdirSync(riotDataDir(), { recursive: true });
  fs.mkdirSync(riotConfigDir(), { recursive: true });
  try {
    for (const part of SESSION_PARTS) {
      const src = path.join(profilesDir(), name, part.key);
      if (fs.existsSync(src)) await copyWithRetry(src, part.live());
    }
  } catch (err) {
    return { ok: false, error: `Couldn't write the session (${err.code || err.message}). Make sure Riot Client is fully closed and try again.` };
  }

  sendProgress("launching");
  const child = spawn(riotClientPath, [], { detached: true, stdio: "ignore" });
  child.unref();
  return { ok: true };
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
