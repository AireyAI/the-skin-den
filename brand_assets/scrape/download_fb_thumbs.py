"""Bulk-download FB thumbnail URLs in parallel with rate limiting + proper headers."""
import json
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlparse

OUT_DIR = "/Users/kyleairey/AireyAi_projects/the-skin-den/brand_assets/photos"
os.makedirs(OUT_DIR, exist_ok=True)

with open("/Users/kyleairey/AireyAi_projects/the-skin-den/brand_assets/scrape/fb_deduped.json") as f:
    items = json.load(f)

HEADERS = [
    "-A", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "-H", "Referer: https://www.facebook.com/",
    "-H", "Accept: image/webp,image/png,image/*,*/*;q=0.8",
    "-H", "Accept-Language: en-GB,en;q=0.9",
]

def download(item):
    url = item["thumb_url"]
    fid = item["file_id"]
    # Guess extension from URL
    ext = ".jpg"
    parsed = urlparse(url)
    if ".png" in parsed.path:
        ext = ".png"
    elif ".webp" in parsed.path:
        ext = ".webp"
    out_path = f"{OUT_DIR}/fb_{fid}{ext}"
    if os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
        return ("skip", fid, os.path.getsize(out_path))
    cmd = ["curl", "-sL", "--max-time", "8", "-o", out_path] + HEADERS + [url]
    r = subprocess.run(cmd, capture_output=True, timeout=15)
    if r.returncode != 0:
        return ("fail-curl", fid, r.returncode)
    size = os.path.getsize(out_path) if os.path.exists(out_path) else 0
    if size < 1000:
        # likely 0-byte or HTML error response
        if os.path.exists(out_path):
            os.remove(out_path)
        return ("fail-empty", fid, size)
    return ("ok", fid, size)

results = {"ok": 0, "skip": 0, "fail-curl": 0, "fail-empty": 0}
with ThreadPoolExecutor(max_workers=8) as ex:
    futures = [ex.submit(download, item) for item in items]
    for fut in as_completed(futures):
        status, fid, info = fut.result()
        results[status] = results.get(status, 0) + 1

print(f"Results: {results}")
print(f"Saved to {OUT_DIR}")
print(f"Total files: {len([f for f in os.listdir(OUT_DIR) if f.startswith('fb_')])}")
