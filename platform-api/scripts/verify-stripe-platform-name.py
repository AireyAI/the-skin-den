#!/usr/bin/env python3
"""Verify Stripe platform display name (no secrets printed)."""
import json, os, urllib.request

path = os.path.expanduser("~/.aireyai-secrets/stripe.env")
key = open(path).read().split("=", 1)[1].strip().strip('"')
with urllib.request.urlopen(
    urllib.request.Request(
        "https://api.stripe.com/v1/account",
        headers={"Authorization": f"Bearer {key}"},
    ),
    timeout=30,
) as r:
    a = json.loads(r.read())
print("display_name:", a.get("settings", {}).get("dashboard", {}).get("display_name"))
print("business_profile.name:", (a.get("business_profile") or {}).get("name"))
print("statement_descriptor:", (a.get("settings", {}).get("payments") or {}).get("statement_descriptor"))
