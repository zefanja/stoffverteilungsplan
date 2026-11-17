import json, datetime as dt, sys
sys.path.insert(0,'src')
from atoms import ATOMS
P=json.load(open('src/plan.json'))
CAL=dict(start="2026-08-17",end="2027-07-09",
 holidays=[dict(name="Herbstferien",frm="2026-10-12",to="2026-10-24"),dict(name="Weihnachtsferien",frm="2026-12-23",to="2027-01-02"),
           dict(name="Winterferien",frm="2027-02-08",to="2027-02-19"),dict(name="Osterferien",frm="2027-03-26",to="2027-04-02"),
           dict(name="Pfingstferien",frm="2027-05-15",to="2027-05-18")],
 free=[dict(date="2026-11-18",name="Buß- und Bettag"),dict(date="2027-05-06",name="Christi Himmelfahrt"),dict(date="2027-05-07",name="unterrichtsfreier Tag")])
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
META={"kl6":dict(label="Klasse 6",short="6",nameA="LB 1 + 2 · Zahlen und Zuordnungen",nameB="LB 3 + 4 · Geometrie",sol=False),
      "kl8":dict(label="Klasse 8",short="8",nameA="LB 1 + 3 + 5 · Algebra und Funktionen",nameB="LB 2 + 4 · Zufall und Ähnlichkeit",sol=True)}
def days():
    d=dt.date.fromisoformat(CAL['start']); e=dt.date.fromisoformat(CAL['end'])
    fr={f['date'] for f in CAL['free']}
    while d<=e:
        iso=d.isoformat()
        if d.weekday()<5 and iso not in fr and not any(h['frm']<=iso<=h['to'] for h in CAL['holidays']): yield d
        d+=dt.timedelta(1)
FER=json.load(open('src/ferien_sn.json'))
out=dict(calendar=CAL,ferienSN=dict(school=FER['school'],public=FER['public']),classes={})
for k in ("kl6","kl8"):
    c=P[k]; units={}
    for code,u in c['units'].items():
        u=dict(u); u.setdefault('stunden',[])
        u['atoms']=[dict(id=f"{code}.{i+1}",l=a[0],t=a[1],q=a[2],a=a[3]) for i,a in enumerate(ATOMS[k].get(code,[]))]
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
js="window.PLAN_DATA="+json.dumps(out,ensure_ascii=False,separators=(",",":"))+";"
open('dist/data.js','w').write(js); print(len(js))
