import { memberPlatformFetch } from "../member-session.js";

export async function fetchGoogleWalletSaveUrl() {
  return memberPlatformFetch("/v1/member/wallet/google");
}

export async function fetchCheckInQr() {
  return memberPlatformFetch("/v1/member/check-in-qr");
}

async function downloadApplePass(btn) {
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = "Opening pass…";
  try {
    const data = await memberPlatformFetch("/v1/member/wallet/apple-link");
    if (!data.url) throw new Error(data.error || "Could not open Apple Wallet");
    window.location.assign(data.url);
    setTimeout(() => {
      btn.textContent = prev;
      btn.disabled = false;
    }, 4000);
  } catch (err) {
    btn.textContent = "Try again";
    btn.disabled = false;
    alert(err.message || "Apple Wallet pass unavailable");
  }
}

export function renderMemberWallet(publicConfig, root) {
  if (!root) return;
  root.replaceChildren();

  const panel = document.createElement("div");
  panel.className = "acct-panel acct-panel--wallet";

  const head = document.createElement("div");
  head.className = "acct-panel-head";
  const title = document.createElement("h2");
  title.className = "acct-subhead acct-subhead--inline";
  title.textContent = "Membership card & check-in";
  head.append(title);
  panel.append(head);

  const lede = document.createElement("p");
  lede.className = "acct-muted";
  lede.textContent =
    "Add your Kettle Kulture membership card to Apple or Google Wallet as soon as you sign in — no payment required. Once you have an active plan, the pass QR works for door check-in (packs deduct one class per scan).";
  panel.append(lede);

  const walletNote = document.createElement("p");
  walletNote.className = "acct-muted acct-wallet-setup-note";
  walletNote.hidden = true;
  panel.append(walletNote);

  const qrWrap = document.createElement("div");
  qrWrap.className = "member-checkin-qr";
  qrWrap.hidden = true;
  const qrImg = document.createElement("img");
  qrImg.className = "member-checkin-qr-img";
  qrImg.alt = "Your check-in QR code";
  qrImg.width = 220;
  qrImg.height = 220;
  const qrMeta = document.createElement("p");
  qrMeta.className = "acct-muted member-checkin-qr-meta";
  qrWrap.append(qrImg, qrMeta);
  panel.append(qrWrap);

  const actions = document.createElement("div");
  actions.className = "member-wallet-actions";

  const gBtn = document.createElement("button");
  gBtn.type = "button";
  gBtn.className = "acct-btn acct-btn--ghost acct-btn--wallet-google";
  gBtn.textContent = "Add to Google Wallet";
  gBtn.addEventListener("click", async () => {
    gBtn.disabled = true;
    gBtn.textContent = "Opening…";
    try {
      const data = await fetchGoogleWalletSaveUrl();
      if (!data.saveUrl) throw new Error(data.error || "Wallet link unavailable");
      window.location.assign(data.saveUrl);
      gBtn.textContent = "Add to Google Wallet";
      gBtn.disabled = false;
    } catch (err) {
      gBtn.textContent = "Try again";
      gBtn.disabled = false;
      alert(err.message || "Could not open Google Wallet");
    }
  });
  if (!publicConfig?.googleWalletEnabled) {
    gBtn.title = "Studio is connecting Google Wallet — tap to try or check back soon.";
  }
  actions.append(gBtn);

  const aBtn = document.createElement("button");
  aBtn.type = "button";
  aBtn.className = "acct-btn acct-btn--ghost acct-btn--wallet-apple";
  aBtn.textContent = "Add to Apple Wallet";
  aBtn.addEventListener("click", () => downloadApplePass(aBtn));
  if (!publicConfig?.appleWalletEnabled) {
    aBtn.title = "Studio is connecting Apple Wallet — tap to try or check back soon.";
  }
  actions.append(aBtn);

  if (!publicConfig?.googleWalletEnabled && !publicConfig?.appleWalletEnabled) {
    walletNote.hidden = false;
    walletNote.textContent =
      "Wallet passes are finishing server setup — you can still tap Add above once connected. Door check-in QR appears here after you have an active plan.";
  }

  panel.append(actions);
  root.append(panel);

  loadCheckInQr(qrWrap, qrImg, qrMeta).catch(() => {
    qrMeta.textContent =
      "Could not load your QR right now — try again in a moment or use Add to Apple Wallet below.";
    qrImg.hidden = true;
    qrImg.removeAttribute("src");
    qrWrap.hidden = false;
  });
}

async function loadCheckInQr(wrap, img, meta) {
  const data = await fetchCheckInQr();
  if (!data.qrUrl) throw new Error("No QR");
  if (!data.qrImage) throw new Error("No QR image");
  img.hidden = false;
  img.onload = () => {
    wrap.hidden = false;
  };
  img.onerror = () => {
    img.hidden = true;
    throw new Error("QR image failed");
  };
  img.src = data.qrImage;
  if (img.complete && img.naturalWidth > 0) wrap.hidden = false;
  if (data.preview && data.message) {
    meta.textContent = data.message;
  } else if (data.unlimited) meta.textContent = `${data.plan || "Member"} — unlimited check-ins`;
  else if (data.classesRemaining != null)
    meta.textContent = `${data.classesRemaining} class${data.classesRemaining === 1 ? "" : "es"} remaining`;
  else meta.textContent = data.plan || "Member";
}
