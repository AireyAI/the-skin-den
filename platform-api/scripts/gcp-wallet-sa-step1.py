# Run: browser-harness -c "$(cat scripts/gcp-wallet-sa-step1.py)"
import json
import time

new_tab(
    "https://console.cloud.google.com/iam-admin/serviceaccounts/create?project=august-boulder-498017-f3"
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
time.sleep(1.2)
print("accountId", set_fc("accountId", "kk-wallet-pass"))
print("desc", set_fc("description", "Google Wallet membership passes"))
print(
    "verify",
    js(
        """
return ["displayName","accountId","description"].map(n=>{
  const i=document.querySelector(`input[formcontrolname="${n}"]`);
  return {n, val:i&&i.value};
});
"""
    ),
)
js(
    """
const b=[...document.querySelectorAll("button")].find(x=>x.innerText.trim()==="Create and continue");
if(b) b.click();
"""
)
time.sleep(3)
print("step2", js("return document.body.innerText.slice(0,2000)"))
