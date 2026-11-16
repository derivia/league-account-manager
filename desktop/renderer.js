document.getElementById("win-minimize").addEventListener("click", () => window.lam.winMinimize());
document.getElementById("win-close").addEventListener("click", () => window.lam.winClose());

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function banner(el, kind, message) {
  if (!message) { el.innerHTML = ""; return; }
  el.innerHTML = `<div class="banner ${kind}">${escapeHtml(message)}</div>`;
}

function relativeTime(ms) {
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360}, 55%, 55%)`;
}

// ── Riot Client path ────────────────────────────────────────────────
async function refreshRiotPath() {
  const { path: p, autoDetected } = await window.lam.getRiotPath();
  const hint = document.getElementById("riot-path-hint");
  hint.textContent = p ? `${p}${autoDetected ? " (auto-detected)" : ""}` : "Not set.";
}

document.getElementById("pick-riot-path").addEventListener("click", async () => {
  const { path: picked, warning } = await window.lam.pickRiotPath();
  const riotBanner = document.getElementById("riot-banner");
  if (picked) {
    refreshRiotPath();
    banner(riotBanner, "bad", warning);
  }
});

// ── Accounts ────────────────────────────────────────────────────────
let switching = false;

function setListLocked(locked) {
  switching = locked;
  document.querySelectorAll(".switch-btn, .delete-btn, .rename-btn").forEach((b) => {
    b.disabled = locked;
  });
}

async function refreshProfiles() {
  const profiles = await window.lam.listProfiles();
  const list = document.getElementById("profile-list");
  const empty = document.getElementById("profile-empty");
  list.innerHTML = "";
  empty.style.display = profiles.length === 0 ? "block" : "none";

  for (const { name, savedAt, active } of profiles) {
    const row = document.createElement("div");
    row.className = `profile-row${active ? " active" : ""}`;
    row.innerHTML = `
      <span class="profile-main">
        <span class="profile-avatar" style="background:${avatarColor(name)}">${escapeHtml(name[0]?.toUpperCase() || "?")}</span>
        <span class="profile-info">
          <span class="profile-name">${escapeHtml(name)}${active ? '<span class="pill ok">active</span>' : ""}</span>
          <span class="profile-meta">Saved ${relativeTime(savedAt)}</span>
        </span>
      </span>
      <span class="profile-actions">
        <button class="btn ghost small rename-btn">Rename</button>
        <button class="btn small switch-btn" ${active ? "disabled" : ""}>Switch</button>
        <button class="btn small danger delete-btn">Delete</button>
      </span>
    `;

    row.querySelector(".switch-btn").addEventListener("click", async () => {
      if (switching) return;
      setListLocked(true);
      const switchBanner = document.getElementById("switch-banner");
      const result = await window.lam.switchProfile(name);
      setListLocked(false);
      if (!result.ok) {
        banner(switchBanner, "bad", result.error || "Failed to switch account.");
      } else {
        banner(switchBanner, "ok", `Switched to ${name}. Riot Client is launching.`);
        refreshProfiles();
      }
    });

    row.querySelector(".delete-btn").addEventListener("click", () => {
      const actions = row.querySelector(".profile-actions");
      actions.innerHTML = `
        <span class="hint" style="margin:0 6px 0 0">Delete "${escapeHtml(name)}"?</span>
        <button class="btn small danger confirm-delete-btn">Delete</button>
        <button class="btn ghost small cancel-delete-btn">Cancel</button>
      `;
      actions.querySelector(".confirm-delete-btn").addEventListener("click", async () => {
        await window.lam.deleteProfile(name);
        refreshProfiles();
      });
      actions.querySelector(".cancel-delete-btn").addEventListener("click", refreshProfiles);
    });

    row.querySelector(".rename-btn").addEventListener("click", () => {
      const info = row.querySelector(".profile-info");
      info.innerHTML = `
        <input type="text" class="rename-input" value="${escapeHtml(name)}" style="width:140px" />
      `;
      const actions = row.querySelector(".profile-actions");
      actions.innerHTML = `
        <button class="btn small confirm-rename-btn">Save</button>
        <button class="btn ghost small cancel-rename-btn">Cancel</button>
      `;
      const input = info.querySelector(".rename-input");
      input.focus();
      input.select();
      const doRename = async () => {
        const result = await window.lam.renameProfile(name, input.value);
        if (!result.ok) {
          alert(result.error || "Failed to rename account.");
          return;
        }
        refreshProfiles();
      };
      actions.querySelector(".confirm-rename-btn").addEventListener("click", doRename);
      actions.querySelector(".cancel-rename-btn").addEventListener("click", refreshProfiles);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") doRename();
        if (e.key === "Escape") refreshProfiles();
      });
    });

    list.appendChild(row);
  }
}

window.lam.onSwitchProgress((stage) => {
  const labels = { closing: "Closing Riot Client...", copying: "Swapping session...", launching: "Launching Riot Client..." };
  banner(document.getElementById("switch-banner"), "", labels[stage] || stage);
});

const saveForm = document.getElementById("save-profile-form");
const saveNameInput = document.getElementById("save-profile-name");
const overwriteWarning = document.getElementById("save-overwrite-warning");

document.getElementById("save-profile").addEventListener("click", () => {
  saveForm.style.display = "flex";
  overwriteWarning.style.display = "none";
  saveNameInput.value = "";
  saveNameInput.focus();
});

document.getElementById("save-profile-cancel").addEventListener("click", () => {
  saveForm.style.display = "none";
  overwriteWarning.style.display = "none";
});

async function confirmSaveProfile() {
  const name = saveNameInput.value.trim();
  if (!name) return;

  if (overwriteWarning.dataset.confirmedFor !== name && await window.lam.profileExists(name)) {
    overwriteWarning.textContent = `"${name}" already exists. Saving will overwrite it and the old session can't be recovered without logging in again. Click Save again to confirm.`;
    overwriteWarning.style.display = "block";
    overwriteWarning.dataset.confirmedFor = name;
    return;
  }

  overwriteWarning.style.display = "none";
  overwriteWarning.dataset.confirmedFor = "";
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
  if (e.key === "Escape") { saveForm.style.display = "none"; overwriteWarning.style.display = "none"; }
});
saveNameInput.addEventListener("input", () => {
  overwriteWarning.dataset.confirmedFor = "";
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
