"""Prépare les cartes de l'arène : vignettes JPG + game/cards.json depuis un classeur de l'atelier.

usage : python3 tools/build_game.py archetypes/hueco-mundo
"""
import json, re, sys
from pathlib import Path
from PIL import Image

TYPES = {"Aqua": "Aqua", "Beast": "Bête", "Beast-Warrior": "Bête-Guerrier", "Dragon": "Dragon", "Fairy": "Elfe",
         "Fiend": "Démon", "Machine": "Machine", "Spellcaster": "Magicien", "Warrior": "Guerrier", "Zombie": "Zombie"}
SUMMON = {"fusion": "Fusion", "synchro": "Synchro", "xyz": "Xyz", "ritual": "Rituel", "link": "Lien"}
ABIL = {"flip": "Flip", "gemini": "Gémeau", "spirit": "Spirit", "toon": "Toon", "union": "Union", "tuner": "Syntoniseur"}
SPELL = {"normal": "Normale", "quickplay": "Jeu-Rapide", "continuous": "Continue", "field": "Terrain", "equip": "Équipement", "ritual": "Rituelle"}
TRAP = {"normal": "Normal", "continuous": "Continu", "counter": "Contre-Piège"}
EXTRA = {"fusion", "synchro", "xyz", "link"}
# Même codage que tools/build_official.py (6e colonne de l'index) : sous-type ou Niveau + drapeaux
ST_RULE = {"normal": "n", "quickplay": "q", "continuous": "c", "equip": "e", "field": "f", "ritual": "r", "counter": "k"}
NOMI = re.compile(r"ne peut pas être Invoqu\w* Normalement|Ni Invocable Normalement", re.I)


def rule(c):
    if c["kind"] != "monster":
        return ST_RULE.get(c["stType"], "n")
    return str(c["level"]) + ("p" if c.get("pendulum") else "") + ("R" if c["frame"] == "ritual" else "") + ("u" if NOMI.search(c["text"]) else "")


def line(c):
    if c["kind"] == "spell":
        return f"Magie {SPELL.get(c['stType'], '')}".strip()
    if c["kind"] == "trap":
        return f"Piège {TRAP.get(c['stType'], '')}".strip()
    parts = [TYPES.get(c["mtype"], c["mtype"])]
    if c["frame"] in SUMMON:
        parts.append(SUMMON[c["frame"]])
    parts += [v for k, v in ABIL.items() if c["abilities"].get(k)]
    if c["frame"] == "effect" or (c["frame"] not in ("normal", "token") and c.get("hasEffect")):
        parts.append("Effet")
    return "[" + "/".join(parts) + "]"


def stats(c):
    if c["kind"] != "monster":
        return ""
    if c["frame"] == "link":
        return f"ATK {c['atk']} · LINK-{sum(map(bool, c['arrows']))}"
    lvl = ("Rang " if c["frame"] == "xyz" else "Niveau ") + str(c["level"])
    return f"{lvl} · ATK {c['atk']} / DEF {c['def']}"


def main(folder):
    folder = Path(folder)
    out = Path(__file__).resolve().parent.parent / "game"
    data = json.loads((folder / "classeur.json").read_text())
    cards = []
    for c in data["cards"]:
        cid = c["setId"]
        img = Image.open(folder / "cartes" / f"{cid}.png").convert("RGB")
        img.thumbnail((420, 620))
        img.save(out / "cards" / f"{cid}.jpg", quality=80, optimize=True)
        kind = "x" if c["kind"] == "monster" and c["frame"] in EXTRA else {"monster": "m", "spell": "s", "trap": "t"}[c["kind"]]
        cards.append({"cid": cid, "name": c["name"], "kind": kind, "field": c["kind"] == "spell" and c["stType"] == "field",
                      "rule": rule(c), "line": line(c), "stats": stats(c), "text": c["text"], "img": f"cards/{cid}.jpg"})
    (out / "cards.json").write_text(json.dumps(cards, ensure_ascii=False, indent=1))
    print(len(cards), "cartes")


if __name__ == "__main__":
    main(sys.argv[1])
