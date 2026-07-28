# Run: browser-harness -c "$(cat platform-api/scripts/stripe-clockwork-branding.harness.py)"
import json

BRAND = "Clockwork Booking"


def set_by_name(name, text):
    return js(f"""
(function() {{
  const el = document.querySelector('[name="{name}"]');
  if (!el) return {{ ok: false, name: "{name}" }};
  el.focus();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, {json.dumps(text)});
  el.dispatchEvent(new Event("input", {{ bubbles: true }}));
  el.dispatchEvent(new Event("change", {{ bubbles: true }}));
  return {{ ok: true, value: el.value }};
}})()
""")


def click_save():
    return js("""
(function() {
  const b = [...document.querySelectorAll("button")].find(x => /save changes|^save$|update|done/i.test(x.innerText.trim()));
  if (b) { b.click(); return b.innerText.trim(); }
  return null;
})()
""")


new_tab("https://dashboard.stripe.com/acct_1TKbkTFYvcCrQjCO/settings/business-details")
wait_for_load(6000)

open1 = js("""
(function() {
  const pub = [...document.querySelectorAll("*")].find(e => e.textContent === "Public details");
  if (!pub) return "no public section";
  let el = pub;
  for (let i = 0; i < 50; i++) {
    el = el.parentElement;
    if (!el) break;
    const edit = [...el.querySelectorAll("button,a")].find(e => e.textContent.trim() === "Edit");
    if (edit) { edit.click(); return "clicked"; }
  }
  return "no edit";
})()
""")
print("open public:", open1)
wait_for_load(4000)
print("name:", set_by_name("business_profile[name]", BRAND))
print("url:", set_by_name("business_profile[url]", ""))
print("save1:", click_save())
wait_for_load(8000)

open2 = js("""
(function() {
  const labels = [...document.querySelectorAll("*")].filter(e => e.textContent?.trim() === "Statement descriptor" && e.children.length === 0);
  for (const t of labels) {
    let p = t.parentElement;
    for (let i = 0; i < 10; i++) {
      const edits = [...(p?.querySelectorAll("button,a") || [])].filter(e => e.textContent.trim() === "Edit");
      if (edits.length) { edits[edits.length - 1].click(); return "clicked"; }
      p = p?.parentElement;
    }
  }
  return "fail";
})()
""")
print("open stmt:", open2)
wait_for_load(3000)
stmt = js("""
(function() {
  const el = [...document.querySelectorAll("input")].find(i => i.name && i.name.includes("statement_descriptor"));
  if (!el) return { ok: false };
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, "CLOCKWORK");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true, value: el.value, name: el.name };
})()
""")
print("stmt:", stmt)
print("save2:", click_save())
wait_for_load(8000)
print("UI verify:", js("""
return {
  businessName: (document.body.innerText.match(/Business name\\n([^\\n]+)/) || [])[1],
  stmt: (document.body.innerText.match(/Statement descriptor\\nEdit\\n([^\\n]+)/) || [])[1]
};
"""))
