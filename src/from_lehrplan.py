"""Erzeugt Klassen für die App aus src/lehrplan.json (Lehrplandatenbank Sachsen).

Je Lernbereich entstehen Einheiten entlang der Lernziele, die Zeitrichtwerte werden anteilig verteilt,
die Inhalte werden zu Stundenthemen. Wahlbereiche stehen als Einheiten zur Auswahl (nicht in der Sequenz).
Oberschule ab Klasse 7: Hauptschul- (HS) und Realschulbildungsgang (RS) als eigene Klassen.
Gymnasium 11/12: Grund- (GK) und Leistungskurs (LK); der Lehrplan gilt für beide Jahre gemeinsam,
die App teilt LB 1–4 auf Klasse 11 und die übrigen auf Klasse 12 auf (Vorschlag, in der Sequenz änderbar).
"""
import re

VARIANTS = {
    "HS": "Hauptschulbildungsgang", "RS": "Realschulbildungsgang",
    "GK": "Grundkurs", "LK": "Leistungskurs",
}
DAYS_BY_HOURS = {2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 1]}


def plan_targets(school, key):
    """Lehrplan-Abschnitt -> Liste (Klassen-ID, Stufe, Variante, Filter für LB-Nummern)."""
    m = re.match(r"Klassenstufe (\d+)(?: – (Haupt|Real)schulbildungsgang)?", key)
    if m:
        g = int(m.group(1)); v = {"Haupt": "HS", "Real": "RS"}.get(m.group(2))
        return [(f"{school}{g}{(v or '').lower()}", g, v, None)]
    m = re.match(r"Jahrgangsstufen 11/12 - (Grund|Leistungs)kurs", key)
    if m:
        v = "GK" if m.group(1) == "Grund" else "LK"
        return [(f"{school}11{v.lower()}", 11, v, lambda nr: nr <= 4), (f"{school}12{v.lower()}", 12, v, lambda nr: nr > 4)]
    return []


