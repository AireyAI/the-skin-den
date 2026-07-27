import { postAdminCheckIn, fetchCheckIns, fetchUnlinked, linkMembership } from "./api.js";

let els = {};
let stream = null;
let scanTimer = null;
let lastScanned = "";

export function initCheckinPanel() {
  els = {
    panel: document.getElementById("panel-checkin"),
    video: document.getElementById("checkin-video"),
    canvas: document.getElementById("checkin-canvas"),
    status: document.getElementById("checkin-status"),
    result: document.getElementById("checkin-result"),
    manualInput: document.getElementById("checkin-manual"),
    manualBtn: document.getElementById("checkin-manual-btn"),
    startBtn: document.getElementById("checkin-start-camera"),
    stopBtn: document.getElementById("checkin-stop-camera"),
    recentBody: document.getElementById("checkin-recent-body"),
    unlinkedBody: document.getElementById("checkin-unlinked-body"),
    unlinkedStatus: document.getElementById("checkin-unlinked-status")
  };

  els.startBtn?.addEventListener("click", () => startCamera());
  els.stopBtn?.addEventListener("click", () => stopCamera());
  els.manualBtn?.addEventListener("click", () => submitScan(els.manualInput?.value));
  els.manualInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitScan(els.manualInput.value);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopCamera();
  });
}

export function showCheckinPanel() {
  refreshRecent();
  refreshUnlinked();
  if (!stream && els.startBtn && !els.startBtn.disabled) {
    startCamera().catch(() => {
      setStatus("Camera unavailable — paste a QR URL or token below.");
    });
  }
}

function setStatus(msg) {
  if (els.status) els.status.textContent = msg;
}

function setResult(lines, ok) {
  if (!els.result) return;
  els.result.hidden = false;
  els.result.classList.toggle("checkin-result--ok", !!ok);
  els.result.classList.toggle("checkin-result--err", ok === false);
  els.result.replaceChildren();
  for (const line of lines) {
    const p = document.createElement("p");
    if (line.strong) {
      const strong = document.createElement("strong");
      strong.textContent = line.strong;
      p.append(strong);
      if (line.rest) p.append(document.createTextNode(line.rest));
    } else {
      p.textContent = line.text || "";
    }
    if (line.className) p.className = line.className;
    els.result.append(p);
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("No camera API");
  stopCamera();
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false
  });
  if (els.video) {
    els.video.srcObject = stream;
    await els.video.play();
  }
  els.startBtn.hidden = true;
  els.stopBtn.hidden = false;
  setStatus("Point at the member’s wallet QR…");
  await loadJsQr();
  scanLoop();
}

function stopCamera() {
  if (scanTimer) {
    cancelAnimationFrame(scanTimer);
    scanTimer = null;
  }
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (els.video) els.video.srcObject = null;
  if (els.startBtn) els.startBtn.hidden = false;
  if (els.stopBtn) els.stopBtn.hidden = true;
}

let jsQrPromise;
function loadJsQr() {
  if (window.jsQR) return Promise.resolve();
  if (!jsQrPromise) {
    jsQrPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Could not load QR scanner"));
      document.head.appendChild(s);
    });
  }
  return jsQrPromise;
}

