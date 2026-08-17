#!/usr/bin/env python3
"""Convert catalog icons to 256×256 PNGs for the desktop app.

Invoked by scripts/import-catalog.ts. Reads a JSON manifest on argv[1]:

    [{"slug": "game-slug", "path": "/abs/path/to/favicon.ico"}, ...]

and writes one PNG per entry into argv[2]. Exits non-zero only if every file
failed; per-file failures are reported in the JSON printed to stdout.
"""
import json
import os
import sys

from PIL import Image

def main() -> int:
    manifest_path, out_dir = sys.argv[1], sys.argv[2]
    with open(manifest_path, encoding="utf-8") as fh:
        entries = json.load(fh)
    os.makedirs(out_dir, exist_ok=True)

    ok, failed = 0, []
    for entry in entries:
        slug, src = entry["slug"], entry["path"]
        try:
            im = Image.open(src)
            im = im.convert("RGBA")
            if im.size != (256, 256):
                im = im.resize((256, 256), Image.LANCZOS)
            im.save(os.path.join(out_dir, f"{slug}.png"), "PNG")
            ok += 1
        except Exception as exc:  # noqa: BLE001 — report and continue
            failed.append({"slug": slug, "error": str(exc)})

    print(json.dumps({"ok": ok, "failed": failed}))
    return 1 if ok == 0 else 0

if __name__ == "__main__":
    raise SystemExit(main())
