"""Erzeugt Klassen für die App aus src/lehrplan.json (Lehrplandatenbank Sachsen).

Je Lernbereich entstehen Einheiten entlang der Lernziele, die Zeitrichtwerte werden anteilig verteilt,
die Inhalte werden zu Stundenthemen. Wie in den ausgearbeiteten Plänen GYM 6/8 kommen Klassenarbeiten, ein Wahlbereich
und ein Jahresabschluss dazu; die übrige Zeit des Schuljahres wird als Übungsstunden anteilig auf die Einheiten verteilt.
Abschlussklassen (GYM 12, OS 10) enden früher.
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


def attach_atoms(cid, units, base_hours=None):
    """Atome anhängen. Hat eine Einheit durch Übungsstunden mehr Stunden als nach Zeitrichtwert (base_hours),
    rückt die Einführungsstunde der Atome anteilig nach hinten."""
    data = load_atoms(cid)
    for code, rows in data.items():
        u = units.get(code)
        assert u is not None, (cid, code, "Einheit unbekannt")
        n = max(1, len(u["stunden"]))
        f = n / max(1, (base_hours or {}).get(code, n))
        u["atoms"] = []
        for i, r in enumerate(rows):
            assert len(r) == 8 and all(isinstance(x, str) and x for x in r[1:]), (cid, code, r)
            l = min(max(1, round(int(r[0]) * f)), n)
            u["atoms"].append(dict(id=f"{code}.{i + 1}", l=l, t=r[1], q=r[2], a=r[3], q2=r[4], a2=r[5], q3=r[6], a3=r[7]))


def end_rule(school, grade):
    """Abschlussklassen enden früher: GYM 12 vor den Osterferien (Abitur), OS 10 vor den Pfingstferien (Prüfungen)."""
    return {("gym", 12): "ostern", ("os", 10): "pfingsten"}.get((school, grade))


def last_day(cal, rule):
    import datetime as dt
    pat = {"ostern": "oster", "pfingsten": "pfingst"}.get(rule)
    for h in cal["holidays"] if pat else []:
        if pat in h["name"].lower():
            return (dt.date.fromisoformat(h["frm"]) - dt.timedelta(1)).isoformat()
    return None


def capacity(cal, weekdays, until=None):
    """Unterrichtsstunden im Schuljahr für einen Wochenplan (Liste der Wochentage 1–5, Doppelungen = mehrere Stunden)."""
    import datetime as dt
    d, e = dt.date.fromisoformat(cal["start"]), dt.date.fromisoformat(until or cal["end"])
    free = {f["date"] for f in cal["free"]}
    n = 0
    while d <= e:
        iso = d.isoformat()
        if d.isoweekday() <= 5 and iso not in free and not any(h["frm"] <= iso <= h["to"] for h in cal["holidays"]):
            n += weekdays.count(d.isoweekday())
        d += dt.timedelta(1)
    return n


def ka_count(school, grade):
    """Klassenarbeiten bzw. Klausuren je Schuljahr: vier allgemeine Platzhalter, zwei je Halbjahr. Die Termine setzt die App
    aus den Ferien (Ende des 1. und 3. Quartals, 2–3 Wochen nach Weihnachts- und Pfingstferien)."""
    return 4


def ka_unit(code, n, word, hours):
    """Allgemeiner Platzhalter für eine Klassenarbeit (ohne Bezug zu bestimmten Einheiten); main = Index der Arbeitsstunde."""
    st = ([f"Wiederholung"] if hours >= 3 else []) + [word] * max(1, hours - (2 if hours >= 3 else 1 if hours >= 2 else 0)) + (["Rückgabe und Berichtigung"] if hours >= 2 else [])
    return dict(code=code, lb="test", title=f"{word} {n}", ka=n, main=1 if hours >= 3 else 0,
                inhalte=["Stoff seit der letzten Arbeit wiederholen", word, "Rückgabe, Berichtigung, Fehlerschwerpunkte"], tiefe=[], vorwissen=[],
                begriffe=[], hinweise=["Platzhalter: Termin per Datum festlegen, Inhalt und Umfang nach den Vorgaben der Schule."],
                material=[], stunden=st, atoms=[])


def place_tests(rows, n):
    """Positionen (Index in rows, nach dem eingefügt wird) für n Klassenarbeiten: möglichst am Ende eines Lernbereichs,
    gleichmäßig über den Stoff verteilt; die letzte am Ende."""
    cum, c = [], 0
    for r in rows:
        c += r["h"] if r["code"] != "P" else 0
        cum.append(c)
    total = c or 1
    pos, last = [], -1
    for j in range(1, n + 1):
        t = total * j / n
        best = None
        for i in range(last + 1, len(rows)):
            if j < n and len(rows) - i <= n - j:
                break
            lb_end = rows[i]["code"] == "P"
            score = abs(cum[i] - t) - (0.1 * total if lb_end else 0)
            if best is None or score < best[0]:
                best = (score, i)
        if j == n:
            best = (0, len(rows) - 1)
        pos.append(best[1]); last = best[1]
    return pos


def build(lehrplan, cal, weeks=25):
    classes = {}
    for school in ("gym", "os"):
        for plan in lehrplan[school]:
            for cid, grade, variant, lbfilter in plan_targets(school, plan["key"]):
                lbs = [lb for lb in plan["lbs"] if lb["wahl"] or lbfilter is None or lbfilter(lb["nr"])]
                pflicht = [lb for lb in lbs if not lb["wahl"]]
                total = sum(lb["ustd"] for lb in pflicht)
                w = {"GK": 4, "LK": 5}.get(variant) or max(2, round(total / (20 if grade == 10 and school == "os" else weeks)))
                days = DAYS_BY_HOURS.get(w, DAYS_BY_HOURS[4])
                rule = end_rule(school, grade)
                cap = capacity(cal, days, last_day(cal, rule))
                exam = rule is not None
                units, lbnames, zrw = {}, {}, {}
                # 1. Lernziele mit Zeitrichtwert-Stunden
                rows = []
                for lb in pflicht:
                    key = f"LB{lb['nr']}"
                    lbnames[key] = lb["title"]; zrw[key] = lb["ustd"]
                    lzs = merge_continuations([lz for lz in lb["lernziele"] if lz["text"]]) or [dict(text=lb["title"], bem=[], refs=[], inhalte=[])]
                    hours = split_hours(lb["ustd"], [1 + len(lz["inhalte"]) + sum(len(i["sub"]) for i in lz["inhalte"]) / 2 for lz in lzs])
                    for k, (lz, h) in enumerate(zip(lzs, hours), 1):
                        rows.append(dict(code=f"{lb['nr']}.{k}" if len(lzs) > 1 else f"{lb['nr']}", lb=key, lz=lz, h=h, base=h))
                    rows.append(dict(code="P", lb="P", h=1))
                wahl = [lb for lb in lbs if lb["wahl"]]
                # 2. feste Bausteine wie in GYM 6/8: Klassenarbeiten (je 3 Std.), ein Wahlbereich, Jahresabschluss
                nka, ka_h = ka_count(school, grade), 3
                wb_h = 2 * w if wahl and grade != 12 else 0
                ja_h = 0 if exam else 2
                fixed = sum(r["h"] for r in rows) + nka * ka_h + wb_h + ja_h
                # 3. restliche Reserve: gut ein Drittel als Puffer am Ende der Lernbereiche (Ausfall, Wiederholung),
                #    der Rest als Übungsstunden anteilig in den Einheiten (wie in GYM 6/8)
                rest = cap - fixed
                if rest > 0:
                    ps, us = [r for r in rows if r["code"] == "P"], [r for r in rows if r["code"] != "P"]
                    rest_p = round(rest * 0.35)
                    lbh = [sum(u["base"] for u in us if u["lb"] == lb) for lb in [f"LB{x['nr']}" for x in pflicht]]
                    for r, extra in zip(ps, split_hours(rest_p, lbh, minimum=0)):
                        r["h"] += extra
                    for r, extra in zip(us, split_hours(rest - rest_p, [r["h"] for r in us], minimum=0)):
                        r["h"] += extra
                for r in rows:
                    if r["code"] != "P":
                        units[r["code"]] = unit_from(r["lz"], r["code"], r["lb"], r["h"])
                # 4. Sequenz mit Klassenarbeiten
                word = "Klausur" if grade >= 11 else "Klassenarbeit"
                seq = []
                stops = set(place_tests(rows, nka))
                kn = 0
                for i, r in enumerate(rows):
                    seq.append([r["code"], "A", r["h"]])
                    if i in stops:
                        kn += 1
                        code = f"KA{kn}"
                        units[code] = ka_unit(code, kn, word, ka_h)
                        seq.append([code, "A", ka_h])
                for lb in wahl:
                    code = f"W{lb['nr']}"
                    lz_all = dict(text=lb["title"], bem=[b for lz in lb["lernziele"] for b in lz["bem"]], refs=[r for lz in lb["lernziele"] for r in lz["refs"]],
                                  inhalte=[dict(text=lz["text"], bem=[], refs=[], sub=[]) for lz in lb["lernziele"]] + [i for lz in lb["lernziele"] for i in lz["inhalte"]])
                    units[code] = unit_from(lz_all, code, "WB", 2 * w)
                    units[code]["title"] = "Wahlbereich: " + lb["title"]
                if wb_h:
                    seq.append([f"W{wahl[0]['nr']}", "A", wb_h])
                if ja_h:
                    units["JA"] = dict(code="JA", lb="P", title="Jahresabschluss: Rückblick, Knobelaufgaben", stunden=["Rückblick auf das Schuljahr", "Knobelaufgaben"], atoms=[])
                    seq.append(["JA", "A", ja_h])
                attach_atoms(cid, units, {r["code"]: r["base"] for r in rows if r["code"] != "P"})
                units["P"] = dict(code="P", lb="P", title="Puffer · Wiederholung", stunden=[], atoms=[])
                lbnames.update(WB="Wahlbereich (2 Wochen, wahlweise)", test=word, P="Puffer / Abschluss")
                tt = [dict(frm=cal["start"], lessons=[dict(day=d, period=2 + (i // 5), track="A") for i, d in enumerate(days)])]
                label = f"Klasse {grade}"
                classes[cid] = dict(type=school, grade=grade, variant=variant, variantLabel=VARIANTS.get(variant, ""),
                                    label=label + (f" {variant}" if variant else ""), short=str(grade) + (variant or "").lower()[:1],
                                    nameA="Fachunterricht", nameB="", sol=7 <= grade <= 9, source="lehrplan", plan=plan["key"],
                                    ziele=plan["ziele"], units=units, unitOrder=list(units.keys()), seq=seq, mode="nacheinander",
                                    tt=tt, lbnames=lbnames, zrw=zrw, weekly=w, endRule=rule, cap=cap)
    return classes
