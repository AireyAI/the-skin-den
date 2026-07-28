# browser-harness -c "$(cat scripts/cloudshell-sa-key.py)"
import json
import time

new_tab("https://shell.cloud.google.com/?cloudshell=true&project=august-boulder-498017-f3")
wait_for_load()

for i in range(30):
    time.sleep(4)
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
    print("wait", i, ready, flush=True)
    if ready.get("hasTerminal") and not ready.get("connecting"):
        break

cmd = (
    "gcloud config set project august-boulder-498017-f3 && "
    "gcloud iam service-accounts keys create /tmp/kk-wallet-key.json "
    "--iam-account=kk-wallet-pass@august-boulder-498017-f3.iam.gserviceaccount.com 2>&1; "
    "echo '---KEY-B64-START---'; base64 -w0 /tmp/kk-wallet-key.json 2>/dev/null || base64 /tmp/kk-wallet-key.json; "
    "echo '---KEY-B64-END---'"
)
type_text(cmd)
press_key("Enter")
time.sleep(25)
text = js("return document.body.innerText;")
print("SHELL_TAIL", (text or "")[-4000:], flush=True)
