"""Reconstruct the two sides of Elisa Fall 2024 from strictly separate pre-field and target rows."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import re
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0,str(ROOT))
from map_veto_data.extract_archive import ARCHIVE_URL, SHA256, key, normalize
from round_form.epl22_inputs import utc_day

ID, START, END = "elisa-fall-2024", "2024-08-12", "2024-09-05"
EVENT = "Elisa Invitational Fall 2024"
DIRECT = ["Zero Tenacity","Metizport","Rebels","Gaimin Gladiators","MOUZ NXT","TSM","Sangal","Into the Breach"]
QUALIFIED = ["FAVBET","Sampi","DASH","Meteor","kONO","ALTERNATE aTTaX","Rhyno","Enterprise"]
GUIDE = "https://elisaesports.com/2024/08/09/elisa-invitational-fall-2024-main-swiss-viewers-guide/"
REPLACEMENT = "https://www.hltv.org/matches/2374654/endpoint-vs-rhyno-elisa-invitational-fall-2024"
WIKI = "https://liquipedia.net/counterstrike/Elisa/Invitational/2024/Fall"
RANK_HASH = "ac0efe00a0620d3647ffed193977fb52c2e1ea7df6d1894ec2e9b21a402ccd06"
RANK = "https://github.com/ValveSoftware/counter-strike_regional_standings/blob/48127d4873dec5504dd18f14006e67da888fab80/standings_global.md"
FF = {2375240,2375435}
PLAYOFF_GUIDE="https://elisaesports.com/2024/09/06/elisa-invitational-fall-2024-playoff-stage-viewers-guide/"
# Rows on the organizer's August 9 live guide, in its published schedule order.
# Team indices follow DIRECT + QUALIFIED. Slot 6 is Endpoint in the guide after the change.
# None denotes a pairing printed without a score; F denotes the recorded forfeit winner.
GUIDE_ROUNDS = [
    [(0,8,"02"),(1,9,"20"),(2,10,"21"),(3,11,"21"),(4,12,"20"),(5,13,"21"),(6,14,"02"),(7,15,"20")],
    [(0,11,"21"),(15,12,"20"),(1,5,"02"),(2,14,"20"),(4,7,"21"),(3,8,"02"),(6,10,"12"),(13,9,"21")],
    [(3,10,"02"),(9,12,"21"),(1,15,"20"),(2,8,"21"),(0,14,"20"),(6,11,"0F"),(7,13,"20"),(4,5,"21")],
    [(5,7,"20"),(1,8,"21"),(15,9,"02"),(0,10,"20"),(13,11,"21"),(3,14,"20")],
    [(3,9,None),(7,10,None),(13,8,None)],
]


def time(g):
    return datetime.fromtimestamp(int(g["date"])/1000,timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def rank_rows(file):
    raw = file.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == RANK_HASH
    rows=[]
    for line in raw.decode().splitlines():
        cells=[c.strip() for c in line.split("|")]
        if len(cells)>4 and cells[1].isdigit():
            five=cells[4].split(", ")
            if len(set(map(key,five)))==5:
                rows.append((int(cells[1]),int(cells[2]),cells[3],five))
    return rows


def field(records, rankfile):
    ranks=rank_rows(rankfile)
    history=sorted((g for g in records if "2024-06-01" <= utc_day(g) < START),
                   key=lambda r:(int(r["date"]),int(r["match-id"])), reverse=True)
    feeders=[r for r in history if r.get("event")==EVENT+" Contenders"]
    assert len(feeders)==33
    feedwins=Counter(r["team1"] if r["team1score"]>r["team2score"] else r["team2"] for r in feeders)
    assert {n for n,w in feedwins.items() if w==3}==set(QUALIFIED)
    names=DIRECT+QUALIFIED
    teams=[]
    for i,n in enumerate(names):
        for raw in history:
            if n not in [raw["team1"],raw["team2"]]:
                continue
            g=normalize(raw)
            if g and g["lineupA"] and g["lineupB"]:
                five=g["lineupA" if g["a"]==n else "lineupB"]
                break
        else:
            raise ValueError("Missing pre-stage lineup for "+n)
        f=set(map(key,five))
        scores=sorted([(len(f & set(map(key,r[3]))),r) for r in ranks],key=lambda s:-s[0])
        top,r=scores[0]
        assigned=top>=3 and top>scores[1][0]
        teams.append(dict(seed=i+1, name=n, origin="direct" if i<8 else "qualified", roster=five,
                          rosterDay=g["day"],rosterSource=g["url"],rosterBasis="latest dated prior played five",
                          rank=r[0] if assigned else None,points=r[1] if assigned else None,
                          vrsRoster=r[3] if assigned else None,ratingTeam=r[2] if assigned else None,
                          vrsOverlap=top if assigned else None))
    assert len({key(p) for t in teams for p in t["roster"]})==80
    return dict(id=ID,label=EVENT+" Main Swiss",start=START,end=END,cutoffExclusive=START,
                firstScheduledUtc=START+"T09:00:00Z",allBo3=True,teams=teams,entrants=names,
                direct=list(range(8)),qualified=list(range(8,16)),openingPairs=[[i,i+8] for i in range(8)],
                openingSource=GUIDE,openingPairCaveat="Organizer's continuously updated Aug 9 guide shows Endpoint in R1. The former Sangal vs Rhyno slot is reconstructed from HLTV's explicit R1 replacement note; no copy of the original draw timestamp was verified.",
                pool=["Ancient","Anubis","Dust2","Inferno","Mirage","Nuke","Vertigo"],
                seedStatus="Indices follow the order of scheduled opening matches within each invitation group. They are not published ordinal strength seeds.",
                pairing="Published first round. Afterward draw against an unplayed opponent with the same record; no official deterministic tie-break priority found.",
                pointsAsOf="2024-08-06",rankingPublishedAt="2024-08-06T18:28:19Z",
                rankingSource=RANK, rankingSha256=RANK_HASH,qualifierSeriesIds=sorted(r["match-id"] for r in feeders),
                sources=[GUIDE,WIKI,REPLACEMENT,"https://www.hltv.org/events/7945/elisa-invitational-fall-2024-contenders"])


def build_truth(records,f):
    participants=f["entrants"].copy()
    slot=participants.index("Sangal")
    participants[slot]="Endpoint"
    rounds,ids,matches=[[] for _ in range(5)],[[] for _ in range(5)],[]
    w,l,opps=[0]*16,[0]*16,[set() for _ in range(16)]
    evidence=[]
    stage=[g for g in records if g.get("event")==EVENT and g.get("stage","").startswith("Swiss round")]
    for rd in range(5):
        gs=sorted((g for g in stage if int(re.match(r"Swiss round (\d)",g["stage"])[1])==rd+1),
                  key=lambda g:(int(g["date"]),int(g["match-id"])))
        used=set()
        for r in gs:
            mid=r["match-id"]
            ai,bi=participants.index(r["team1"]),participants.index(r["team2"])
            assert max(w[ai],l[ai])<3 and (w[ai],l[ai])==(w[bi],l[bi])
            assert ai not in used and bi not in used and bi not in opps[ai]
            used.update([ai,bi]); opps[ai].add(bi); opps[bi].add(ai)
            skip=mid in FF
            g=normalize(r)
            if skip:
                assert not g and len(r["maps"])==1 and r["maps"][0]["map"]=="Default"
                assert r["maps"][0]["status"]=="not_played" and sorted([r["team1score"],r["team2score"]])==[0,1]
            else:
                assert g and g["bo"]==3
                assert (g["lineupA"] and g["lineupB"]) or mid==2375239
            won,lost=(ai,bi) if r["team1score"]>r["team2score"] else (bi,ai)
            listed=[(a,b,s) for a,b,s in GUIDE_ROUNDS[rd] if {a,b}=={ai,bi}]
            assert len(listed)==1,(mid,listed)
            a,b,s=listed[0]
            if s and "F" in s:
                assert skip and (a if s[0]=="F" else b)==won
            elif mid==2375241:
                assert (a,b,s)==(0,14,"20") and (won,lost)==(0,14)
                assert g["maps"]==[["Vertigo",30,34],["Anubis",16,12],["Inferno",13,10]]
            elif s:
                expected=[r["team1score"],r["team2score"]]
                assert not skip and list(map(int,s))==(expected if ai==a else expected[::-1]),(mid,s,expected)
            rounds[rd].append([won,lost])
            ids[rd].append(mid)
            overlap=[]
            for m in r["maps"]:
                if skip or m["status"]!="played":
                    continue
                bounds=[]
                for index,side in [(ai,"team1"),(bi,"team2")]:
                    assert m[side]["name"]==participants[index]
                    players={key(p["name"]) for p in m["players"][side]}
                    original=set(map(key,f["teams"][index]["roster"]))
                    assert 5<=len(players)<=6
                    # If six are credited on one map, only five can be on the server at once.
                    bounds.append(max(0,len(players & original)-(len(players)-5)))
                overlap.append(dict(map=m["map"],overlapA=bounds[0],overlapB=bounds[1]))
            core=[min(m[k] for m in overlap) if overlap else None for k in ["overlapA","overlapB"]]
            matches.append(dict(id=mid,day=utc_day(r),startUtc=time(r),round=rd+1,bo=3,a=participants[ai],b=participants[bi],
                                w=won,l=lost,played=not skip,coreEligible=bool(overlap) and min(core)>=3,
                                officialPairVerified=True,officialScoreVerified=s is not None and mid!=2375241,
                                coreOverlapA=core[0],coreOverlapB=core[1],coreByMap=overlap,
                                fiveA=None if skip else g["lineupA"],fiveB=None if skip else g["lineupB"],
                                administrative=skip,score=None if skip else [r["team1score"],r["team2score"]],
                                awardedWinner=participants[won] if skip else None,maps=[] if skip else g["maps"],
                                sourceUrl=r["url"].replace("https://hltv.org/","https://www.hltv.org/")))
            if mid==2375239:
                matches[-1]["listedPlayersByMap"]=[dict(map=m["map"], players={
                    m[k]["name"]:[p["name"] for p in pp] for k,pp in m["players"].items()})
                    for m in r["maps"] if m["status"]=="played"]
        for won,lost in rounds[rd]:
            w[won]+=1; l[lost]+=1
        evidence.append(dict(round=rd+1,matches=len(gs),legalDistinctPairs=len(used)//2))
    assert len(stage)==33 and list(map(len,rounds))==[8,8,8,6,3] and len(set(sum(ids,[])))==33
    assert {tuple(sorted(p)) for p in rounds[0]}=={tuple(p) for p in f["openingPairs"]}
    actual=[0 if a==3 and b==0 else 1 if a==3 else 2 if b==3 and a==0 else 3 for a,b in zip(w,l)]
    assert Counter(actual)=={0:2,1:6,2:2,3:6}
    assert {participants[i] for i,v in enumerate(actual) if v<2}=={
        "Rebels","MOUZ NXT","TSM","Zero Tenacity","Metizport","ALTERNATE aTTaX","Sampi","Into the Breach"}
    identity=actual.copy()
    identity[slot]=3  # No 3-0/qualifier/0-3 category is credited to an original entrant that never played.
    return dict(id=ID,end=END,entrants=participants,rounds=rounds,matchIds=ids,matches=matches,
                actual=actual,actualBySlot=actual,actualByTeamIdentity=identity,
                actualRecords=[f"{a}-{b}" for a,b in zip(w,l)],administrativeMatchIds=sorted(FF),
                changes=[dict(day="2024-08-13",slot=slot,original="Sangal",replacement="Endpoint",source=REPLACEMENT)],
                legalityReplay=evidence,source=GUIDE,officialAdvancementSource=PLAYOFF_GUIDE,
                officialMapScoreDiscrepancies=[dict(id=2375241,guide="2-0",played="2-1",winnerAgrees=True)],
                archiveSource=ARCHIVE_URL,archiveSha256=SHA256)


if __name__=="__main__":
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument("archive",type=Path);cli.add_argument("vrs",type=Path);cli.add_argument("--write",action="store_true")
    a=cli.parse_args()
    assert hashlib.sha256(a.archive.read_bytes()).hexdigest()==SHA256
    with gzip.open(a.archive,"rt",encoding="utf8") as fp:
        records=json.load(fp)
    pre=field(records,a.vrs)
    for name,data in [("field",pre),("results",build_truth(records,pre))]:
        p=HERE/f"holdout-fall-{name}.json"
        if a.write:
            p.write_bytes((json.dumps(data,indent=2,ensure_ascii=False)+"\n").encode())
        else:
            assert json.loads(p.read_bytes())==data
    print([(t["name"],t["points"],t["vrsOverlap"]) for t in pre["teams"]])
