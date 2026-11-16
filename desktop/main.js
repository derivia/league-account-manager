const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { execFile, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { setupUpdater } = require("./updater.js");

const SESSION_FILENAME = "RiotGamesPrivateSettings.yaml";
const RIOT_PROCESSES = [
  "RiotClientServices.exe",
  "RiotClientUx.exe",
  "LeagueClientUx.exe",
  "LeagueClient.exe",
];

function riotDataDir() {
  return path.join(process.env.LOCALAPPDATA || "", "Riot Games", "Riot Client", "Data");
}

function liveSessionFile() {
  return path.join(riotDataDir(), SESSION_FILENAME);
}

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

function createWindow() {
  const saved = loadBounds();
  const win = new BrowserWindow({
    width: saved?.width || 420,
    height: saved?.height || 560,
    x: saved?.x,
    y: saved?.y,
    minWidth: 360,
    minHeight: 420,
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
  return win;
}

ipcMain.handle("get-riot-path", () => readConfig().riotClientPath || "");

ipcMain.handle("pick-riot-path", async () => {
  const result = await dialog.showOpenDialog({
    title: "Locate RiotClientServices.exe",
    properties: ["openFile"],
    filters: [{ name: "Riot Client", extensions: ["exe"] }],
  });
  if (result.canceled || !result.filePaths[0]) return "";
  const picked = result.filePaths[0];
  writeConfig({ ...readConfig(), riotClientPath: picked });
  return picked;
});

ipcMain.handle("list-profiles", () => {
  try {
    return fs
      .readdirSync(profilesDir(), { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(profilesDir(), e.name, SESSION_FILENAME)))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
});

ipcMain.handle("save-profile", (_e, name) => {
  if (!name || !name.trim()) return { ok: false, error: "Name is required." };
  const src = liveSessionFile();
  if (!fs.existsSync(src)) {
    return {
      ok: false,
      error: "No active Riot session found. Log in with \"Stay signed in\" checked first.",
    };
  }
  const dest = path.join(profilesDir(), name.trim());
  fs.mkdirSync(dest, { recursive: true });
  fs.copyFileSync(src, path.join(dest, SESSION_FILENAME));
  return { ok: true };
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
  const src = path.join(profilesDir(), name, SESSION_FILENAME);
  if (!fs.existsSync(src)) return { ok: false, error: "Profile not found." };

  await killRiotProcesses();
  await sleep(1500);

  fs.mkdirSync(riotDataDir(), { recursive: true });
  fs.copyFileSync(src, liveSessionFile());

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
