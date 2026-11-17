"""Liest die Mathematik-Lehrpläne (HTML aus src/fetch_lehrplan.js) und schreibt src/lehrplan.json.

Aufruf: python3 -I src/parse_lehrplan.py <ordner mit gym_lplan.html und os_lplan.html>

Struktur je Schulart:
  plans: [{key, title, ziele: [[überschrift, text], …],
           lbs: [{nr, wahl, title, ustd, lernziele: [{text, bem, refs, inhalte: [{text, bem, refs, sub: [...]}]}]}]}]
Formeln (MathML) werden in die Textschreibweise der App übersetzt (3/4, x², a^(n+1), √x …),
die dort mit MathJax gesetzt wird.
"""
import json, re, sys, datetime
from bs4 import BeautifulSoup, NavigableString, Tag

SUP = str.maketrans("0123456789n-+", "⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁻⁺")
SUB = str.maketrans("0123456789n", "₀₁₂₃₄₅₆₇₈₉ₙ")


def mml(e):
    """MathML-Element -> Textschreibweise."""
    if isinstance(e, NavigableString):
        return str(e)
    n = e.name
    kids = [c for c in e.children if isinstance(c, Tag)]
    if n in ("math", "mrow", "mstyle", "semantics"):
        return "".join(mml(c) for c in kids)
    if n in ("mn", "mi", "mtext"):
        return e.get_text()
    if n == "mo":
        t = e.get_text()
        return {"-": "−", "\xa0": " ", "'": "′", "\\": "\\"}.get(t, t if t not in "=<>+±·×÷↦∈:" else f" {t} ")
    if n == "mspace":
        return " "
    if n == "mfenced":
        o, c, sep = e.get("open", "("), e.get("close", ")"), e.get("separators", ",")
        return o + (sep[:1] + " ").join(mml(k) for k in kids) + c
    if n == "mfrac":
        a, b = (wrap(mml(kids[0])), wrap(mml(kids[1]))) if len(kids) == 2 else ("", "")
        return f"{a}/{b}"
    if n == "msup":
        return mml(kids[0]) + sup(mml(kids[1]))
    if n == "msub":
        return mml(kids[0]) + sub(mml(kids[1]))
    if n == "msubsup":
        return mml(kids[0]) + sub(mml(kids[1])) + sup(mml(kids[2]))
    if n == "msqrt":
        inner = "".join(mml(c) for c in kids)
        return "√" + (inner if re.fullmatch(r"[\w,]+", inner) else f"({inner})")
    if n == "mroot":
        idx = mml(kids[1]).strip()
        return ("∛(" if idx == "3" else sup(idx) + "√(") + mml(kids[0]) + ")"
    if n == "mtable":
        return "(" + "; ".join(" ".join(mml(td) for td in tr.find_all("mtd")) for tr in e.find_all("mtr")) + ")"
    return "".join(mml(c) for c in kids) or e.get_text()


def wrap(s):
    s = s.strip()
    return s if re.fullmatch(r"−?[\w,′²³]+", s) else f"({s})"


def sup(s):
    s = s.strip()
    if re.fullmatch(r"[0-9n+−-]+", s):
        return s.replace("−", "-").translate(SUP)
    return f"^({s})" if len(s) > 1 else f"^{s}"


def sub(s):
    s = s.strip()
    if re.fullmatch(r"[0-9n]+", s):
        return s.translate(SUB)
    return f"_({s})" if len(s) > 1 else f"_{s}"


def text(el):
    """Text eines Elements mit übersetzten Formeln, Leerraum normalisiert."""
    if el is None:
        return ""
    out = []
    for c in el.descendants:
        if isinstance(c, Tag) and c.name == "math":
            out.append(mml(c))
        elif isinstance(c, NavigableString) and not any(p.name == "math" for p in c.parents):
            out.append(str(c))
    s = "".join(out).replace("\xa0", " ")
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r" ([,;.])", r"\1", s)
    s = re.sub(r"(?<=[A-Za-z0-9)])dx\b", " dx", s)        # „1/xdx“ -> „1/x dx“
    return s


def cell(td):
    """Bemerkungsspalte: Absätze als Liste; Verweise ➔ (Bezug) und ⇒ (übergreifendes Ziel) getrennt."""
    if td is None:
        return [], []
    refs = []
    for vb in td.select("div.vlBlock"):
        arrow = vb.get_text(" ", strip=True)[:1]
        label = re.sub(r"\s+", " ", vb.get_text(" ", strip=True)[1:]).strip()
        if label:
            refs.append(("→ " if arrow == "➔" else "⇒ ") + label)
        vb.decompose()
    paras = [text(p) for p in td.find_all("p")] or [text(td)]
    return [p for p in paras if p], refs


def parse(path):
    soup = BeautifulSoup(open(path, encoding="utf-8").read(), "html.parser")
    plans = []
    for page in soup.select("div.lplanpage"):
        key = (page.get("data-ci") or "").strip()
        if not re.match(r"(Klassenstufe|Jahrgangsstufen?) ", key) or not page.select(":scope > div.childItems > div.lernbereich"):
            continue
        ziele, cur = [], None
        for p in page.select(":scope > div.childItems > div:not(.lernbereich) p"):
            t = text(p)
            if not t:
                continue
            if p.find("strong"):
                cur = [t, ""]; ziele.append(cur)
            elif cur is not None:
                cur[1] = (cur[1] + " " + t).strip()
        lbs = []
        for lb in page.select(":scope > div.childItems > div.lernbereich"):
            h = lb.find("h3")
            span = h.find("span")
            ustd = int(re.search(r"\d+", span.get_text()).group()) if span and re.search(r"\d+", span.get_text()) else 0
            if span:
                span.extract()
            head = re.sub(r"\s+", " ", h.get_text(" ", strip=True))
            m = re.match(r"(Lernbereich|Wahlbereich) (\d+):\s*(.*)", head)
            if not m:
                continue
            item = dict(nr=int(m.group(2)), wahl=m.group(1) == "Wahlbereich", title=m.group(3).strip(), ustd=ustd, lernziele=[])
            lz = inh = None
            for tr in lb.select("table.lbinhalte tr"):
                cls = tr.get("class") or []
                level = 1 if "lze1" in cls else 2 if "lze2" in cls else 3 if "lze3" in cls else 0
                t = text(tr.find("td", class_="lz"))
                bem, refs = cell(tr.find("td", class_="lzb"))
                if not level or not (t or bem):
                    continue
                if level == 1 or lz is None:
                    lz = dict(text=t, bem=bem, refs=refs, inhalte=[]); item["lernziele"].append(lz); inh = None
                elif level == 2 or inh is None:
                    inh = dict(text=t, bem=bem, refs=refs, sub=[]); lz["inhalte"].append(inh)
                else:
                    inh["sub"].append(dict(text=t, bem=bem, refs=refs))
            lbs.append(item)
        plans.append(dict(key=key, ziele=ziele, lbs=lbs))
    return plans


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "."
    out = dict(quelle="https://www.schulportal.sachsen.de/lplandb/", abgerufen=datetime.date.today().isoformat())
    for name in ("gym", "os"):
        out[name] = parse(f"{src}/{name}_lplan.html")
        print(name, [(p["key"], len(p["lbs"]), sum(l["ustd"] for l in p["lbs"] if not l["wahl"])) for p in out[name]])
    with open("src/lehrplan.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
