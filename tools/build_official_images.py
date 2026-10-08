#!/usr/bin/env python3
"""Planches d'images des cartes officielles pour l'Arène.

Source : un dossier d'images nommées par numéro de carte (<id>.png / .jpg), par exemple
« Card Images » du dépôt github.com/Wildric-Auric/YuGiOh-Database.

Produit :
  game/ygo/img/<n>.jpg   planches de 10 × 10 vignettes (177 × 258 px chacune)
  game/ygo/img.json      {"ids": [...]} : la carte ids[i] est sur la planche i // 100, case i % 100

Usage : python3 tools/build_official_images.py "<dossier des images>"
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "game" / "ygo" / "img"
W, H, COLS, ROWS = 177, 258, 10, 10
PER = COLS * ROWS


def main(src):
    src = Path(src)
    index = json.loads((ROOT / "game" / "ygo" / "index.json").read_text())
    wanted = {c[0] for c in index["cards"]}
    files = {}
    for f in src.iterdir():
        if f.suffix.lower() in (".png", ".jpg", ".jpeg") and f.stem.isdigit() and int(f.stem) in wanted:
            files[int(f.stem)] = f
    # Classées par nom anglais : les cartes d'un même archétype partagent les mêmes planches
    en = {c[0]: (c[2] or c[1]).strip('"').lower() for c in index["cards"]}
    ids = sorted(files, key=lambda i: (en[i], i))
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.jpg"):
        old.unlink()
    kept = []
    for n in range((len(ids) + PER - 1) // PER):
        sheet = Image.new("RGB", (W * COLS, H * ROWS), (20, 24, 40))
        for i, cid in enumerate(ids[n * PER:(n + 1) * PER]):
            try:
                im = Image.open(files[cid]).convert("RGB").resize((W, H), Image.LANCZOS)
            except Exception as e:  # image illisible : la carte garde son cadre texte
                print("ignorée", cid, e)
                cid = 0
                im = None
            if im:
                sheet.paste(im, ((i % COLS) * W, (i // COLS) * H))
            kept.append(cid)
        sheet.save(OUT / f"{n}.jpg", quality=66, optimize=True, progressive=True)
    (ROOT / "game" / "ygo" / "img.json").write_text(json.dumps({"ids": kept}, separators=(",", ":")))
    size = sum(f.stat().st_size for f in OUT.glob("*.jpg"))
    print(f"{len([k for k in kept if k])} images sur {len(wanted)} cartes · {n + 1} planches · {size / 1e6:.0f} Mo")


if __name__ == "__main__":
    main(sys.argv[1])
