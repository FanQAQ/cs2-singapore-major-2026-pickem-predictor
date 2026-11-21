"""Reconstruct PGL Astana 2025 Swiss. The field can be generated without the target rows."""
import argparse
from collections import Counter, defaultdict
from datetime import datetime
import gzip
import hashlib
import html
import json
from pathlib import Path
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from latent_form.bucharest import read_ranks
from map_veto_data.extract_archive import ARCHIVE_URL, SHA256, key, normalize
from round_form.epl22_inputs import ranking, utc_day

ID, EVENT, START, END = 'astana-2025', 'PGL Astana 2025', '2025-05-10', '2025-05-14'
ARTICLE_ID = '1749531500230'
ROSTER_URL = 'https://news.pglesports.com/api/articles/' + ARTICLE_ID
ROSTER_HASH = 'ce1192c6b2b1a6c1c76ddc8039c0e5932a9f6351bc652fc1d7ba5ef3e745329d'
DRAW = 'https://www.hltv.org/news/41597/pgl-astana-opening-matchups-revealed'
FORMAT = 'https://www.hltv.org/news/41628/pgl-astana-teams-format-schedule-prizes-talent-fantasy'
GROUP_URL = 'https://www.pglesports.com/_next/static/chunks/app/cs2/pgl-astana-2025/page-fb7e1b5997285411.js'
GROUP_HASH = '4930400ca68a6e2942a72007d2f392ad1f882eacb64fa4aca9324c30ede6c7a5'
OPENING = [('Aurora','BIG'), ('Astralis','ODDIK'), ('G2','MIBR'), ('The MongolZ','FURIA'),
           ('Virtus.pro','Ninjas in Pyjamas'), ('Natus Vincere','M80'), ('Spirit','GamerLegion'), ('paiN','HOTU')]
ORG = {'Team Spirit':'Spirit', 'HOTU Esports':'HOTU', 'G2 Esports':'G2', 'paiN Gaming':'paiN'}
ALIAS = {'Woody':'WOOD7', 'dav1deu$':'dav1deuS', 'huNter':'huNter-'}
CHANGES = {'G2':({'m0NESY'}, {'hades'}), 'Astralis':({'cadiaN'}, {'HooXi'}),
           'FURIA':({'chelo','skullz'}, {'molodoy','YEKINDAR'})}
STAND_INS = {
    'G2': dict(outgoing='huNter-',incoming='TaZ',announcedDay='2025-05-09',earliestVisaDay=None,
               url='https://x.com/G2CSGO/status/1920782752246309324',
               report='https://www.hltv.org/news/41642/taz-to-stand-in-for-hunter-at-pgl-astana'),
    'paiN': dict(outgoing='dgt',incoming='rikz',announcedDay='2025-05-09',earliestVisaDay='2025-05-12',
                 url='https://x.com/paiNGamingBR/status/1920856435350437976',
                 report='https://www.hltv.org/news/41643/rikz-to-stand-in-for-dgt-during-pgl-astana-opening-weekend'),
}
VERBS = ['ban','ban','pick','pick','ban','ban','left']
POOL = ['Ancient','Anubis','Dust2','Inferno','Mirage','Nuke','Train']


def announced_rosters(article):
    if isinstance(article, list):
        article, = [a for a in article if a['id'] == ARTICLE_ID]
    assert article['id'] == ARTICLE_ID and article['createdAt'] == '2025-04-28T11:26:29.404Z'
    # PGL's copy was migrated after the event; every starter is independently derived below.
    assert hashlib.sha256(article['content'].encode()).hexdigest() == ROSTER_HASH
    parts = re.split(r'<h3[^>]*>([^<]+)</h3>', article['content'])[1:]
    rosters = {}
    for org, body in zip(parts[::2],parts[1::2]):
        text = html.unescape(re.sub(r'<[^>]*>','',body))
        five = re.split(r'\s*[|/]\s*',text)[:5]
        rosters[ORG.get(org,org)] = [ALIAS.get(p,p) for p in five]
    assert set(rosters) == {name for pair in OPENING for name in pair}
    return article, rosters


def rank_reference(release):
    file, = release['files']
    return dict(asOf=release['rankDay'], publishedAt=release['published'], sha256=file['sha256'],
                url='https://github.com/ValveSoftware/counter-strike_regional_standings/blob/' +
                release['sha'] + '/' + file['path'])


def signature(game):
    first = game['steps'][0][0]
    assert [s[1] for s in game['steps']] == VERBS
    return ''.join('A' if s[0] == first else 'B' for s in game['steps'][:6])


