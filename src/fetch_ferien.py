"""Lädt Schulferien und Feiertage für Sachsen von openholidaysapi.org nach src/ferien_sn.json.

Aufruf: python3 -I src/fetch_ferien.py [erstes_jahr] [letztes_jahr]
Jahr = Beginn des Schuljahres (2026 -> Schuljahr 2026/27).
"""
import json, sys, urllib.request, urllib.parse

API = "https://openholidaysapi.org"

def get(kind, frm, to):
    q = urllib.parse.urlencode(dict(countryIsoCode="DE", subdivisionCode="DE-SN", languageIsoCode="DE", validFrom=frm, validTo=to))
    with urllib.request.urlopen(f"{API}/{kind}?{q}", timeout=30) as r:
        return json.load(r)

def name(x):
    return next((n["text"] for n in x["name"] if n.get("language") == "DE"), x["name"][0]["text"])

first = int(sys.argv[1]) if len(sys.argv) > 1 else 2025
last = int(sys.argv[2]) if len(sys.argv) > 2 else 2029
school, public = {}, {}
for y in range(first, last + 1):
    for x in get("SchoolHolidays", f"{y}-06-01", f"{y+1}-09-30"):
        school[(x["startDate"], x["endDate"])] = name(x)
    for x in get("PublicHolidays", f"{y}-08-01", f"{y+1}-08-31"):
        public[x["startDate"]] = name(x)
out = dict(source=API, state="SN",
           school=[[a, b, n] for (a, b), n in sorted(school.items())],
           public=[[d, n] for d, n in sorted(public.items())])
with open("src/ferien_sn.json", "w") as f:
    json.dump(out, f, ensure_ascii=False, indent=0)
print(len(out["school"]), "Ferienabschnitte,", len(out["public"]), "Feiertage")
