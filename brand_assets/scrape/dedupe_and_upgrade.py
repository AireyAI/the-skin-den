"""Dedupe FB CDN URLs by file ID, prefer hi-res, generate stripped URLs for upgrade."""
import json
import re
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

with open("/Users/kyleairey/AireyAi_projects/the-skin-den/brand_assets/scrape/fb_photo_urls.json") as f:
    imgs = json.load(f)

# Group by file ID (the numeric portion before .jpg/.png)
groups = {}
for img in imgs:
    src = img["src"]
    # Extract filename like 530465494_122118155594935999_4431123627280585865_n.jpg
    m = re.search(r"/([^/]+\.(jpg|jpeg|png|webp))(\?|$)", src)
    if not m:
        continue
    filename = m.group(1)
    # File ID is the first numeric segment
    file_id_m = re.match(r"(\d+)_(\d+)", filename)
    if not file_id_m:
        continue
    fid = f"{file_id_m.group(1)}_{file_id_m.group(2)}"
    if fid not in groups:
        groups[fid] = []
    groups[fid].append(img)

print(f"Unique file IDs: {len(groups)}")

# For each group, pick the largest, and also produce a stripped-stp URL for hi-res attempt
deduped = []
for fid, items in groups.items():
    # sort by area desc
    items.sort(key=lambda x: x["w"] * x["h"], reverse=True)
    best = items[0]
    src = best["src"]
    # Try to strip the stp= param (FB sizing)
    parsed = urlparse(src)
    qs = parse_qs(parsed.query)
    qs.pop("stp", None)
    new_query = urlencode({k: v[0] for k, v in qs.items()})
    stripped_url = urlunparse(parsed._replace(query=new_query))
    deduped.append({
        "file_id": fid,
        "thumb_url": src,
        "hires_url": stripped_url,
        "thumb_w": best["w"],
        "thumb_h": best["h"],
    })

# Sort by file_id desc (newer first, typically)
deduped.sort(key=lambda x: x["file_id"], reverse=True)

with open("/Users/kyleairey/AireyAi_projects/the-skin-den/brand_assets/scrape/fb_deduped.json", "w") as f:
    json.dump(deduped, f, indent=2)

print(f"Deduped: {len(deduped)} unique images")
print(f"Sample hires URL: {deduped[0]['hires_url'][:160]}")
