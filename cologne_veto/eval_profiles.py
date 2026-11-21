"""Join all Stage 2 matches to verified action lanes, keeping 362 map observations frozen."""
import argparse
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from copy import deepcopy
from datetime import date
from pathlib import Path

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
sys.path.insert(0,str(ROOT))
from map_strength.build import roster, team_for
from stage3_maps.profiles import FIELDS
from experience.build_history import normalize as historical_nick

ID='cologne-2026-3'
CUTOFF=date(2026,6,10)

def read(p):
    return json.loads(p.read_text(encoding='utf8'))

def teamfive(names):
    return roster(n.split('@')[0] for n in names)

def norm(name):
    return re.sub('[^a-z0-9]','',name.lower())

def equivalent_five(a,b):
    def canonical(names):
        observed={'v$m':'vsm','hunter-':'hunter'}
        normalized=(historical_nick(n.split('@')[0]) for n in names)
        return {observed.get(n,n) for n in normalized}
    return canonical(a)==canonical(b)

def games_and_aliases():
    raw=read(ROOT/'major_form/all_stages.json')['editions']['cologne']['matches']
    stages=read(ROOT/'multi_stage/inputs.json')
    seeded=next(e for e in stages if e['id']=='cologne-2026-2')['teams']
    entrants={t['name']:teamfive(t['roster']) for t in seeded}
    schedule=[g for g in raw if g['stage']==2]
    assert Counter(g['bo'] for g in schedule)=={1:20,3:13}
    aliases={norm(t):t for t in entrants}
    indexed={}
    for g in schedule:
        a,b=(team_for(teamfive(g[k]),entrants)[0] for k in ('rosterA','rosterB'))
        assert a!=b
        for label,source in ((a,g['a']),(b,g['b'])):
            assert aliases.setdefault(norm(source),label)==label
        key=frozenset([a,b])
        assert key not in indexed
        indexed[key]={'source':g,'a':a,'b':b}
    for abbr,full in {'bb':'BetBoom','bbteam':'BetBoom','spirit':'Spirit','gl':'GamerLegion',
                       'fq':'FlyQuest','futesports':'FUT','pain':'paiN','mibr':'MIBR'}.items():
        if full in entrants:
            aliases[abbr]=full
    return indexed,aliases

def rankings():
    data=(ROOT/'vrs_repair/sources/2026-06-01-global.md').read_text(encoding='utf8')
    ref=read(ROOT/'stage3_maps/inputs-snapshots.json')['2026-06-01']
    assert hashlib.sha256(data.encode()).hexdigest()==ref
    rows=[]
    for ln in data.splitlines():
        cells=[v.strip() for v in ln.split('|')]
        if len(cells)>4 and cells[1].isdigit():
            five=[n for n in cells[4].split(', ') if n]
            if len(five)==5:
                rows.append((teamfive(five),int(cells[2]),cells[3]))
    assert len(rows)>100
    def resolve(five):
        candidates=sorted(((len(five & f),p,n) for f,p,n in rows),reverse=True)
        n,p,team=candidates[0]
        assert n>=3 and n>candidates[1][0]
        return {'points':p,'team':team,'overlap':n,'rankDay':'2026-06-01'}
    return resolve

def lanes(steps,bo,names,aliases,pool):
    expected=(['ban']*6 if bo==1 else ['ban','ban','pick','pick','ban','ban'])+['left']
    assert len(steps)==7
    remaining=set(pool)
    result={n:[[0]*7 for _ in FIELDS] for n in names}
    actors=[]
    for i,step in enumerate(steps):
        action={'remove':'ban','removed':'ban','banned':'ban','picked':'pick','decider':'left',
                'leftover':'left','remaining':'left'}.get(step['action'].lower(),step['action'].lower())
        assert action==expected[i],(names,action,i)
        mp=next(m for m in remaining if norm(m)==norm(step['map']))
        if i<6:
            who=aliases[norm(step['team'])]
            assert who in names
            actors.append(who)
            k=0 if action=='ban' else 1
            result[who][k][pool.index(mp)]+=1
            for m in remaining:result[who][k+2][pool.index(m)]+=1
        else:assert step['team'] is None
        remaining.remove(mp)
    assert not remaining
    for t in names:
        assert (sum(result[t][0]),sum(result[t][1]))==((3,0) if bo==1 else (2,1))
    order=''.join('A' if a==actors[0] else 'B' for a in actors)
    assert order==('AABBBA' if bo==1 else 'ABABBA'),(names,order)
    return result,order

