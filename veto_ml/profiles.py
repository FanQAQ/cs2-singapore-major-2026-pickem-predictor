"""Prepare pre-lock BO3 action/opportunity counts without reading target truth."""
import argparse
import bisect
import gzip
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from stage3_maps.inputs import collect, veto_counts
from stage3_maps.profiles import FIELDS
from tail_calibration import training as rankings
from map_strength.build import POOLS


def read(path):
    content = path.read_bytes()
    return json.loads(gzip.decompress(content) if path.suffix == '.gz' else content)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def store(path, data, check):
    raw = (json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode()
    if path.suffix == '.gz':
        raw = gzip.compress(raw, mtime=0)
    if check:
        assert path.read_bytes() == raw, path
    else:
        path.write_bytes(raw)


def fields():
    majors = read(ROOT / 'f1bre_models/major-fields.json')['fields']
    out = {k:dict(f, id=k, pool=POOLS[k.split('-')[0]][0].split()) for k,f in majors.items()}
    for fpath, fallback in [('f1bre_models/cluj-field.json','cologne'),
                            ('latent_form/bucharest-field.json','austin'),('veto_ml/astana-field.json','austin')]:
        f = read(ROOT / fpath)
        out[f['id']] = dict(f, pool=f.get('pool') or POOLS[fallback][0].split())
    return out


def core(raw, org):
    return frozenset(rankings.roster([n.split('@')[0] for n in raw], org))


def summarize(sides, names):
    counts = [len(x) for x in sides.values()]
    dates = [r['day'] for votes in sides.values() for r in votes]
    unique = {r['series'] for votes in sides.values() for r in votes}
    return dict(uniqueBO3=len(unique), teamRows=sum(counts), first=min(dates,default=None),
                last=max(dates,default=None), counts={k:len(sides.get(k,[])) for k in names},
                lastByTeam={k:max((r['day'] for r in sides.get(k,[])),default=None) for k in names})


def archived(out):
    old = read(ROOT / 'stage3_maps/profiles.json')
    raw = read(ROOT / 'stage3_maps/field-maps.json')['fields']
    counts = read(ROOT / 'stage3_maps/field-veto.json')['fields']
    extra = read(ROOT / 'cologne_veto/eval-profiles.json')
    for k, p in old.items():
        f = raw[k]
        names = [t['name'] for t in f['teams']]
        clubs = {t['name']:core(t['roster'],t['name']) for t in f['teams']}
        schedules = {}
        for g in f['maps']:
            for side in ('a','b'):
                five = core(g['five' + side.upper()],g[side])
                owners = [t for t,roster in clubs.items() if len(roster & five)>=3]
                if len(owners)==1:
                    schedules[(g['series'],side)] = (owners[0],g['bo'])
        sides = defaultdict(list)
        for r in counts[k]['observations']:
            match = schedules.get((r['series'],r['side']))
            if match and match[1]==3:
                sides[match[0]].append(r)
        teams = p['mapVeto']['teams']
        if k==extra['id']:
            teams = extra['augmentedVeto']
            for g in extra['audit']:
                if g['bo']==3 and g['complete']:
                    for t in g['stage3Cores']:
                        sides[t].append(dict(series='stage2:'+str(g['hltvId']),day=g['day']))
        cov = summarize(sides,names)
        assert all(cov['counts'][t] == teams[t]['bo3']['n'] for t in names), k
        out[k]=dict(start=f['start'], cutoffExclusive=f['start'], pool=f['pool'], teams=teams,
                    coverage=cov, source='stage3_maps/profiles.json' if k!=extra['id'] else 'cologne_veto/eval-profiles.json')


def supplemental():
    # Reuse actual late-period veto facts. Require the opposing five from the
    # same Ektarr series, or both independently captured HLTV team-side rows.
    rows = read(ROOT/'map_veto_data/evidence.json.gz')
    meta = read(ROOT/'map_strength/events.json')
    return [dict(r,pool=meta[r['event']]['pool']) for r in rows if
            r['event'] in ('singapore','cologne') and r['format']=='bo3' and r['date']>'2026-03-23']


def griffin_data(directory):
    # This pinned extractor verifies all five CSV hashes and stops on 2026-11-02.
    sys.path.insert(0,str(ROOT/'map_veto_data'))
    from extract_singapore_csv import build
    return build(directory)


def profile(f, games, supplements, tables, griffin):
    high=f.get('cutoffExclusive',f['start'])[:10]
    low=(date.fromisoformat(high)-timedelta(days=90)).isoformat()
    pool=f['pool']
    clubs={t['name']:core(t['roster'],t['name']) for t in f['teams']}
    assert len(clubs)==16 and len(set(pool))==7
    schedule={t:{} for t in clubs}
    rows=defaultdict(list)
    publications=[r['published'][:10] for r in tables]
    rankcache={}
    eligible={}
    def owner(five):
        matches=[(t,len(c&five)) for t,c in clubs.items() if len(c&five)>=3]
        return matches[0] if len(matches)==1 else (None,None)
    def register(sid,day,bo,names,fives,counts=None,src=None):
        if any(len(v)!=5 for v in fives) or fives[0]&fives[1]:
            return
        who=[owner(v) for v in fives]
        if not any(t for t,_ in who) or who[0][0]==who[1][0]:
            return
        rid=bisect.bisect_left(publications,day)-1
        if rid<0: return
        def rank(five):
            key=(rid,five)
            if key not in rankcache: rankcache[key]=rankings.rank_for(five,tables[rid])
            return rankcache[key]
        ra,rb=(rank(v) for v in fives)
        if not ra or not rb or ra[0] is rb[0]: return
        for i,(name,common) in enumerate(who):
            if name:
                evidence=(common,fives[1-i],day)
                assert schedule[name].setdefault(sid,evidence)==evidence,(f['id'],name,sid)
                if counts and bo==3:
                    rows[name].append(dict(series=sid,day=day,counts=counts['ab'[i]],source=src))
        eligible[sid]=(day,bo,fives,who,names)
    for g in games:
        if not low<=g['day']<high or not any(m[1] in pool for m in g['maps']):
            continue
        fives=[core(g['five'+x.upper()],g[x]) for x in ('a','b')]
        counts=veto_counts(g['steps'],g['bo'],pool)
        register(g['series'],g['day'],g['bo'],[g['a'],g['b']],fives,counts,g['sourceUrl'])
    # The later Griffin team export was selected for the prospective field only.
    # Bind a previously seen fixture by both fives, day and series length.
    # Its complete 7-step veto is usable even when Ektarr lacks that match.
    if f['id']=='singapore':
        for m in griffin:
            if not (low<=m['day']<high and m['lineupA'] and m['lineupB']) or not any(g[0] in pool for g in m['maps']):
                continue
            fives=[core(m['lineupA'],m['a']),core(m['lineupB'],m['b'])]
            matches=[sid for sid,(day,bo,rv,_,_) in eligible.items() if
                     day==m['day'] and bo==m['bo'] and set(rv)==set(fives)]
            if len(matches)>1: continue
            sid=matches[0] if matches else 'hltv:'+str(m['mid'])
            register(sid,m['day'],m['bo'],[m['a'],m['b']],fives,veto_counts(m['steps'],m['bo'],pool),m['url'])
    extra=defaultdict(list)
    for r in supplements:
        if low <= r['date'] < high and set(r['pool'])==set(pool):
            extra[r['hltvId']].append(r)
    rejected=Counter()
    for mid,rs in extra.items():
        # Only deduplicate matching target-day, exact recorded rosters and unambiguous match ID.
        ids={m.group(1) for r in rs if (m:=re.search(r'Ektarr (\d+)',r['rosterSource']))}
        possible = ['ektarr:'+i for i in ids if 'ektarr:'+i in eligible]
        if not possible and len(ids)==0:
            for sid,(day,bo,fives,_,_) in eligible.items():
                # A single team's five can play two opponents on the same day.
                # Require an exact source ID or BOTH source fives for a join.
                card_fives={core(r['roster'],r['team']) for r in rs}
                if day==rs[0]['date'] and bo==3 and (sid=='hltv:'+str(mid) or card_fives==set(fives)):
                    possible.append(sid)
        if len(possible)!=1:
            rejected['noUniqueRankedOpponentSchedule']+=1
            continue
        sid=possible[0];day,bo,fives,who,_=eligible[sid]
        assert day==rs[0]['date'] and bo==3
        for r in rs:
            v=core(r['roster'],r['team'])
            if v not in fives: continue
            t=who[fives.index(v)][0]
            if not t or any(row['series']==sid for row in rows[t]):continue
            ix=[r['pool'].index(m) for m in pool]
            counts=[[line[i] for i in ix] for line in r['counts']]
            rows[t].append(dict(series=sid,day=day,counts=counts,source=r['url']))
    asof=date.fromisoformat(high)-timedelta(days=1)
    teams={}
    audit={}
    for t in clubs:
        totals={key:dict.fromkeys(pool,0.) for key in FIELDS}
        evidence=[]
        for r in rows[t]:
            common,opp,day=schedule[t][r['series']]
            repeat=sum(len(opp & other[1])>=3 for other in schedule[t].values())
            age=(asof-date.fromisoformat(day)).days
            assert repeat>=1 and 0<=age<90
            w=common/5*0.5**(age/45)/repeat
            for k,counts in zip(FIELDS,r['counts']):
                for m,n in zip(pool,counts):totals[k][m]+=n*w
            evidence.append([r['series'],day,common,repeat,r['counts'],r['source']])
        assert len({r[0] for r in evidence})==len(evidence)
        audit[t]=evidence
        teams[t]={'bo3':dict(n=len(evidence),**{k:{m:round(x,8) for m,x in v.items()} for k,v in totals.items()})}
    cov=summarize(rows,clubs)
    cov.update(windowStart=low,supplementExclusions=dict(rejected))
    return dict(start=f['start'],cutoffExclusive=high,pool=pool,teams=teams,coverage=cov,source='weighted-sides.json.gz'),audit


def main(args):
    out={}; archived(out)
    new={k:f for k,f in fields().items() if k not in out}
    windows=[]
    for f in new.values():
        high=f.get('cutoffExclusive',f['start'])[:10]
        windows.append(((date.fromisoformat(high)-timedelta(days=90)).isoformat(),high))
    games=collect(args.hltvy.parent,args.ektarr,windows)
    tables=rankings.release_tables(args.ranks)
    supplements=supplemental()
    griffin=griffin_data(args.griffin)
    audit={}
    for k,f in new.items():
        out[k],audit[k]=profile(f,games,supplements,tables,griffin)
    for k,f in out.items():
        c=f['coverage']
        print(k,c['uniqueBO3'],len([n for n in c['counts'].values() if n]),c['first'],c['last'])
    deps={str(p.relative_to(ROOT)).replace('\\','/'):sha(p) for p in (
        ROOT/'stage3_maps/profiles.json',ROOT/'cologne_veto/eval-profiles.json',
        ROOT/'stage3_maps/field-maps.json',ROOT/'stage3_maps/field-veto.json',ROOT/'map_veto_data/evidence.json.gz',
        ROOT/'map_strength/events.json',ROOT/'tail_calibration/training-releases.json',ROOT/'f1bre_models/major-fields.json',
        ROOT/'f1bre_models/cluj-field.json',ROOT/'latent_form/bucharest-field.json',HERE/'astana-field.json')}
    deps.update(hltvy=sha(args.hltvy),ektarr=sha(args.ektarr))
    for name in ('maps','series','lineups','player_stats','veto_steps'):
        deps['griffin/'+name+'.csv']=sha(args.griffin/(name+'.csv'))
    store(HERE/'weighted-sides.json.gz',dict(fields=audit,sources=deps),args.check)
    store(HERE/'profiles.json.gz',dict(fields=out,sources=deps),args.check)


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--check',action='store_true')
    for name in ('hltvy','ektarr','ranks','griffin'):ap.add_argument('--'+name,type=Path,required=True)
    main(ap.parse_args())
