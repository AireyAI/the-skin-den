# Pay & Wallet signup — JS value setter only (no fill_input / no per-char typing).
import json
import time

new_tab("https://pay.google.com/business/console/home")
wait_for_load()
time.sleep(2)


def set_aria(label, value):
    return js(
        f"""
    (function() {{
      const input = document.querySelector('[aria-label="{label}"]');
      if (!input) return {{ ok: false }};
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, {json.dumps(value)});
      input.dispatchEvent(new Event("input", {{ bubbles: true }}));
      input.dispatchEvent(new Event("change", {{ bubbles: true }}));
      return {{ ok: true, val: input.value }};
    }})()
    """
    )


print("name", set_aria("Enter public business name", "Kettle Kulture"))
# Terms (first checkbox)
js(
    """
const cb = document.querySelectorAll('input[type=checkbox]')[0];
if (cb && !cb.checked) cb.click();
"""
)
time.sleep(0.5)
print("invalid?", js('return document.body.innerText.includes("Invalid business name")'))
js(
    """
[...document.querySelectorAll("button")].find(b => b.innerText.trim() === "Continue")?.click();
"""
)
time.sleep(4)
print(page_info()["url"])
print(js("return document.body.innerText.slice(0,2000)"))
