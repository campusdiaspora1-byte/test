"""Génère l'extension EDOPro « Hueco Mundo » depuis le classeur de l'atelier.

usage : python3 edopro/build_edopro.py
Écrit edopro/dist/expansions/ : hueco-mundo.cdb, strings.conf, pics/<id>.jpg, script/c<id>.lua
et edopro/test/cards.json (données pour le banc de test).
"""
import json, shutil, sqlite3
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
ARCH = ROOT.parent / "archetypes" / "hueco-mundo"
BASE = 711000000  # identifiants : 711000001 = HMUN-FR001, … ; 711000027 = Jeton Fracción

# Archétypes (setcodes 16 bits, hors de la plage officielle)
SET = {"ESPADA": 0xf70, "LAS_NOCHES": 0xf71, "ULQUIORRA": 0xf72, "CERO": 0xf73, "FRACCIONES": 0xf74, "STARRK": 0xf75,
       "GRIMMJOW": 0xf76, "BARRAGAN": 0xf77, "HARRIBEL": 0xf78, "LILYNETTE": 0xf79, "TRES_BESTIAS": 0xf7b}
SET_NAMES = {"ESPADA": "Espada", "LAS_NOCHES": "Las Noches", "ULQUIORRA": "Ulquiorra Cifer", "CERO": "Cero", "FRACCIONES": "Fracciones",
             "STARRK": "Coyote Starrk", "GRIMMJOW": "Grimmjow Jaegerjaquez", "BARRAGAN": "Barragán Luisenbarn", "HARRIBEL": "Tier Harribel",
             "LILYNETTE": "Lilynette Gingerbuck", "TRES_BESTIAS": "Las Tres Bestias"}
MEMBERS = {1: ["ESPADA", "ULQUIORRA"], 2: ["LAS_NOCHES"], 3: ["CERO"], 4: ["ULQUIORRA"], 5: ["FRACCIONES"], 6: ["ULQUIORRA"],
           9: ["ESPADA", "GRIMMJOW"], 10: ["GRIMMJOW"], 11: ["ESPADA", "STARRK"], 12: ["STARRK"], 13: ["ESPADA", "LILYNETTE"],
           14: ["ESPADA", "BARRAGAN"], 15: ["BARRAGAN"], 16: ["ESPADA", "HARRIBEL"], 17: ["HARRIBEL"], 18: ["FRACCIONES", "TRES_BESTIAS"],
           20: ["ESPADA", "FRACCIONES"], 21: ["ESPADA"], 22: ["ESPADA"], 23: ["ESPADA", "CERO"], 24: ["ESPADA"], 25: ["ESPADA"], 26: ["ESPADA"]}

T = dict(MONSTER=0x1, SPELL=0x2, TRAP=0x4, NORMAL=0x10, EFFECT=0x20, FUSION=0x40, UNION=0x400, TUNER=0x1000, SYNCHRO=0x2000,
         TOKEN=0x4000, QUICK=0x10000, CONT=0x20000, FIELD=0x80000, XYZ=0x800000, SPSUMMON=0x2000000, LINK=0x4000000)
RACE = {"Fiend": 0x8, "Aqua": 0x40}
ATTR = {"DARK": 0x20, "WATER": 0x2}

# Textes d'aide affichés par EDOPro (aux.Stringid(id, n) = strN+1)
STRINGS = {
    1: ["Ajouter une Magie/Piège", "Invoquer un « Ulquiorra Cifer »"],
    2: ["Ajouter un monstre", "Invoquer un « Ulquiorra Cifer »"],
    3: ["Remplacer la destruction"],
    4: ["Détruire les colonnes", "Se mélanger dans le Deck"],
    5: ["Annuler l'effet"],
    6: ["Invocation Spéciale", "Annuler les effets", "Invoquer Segunda Etapa"],
    7: ["Invoquer Murciélago", "Ajouter une Magie Jeu-Rapide « Cero »"],
    8: ["Activer Dominance", "Annuler et réduire l'ATK", "Détruire le plus fort", "Invoquer Segunda Etapa"],
    9: ["Invocation Spéciale", "Réduire le Niveau"],
    10: ["Détruire des Magies/Pièges"],
    11: ["Invoquer Lilynette", "Changer les Niveaux", "Niveau +1", "Niveau −1"],
    12: ["Dommages et destruction", "Détruire l'attaquant"],
    13: ["Invocation Spéciale", "Ajouter une Magie Jeu-Rapide « Cero »", "Protection"],
    14: ["Invocation par 1 Sacrifice", "Invocation Fusion"],
    15: ["Placer un Compteur Vieillesse"],
    16: ["Invocation Spéciale", "Piocher"],
    17: ["Renvoyer en main", "Remplacer la destruction"],
    18: ["Invocation Spéciale", "Invoquer 3 Jetons", "Invoquer Ayon"],
    19: ["Détruire le monstre"],
    20: ["Invocation Spéciale", "Ajouter un « Espada »", "Remplacer la destruction"],
    21: ["Sacrifier et piocher", "Ajouter une Magie Jeu-Rapide « Cero »", "Affaiblir"],
    22: ["Ajouter le Laboratoire", "Équiper", "Invoquer depuis l'équipement"],
    23: ["Ignorer Las Noches", "Gagner de l'ATK"],
    24: ["Hierro"], 25: ["Prendre le contrôle"], 26: ["Festin"],
}