def build_field(before, article, ranks_path, seed_path):
    original, announced = announced_rosters(article)
    releases = json.loads((ROOT/'tail_calibration/training-releases.json').read_bytes())
    release = max((r for r in releases if r['published'][:10] < START),key=lambda r:r['published'])
    seed_release, = [r for r in releases if r['rankDay']=='2025-03-03']
    assert release['rankDay'] == '2025-05-05'
    ranks, seeds = read_ranks(release,ranks_path), read_ranks(seed_release,seed_path)
    witnesses, evidence = {}, defaultdict(list)
    for r in before:
        assert utc_day(r) < START
        ev = r['event']
        rule_witness = (ev.startswith(EVENT+' ') and 'Qualifier' in ev) or ev=='PGL Bucharest 2025'
        if not (rule_witness or any(r.get(k) in announced for k in ('team1','team2'))):
            continue
        g = normalize(r)
        if not g:
            continue
        for s in ('a','b'):
            five = g['lineup'+s.upper()]
            if five and g[s] in announced:
                witnesses[g[s]] = dict(id=g['mid'],day=g['day'],roster=five,sourceUrl=g['url'])
        if rule_witness and g['bo'] == 3:
            assert set(POOL) == {step[2] for step in g['steps']}
            evidence[ev].append((signature(g),g['url']))

    teams = []
    for name in announced:
        witness = witnesses[name]
        departed, arrived = CHANGES.get(name,(set(),set()))
        assert departed.issubset(witness['roster'])
        registered = (set(witness['roster'])-departed)|arrived
        assert set(map(key,registered)) == set(map(key,announced[name])), (name,registered,announced[name])
        stand_in = STAND_INS.get(name)
        opening = registered
        if stand_in:
            assert stand_in['outgoing'] in registered and stand_in['announcedDay'] < START
            opening=(registered-{stand_in['outgoing']})|{stand_in['incoming']}
        five=sorted(opening,key=key)
        rank, seed = ranking(five,ranks), ranking(registered,seeds)
        teams.append(dict(name=name, roster=five, announcedRoster=announced[name], rosterWitness=witness,
                          standIn=stand_in,
                          changes=dict(outgoing=sorted(departed),incoming=sorted(arrived),sourceUrl=DRAW) if arrived else None,
                          points=rank['points'],rank=rank['rank'],ratingTeam=rank['name'],vrsRoster=rank['roster'],
                          overlap=rank['overlap'],seedRank=seed['rank'],seedRatingTeam=seed['name'],
                          seedRoster=seed['roster'],seedOverlap=seed['overlap']))
    teams.sort(key=lambda t:t['seedRank'])
    for i,t in enumerate(teams,1):
        t['seed'] = i
    entrants = [t['name'] for t in teams]
    assert len({key(p) for t in teams for p in t['roster']}) == 80
    assert all(len({t[k] for t in teams})==16 for k in ('rank','seedRank','name'))
    assert set(map(frozenset,OPENING)) == {frozenset((entrants[i],entrants[i+8])) for i in range(8)}
    evidence_summary = {}
    for ev, rows in sorted(evidence.items()):
        evidence_summary[ev] = dict(counts=dict(sorted(Counter(v for v,_ in rows).items())),
                                    example=rows[0][1],exceptions=[url for v,url in rows if v!='ABABBA'])
    assert evidence_summary['PGL Bucharest 2025']['counts']=={'ABABBA':40}
    return dict(id=ID,label=EVENT+' Swiss',start=START,end=END,cutoffExclusive=START,allBo3=True,
                teams=teams,entrants=entrants,seedOrder=list(range(16)),openingPairs=OPENING,openingSource=DRAW,
                drawPublishedDay='2025-05-02',formatSource=FORMAT,groupStructure='single_field',
                pool=POOL,rosterApi=ROSTER_URL,rosterHtmlSha256=ROSTER_HASH,rosterPublishedAt=original['createdAt'],
                rosterUpdatedAt=original['updatedAt'],rankSnapshot=rank_reference(release),
                seedSnapshot=rank_reference(seed_release),bo3Actors='ABABBA',priorRuleEvidence=evidence_summary,
                archiveSource=ARCHIVE_URL,archiveSha256=SHA256)


def confirm_official(matches, official):
    """Read only the public Groups data literal. No JavaScript is executed."""
    assert hashlib.sha256(official).hexdigest()==GROUP_HASH
    literal=official.decode().split('f=[{leftTeam',1)[1].split('],p=[{leftTeam',1)[0]
    rows=json.loads(re.sub(r'([{,])([A-Za-z]+):',r'\1"\2":','[{leftTeam'+literal+']'))
    names={**ORG,'NIP':'Ninjas in Pyjamas','astralis':'Astralis'}
    positions={frozenset(m['teams']):m for m in matches}
    seen=set()
    for row in rows:
        left,right=[names.get(row[s+'Team'],row[s+'Team']) for s in ('left','right')]
        pair=frozenset((left,right))
        assert pair not in seen
        seen.add(pair)
        m=positions[pair]
        assert row['format']=='BO3' and row['status']=='end'
        assert datetime.strptime(row['date'],'%d.%m.%Y').date().isoformat()==m['day']
        assert [left,right][int(row['rightScore']>row['leftScore'])]==m['teams'][int(m['b']==m['w'])]
        original_order=m['teams']==[left,right]
        scheduled=[]
        round_scores=[]
        for v in row['maps']:
            label=v['map'].removeprefix('de_').replace(' ','').replace('miirage','mirage').capitalize()
            scheduled.append(label)
            assert (v['leftTeamKey'],v['rightTeamKey'])==(row['leftTeamKey'],row['rightTeamKey'])
            scores=[v['leftScore'],v['rightScore']]
            round_scores.append(scores if original_order else scores[::-1])
        assert scheduled==m['planned']
        played=len(m['maps'])
        assert [x[1:] for x in m['maps']]==round_scores[:played]
        assert (row['leftScore']+row['rightScore'])==played and all(s==[0,0] for s in round_scores[played:])
    assert seen==set(positions) and len(seen)==33