def field_series(field,entrants):
    indexed=defaultdict(dict)
    editions={}
    witnesses={}
    for m in field['maps']:
        a,b=teamfive(m['fiveA']),teamfive(m['fiveB'])
        sid=m['series']
        assert editions.setdefault(sid,(m['day'],m['bo'],a,b))==(m['day'],m['bo'],a,b)
        for side,own,opp in [('a',a,b),('b',b,a)]:
            who=team_for(own,entrants)
            if who:
                t,n=who
                meta={'day':m['day'],'common':n,'opp':opp,'bo':m['bo']}
                indexed[t][sid]=meta
                witnesses[(sid,side)]=(t,meta)
    return indexed,editions,witnesses

def reweight(pool,names,schedule,observations):
    out={t:{'bo3':{'n':0,**{f:dict.fromkeys(pool,0.) for f in FIELDS}}} for t in names}
    seen=set()
    for sid,t,counts in observations:
        assert (sid,t) not in seen
        seen.add((sid,t))
        row=schedule[t][sid]
        assert row['bo']==3
        overlap=sum(len(other['opp']&row['opp'])>=3 for other in schedule[t].values())
        age=(CUTOFF-date.fromisoformat(row['day'])).days
        assert 0<=age<90 and overlap>=1
        weight=row['common']/5*0.5**(age/45)/overlap
        part=out[t]['bo3']
        part['n']+=1
        for key,vals in zip(FIELDS,counts):
            for m,n in zip(pool,vals):part[key][m]+=weight*n
    for v in out.values():
        for key in FIELDS:v['bo3'][key]={m:round(n,8) for m,n in v['bo3'][key].items()}
    return out

