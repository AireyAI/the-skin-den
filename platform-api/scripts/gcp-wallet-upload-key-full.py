# Run: browser-harness -c "$(cat scripts/gcp-wallet-upload-key-full.py)"
import json
import time

new_tab(
    "https://console.cloud.google.com/iam-admin/serviceaccounts/details/103994218498079629429/keys?project=august-boulder-498017-f3"
)
wait_for_load()
time.sleep(3)
js(
    """(() => {
  const ok=[...document.querySelectorAll("button")].find(b=>/OK, got it/i.test(b.innerText));
  if(ok) ok.click();
})();"""
)
time.sleep(1)
js(
    """(() => {
  const add=[...document.querySelectorAll("button")].find(b=>/^Add key$/i.test(b.innerText.trim()));
  if(add) add.click();
})();"""
)
time.sleep(1)
js(
    """(() => {
  const u=[...document.querySelectorAll("*")].find(e=>e.innerText&&e.innerText.trim()==="Upload existing key");
  if(u) u.click();
})();"""
)
time.sleep(2)

pub = open(
    "/Users/kyleairey/aireyai-workspace/trainer-apps/kettle-kulture/platform-api/.wallet-keygen/cert.pem"
).read()

js(
    """
(() => {
  const paste=[...document.querySelectorAll("*")].find(e=>e.innerText&&e.innerText.trim()==="Paste existing key");
  if(paste) paste.click();
})();
"""
)
time.sleep(0.5)
print(
    "paste",
    js(
        f"""
(() => {{
  const ta=document.querySelector("textarea");
  if(!ta) return {{ok:false}};
  const setter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,"value").set;
  setter.call(ta, {json.dumps(pub)});
  ta.dispatchEvent(new Event("input",{{bubbles:true}}));
  ta.dispatchEvent(new Event("change",{{bubbles:true}}));
  return {{ok:true, len:ta.value.length}};
}})();
"""
    ),
)
time.sleep(0.5)
print(
    "upload",
    js(
        """
(() => {
  const b=[...document.querySelectorAll("button")].find(x=>/^Upload$/i.test(x.innerText.trim()));
  if(b){ b.click(); return true; }
  return false;
})();
"""
    ),
)
time.sleep(5)
print(
    json.dumps(
        js(
            """
return {
  snack:[...document.querySelectorAll(".mat-mdc-snack-bar-label, [role=alert], .cfc-alert-content")].map(e=>e.innerText).filter(Boolean),
  disabled: document.body.innerText.includes("Service account key creation is disabled"),
  table: [...document.querySelectorAll("table tbody tr, mat-row")].slice(0,8).map(r=>r.innerText.replace(/\\s+/g," ").slice(0,220))
};
"""
        )
    )
)