def build_results(rows,field,official):
    names=field['entrants']
    rounds=[[] for _ in range(5)]
    matches=[]
    for r in rows:
        rd=int(re.search(r'Swiss round (\d)',r['stage'])[1])
        g=normalize(r)
        assert g and g['bo']==3 and set(POOL)=={s[2] for s in g['steps']}, r['match-id']
        a,b=names.index(g['a']),names.index(g['b'])
        planned=[step[2] for step in g['steps'] if step[1] in ('pick','left')]
        assert [m[0] for m in g['maps']]==planned[:len(g['maps'])]
        w,l=(a,b) if r['team1score']==2 else (b,a)
        overlaps=[len(set(map(key,field['teams'][i]['roster'])) & set(map(key,five)))
                  for i,five in ((a,g['lineupA']),(b,g['lineupB']))]
        assert min(overlaps)>=3 and (rd!=1 or overlaps==[5,5])
        rounds[rd-1].append([w,l])
        matches.append(dict(id=g['mid'],day=g['day'],round=rd,a=a,b=b,w=w,l=l,teams=[names[a],names[b]],
                            bo=3,played=True,rosterA=g['lineupA'],rosterB=g['lineupB'],overlap=overlaps,
                            maps=g['maps'],steps=g['steps'],planned=planned,actors=signature(g),
                            sourceUrl=g['url']))
    assert len(matches)==len({m['id'] for m in matches})==33
    confirm_official(matches,official)
    assert [len(r) for r in rounds]==[8,8,8,6,3]
    wins,losses=[0]*16,[0]*16
    pairs=set()
    for rnd in rounds:
        assert sorted(i for p in rnd for i in p)==[i for i in range(16) if max(wins[i],losses[i])<3]
        for w,l in rnd:
            assert (wins[w],losses[w])==(wins[l],losses[l]) and frozenset((w,l)) not in pairs
            pairs.add(frozenset((w,l)))
            wins[w]+=1
            losses[l]+=1
    actual=[(0 if l==0 else 1) if w==3 else (2 if w==0 else 3) for w,l in zip(wins,losses)]
    assert [actual.count(i) for i in range(4)]==[2,6,2,6]
    js=("require('./engine/engine.js');const r=CS.replay(JSON.parse(require('fs').readFileSync(0,'utf8')));"
        "require('node:assert/strict').equal(r.matched,33);console.log(JSON.stringify(r.rounds.map(s=>s.matched)))")
    verification=subprocess.run(['node','-e',js],cwd=ROOT,input=json.dumps(rounds),text=True,
                                capture_output=True,check=True)
    return dict(id=ID,end=END,entrants=names,matches=matches,rounds=rounds,actual=actual,
                matchedByRound=json.loads(verification.stdout),administrativeMatchIds=[],archiveSha256=SHA256,
                officialScheduleSource=GROUP_URL,officialScheduleSha256=GROUP_HASH)


def emit(name, obj, write):
    out=HERE/('astana-'+name+'.json')
    raw=(json.dumps(obj,ensure_ascii=False,indent=2)+'\n').encode()
    if write:
        out.write_bytes(raw)
    elif raw!=out.read_bytes():
        raise ValueError('Rebuild differs from '+out.name)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for param in ('archive','article','ranks','seed_ranks'):
        parser.add_argument(param,type=Path)
    parser.add_argument('--field-only',action='store_true')
    parser.add_argument('--official-groups',type=Path,help='The fixed Groups asset from the PGL event website')
    parser.add_argument('--write',action='store_true')
    args=parser.parse_args()
    if not args.field_only and not args.official_groups:
        parser.error('--official-groups is required for checking the actual results')
    assert hashlib.sha256(args.archive.read_bytes()).hexdigest()==SHA256
    with gzip.open(args.archive,'rt',encoding='utf8') as stream:
        raw=json.load(stream)
    before=sorted((r for r in raw if '2025-02-01'<=utc_day(r)<START),key=lambda r:(r['date'],r['match-id']))
    field=build_field(before,json.loads(args.article.read_bytes()),args.ranks,args.seed_ranks)
    emit('field',field,args.write)
    if not args.field_only:
        target=sorted((r for r in raw if r.get('event')==EVENT and START<=utc_day(r)<=END),
                      key=lambda r:(r['date'],r['match-id']))
        emit('results',build_results(target,field,args.official_groups.read_bytes()),args.write)
