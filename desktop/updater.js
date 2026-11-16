const { ipcMain, app } = require("electron");
const { spawn } = require("child_process");
const https = require("https");
const fs = require("fs");
const path = require("path");

const GITHUB_OWNER = "derivia";
const GITHUB_REPO = "league-account-manager";

let mainWindow = null;

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const headers = { "User-Agent": "League-Account-Manager-Updater" };
    https.get(url, { headers }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return fetchJSON(res.headers.location).then(resolve, reject);
      }
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const headers = {
      "User-Agent": "League-Account-Manager-Updater",
      "Accept": "application/octet-stream",
    };

    function follow(u) {
      https.get(u, { headers }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          return follow(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        }
        const total = parseInt(res.headers["content-length"] || "0", 10);
        let received = 0;
        const file = fs.createWriteStream(dest);
        res.on("data", (chunk) => {
          received += chunk.length;
          file.write(chunk);
          if (total > 0 && onProgress) {
            onProgress({ percent: Math.round((received / total) * 100), transferred: received, total });
          }
        });
        res.on("end", () => { file.end(() => resolve(dest)); });
        res.on("error", reject);
      }).on("error", reject);
    }
    follow(url);
  });
}

function setupUpdater(win) {
  mainWindow = win;

  ipcMain.handle("get-app-version", () => app.getVersion());

  ipcMain.handle("get-versions", async () => {
    try {
      const releases = await fetchJSON(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`,
      );
      if (!Array.isArray(releases)) return [];
      const current = app.getVersion();
      const seen = new Set();
      const deduped = [];
      for (const r of releases) {
        if (seen.has(r.tag_name)) continue;
        seen.add(r.tag_name);
        deduped.push(r);
      }
      return deduped.map((r) => ({
        tag: r.tag_name,
        name: r.name || r.tag_name,
        date: r.published_at,
        body: r.body || "",
        prerelease: r.prerelease,
        current: r.tag_name === `v${current}` || r.tag_name === current,
        assets: (r.assets || []).map((a) => ({
          name: a.name,
          url: a.browser_download_url,
          apiUrl: a.url,
          size: a.size,
        })),
      }));
    } catch (err) {
      console.error("Failed to fetch releases:", err.message);
      return [];
    }
  });

  ipcMain.handle("download-update", async (_e, assetApiUrl) => {
    if (!assetApiUrl) return { ok: false, error: "No asset URL provided" };
    try {
      const dest = path.join(app.getPath("temp"), "League-Account-Manager-Setup.exe");
      await downloadFile(assetApiUrl, dest, (p) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("download-progress", p);
        }
      });
      return { ok: true, path: dest };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("install-update", (_e, exePath) => {
    if (exePath && fs.existsSync(exePath)) {
      const child = spawn(exePath, ["/S", "--force-run"], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      app.quit();
    }
  });
}

module.exports = { setupUpdater };