def build(ledger):
    frozen=read(ROOT/'stage3_maps/profiles.json')[ID]
    field=read(ROOT/'stage3_maps/field-maps.json')['fields'][ID]
    old=read(ROOT/'stage3_maps/field-veto.json')['fields'][ID]['observations']
    assert len(field['maps'])==362 and len(set(r['series'] for r in old))==25
    assert max(r['day'] for r in old)<'2026-06-06'
    pool=field['pool']
    entrants={t['name']:teamfive(t['roster']) for t in field['teams']}
    indexed,aliases=games_and_aliases()
    resolve=rankings()
    schedule,known,witness=field_series(field,entrants)
    old_votes=[(r['series'],witness[r['series'],r['side']][0],r['counts']) for r in old
               if (r['series'],r['side']) in witness and witness[r['series'],r['side']][1]['bo']==3]
    baseline=reweight(pool,entrants,schedule,old_votes)
    assert baseline==frozen['mapVeto']['teams']
    expanded=deepcopy(schedule)
    tape,added,agreed=[],[],[]
    seen=set()
    assert len(ledger)==33
    official={r['stage2Id']:r for r in read(HERE/'official-blast.json')['matches']}
    reference=read(HERE/'reference.json')
    posted={r['hltvId']:r for r in reference['records']}
    independent={r['stage2Id']:r for r in read(HERE/'official-crosscheck.json')['matches']}
    assert len(independent)==33
    for row in ledger:
        key=frozenset(aliases[norm(x)] for x in (row['a'],row['b']))
        assert key not in seen
        seen.add(key)
        data=indexed[key];g=data['source'];day=g['day'];bo=g['bo']
        assert row['day']==day and row['bo']==bo and day<'2026-06-11'
        assert g['pointsAsOf']=='2026-06-01'
        a,b=teamfive(g['rosterA']),teamfive(g['rosterB'])
        vs=[resolve(a),resolve(b)]
        assert vs[0]['team']!=vs[1]['team']
        blast=official[row['hltvId']]
        assert blast['day']==day and blast['bo']==bo and {aliases[norm(blast[k])] for k in ('a','b')}==key
        lineup={aliases[norm(blast['a'])]:blast['fiveA'],aliases[norm(blast['b'])]:blast['fiveB']}
        assert equivalent_five(a,lineup[data['a']]) and equivalent_five(b,lineup[data['b']]),(key,lineup)
        winner=aliases[norm(blast['a'] if blast['score'][0]>blast['score'][1] else blast['b'])]
        assert winner==(data['a'] if g['y'] else data['b'])
        joined=[sid for sid,(d,h,p,q) in known.items() if d==day and h==bo and
                ((len(a&p)>=3 and len(b&q)>=3) or (len(a&q)>=3 and len(b&p)>=3))]
        assert len(joined)<=1,(key,joined)
        sid=joined[0] if joined else 'valve:'+str(g['id'])
        actions=row.get('actions')
        sides=None;order=None
        if actions:
            sides,order=lanes(actions,bo,[data['a'],data['b']],aliases,pool)
            assert row['sources']
            original=posted[row['hltvId']]
            assert original['utcPublishedAt']<reference['stage3ScheduledStartUtc']
            assert all(original[k]<reference['stage3ScheduledStartUtc'] for k in ('utcFirstCapture','utcSecondCapture'))
            assert original['url'] in row['sources']
            selected=[v['map'] for v in actions if v['action']!='ban']
            assert [m[0] for m in blast['maps']]==selected[:len(blast['maps'])]
            second=independent[row['hltvId']]
            assert [s['map'] for s in actions]==[s['map'] for s in second['sourceSteps']]
        owners=[]
        for n,own,opp in [(data['a'],a,b),(data['b'],b,a)]:
            who=team_for(own,entrants)
            if not who:continue
            team,common=who
            owners.append(team)
            if bo==3:
                if sid in expanded[team]:
                    assert equivalent_five(expanded[team][sid]['opp'],opp) and expanded[team][sid]['common']==common
                else:
                    expanded[team][sid]={'day':day,'common':common,'opp':opp,'bo':bo}
                if sides:
                    added.append((sid,team,sides[n]))
                    if not second['differences']:agreed.append((sid,team,sides[n]))
        tape.append({'hltvId':row['hltvId'],'stage2Series':g['id'],'fieldMapSeries':joined[0] if joined else None,
            'day':day,'bo':bo,'teams':[data['a'],data['b']],'stage3Cores':owners,'rankChecks':vs,
            'complete':bool(actions),'actorOrder':order,'sources':row.get('sources',[]),'reason':row.get('reason'),
            'officialUrl':blast['sourceUrl'],'playedMapsChecked':len(blast['maps']),
            'secondSourceAgrees':not second['differences'] if actions else None})
    assert seen==set(indexed) and len({r['hltvId'] for r in tape})==33
    controlled=reweight(pool,entrants,expanded,old_votes)
    augmented=reweight(pool,entrants,expanded,old_votes+added)
    confirmed=reweight(pool,entrants,expanded,old_votes+agreed)
    return {'id':ID,'oldUniqueBO3':25,'frozenMapCount':362,'additionalEligibleBO3':len({s for s,_,_ in added}),
            'additionalTeamVotes':len(added),'agreementEligibleBO3':len({s for s,_,_ in agreed}),
            'audit':tape,'oldFixedSchedule':controlled,'agreementOnlyVeto':confirmed,'augmentedVeto':augmented}

if __name__=='__main__':
    args=argparse.ArgumentParser()
    args.add_argument('--check',action='store_true')
    opt=args.parse_args()
    output=build(read(HERE/'ledger.json')['matches'])
    target=HERE/'eval-profiles.json'
    text=json.dumps(output,ensure_ascii=False,separators=(',',':'))+'\n'
    if opt.check: assert json.loads(target.read_text(encoding='utf8'))==output
    else:target.write_bytes(text.encode('utf8'))
