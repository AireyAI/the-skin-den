# browser-harness -c "$(cat scripts/cloudshell-deploy-wallet-proxy.py)"
import json
import time
from pathlib import Path

SECRET = Path(
    "/Users/kyleairey/aireyai-workspace/trainer-apps/kettle-kulture/platform-api/.wallet-proxy-secret"
).read_text().strip()

new_tab("https://shell.cloud.google.com/?cloudshell=true&project=august-boulder-498017-f3")
wait_for_load()

for i in range(36):
    time.sleep(5)
    ready = js(
        """
(() => {
  const t = document.body.innerText || "";
  const connecting = /Connecting|Provisioning|Loading your Cloud Shell/i.test(t);
  const ta = document.querySelector(".inputarea") || document.querySelector("textarea.xterm-helper-textarea");
  return { connecting, hasTerminal: !!ta };
})();
"""
    )
    print("wait", i, ready)
    if ready.get("hasTerminal") and not ready.get("connecting"):
        break

time.sleep(2)

commands = [
    f"export WALLET_PROXY_SECRET={SECRET}",
    "gcloud config set project august-boulder-498017-f3",
    "gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com walletobjects.googleapis.com iamcredentials.googleapis.com --quiet",
    "rm -rf /tmp/kk-wallet && git clone --depth 1 -b feat/public-website https://github.com/AireyAI/kettle-kulture.git /tmp/kk-wallet",
    "cd /tmp/kk-wallet/platform-api && bash scripts/gcp-deploy-wallet-proxy.sh",
    "gcloud run services describe kk-wallet-proxy --region europe-west2 --format='value(status.url)'",
]

for cmd in commands:
    print("RUN:", cmd[:80], "...")
    js(
        """
(() => {
  const ta = document.querySelector(".inputarea") || document.querySelector("textarea.xterm-helper-textarea");
  if (!ta) return { ok: false };
  ta.focus();
  ta.value = "";
  return { ok: true };
})();
"""
    )
    type_text(cmd)
    press_key("Enter")
    time.sleep(8 if "clone" in cmd or "deploy" in cmd else 3)

# deploy takes ~3-5 min
for i in range(40):
    time.sleep(15)
    tail = js("return document.body.innerText.slice(-3000);")
    print("--- tail", i, "---")
    print(tail[-1200:] if isinstance(tail, str) else tail)
    if isinstance(tail, str) and "https://kk-wallet-proxy" in tail and ".run.app" in tail:
        break
    if isinstance(tail, str) and "Service URL:" in tail:
        break

print("DONE")
