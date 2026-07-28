import time

js(
    """
const b=[...document.querySelectorAll("button")].find(x=>x.innerText.trim()==="Done");
if(b) b.click();
"""
)
time.sleep(2)
new_tab(
    "https://console.cloud.google.com/iam-admin/serviceaccounts/details/100000000000000000000/keys?project=august-boulder-498017-f3"
)
