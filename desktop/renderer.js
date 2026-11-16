document.getElementById("win-minimize").addEventListener("click", () => window.lam.winMinimize());
document.getElementById("win-close").addEventListener("click", () => window.lam.winClose());

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ── Riot Client path ────────────────────────────────────────────────
async function refreshRiotPath() {
  const p = await window.lam.getRiotPath();
  const hint = document.getElementById("riot-path-hint");
  hint.textContent = p ? p : "Not set.";
}

document.getElementById("pick-riot-path").addEventListener("click", async () => {
  const picked = await window.lam.pickRiotPath();
  if (picked) refreshRiotPath();
});

// ── Accounts ────────────────────────────────────────────────────────
async function refreshProfiles() {
  const names = await window.lam.listProfiles();
  const list = document.getElementById("profile-list");
  const empty = document.getElementById("profile-empty");
  list.innerHTML = "";
  empty.style.display = names.length === 0 ? "block" : "none";

  for (const name of names) {
    const row = document.createElement("div");
    row.className = "profile-row";
    row.innerHTML = `
      <span class="profile-name">${escapeHtml(name)}</span>
      <span class="profile-actions">
        <button class="btn small switch-btn">Switch</button>
        <button class="btn small danger delete-btn">Delete</button>
      </span>
    `;
    row.querySelector(".switch-btn").addEventListener("click", async () => {
      row.querySelector(".switch-btn").disabled = true;
      row.querySelector(".switch-btn").textContent = "Switching...";
      const result = await window.lam.switchProfile(name);
      if (!result.ok) alert(result.error || "Failed to switch account.");
      row.querySelector(".switch-btn").disabled = false;
      row.querySelector(".switch-btn").textContent = "Switch";
    });
    row.querySelector(".delete-btn").addEventListener("click", async () => {
      if (!confirm(`Delete saved account "${name}"?`)) return;
      await window.lam.deleteProfile(name);
      refreshProfiles();
    });
    list.appendChild(row);
  }
}

const saveForm = document.getElementById("save-profile-form");
const saveNameInput = document.getElementById("save-profile-name");

document.getElementById("save-profile").addEventListener("click", () => {
  saveForm.style.display = "flex";
  saveNameInput.value = "";
  saveNameInput.focus();
});

document.getElementById("save-profile-cancel").addEventListener("click", () => {
  saveForm.style.display = "none";
});

async function confirmSaveProfile() {
  const name = saveNameInput.value.trim();
  if (!name) return;
  const result = await window.lam.saveProfile(name);
  if (!result.ok) {
    alert(result.error || "Failed to save account.");
    return;
  }
  saveForm.style.display = "none";
  refreshProfiles();
}

document.getElementById("save-profile-confirm").addEventListener("click", confirmSaveProfile);
saveNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") confirmSaveProfile();
  if (e.key === "Escape") { saveForm.style.display = "none"; }
});

// ── Updates ─────────────────────────────────────────────────────────
function compareVersions(a, b) {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

function formatSize(bytes) {
  if (!bytes) return "";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let downloadedPath = "";

async function refreshVersions() {
  const [currentVersion, releases] = await Promise.all([
    window.lam.appVersion(),
    window.lam.getVersions(),
  ]);
  document.getElementById("version-hint").textContent = `Installed: v${currentVersion}`;

  const table = document.getElementById("version-table");
  if (releases.length === 0) {
    table.innerHTML = '<div class="empty">No releases found yet.</div>';
    return;
  }

  const rows = releases.map((r) => {
    const exe = r.assets.find((a) => a.name.endsWith(".exe"));
    const newer = compareVersions(r.tag, currentVersion) > 0;
    const pill = r.current
      ? '<span class="pill ok">installed</span>'
      : newer
        ? '<span class="pill warn">new</span>'
        : "";
    const action = exe && !r.current
      ? `<button class="btn ghost small download-btn" data-url="${exe.apiUrl}">${newer ? "Update" : "Reinstall"} (${formatSize(exe.size)})</button>`
      : "";
    return `<tr><td>${escapeHtml(r.tag)}${pill}</td><td>${(r.date || "").slice(0, 10)}</td><td>${action}</td></tr>`;
  }).join("");

  table.innerHTML = `
    <table>
      <thead><tr><th>Version</th><th>Date</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  table.querySelectorAll(".download-btn").forEach((btn) => {
    btn.addEventListener("click", () => downloadUpdate(btn.dataset.url));
  });
}

async function downloadUpdate(assetApiUrl) {
  const banner = document.getElementById("update-banner");
  banner.innerHTML = '<div class="banner">Downloading... 0%</div>';
  const result = await window.lam.downloadUpdate(assetApiUrl);
  if (!result.ok) {
    banner.innerHTML = `<div class="banner bad">${escapeHtml(result.error || "Download failed.")}</div>`;
    return;
  }
  downloadedPath = result.path;
  banner.innerHTML = `
    <div class="banner ok">
      Download complete.
      <button class="btn small" id="install-btn" style="margin-left:8px">Install and restart</button>
    </div>
  `;
  document.getElementById("install-btn").addEventListener("click", () => {
    window.lam.installUpdate(downloadedPath);
  });
}

window.lam.onDownloadProgress((p) => {
  const banner = document.getElementById("update-banner");
  if (banner.querySelector(".banner")) {
    banner.querySelector(".banner").textContent = `Downloading... ${p.percent}%`;
  }
});

document.getElementById("check-updates").addEventListener("click", refreshVersions);

refreshRiotPath();
refreshProfiles();
refreshVersions();
