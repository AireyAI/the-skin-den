import { getMemberToken, fetchMemberProfile, memberPlatformFetch } from "../member-session.js";

export async function fetchMemberBilling() {
  return memberPlatformFetch("/v1/member/billing");
}

export async function openBillingPortal() {
  const { url } = await memberPlatformFetch("/v1/member/billing/portal", { method: "POST", body: "{}" });
  if (url) window.location.href = url;
}

export function renderMemberBilling(data, root) {
  if (!root) return;
  root.replaceChildren();

  const panel = document.createElement("div");
  panel.className = "acct-panel acct-panel--billing";

  const head = document.createElement("div");
  head.className = "acct-panel-head";
  const title = document.createElement("h2");
  title.className = "acct-subhead acct-subhead--inline";
  title.textContent = "Billing";
  head.append(title);
  panel.append(head);

  const msg = document.createElement("p");
  msg.className = "acct-muted";
  msg.textContent = data?.message || "Payment details appear here after your first online purchase.";
  panel.append(msg);

  if (data?.paymentFailed) {
    const warn = document.createElement("p");
    warn.className = "member-billing-warn";
    warn.textContent = "Payment failed — update your card to keep your membership active.";
    panel.append(warn);
  }

  if (data?.portalAvailable) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "acct-btn acct-btn--ghost acct-btn--billing";
    btn.textContent = "Manage billing & invoices";
    btn.addEventListener("click", () => {
      btn.disabled = true;
      openBillingPortal().catch((err) => {
        btn.disabled = false;
        alert(err.message || "Could not open billing page.");
      });
    });
    panel.append(btn);
  } else if (getMemberToken()) {
    const link = document.createElement("a");
    link.className = "acct-link";
    link.href = "../pricing.html";
    link.textContent = "Buy a pack or membership";
    panel.append(link);
  }

  root.append(panel);
}

export async function startProductCheckout(productId, customer) {
  return memberPlatformFetch("/v1/public/memberships/checkout", {
    method: "POST",
    body: JSON.stringify({
      productId,
      email: customer.email,
      name: customer.name
    })
  });
}

export async function loadPublicProducts() {
  const url = (window.KK_PLATFORM_API || "").replace(/\/$/, "");
  if (!url) return [];
  const res = await fetch(`${url}/v1/public/products`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.products || [];
}

export async function buyProduct(productId) {
  let email = "";
  let name = "";
  if (getMemberToken()) {
    const profile = await fetchMemberProfile();
    email = profile.user?.email || "";
    name = profile.user?.name || profile.user?.email || "";
    const data = await startProductCheckout(productId, { email, name });
    if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    else throw new Error("Checkout could not be started.");
    return;
  }
  email = window.prompt("Your email (for receipt and membership link):")?.trim() || "";
  if (!email) return;
  name = window.prompt("Your name:")?.trim() || email.split("@")[0];
  const data = await startProductCheckout(productId, { email, name });
  if (data.checkoutUrl) window.location.href = data.checkoutUrl;
  else throw new Error("Checkout could not be started.");
}

export function wirePricingBuyButtons() {
  document.querySelectorAll("[data-buy-product]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-buy-product");
      btn.disabled = true;
      buyProduct(id)
        .catch((err) => alert(err.message || "Checkout failed."))
        .finally(() => {
          btn.disabled = false;
        });
    });
  });
}

export async function hydratePricingFromApi() {
  const products = await loadPublicProducts();
  for (const p of products) {
    const card = document.querySelector(`[data-package-id="${p.id}"]`);
    if (!card) continue;
    const priceEl = card.querySelector("[data-package-price]");
    const statusEl = card.querySelector(".price-status");
    const buyBtn = card.querySelector("[data-buy-product]");
    if (priceEl) priceEl.textContent = p.priceLabel || "";
    if (statusEl) statusEl.hidden = true;
    if (buyBtn) buyBtn.hidden = false;
  }
}
