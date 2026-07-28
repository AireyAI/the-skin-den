# Run: browser-harness -c "$(cat scripts/gcp-wallet-sa-gemini.py)"
import json
import time

PROJECT = "gen-lang-client-0586371173"
new_tab(
    f"https://console.cloud.google.com/iam-admin/serviceaccounts/create?project={PROJECT}"
)
wait_for_load()
time.sleep(2)


def set_fc(name, value):
    return js(
        f"""
    (function() {{
      const input = document.querySelector('input[formcontrolname="{name}"]');
      if (!input) return {{ ok: false }};
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, {json.dumps(value)});
      input.dispatchEvent(new Event("input", {{ bubbles: true }}));
      input.dispatchEvent(new Event("change", {{ bubbles: true }}));
      return {{ ok: true, val: input.value }};
    }})()
    """
    )


print("display", set_fc("displayName", "Kettle Kulture Wallet"))
time.sleep(1)
print("accountId", set_fc("accountId", "kk-wallet-pass"))
print("desc", set_fc("description", "Google Wallet membership passes for Kettle Kulture"))
js(
    """
const b=[...document.querySelectorAll("button")].find(x=>x.innerText.trim()==="Create and continue");
if(b) b.click();
"""
)
time.sleep(3)
js(
    """
(() => {
  const done=[...document.querySelectorAll("button")].find(x=>x.innerText.trim()==="Done");
  if(done) done.click();
})();
"""
)
time.sleep(2)
print(
    json.dumps(
        js(
            """
return [...document.querySelectorAll("table tr, mat-row")].slice(0,5).map(r=>r.innerText.replace(/\\s+/g," ").slice(0,200));
"""
        )
    )
)
