import json
import time

new_tab("https://console.cloud.google.com/iam-admin/iam?project=august-boulder-498017-f3")
wait_for_load()
time.sleep(2)

js(
    """
(function(){
  const grant=[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Grant access');
  if(grant) grant.click();
})();
"""
)
time.sleep(2)

SA = "kk-wallet-pass@august-boulder-498017-f3.iam.gserviceaccount.com"

# New principals field — often textarea or input
js(
    f"""
(function(){{
  const inputs=[...document.querySelectorAll('input, textarea')];
  const field=inputs.find(i=>i.getAttribute('aria-label')&&i.getAttribute('aria-label').includes('principals')) 
    || inputs.find(i=>i.placeholder&&/principal/i.test(i.placeholder))
    || inputs.find(i=>i.getAttribute('formcontrolname')==='principal');
  if(!field) return {{ok:false, count:inputs.length}};
  const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  setter.call(field, {json.dumps(SA)});
  field.dispatchEvent(new Event('input',{{bubbles:true}}));
  return {{ok:true, val:field.value}};
}})()
"""
)
time.sleep(1)

# Open role dropdown — click Select a role
js(
    """
(function(){
  const sel=[...document.querySelectorAll('*')].find(e=>e.innerText&&e.innerText.trim()==='Select a role');
  if(sel) sel.click();
})();
"""
)
time.sleep(1)

js(
    """
(function(){
  const filter=document.querySelector('input[placeholder*="Filter"], input[aria-label*="Filter"]');
  if(filter){
    const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    setter.call(filter,'wallet');
    filter.dispatchEvent(new Event('input',{bubbles:true}));
  }
})();
"""
)
time.sleep(1)
print(json.dumps(js("return document.body.innerText.match(/wallet[^\\n]{0,60}/gi)")))
print(js("return document.body.innerText.slice(0,2500)"))