def setcode(n):
    v = 0
    for i, k in enumerate(MEMBERS.get(n, [])):
        v |= SET[k] << (16 * i)
    return v


def row(c, n):
    k = c["kind"]
    if k == "spell":
        ty = T["SPELL"] | {"field": T["FIELD"], "quickplay": T["QUICK"], "continuous": T["CONT"]}.get(c["stType"], 0)
        return ty, 0, 0, 0, 0, 0
    if k == "trap":
        return T["TRAP"] | (T["CONT"] if c["stType"] == "continuous" else 0), 0, 0, 0, 0, 0
    f = c["frame"]
    ty = T["MONSTER"] | T["EFFECT"] | {"synchro": T["SYNCHRO"], "xyz": T["XYZ"], "link": T["LINK"], "fusion": T["FUSION"]}.get(f, 0)
    if c["abilities"].get("tuner"): ty |= T["TUNER"]
    if c["abilities"].get("union"): ty |= T["UNION"]
    if n in (4, 6): ty |= T["SPSUMMON"]
    atk, df, lvl = int(c["atk"]), int(c["def"] or 0), int(c["level"])
    if f == "link":
        df = sum(1 << b for b, i in ((0, 6), (1, 5), (2, 4)) if c["arrows"][i])  # bas-gauche, bas, bas-droite
        lvl = sum(map(bool, c["arrows"]))
    return ty, atk, df, lvl, RACE[c["mtype"]], ATTR[c["attribute"]]


def main():
    out = ROOT / "dist" / "expansions"
    if out.exists(): shutil.rmtree(out)
    (out / "pics").mkdir(parents=True); (out / "script").mkdir()
    cards = json.loads((ARCH / "classeur.json").read_text())["cards"]
    db = sqlite3.connect(out / "hueco-mundo.cdb")
    db.execute("create table datas(id integer primary key,ot integer,alias integer,setcode integer,type integer,atk integer,def integer,level integer,race integer,attribute integer,category integer)")
    db.execute("create table texts(id integer primary key,name text,desc text," + ",".join(f"str{i} text" for i in range(1, 17)) + ")")
    test = []
    for c in cards:
        n = int(c["setId"][-3:]); cid = BASE + n
        ty, atk, df, lvl, race, attr = row(c, n)
        sc = setcode(n)
        db.execute("insert into datas values(?,?,?,?,?,?,?,?,?,?,?)", (cid, 3, 0, sc, ty, atk, df, lvl, race, attr, 0))
        strs = STRINGS.get(n, []) + [""] * 16
        db.execute("insert into texts values(?,?,?," + ",".join("?" * 16) + ")", (cid, c["name"], c["text"], *strs[:16]))
        Image.open(ARCH / "cartes" / f"{c['setId']}.png").convert("RGB").resize((400, 580)).save(out / "pics" / f"{cid}.jpg", quality=88)
        test.append({"code": cid, "alias": 0, "setcodes": [SET[k] for k in MEMBERS.get(n, [])], "type": ty, "level": lvl, "attribute": attr,
                     "race": race, "attack": atk, "defense": df, "lscale": 0, "rscale": 0, "link_marker": df if ty & T["LINK"] else 0, "name": c["name"]})
    tok = BASE + 27  # Jeton Fracción : Aqua/EAU/Niveau 1/500/500
    db.execute("insert into datas values(?,?,?,?,?,?,?,?,?,?,?)", (tok, 3, 0, 0, T["MONSTER"] | T["NORMAL"] | T["TOKEN"], 500, 500, 1, RACE["Aqua"], ATTR["WATER"], 0))
    tok_png = ARCH / "cartes" / "HMUN-FR027.png"  # illustration du Jeton (même atelier que les autres cartes)
    if tok_png.exists(): Image.open(tok_png).convert("RGB").resize((400, 580)).save(out / "pics" / f"{tok}.jpg", quality=88)
    db.execute("insert into texts values(?,?,?," + ",".join("?" * 16) + ")", (tok, "Jeton Fracción", "Ce Jeton est Invoqué par l'effet de « Las Tres Bestias - Fracciones de la Chimère ».", *[""] * 16))
    test.append({"code": tok, "alias": 0, "setcodes": [], "type": T["MONSTER"] | T["NORMAL"] | T["TOKEN"], "level": 1, "attribute": ATTR["WATER"],
                 "race": RACE["Aqua"], "attack": 500, "defense": 500, "lscale": 0, "rscale": 0, "link_marker": 0, "name": "Jeton Fracción"})
    db.commit(); db.close()
    (out / "strings.conf").write_text("#Hueco Mundo (fan-made)\n" + "".join(f"!setname 0x{SET[k]:x} {SET_NAMES[k]}\n" for k in SET) + "!counter 0x1f70 Compteur Vieillesse\n")
    for f in (ROOT / "script").glob("c*.lua"):
        shutil.copy(f, out / "script" / f.name)
    (ROOT / "test" / "cards.json").write_text(json.dumps(test, ensure_ascii=False, indent=1))
    print(len(test), "cartes ·", len(list((out / "script").glob("*.lua"))), "scripts")


if __name__ == "__main__":
    main()