function scanLoop() {
  if (!stream || !els.video || !els.canvas) return;
  const v = els.video;
  const c = els.canvas;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const tick = () => {
    if (!stream) return;
    if (v.readyState === v.HAVE_ENOUGH_DATA) {
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const img = ctx.getImageData(0, 0, c.width, c.height);
      const code = window.jsQR?.(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
      if (code?.data && code.data !== lastScanned) {
        lastScanned = code.data;
        submitScan(code.data);
        setTimeout(() => {
          lastScanned = "";
        }, 4000);
      }
    }
    scanTimer = requestAnimationFrame(tick);
  };
  scanTimer = requestAnimationFrame(tick);
}

async function submitScan(raw, { override = false } = {}) {
  const payload = (raw || "").trim();
  if (!payload) return;
  setStatus(override ? "Overriding…" : "Scanning…");
  try {
    const data = await postAdminCheckIn(payload, { override });
    const m = data.member;
    const creditsLine =
      m?.packCredits != null
        ? { text: `${m.packCredits} classes left`, className: "checkin-result-meta" }
        : { text: "Unlimited plan", className: "checkin-result-meta" };
    const lines = [
      { strong: m?.name || "Member", className: "checkin-result-name" },
      { text: data.message || "Checked in" },
      creditsLine
    ];
    if (data.warning) lines.push({ text: data.warning, className: "checkin-result-meta" });
    setResult(lines, true);
    setStatus(data.alreadyCheckedIn ? "Duplicate scan (no extra deduction)." : "Success.");
    if (els.manualInput) els.manualInput.value = "";
    refreshRecent();
  } catch (err) {
    // A refused member is a decision for the coach standing there, not a dead end —
    // the override is recorded against them in the check-in log.
    if (err.canOverride && !override) {
      const who = err.member?.name ? `${err.member.name}: ` : "";
      if (confirm(`${who}${err.message}\n\nLet them in anyway? This is recorded.`)) {
        await submitScan(payload, { override: true });
        return;
      }
    }
    setResult([{ text: err.message || "Scan failed" }], false);
    setStatus("Scan failed — try again.");
  }
}

export async function refreshRecent() {
  if (!els.recentBody || !window.KK_ADMIN_API_BASE) return;
  try {
    const { checkIns } = await fetchCheckIns();
    els.recentBody.replaceChildren();
    for (const row of checkIns || []) {
      const tr = document.createElement("tr");
      const cells = [
        row.memberName || row.memberId,
        row.scannedAt?.slice(0, 16).replace("T", " ") || "",
        row.deducted ? "−1 class" : "—",
        row.creditsAfter != null ? String(row.creditsAfter) : "—",
        row.refused ? "Refused" : row.overridden ? "Override" : "OK"
      ];
      for (const text of cells) {
        const td = document.createElement("td");
        td.textContent = text;
        tr.append(td);
      }
      if (row.refused) tr.classList.add("is-refused");
      els.recentBody.appendChild(tr);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Memberships with no login attached. Before this existed the door said "link them in
 * admin" and there was nothing in admin to do it with.
 */
export async function refreshUnlinked() {
  if (!els.unlinkedBody || !window.KK_ADMIN_API_BASE) return;
  try {
    const { unclaimedMemberships } = await fetchUnlinked();
    els.unlinkedBody.replaceChildren();
    if (!unclaimedMemberships?.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 4;
      td.textContent = "Every membership is linked to an account.";
      tr.append(td);
      els.unlinkedBody.append(tr);
      return;
    }
    for (const m of unclaimedMemberships) {
      els.unlinkedBody.append(unlinkedRow(m));
    }
  } catch {
    /* the panel still works without this list */
  }
}

function unlinkedRow(m) {
  const tr = document.createElement("tr");
  for (const text of [m.name || m.memberId, m.email, m.plan || "—"]) {
    const td = document.createElement("td");
    td.textContent = text;
    tr.append(td);
  }

  const actionCell = document.createElement("td");
  const row = document.createElement("div");
  row.className = "checkin-manual-row";
  const input = document.createElement("input");
  input.type = "email";
  input.className = "schedule-meta-input";
  input.placeholder = m.email || "account email";
  input.autocomplete = "off";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn--ghost btn--sm";
  btn.textContent = "Link";
  btn.addEventListener("click", async () => {
    const email = (input.value || m.email || "").trim();
    if (!email) return;
    btn.disabled = true;
    try {
      await linkMembership(m.memberId, email);
      setUnlinkedStatus(`Linked ${m.name || m.memberId} to ${email}.`);
      refreshUnlinked();
    } catch (err) {
      setUnlinkedStatus(err.message || "Could not link that account.");
      btn.disabled = false;
    }
  });
  row.append(input, btn);
  actionCell.append(row);
  tr.append(actionCell);
  return tr;
}

function setUnlinkedStatus(msg) {
  if (els.unlinkedStatus) els.unlinkedStatus.textContent = msg;
}

export function teardownCheckinPanel() {
  stopCamera();
}