def split_hours(total, weights, minimum=2):
    """Verteilt total Stunden nach Gewichten (größte Reste), mindestens `minimum` je Teil, sofern möglich."""
    n = len(weights)
    if n == 0:
        return []
    if total < minimum * n:
        minimum = max(1, total // n)
    rest = total - minimum * n
    s = sum(weights) or n
    raw = [rest * w / s for w in weights]
    base = [int(x) for x in raw]
    for i in sorted(range(n), key=lambda i: raw[i] - base[i], reverse=True)[: rest - sum(base)]:
        base[i] += 1
    return [minimum + b for b in base]


def lesson_titles(items, hours, fallback):
    """Stundenthemen aus Inhalten: mehr Inhalte als Stunden -> zusammenfassen; sonst bekommt jedes Thema seinen Anteil
    (erste Stunde Einführung, weitere als Übung), ab 4 Stunden schließt eine Wiederholungsstunde ab."""
    items = [t for t in items if t] or [fallback]
    if hours <= 0:
        return []
    review = hours >= 4 and len(items) < hours
    h = hours - (1 if review else 0)
    if len(items) >= h:
        groups = [[] for _ in range(h)]
        for i, t in enumerate(items):
            groups[i * h // len(items)].append(t)
        out = [" · ".join(g) for g in groups]
    else:
        out = []
        for t, k in zip(items, split_hours(h, [1] * len(items), minimum=1)):
            out.append(t)
            out += [f"{t}: Übung" if j == 0 else f"{t}: Anwenden und Vertiefen" for j in range(k - 1)]
    if review:
        out.append("Wiederholung und Kurzkontrolle")
    return out


COMPETENCE = re.compile(r"^(Kennen|Beherrschen|Anwenden|Übertragen|Einblick gewinnen|Beurteilen|Sich positionieren|Gestalten|Reflektieren|Erkennen)\b")


def merge_continuations(lzs):
    """Lernziele beginnen mit einem Kompetenzverb; Zeilen ohne ein solches (z. B. „y = x; y = x² …“) setzen das vorige fort."""
    out = []
    for lz in lzs:
        if out and not COMPETENCE.match(lz["text"]):
            prev = out[-1]
            prev["inhalte"].append(dict(text=lz["text"], bem=lz["bem"], refs=lz["refs"], sub=[]))
            prev["inhalte"] += lz["inhalte"]
        else:
            out.append(dict(lz, inhalte=list(lz["inhalte"])))
    return out


def short_title(text):
    """„Beherrschen des Darstellens von Quadern“ bleibt lesbar, aber ohne überlange Klammerzusätze."""
    return re.sub(r"\s*\([^)]{40,}\)", "", text).strip()


def unit_from(lz, code, lb_key, hours):
    # Stundenthemen: Inhalte und ihre Unterpunkte; ohne Inhalte die Bemerkungen zum Lernziel
    inh = []
    for i in lz["inhalte"]:
        inh.append(i["text"])
        inh += [s["text"] for s in i["sub"] if s["text"]]
    if not inh:
        inh = [short_title(lz["text"])]
    detail = [i["text"] + (" (" + "; ".join(s["text"] for s in i["sub"]) + ")" if i["sub"] else "") for i in lz["inhalte"]]
    bem = list(lz["bem"])
    for i in lz["inhalte"]:
        bem += [f"{i['text']}: {b}" for b in i["bem"]]
        for s in i["sub"]:
            bem += [f"{s['text']}: {b}" for b in s["bem"]]
    refs = lz["refs"] + [r for i in lz["inhalte"] for r in i["refs"]] + [r for i in lz["inhalte"] for s in i["sub"] for r in s["refs"]]
    vor = [r[2:] for r in dict.fromkeys(refs) if r.startswith("→")]
    uebergreifend = [r[2:] for r in dict.fromkeys(refs) if r.startswith("⇒")]
    hinweise = bem + ([("Übergreifend: " + ", ".join(uebergreifend))] if uebergreifend else [])
    # Lernziele wie „Anwenden der Kenntnisse über Prismen auf das“ werden im Lehrplan durch die Inhalte fortgesetzt
    title = short_title(lz["text"])
    if re.search(r"\b(auf|das|die|der|den|dem|des|zum|zur|beim|bei|von|vom|für|mit|im|in|über|zu)$", title) and lz["inhalte"]:
        title = f"{title} {lz['inhalte'][0]['text']}" + (" …" if len(lz["inhalte"]) > 1 else "")
    return dict(code=code, lb=lb_key, title=title, inhalte=detail or [lz["text"]], tiefe=[], vorwissen=vor,
                begriffe=[], hinweise=hinweise, material=[], stunden=lesson_titles(inh, hours, lz["text"]), atoms=[])


def load_atoms(cid):
    """Atome je Klasse aus src/atoms_lehrplan/<cid>.json: {Einheit: [[Stunde, Atom, Frage, Lösung, Frage2, Lösung2, Frage3, Lösung3], …]}."""
    import json, os
    p = f"src/atoms_lehrplan/{cid}.json"
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}


def attach_atoms(cid, units):
    data = load_atoms(cid)
    for code, rows in data.items():
        u = units.get(code)
        assert u is not None, (cid, code, "Einheit unbekannt")
        n = max(1, len(u["stunden"]))
        u["atoms"] = []
        for i, r in enumerate(rows):
            assert len(r) == 8 and all(isinstance(x, str) and x for x in r[1:]), (cid, code, r)
            u["atoms"].append(dict(id=f"{code}.{i + 1}", l=min(max(1, int(r[0])), n), t=r[1], q=r[2], a=r[3], q2=r[4], a2=r[5], q3=r[6], a3=r[7]))


def build(lehrplan, cal_start, weeks=25):
    classes = {}
    for school in ("gym", "os"):
        for plan in lehrplan[school]:
            for cid, grade, variant, lbfilter in plan_targets(school, plan["key"]):
                lbs = [lb for lb in plan["lbs"] if lb["wahl"] or lbfilter is None or lbfilter(lb["nr"])]
                pflicht = [lb for lb in lbs if not lb["wahl"]]
                total = sum(lb["ustd"] for lb in pflicht)
                w = {"GK": 4, "LK": 5}.get(variant) or max(2, round(total / (20 if grade == 10 and school == "os" else weeks)))
                units, seq, lbnames, zrw = {}, [], {}, {}
                for lb in pflicht:
                    key = f"LB{lb['nr']}"
                    lbnames[key] = lb["title"]; zrw[key] = lb["ustd"]
                    lzs = merge_continuations([lz for lz in lb["lernziele"] if lz["text"]]) or [dict(text=lb["title"], bem=[], refs=[], inhalte=[])]
                    hours = split_hours(lb["ustd"], [1 + len(lz["inhalte"]) + sum(len(i["sub"]) for i in lz["inhalte"]) / 2 for lz in lzs])
                    for k, (lz, h) in enumerate(zip(lzs, hours), 1):
                        code = f"{lb['nr']}.{k}" if len(lzs) > 1 else f"{lb['nr']}"
                        units[code] = unit_from(lz, code, key, h)
                        seq.append([code, "A", h])
                    seq.append(["P", "A", 1])
                for lb in [lb for lb in lbs if lb["wahl"]]:
                    code = f"W{lb['nr']}"
                    lz_all = dict(text=lb["title"], bem=[b for lz in lb["lernziele"] for b in lz["bem"]], refs=[r for lz in lb["lernziele"] for r in lz["refs"]],
                                  inhalte=[dict(text=lz["text"], bem=[], refs=[], sub=[]) for lz in lb["lernziele"]] + [i for lz in lb["lernziele"] for i in lz["inhalte"]])
                    units[code] = unit_from(lz_all, code, "WB", 2 * w)
                    units[code]["title"] = "Wahlbereich: " + lb["title"]
                attach_atoms(cid, units)
                units["P"] = dict(code="P", lb="P", title="Puffer · Wiederholung", stunden=[], atoms=[])
                lbnames.update(WB="Wahlbereich (2 Wochen, wahlweise)", P="Puffer")
                days = DAYS_BY_HOURS.get(w, DAYS_BY_HOURS[4])
                tt = [dict(frm=cal_start, lessons=[dict(day=d, period=2 + (i // 5), track="A") for i, d in enumerate(days)])]
                label = f"Klasse {grade}"
                classes[cid] = dict(type=school, grade=grade, variant=variant, variantLabel=VARIANTS.get(variant, ""),
                                    label=label + (f" {variant}" if variant else ""), short=str(grade) + (variant or "").lower()[:1],
                                    nameA="Fachunterricht", nameB="", sol=False, source="lehrplan", plan=plan["key"],
                                    ziele=plan["ziele"], units=units, unitOrder=list(units.keys()), seq=seq, mode="nacheinander",
                                    tt=tt, lbnames=lbnames, zrw=zrw, weekly=w)
    return classes
