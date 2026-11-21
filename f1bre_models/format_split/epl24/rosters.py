"""Build the pre-event roster and ESL live-rating inputs, without reading event results."""
import argparse
import csv
import hashlib
import json
import re
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
CUTOFF = '2026-10-03'
EKTARR = 'https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11'
EKTARR_SHA = 'd99aa6a61c5d9018eef587ce28c026df4dd61406fdd46afe7a8d08bdcdcf2972'
ESL = 'https://pro.eslgaming.com/tour/2026/09/esl-pro-league-season-24-team-seeding-and-live-ratings/'
RATINGS = [1.00,2.33,3.15,3.73,4.17,5.45,6.93,7.23,9.00,9.36,9.50,11.00,12.47,13.58,13.69,15.00]
ALIASES = {
    'Team Spirit':'Spirit', 'Team Vitality':'Vitality', 'Team Falcons':'Falcons',
    'FURIA Esports':'FURIA', 'Aurora Gaming':'Aurora', 'G2 Esports':'G2',
    '9z Team':'9z', 'BETBOOM TEAM':'BETBOOM', '1w Team':'1win',
}
SHINDEN_PRE = 'https://www.hltv.org/matches/2397763/shinden-vs-pain-pgl-masters-bucharest-2026-south-america-closed-qualifier'
ANNOUNCEMENTS = {
    'Legacy': ('2026-09-27', 'art', 'bobz', 'https://www.hltv.org/news/45582/art-out-of-esl-pro-league-s24-with-meningitis'),
    'PARIVISION': ('2026-09-17', 'slaxejezzz', 'hobbit', 'https://www.hltv.org/news/45534/parivision-replace-slaxejezzz-with-hobbit'),
}


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def name(handle):
    return unicodedata.normalize('NFKC',handle).strip().casefold()


def side_five(r,side,team):
    players = []
    for k in range(1,6):
        field = f'team{side}_player{k}'
        raw = re.split(r'\s*[,(/]',r[field],maxsplit=1)[0].strip()
        pid = r[field+'_id']
        if not raw or not pid or pid=='0':
            return None
        handle = name(raw)
        if team=='ShindeN':
            # Same player IDs in the witnessed match. Its ten-player source uses the Valve names.
            handle = {('27335','fraguty'):'guty', ('4500','ivanzinho'):'ivz'}.get((pid,handle),handle)
        if team=='PARIVISION' and handle=='slax':
            handle='slaxejezzz'
        players.append(dict(handle=handle,sourceHandle=raw,sourcePlayerId=pid))
    if any(len({p[k] for p in players})!=5 for k in ['handle','sourcePlayerId']):
        return None
    return sorted(players,key=lambda p:p['handle'])


def ledger(ektarr):
    assert sha(ektarr)==EKTARR_SHA
    with ektarr.open(encoding='utf-8-sig',newline='') as f:
        yield from csv.DictReader(f)


def freeze(ektarr):
    seedfile=HERE/'seeding.json'
    seeding=json.loads(seedfile.read_bytes())
    entrants={t['team']:t for t in seeding['teams']}
    witnesses={}
    for r in ledger(ektarr):
        if r['is_total']!='True' or not '2026-07-01'<=r['datetime'][:10]<CUTOFF:
            continue
        for side in (1,2):
            club=r[f'team{side}']
            team=ALIASES.get(club,club)
            if team not in entrants:
                continue
            five=side_five(r,side,team)
            if five is None:
                continue
            item=dict(dateTimeAsRecorded=r['datetime'],id=r['match_id'],event=r['tournament'],
                      sourceTeam=club,opponent=r[f'team{3-side}'],players=five)
            if team not in witnesses or (item['dateTimeAsRecorded'],item['id'])>(witnesses[team]['dateTimeAsRecorded'],witnesses[team]['id']):
                witnesses[team]=item
    assert set(witnesses)==set(entrants)
    teams=[]
    for t,rating in zip(seeding['teams'],RATINGS):
        club=t['team']
        witness=witnesses[club]
        five={p['handle'] for p in witness['players']}
        source=None
        if club in ANNOUNCEMENTS:
            day,out,inc,url=ANNOUNCEMENTS[club]
            assert day<CUTOFF
            if witness['dateTimeAsRecorded'][:10]<day:
                assert out in five and inc not in five
                five.remove(out)
                five.add(inc)
            assert inc in five and out not in five
            source=dict(date=day,out=out,incoming=inc,url=url)
        vrs=set(map(name,t['vrsFive']))
        assert len(five)==5 and len(five & vrs)>=3
        teams.append(dict(name=club,seed=t['seed'],points=t['vrsPoints'],globalRank=t['globalRank'],
                          vrsRoster=t['vrsFive'],roster=sorted(five),vrsCoreOverlap=len(five & vrs),
                          latestWitness=witness,substitutionAnnouncement=source,eslLiveRating=rating))
    assert len({p for t in teams for p in t['roster']})==80
    return dict(id=seeding['id'],start=CUTOFF,cutoffExclusive=CUTOFF,allBo3=True,
                seedingSHA256=sha(seedfile),liveRatingDate='2026-09-25',liveRatingSource=ESL,
                mapPool=['Ancient','Anubis','Cache','Dust2','Inferno','Mirage','Nuke'],
                mapPoolSource='https://pro.eslgaming.com/tour/2026/07/esl-pro-tour-counter-strike-rulebook-2026-update-2-changelog/',
                liveRatings=RATINGS,firstRound=seeding['firstRound'],ektarrSource=EKTARR,ektarrSHA256=EKTARR_SHA,
                shindenAliasesSource=SHINDEN_PRE,teams=teams)


def save(file,data,check):
    raw=(json.dumps(data,ensure_ascii=False,indent=2)+'\n').encode()
    if check:
        assert file.read_bytes()==raw,file
    else:
        file.write_bytes(raw)


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('ektarr',type=Path)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    save(HERE/'field.json',freeze(args.ektarr),args.check)
