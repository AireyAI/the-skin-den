# browser-harness -c "$(cat scripts/gcp-wallet-pay-invite-dev.py)"
import json
import time

new_tab("https://pay.google.com/business/console/users/BCR2DN6D7K2YVRIO")
wait_for_load()
time.sleep(3)
js(
    """
(() => {
  const inv=[...document.querySelectorAll("button")].find(x=>(x.innerText||"").includes("Invite a user"));
  if(inv) inv.click();
})();
"""
)
time.sleep(2)
email = "kk-wallet-pass@august-boulder-498017-f3.iam.gserviceaccount.com"
print(
    "email",
    js(
        f"""
(() => {{
  const inputs=[...document.querySelectorAll("input")].filter(i=>i.offsetParent);
  const input=inputs.find(i=>i.type!=="search")||inputs[0];
  if(!input) return {{ok:false}};
  const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;
  setter.call(input, {json.dumps(email)});
  input.dispatchEvent(new Event("input",{{bubbles:true}}));
  return {{ok:true, val:input.value}};
}})();
"""
    ),
)
time.sleep(1)
js(
    """
(() => {
  const dev=[...document.querySelectorAll("*")].find(e=>e.innerText&&/^Developer$/i.test(e.innerText.trim()));
  if(dev) dev.click();
})();
"""
)
time.sleep(1)
print(
    "submit",
    js(
        """
(() => {
  const b=[...document.querySelectorAll("button")].find(x=>/Send invite|Invite|Save/i.test(x.innerText||""));
  if(b){ b.click(); return b.innerText; }
  return null;
})();
"""
    ),
)
time.sleep(3)
print(json.dumps(js("return document.body.innerText.slice(0,1800)")))
