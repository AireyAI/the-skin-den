# browser-harness -c "$(cat scripts/gcp-wallet-sa-gemini-key.py)"
import json
import time

PROJECT = "gen-lang-client-0586371173"
SA_NUM = "113785727973959689045"

new_tab(
    f"https://console.cloud.google.com/iam-admin/serviceaccounts/details/{SA_NUM}/keys?project={PROJECT}"
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
  const c=[...document.querySelectorAll("*")].find(e=>e.innerText&&e.innerText.trim()==="Create new key");
  if(c) c.click();
})();"""
)
time.sleep(1)
js(
    """(() => {
  const jsonOpt=[...document.querySelectorAll("mat-radio-button,label,span")].find(e=>/JSON/i.test(e.innerText||""));
  if(jsonOpt) jsonOpt.click();
})();"""
)
time.sleep(0.5)
print(
    "create",
    js(
        """(() => {
  const btn=[...document.querySelectorAll("button")].find(x=>/^Create$/i.test(x.innerText.trim()));
  if(btn){ btn.click(); return true; }
  return false;
})();"""
    ),
)
time.sleep(5)
print(
    json.dumps(
        js(
            """
return {
  snack:[...document.querySelectorAll(".mat-mdc-snack-bar-label,[role=alert]")].map(e=>e.innerText).filter(Boolean),
  blocked: document.body.innerText.includes("disabled"),
  rows:[...document.querySelectorAll("table tbody tr")].map(r=>r.innerText.replace(/\\s+/g," ").slice(0,180))
};
"""
        )
    )
)
