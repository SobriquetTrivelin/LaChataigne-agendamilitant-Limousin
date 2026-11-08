#!/usr/bin/env python3
"""
Ajoute une affiche : la redimensionne (720 px de large max) et l'enregistre en JPEG léger
dans docs/affiches/.   Nécessite Pillow :  pip install pillow

Usage :  python3 tools/affiche.py ~/Téléchargements/affiche.png nom-court
Puis, dans evenements.json :  "affiches": ["affiches/nom-court.jpg"]
Licence : AGPL-3.0-or-later.
"""
import sys, re
from pathlib import Path
from PIL import Image

if len(sys.argv) != 3:
    sys.exit(__doc__)
src, nom = Path(sys.argv[1]), re.sub(r"[^a-z0-9-]+", "-", sys.argv[2].lower()).strip("-")
dest = Path(__file__).resolve().parent.parent / "docs" / "affiches" / f"{nom}.jpg"
im = Image.open(src).convert("RGB")
if im.width > 720:
    im = im.resize((720, round(im.height * 720 / im.width)), Image.LANCZOS)
im.save(dest, quality=78, optimize=True, progressive=True)
print(f"✓ {dest.relative_to(dest.parent.parent.parent)}  ({dest.stat().st_size // 1024} Ko)")
