import json,sys
from openpyxl import load_workbook
out={}
for k,f in (("kl6","in/kl6.xlsx"),("kl8","in/kl8.xlsx")):
    wb=load_workbook(f)
    E=wb["Einheiten"]; units={}
    for r in range(2,E.max_row+1):
        c=E.cell(r,1).value
        if not c: continue
        units[c]=dict(code=c,lb=E.cell(r,2).value,title=E.cell(r,3).value)
    for c,u in units.items():
        if c not in wb.sheetnames: continue
        X=wb[c]
        def bl(cell):
            v=X[cell].value
            if not v or v=="—": return []
            return [x[2:] if x.startswith("• ") else x for x in v.split("\n")]
        u.update(inhalte=bl("A7"),tiefe=bl("A10"),vorwissen=bl("A13"),begriffe=(bl("E7")[0].split(", ") if bl("E7") else []),hinweise=bl("E10"),material=bl("E13"))
        st=[]; r=17
        while X.cell(r,2).value: st.append(X.cell(r,2).value); r+=1
        u['stunden']=st
    S=wb["Sequenz"]; seq=[]
    for r in range(6,66):
        c=S.cell(r,2).value
        if c: seq.append([c,S.cell(r,4).value,S.cell(r,5).value])
    K=wb["Kalender"]
    out[k]=dict(units=units,seq=seq,mode=K["C3"].value,lbnames={},zrw={})
    O=wb["Übersicht"]
    for r in range(4,13):
        out[k]['lbnames'][O.cell(r,1).value]=O.cell(r,2).value
        if O.cell(r,3).value: out[k]['zrw'][O.cell(r,1).value]=O.cell(r,3).value
json.dump(out,open("src/plan.json","w"),ensure_ascii=False,indent=0)
for k in out:
    print(k,len(out[k]['units']),len(out[k]['seq']),out[k]['mode'],out[k]['zrw'])
    for c,u in out[k]['units'].items(): print(' ',c,u['lb'],len(u.get('stunden',[])),u['title'][:40])
