import json
import time

new_tab("https://pay.google.com/business/console/products/passes/BCR2DN6D7K2YVRIO")
wait_for_load()
time.sleep(2)

# Open terms dialog
r = js(
    """
const el=[...document.querySelectorAll("*")].find(e=>e.innerText&&e.innerText.trim()==="Build your first pass");
if(!el) return null;
const rect=el.getBoundingClientRect();
return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};
"""
)
if r:
    click_at_xy(r["x"], r["y"])
time.sleep(2)

js(
    """
(function(){
  const cb=document.querySelector('input[type=checkbox]');
  if(cb && !cb.checked) cb.click();
})();
"""
)
time.sleep(0.5)

js(
    """
(function(){
  const btn=[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Continue' && !b.disabled);
  if(btn) btn.click();
})();
"""
)

for i in range(15):
    time.sleep(2)
    info = page_info()
    body = js("return document.body.innerText")
    issuer = js(
        """
const t=document.body.innerText;
const m=t.match(/Issuer ID[^\\d]*(\\d{10,20})/i) || t.match(/(3388\\d{15,})/);
return m ? m[1] || m[0] : null;
"""
    )
    print("poll", i, info["url"], "issuer=", issuer)
    if issuer:
        print("FOUND_ISSUER", issuer)
        break
    if "Google Wallet API Dashboard" in body or "Demo mode" in body:
        print(body[:5000])
        break
    if "Terms of Service" not in body and i > 3:
        print(body[:4000])
        break

print("FINAL_URL", page_info()["url"])
print(js("return document.body.innerText.slice(0,6000)"))
