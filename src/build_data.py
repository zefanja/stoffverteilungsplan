import json, datetime as dt, sys
sys.path.insert(0,'src')
from atoms import ATOMS
from atoms_levels import LEVELS
P=json.load(open('src/plan.json'))
CAL=dict(start="2026-08-17",end="2027-07-09",
 holidays=[dict(name="Herbstferien",frm="2026-10-12",to="2026-10-24"),dict(name="Weihnachtsferien",frm="2026-12-23",to="2027-01-02"),
           dict(name="Winterferien",frm="2027-02-08",to="2027-02-19"),dict(name="Osterferien",frm="2027-03-26",to="2027-04-02"),
           dict(name="Pfingstferien",frm="2027-05-15",to="2027-05-18")],
 free=[dict(date="2026-11-18",name="Buß- und Bettag"),dict(date="2026-11-19",name="HA-Tag"),dict(date="2026-11-20",name="HA-Tag"),dict(date="2027-05-06",name="Christi Himmelfahrt"),dict(date="2027-05-07",name="unterrichtsfreier Tag")])
L=lambda day,period,track: dict(day=day,period=period,track=track)
# Stundenplan-Versionen: jede gilt ab "frm" bis zum Tag vor der nächsten Version
TT={"kl6":[dict(frm=CAL['start'],lessons=[L(1,3,"A"),L(3,2,"B"),L(4,4,"A"),L(5,1,"B")])],
    "kl8":[dict(frm=CAL['start'],lessons=[L(1,2,"A"),L(2,5,"B"),L(4,1,"A"),L(5,3,"B")]),
           dict(frm="2026-10-26",lessons=[L(1,2,"A"),L(2,5,"B"),L(4,1,"A"),L(5,3,"SOL")])]}
def lessons_on(k,iso):
    cur=None
    for v in TT[k]:
        if v['frm']<=iso: cur=v
    return cur['lessons'] if cur else []
# Klassen-IDs kl6/kl8 bleiben wegen der gespeicherten Daten; neue Klassen z. B. "gym7", "os5".
META={"kl6":dict(type="gym",grade=6,label="Klasse 6",short="6",nameA="LB 1 + 2 · Zahlen und Zuordnungen",nameB="LB 3 + 4 · Geometrie",sol=False),
      "kl8":dict(type="gym",grade=8,label="Klasse 8",short="8",nameA="LB 1 + 3 + 5 · Algebra und Funktionen",nameB="LB 2 + 4 · Zufall und Ähnlichkeit",sol=True)}
def days():
    d=dt.date.fromisoformat(CAL['start']); e=dt.date.fromisoformat(CAL['end'])
    fr={f['date'] for f in CAL['free']}
    while d<=e:
        iso=d.isoformat()
        if d.weekday()<5 and iso not in fr and not any(h['frm']<=iso<=h['to'] for h in CAL['holidays']): yield d
        d+=dt.timedelta(1)
FER=json.load(open('src/ferien_sn.json'))
SCHOOL_TYPES={"gym":dict(label="Gymnasium",short="GYM",grades=list(range(5,13))),
              "os":dict(label="Oberschule",short="OS",grades=list(range(5,11)))}
out=dict(schoolTypes=SCHOOL_TYPES,calendar=CAL,ferienSN=dict(school=FER['school'],public=FER['public']),classes={})
for k in META:
    c=P[k]; units={}
    for code,u in c['units'].items():
        u=dict(u); u.setdefault('stunden',[])
        u['atoms']=[dict(id=f"{code}.{i+1}",l=a[0],t=a[1],q=a[2],a=a[3]) for i,a in enumerate(ATOMS[k].get(code,[]))]
        lv=LEVELS.get(k,{}).get(code,[])
        assert len(lv) in (0,len(u['atoms'])),(k,code,len(lv),len(u['atoms']))
        for a,x in zip(u['atoms'],lv): a.update(q2=x[0],a2=x[1],q3=x[2],a3=x[3])
        for a in u['atoms']: assert 1<=a['l']<=max(1,len(u['stunden'])),(code,a)
        units[code]=u
    seq=[list(r) for r in c['seq']]
    mode=c['mode']
    # capacity
    cap={"A":0,"B":0}
    for d in days():
        for t in lessons_on(k,d.isoformat()):
            if t['day']!=d.isoweekday(): continue
            if t['track']=="SOL": continue
            tr="A" if mode=="nacheinander" else t['track']
            cap[tr]+=1
    for tr in ("A","B"):
        used=sum(r[2] for r in seq if ("A" if mode=="nacheinander" else r[1])==tr)
        diff=cap[tr]-used
        # adjust last P of that track
        for r in reversed(seq):
            if diff==0: break
            if r[0]=="P" and ("A" if mode=="nacheinander" else r[1])==tr:
                nv=max(0,r[2]+diff); diff-= (nv-r[2]); r[2]=nv
        print(k,tr,"cap",cap[tr],"used",used,"rest",diff)
    out['classes'][k]=dict(**META[k],units=units,unitOrder=list(units.keys()),seq=seq,mode=mode,tt=TT[k],lbnames=c['lbnames'],zrw=c['zrw'])
    print(k,"atoms",sum(len(u['atoms']) for u in units.values()))
