"""Assign pre-stage entry cohorts from the prior Swiss and the actual five on each side."""
import argparse
import gzip
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from tail_calibration.training import roster
from experience.build_history import AMBIGUOUS


def read(relative):
    p = ROOT / relative
    raw = p.read_bytes()
    return json.loads(gzip.decompress(raw) if p.suffix == '.gz' else raw)


def core(five, name):
    # The shared ML's roster routine resolves team-specific homonyms before matching.
    return set(roster([p.split('@')[0] for p in five], name)) - AMBIGUOUS


def group(field, previous, invited):
    teams = {t['name']:core(t['roster'],t['name']) for t in field['teams']}
    assert len(teams) == 16 and len(invited) == 8
    ledger = defaultdict(list)
    assert len(previous) == len({str(r['id']) for r in previous}) == 33
    for r in previous:
        assert r['day'] < field['start']
        for side in 'AB':
            starters = core(r['five'+side],r[side.lower()])
            found = [(t,len(starters & v)) for t,v in teams.items() if len(starters & v)>=3]
            assert len(found)<=1,(field['id'],r['id'],found)
            if found:
                name,n = found[0]
                ledger[name].append((str(r['id']),int(r['aWon'] == (side == 'A')),n))
    names = list(teams)
    assert set(ledger) == set(names) - {names[i] for i in invited}, (field['id'],set(ledger))
    rows = {}
    for t in names:
        if t not in ledger:
            rows[t] = dict(entry='direct')
            continue
        series = ledger[t]
        wins = sum(row[1] for row in series)
        assert wins == 3 and 3<=len(series)<=5 and len({r[0] for r in series})==len(series),(t,series)
        rows[t] = dict(entry='3-'+str(len(series)-wins),minCore=min(r[2] for r in series),
                       matches=[r[0] for r in series])
    assert Counter(row['entry'] for row in rows.values()) == {'direct':8,'3-0':2,'3-1':3,'3-2':3}
    return dict(start=field['start'],previousEnd=max(r['day'] for r in previous),teams=rows)


def cohorts():
    fields=read('f1bre_models/major-fields.json')['fields']
    edition=read('major_form/all_stages.json')['editions']
    stages=read('multi_stage/inputs.json')
    out={}
    for stage in stages:
        key=stage['id']
        games=[dict(id=g['id'],day=g['day'],a=g['a'],b=g['b'],fiveA=g['rosterA'],fiveB=g['rosterB'],aWon=bool(g['y']))
               for g in edition[stage['parent']]['matches'] if g['stage']==stage['stage']-1]
        out[key]=group(fields[key],games,range(8))
        out[key]['source']=stage['stageSources'][0]['url']
    e21=read('tail_calibration/epl21-field.json')
    games=[]
    for r in read('f1bre_models/elo-data.json.gz')['rows']:
        if r['event']=='ESL Pro League Season 21 Stage 1' and r['day']<e21['start']:
            wins=sum(x>y for _,x,y in r['maps'])
            games.append(dict(**r,aWon=wins>len(r['maps'])/2))
    out[e21['id']]=group(e21,games,e21['direct'])
    out[e21['id']]['source']=e21['seedingSource']
    e22=read('round_form/epl22-inputs.json')
    e23=read('epl_transfer/field.json')
    clubs={t['name']:t for t in read('epl_transfer/rosters.json')['teams']}
    e23['teams']=[clubs[n] for n in e23['entrants']]
    for field,prior,url in [
        (e22['target'],e22['priorStage'],e22['target']['seedingSource']),
        (e23,read('round_form/epl-inputs.json')['fields'][e23['id']],e23['seeding'])]:
        games=[dict(**g,aWon=g['score'][0]>g['score'][1]) for g in prior['series']]
        out[field['id']]=group(field,games,field['direct'])
        out[field['id']]['source']=url
    return out


if __name__=='__main__':
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--check',action='store_true')
    args=cli.parse_args()
    fields=cohorts()
    output=HERE/'entrants.json'
    data=(json.dumps(fields,ensure_ascii=False,indent=2)+'\n').encode()
    if args.check:
        assert json.loads(output.read_bytes()) == fields
    else:
        output.write_bytes(data)
    print(len(fields),'stages,',sum(len(f['teams']) for f in fields.values()),'verified entrants')
