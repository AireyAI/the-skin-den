#!/usr/bin/env python3
"""
Apple Wallet store-card assets — pixel layout (design at @2x, export @1x/@2x/@3x).

Strip: Higgsfield hero (375:123) scaled to Apple strip slots; pass background matches strip edges.
"""
from __future__ import annotations

import json
import statistics
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
STRIP_MASTER = ROOT / "brand_assets" / "wallet" / "kettle-kulture-wallet-strip-hero-master.png"
LOGO = ROOT / "website" / "assets" / "brand" / "kettle-kulture-logo.png"
if not LOGO.exists():
    LOGO = ROOT / "brand_assets" / "kettle-kulture-logo.png"

OUT = Path(__file__).resolve().parents[1] / "pass-template.pass"
WEB = ROOT / "website" / "assets" / "wallet"
PASS_JSON = OUT / "pass.json"

STRIP_W_2X, STRIP_H_2X = 750, 246
STRIP_W_3X, STRIP_H_3X = 1125, 369
STRIP_W_1X, STRIP_H_1X = 375, 123

V2 = ROOT / "brand_assets" / "wallet" / "kettle-kulture-apple-wallet-higgsfield-v2.png"


def _sample_pass_background(im: Image.Image) -> tuple[int, int, int]:
    px = im.convert("RGB")
    w, h = px.size
    samples: list[tuple[int, int, int]] = []
    for x in range(0, w, max(1, w // 48)):
        samples.append(px.getpixel((x, h - 1)))
        samples.append(px.getpixel((x, 0)))
    for y in range(0, h, max(1, h // 24)):
        samples.append(px.getpixel((0, y)))
        samples.append(px.getpixel((w - 1, y)))
    return (
        int(statistics.mean(p[0] for p in samples)),
        int(statistics.mean(p[1] for p in samples)),
        int(statistics.mean(p[2] for p in samples)),
    )


STRIP_INSET_SCALE = 0.96  # ~4% margin — Wallet clips strip edges


def _strip_at(width: int, height: int, pass_bg: tuple[int, int, int]) -> Image.Image:
    if STRIP_MASTER.exists():
        src = Image.open(STRIP_MASTER).convert("RGB")
        tw = max(1, int(width * STRIP_INSET_SCALE))
        th = max(1, int(height * STRIP_INSET_SCALE))
        art = src.resize((tw, th), Image.Resampling.LANCZOS)
        im = Image.new("RGB", (width, height), pass_bg)
        im.paste(art, ((width - tw) // 2, (height - th) // 2))
        px = im.load()
        blend_rows = min(4, height)
        for y in range(height - blend_rows, height):
            t = (y - (height - blend_rows) + 1) / blend_rows
            for x in range(width):
                r, g, b = px[x, y]
                px[x, y] = (
                    int(r * (1 - t) + pass_bg[0] * t),
                    int(g * (1 - t) + pass_bg[1] * t),
                    int(b * (1 - t) + pass_bg[2] * t),
                )
        return im
    if not V2.exists():
        raise SystemExit(f"Missing strip art: {STRIP_MASTER} or {V2}")
    return Image.open(V2).convert("RGB").resize((width, height), Image.Resampling.LANCZOS)


def _logo_tight(max_px: int) -> Image.Image:
    mark = Image.open(LOGO).convert("RGBA")
    mark.thumbnail((max_px, max_px), Image.Resampling.LANCZOS)
    return mark


def _icon(size: int) -> Image.Image:
    mark = Image.open(LOGO).convert("RGBA")
    mark.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    return canvas.convert("RGB")


def _hero_google(strip_rgb: Image.Image, pass_bg: tuple[int, int, int]) -> Image.Image:
    strip = strip_rgb.resize((1200, int(1200 * STRIP_H_2X / STRIP_W_2X)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (1200, 400), pass_bg)
    y = (400 - strip.height) // 2
    canvas.paste(strip, (0, max(0, y)))
    return canvas


def _update_pass_json(pass_bg: tuple[int, int, int]) -> None:
    if not PASS_JSON.exists():
        return
    data = json.loads(PASS_JSON.read_text())
    data["backgroundColor"] = f"rgb({pass_bg[0]}, {pass_bg[1]}, {pass_bg[2]})"
    PASS_JSON.write_text(json.dumps(data, indent=2) + "\n")


def main() -> None:
    if not STRIP_MASTER.exists() and not V2.exists():
        raise SystemExit(f"Missing strip: {STRIP_MASTER}")
    if not LOGO.exists():
        raise SystemExit(f"Missing logo: {LOGO}")

    preview = Image.open(STRIP_MASTER if STRIP_MASTER.exists() else V2).convert("RGB")
    preview = preview.resize((STRIP_W_3X, STRIP_H_3X), Image.Resampling.LANCZOS)
    pass_bg = _sample_pass_background(preview)

    OUT.mkdir(parents=True, exist_ok=True)
    WEB.mkdir(parents=True, exist_ok=True)

    strip_3x = _strip_at(STRIP_W_3X, STRIP_H_3X, pass_bg)
    _strip_at(STRIP_W_1X, STRIP_H_1X, pass_bg).save(OUT / "strip.png", optimize=True)
    _strip_at(STRIP_W_2X, STRIP_H_2X, pass_bg).save(OUT / "strip@2x.png", optimize=True)
    strip_3x.save(OUT / "strip@3x.png", optimize=True)

    _logo_tight(50).save(OUT / "logo.png", optimize=True)
    _logo_tight(100).save(OUT / "logo@2x.png", optimize=True)
    _logo_tight(150).save(OUT / "logo@3x.png", optimize=True)

    _icon(29).save(OUT / "icon.png", optimize=True)
    _icon(58).save(OUT / "icon@2x.png", optimize=True)
    _icon(87).save(OUT / "icon@3x.png", optimize=True)

    _hero_google(strip_3x, pass_bg).save(WEB / "pass-strip-v2.png", optimize=True)
    _icon(512).save(WEB / "pass-logo-v2.png", optimize=True)

    _update_pass_json(pass_bg)
    hex_bg = f"#{pass_bg[0]:02x}{pass_bg[1]:02x}{pass_bg[2]:02x}"
    print(f"Apple Wallet assets → {OUT}")
    print(f"Pass background {pass_bg} ({hex_bg})")


if __name__ == "__main__":
    main()