# Alle weiteren Klassen aus den Lehrplänen; GYM 6 und 8 behalten ihre ausgearbeiteten Pläne mit Atomen.
from from_lehrplan import build as build_lehrplan
LP=json.load(open('src/lehrplan.json'))
done={(m['type'],m['grade'],None) for m in META.values()}
for k,c in build_lehrplan(LP,CAL).items():
    if (c['type'],c['grade'],c['variant']) in done: continue
    out['classes'][k]=c
    print(k,c['label'],'Std.',sum(r[2] for r in c['seq']),'cap',c['cap'],'Stoff',sum(r[2] for r in c['seq'] if r[0][0].isdigit()),'zrw',sum(c['zrw'].values()),'KA',sum(1 for r in c['seq'] if r[0].startswith('KA')),'Ende',c['endRule'])
for k in META: out['classes'][k].update(variant=None,variantLabel="",source="stoffverteilung")
# GYM 6/8: die inhaltsbezogenen Klassenarbeiten der Excel-Pläne durch vier allgemeine Platzhalter KA1–KA4 ersetzen (Stunden
# bleiben). Bei zwei Strängen wechseln sie sich ab (KA1 A, KA2 B, …), damit jeder Strang zwei Arbeiten trägt.
from from_lehrplan import ka_unit
for k in META:
    c=out['classes'][k]; old=[code for code,u in c['units'].items() if u.get('lb')=='test']
    rows=[r for r in c['seq'] if r[0] in old]
    rank={}; order=[]
    for r in rows: rank[id(r)]=sum(1 for x in rows[:rows.index(r)] if x[1]==r[1]); order.append(r)
    order.sort(key=lambda r:(rank[id(r)],r[1]))
    for code in old: del c['units'][code]
    for n,r in enumerate(order,1):
        r[0]=f"KA{n}"; c['units'][r[0]]=ka_unit(r[0],n,"Klassenarbeit",r[2])
    c['unitOrder']=[x for x in c['unitOrder'] if x not in old]+[f"KA{n}" for n in range(1,len(order)+1)]
    c['oldKA']=old
    assert len(order)==4,(k,len(order))
# Aufgabengeneratoren (Anemo) je Atom: Feld "g" = Generator-ID oder Liste; ohne Eintrag bleiben die festen Fragen.
GMAP=json.load(open('src/generator_map.json')); GIDS=set(json.load(open('src/anemo/labels.json')))
ng=0
for k,m in GMAP.items():
    if k.startswith('_'): continue
    byid={a['id']:a for u in out['classes'][k]['units'].values() for a in u['atoms']}
    for aid,g in m.items():
        assert aid in byid,(k,aid)
        for x in (g if isinstance(g,list) else [g]): assert x in GIDS,(k,aid,x)
        byid[aid]['g']=g; ng+=1
print("Atome mit Generator:",ng,"von",sum(len(u['atoms']) for c in out['classes'].values() for u in c['units'].values()))
out['defaultMine']=list(META.keys())
out['lehrplanQuelle']=dict(url=LP['quelle'],abgerufen=LP['abgerufen'])
js="window.PLAN_DATA="+json.dumps(out,ensure_ascii=False,separators=(",",":"))+";"
open('dist/data.js','w').write(js); print(len(js))
