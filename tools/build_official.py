"""Construit la base des cartes officielles de l'arène depuis la base YGOPro (mycard/ygopro-database).

usage : python3 tools/build_official.py <fr-FR/cards.cdb> <en-US/cards.cdb>
Écrit game/ygo/index.json (recherche : id, nom FR, nom EN, cadre) et game/ygo/d/<n>.json (textes, par paquets).
"""
import json, sqlite3, sys
from pathlib import Path

RACE = ["Guerrier", "Magicien", "Elfe", "Démon", "Zombie", "Machine", "Aqua", "Pyro", "Rocher", "Bête Ailée", "Plante", "Insecte",
        "Tonnerre", "Dragon", "Bête", "Bête-Guerrier", "Dinosaure", "Poisson", "Serpent de Mer", "Reptile", "Psychique",
        "Bête Divine", "Dieu Créateur", "Wyrm", "Cyberse", "Illusion"]
ATTR = {1: "TERRE", 2: "EAU", 4: "FEU", 8: "VENT", 16: "LUMIÈRE", 32: "TÉNÈBRES", 64: "DIVIN"}
T = dict(MONSTER=0x1, SPELL=0x2, TRAP=0x4, NORMAL=0x10, EFFECT=0x20, FUSION=0x40, RITUAL=0x80, SPIRIT=0x200, UNION=0x400,
         GEMINI=0x800, TUNER=0x1000, SYNCHRO=0x2000, TOKEN=0x4000, QUICK=0x10000, CONT=0x20000, EQUIP=0x40000, FIELD=0x80000,
         COUNTER=0x100000, FLIP=0x200000, TOON=0x400000, XYZ=0x800000, PEND=0x1000000, LINK=0x4000000)
CHUNKS = 100


def race(r):
    return next((RACE[i] for i in range(len(RACE)) if r >> i & 1), "?")


def describe(ty, atk, df, lvl, rc, at):
    has = lambda k: ty & T[k]
    if has("SPELL"):
        sub = next((v for k, v in [("QUICK", "Jeu-Rapide"), ("CONT", "Continue"), ("EQUIP", "Équipement"), ("FIELD", "Terrain"), ("RITUAL", "Rituelle")] if has(k)), "Normale")
        return "s", "s", "Magie " + sub, "", bool(has("FIELD"))
    if has("TRAP"):
        sub = next((v for k, v in [("CONT", "Continu"), ("COUNTER", "Contre-Piège")] if has(k)), "Normal")
        return "t", "t", "Piège " + sub, "", False
    parts = [race(rc)]
    for k, v in [("FUSION", "Fusion"), ("SYNCHRO", "Synchro"), ("XYZ", "Xyz"), ("LINK", "Lien"), ("RITUAL", "Rituel"), ("PEND", "Pendule"),
                 ("FLIP", "Flip"), ("GEMINI", "Gémeau"), ("SPIRIT", "Spirit"), ("TOON", "Toon"), ("UNION", "Union"), ("TUNER", "Syntoniseur")]:
        if has(k):
            parts.append(v)
    parts.append("Effet" if has("EFFECT") else "Normal" if has("NORMAL") and len(parts) > 1 else "")
    line = f"{ATTR.get(at, '?')} · [{'/'.join(p for p in parts if p)}]"
    frame = "l" if has("LINK") else "xy" if has("XYZ") else "sy" if has("SYNCHRO") else "fu" if has("FUSION") else "r" if has("RITUAL") else "e" if has("EFFECT") else "n"
    level = lvl & 0xFF
    a = "?" if atk < 0 else str(atk)
    if has("LINK"):
        stats = f"ATK {a} · LINK-{level}"
    else:
        d = "?" if df < 0 else str(df)
        stats = f"{'Rang' if has('XYZ') else 'Niveau'} {level} · ATK {a} / DEF {d}"
        if has("PEND"):
            stats += f" · Échelle {lvl >> 24 & 0xFF}"
    kind = "x" if ty & (T["FUSION"] | T["SYNCHRO"] | T["XYZ"] | T["LINK"]) else "m"
    return kind, frame, line, stats, False


def main(fr_path, en_path):
    out = Path(__file__).resolve().parent.parent / "game" / "ygo"
    (out / "d").mkdir(parents=True, exist_ok=True)
    en = dict(sqlite3.connect(en_path).execute("select id, name from texts"))
    rows = sqlite3.connect(fr_path).execute(
        "select d.id, d.alias, d.ot, d.type, d.atk, d.def, d.level, d.race, d.attribute, t.name, t.desc from datas d join texts t using(id)")
    index, chunks, alias = [], [{} for _ in range(CHUNKS)], {}
    for cid, al, ot, ty, atk, df, lvl, rc, at, name, desc in rows:
        if ot not in (1, 2, 3) or ty & T["TOKEN"] or not name:
            continue
        if al and abs(al - cid) < 20:  # illustrations alternatives : même carte
            alias[cid] = al
            continue
        kind, frame, line, stats, field = describe(ty, atk, df, lvl, rc, at)
        e = en.get(cid, "")
        index.append([cid, name, e if e != name else "", kind, frame] + ([1] if field else []))
        chunks[cid % CHUNKS][str(cid)] = [line, stats, (desc or "").replace("\r\n", "\n").replace("\t", "").strip()]
    index.sort(key=lambda r: r[1].lower())
    (out / "index.json").write_text(json.dumps({"cards": index, "alias": alias}, ensure_ascii=False, separators=(",", ":")))
    for i, ch in enumerate(chunks):
        (out / "d" / f"{i}.json").write_text(json.dumps(ch, ensure_ascii=False, separators=(",", ":")))
    print(len(index), "cartes,", len(alias), "illustrations alternatives")


if __name__ == "__main__":
    main(*sys.argv[1:3])
