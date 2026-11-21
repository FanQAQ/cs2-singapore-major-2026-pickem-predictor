"""Rebuild the independent Elisa spring field and the separately scored results."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import re


HERE = Path(__file__).resolve().parent
START, END = "2024-04-08", "2024-05-02"
ID = "elisa-spring-2024"
GUIDE = "https://elisaesports.com/2024/04/05/elisa-invitational-spring-2024-main-swiss-viewers-guide/"
EVENT = "Elisa Invitational Spring 2024"
COMMIT = "99a0ba5fff938345d10d500f8b29cd297076573e"
VRS_URL = f"https://github.com/ValveSoftware/counter-strike_regional_standings/blob/{COMMIT}/standings_europe.md"
RANK_SHA = "f5d3fbc3a16556d61b2bc3f46db6ee18a45c808e4dfc944a3d25c9477a205d0a"
RAW_SHA = "750b0da45142fc797eddb708698d14d269237e59784d6a1d066eddba0ba31551"
B8 = "https://www.hltv.org/news/38706/headtr1ck-set-on-b8-move"
ENDPOINT = "https://www.hltv.org/news/38672/endpoint-transfer-sl3nd"
ORDER = ["ex-Preasy", "ECSTATIC", "Enterprise", "SINNERS", "EYEBALLERS", "HAVU",
         "Alliance", "B8", "MOUZ NXT", "Zero Tenacity", "BLEED", "Permitta",
         "ALTERNATE aTTaX", "Espionage", "Endpoint", "ECF"]
OPENING = [[3,12], [7,8], [0,15], [5,10], [4,11], [1,14], [2,13], [6,9]]
BEFORE = [2370434,2370958,2370432,2370963,2371174,2371067,2371258,2370985,
          2370953,2370434,2371130,2370957,2371031,2371114,2370297,2370298]
PAST_NAMES = {"ex-ENEIDA":"ECF", "ENEIDA":"ECF", "Preasy":"ex-Preasy"}
RESULT_NAMES = {"Grannys Knockers":"ex-Preasy", "Gaimin Gladiators":"ECSTATIC", "Sashi":"Espionage"}
# Published matchday rows as displayed on the organizer's April 5 guide, updated weekly.
# Each tuple is the page's first-side slot, optional second-side slot, awarded score, FF flag.
OFFICIAL = [
    (3,12,2,0,0), (7,8,1,2,0), (0,15,2,0,0), (5,10,0,2,0),
    (4,11,0,2,0), (1,14,2,0,1), (2,13,1,2,0), (6,9,2,0,0),
    (6,8,0,2,0), (0,13,1,2,0), (3,10,0,2,0), (1,11,2,1,0),
    (4,14,0,2,0), (2,15,0,2,1), (7,9,2,0,0), (5,12,2,0,0),
    (0,11,0,2,0), (6,7,2,0,0), (2,12,1,2,0), (1,13,0,2,0),
    (8,10,2,0,1), (3,14,1,2,0), (5,15,0,2,0), (4,9,2,0,0),
    (6,14,2,0,0), (1,15,1,2,0), (10,11,2,0,0), (4,5,1,2,0),
    (3,7,0,2,0), (0,12,2,0,1), (7,11,2,0,0), (0,None,0,2,0), (1,None,2,0,0),
]


def day(game):
    return datetime.fromtimestamp(game["date"]/1000, timezone.utc).date().isoformat()


def lineup(m, side):
    return sorted([p["name"] for p in m["players"][side]], key=str.lower)


def published_rankings(filename):
    assert hashlib.sha256(filename.read_bytes()).hexdigest() == RANK_SHA
    ranks = []
    for line in filename.read_text(encoding="utf8").splitlines():
        if re.match(r"\|\s*\d+", line):
            rank, points, name, five = [s.strip() for s in line.strip("|").split("|")]
            ranks.append((int(rank), int(points), name, [p.strip() for p in five.split(",")]))
    return ranks


def intersect(first, second):
    return {n.casefold() for n in first} & {n.casefold() for n in second}


def field_data(raw, ranks):
    before = {g["match-id"]:g for g in raw if day(g)<START}
    prelim = [g for g in before.values() if g["event"]==EVENT+" Contenders"]
    wins = Counter(PAST_NAMES.get(g[k],g[k]) for g in prelim for k in ["team1" if g["team1score"]>g["team2score"] else "team2"])
    assert len(prelim)==33 and {t for t,w in wins.items() if w==3}==set(ORDER[8:])
    teams = []
    for i, name in enumerate(ORDER):
        game = before[BEFORE[i]]
        side = next(k for k in ("team1", "team2") if PAST_NAMES.get(game[k],game[k])==name)
        played = [m for m in game["maps"] if m["status"]=="played"]
        roster = lineup(played[0],side)
        assert len(roster)==5 and all(lineup(m,side)==roster for m in played)
        entry = dict(seed=i+1,name=name,roster=roster,rosterDay=day(game),rosterSource=game["url"],
                     rosterEvidence="prior played series",lastSeriesDay=day(game),lastSeriesRoster=roster,
                     lastSeriesSource=game["url"],unknownSeats=0)
        if name=="B8":
            assert "OWNER" in roster
            roster=sorted([p for p in roster if p!="OWNER"]+["headtr1ck"],key=str.lower)
            entry.update(roster=roster, rosterDay="2024-04-05",rosterSource=B8,
                         rosterEvidence="two additions announced; outgoing OWNER attributed to HLTV reporting")
        if name=="Endpoint":
            roster=[p for p in roster if p.casefold() not in {"sl3nd","swicher"}]
            assert len(roster)==3
            entry.update(roster=roster,rosterDay="2024-04-01",rosterSource=ENDPOINT,
                         rosterEvidence="three retained British starters; replacements unconfirmed before lock",
                         unknownSeats=2)
        same = [(len(intersect(roster,r[3])),r) for r in ranks]
        overlap = max(n for n,r in same)
        candidates = [r for n,r in same if n==overlap]
        assert len(candidates)==1 and overlap>=2
        rank,points,rated,rated_roster = candidates[0]
        entry.update(rank=rank if overlap>=3 else None,points=points if overlap>=3 else None,
                     ratingTeam=rated,vrsRoster=rated_roster,overlap=overlap,
                     vrsEligible=overlap>=3)
        teams.append(entry)
    assert [t["name"] for t in teams if t["points"] is None]==["Endpoint"]
    return dict(id=ID,label="Elisa Invitational Spring 2024 Main Swiss",start=START,end=END,
                cutoffExclusive=START,firstScheduledUtc="2024-04-08T09:00:00Z",allBo3=True,
                entrants=ORDER,teams=teams,direct=list(range(8)),qualified=list(range(8,16)),
                openingPairs=OPENING,opening=OPENING,
                qualifyingStage=dict(series=len(prelim),lastDay=max(map(day,prelim)),
                                     matchIds=sorted(g["match-id"] for g in prelim)),
                seedSource="one-based organizer list position; no official performance seeding recovered",
                pool=["Ancient","Anubis","Inferno","Mirage","Nuke","Overpass","Vertigo"],
                ratings=dict(date="2024-03-04",publishedAt="2024-03-04T23:55:04Z",region="Europe",
                             source=VRS_URL,sha256=RANK_SHA,eligible=15,missing=["Endpoint"]),
                sources=[GUIDE,"https://www.hltv.org/events/7701/elisa-invitational-spring-2024-contenders",
                         VRS_URL,B8,ENDPOINT])


def results_data(raw, field):
    games = sorted([g for g in raw if g["event"]==EVENT and re.match(r"Swiss round [1-5]",g["stage"] or "")
                    and START<=day(g)<=END],key=lambda g:(g["date"],g["match-id"]))
    assert len(games)==33
    matches, rounds, seen = [],[[] for _ in range(5)],set()
    wins,losses = [0]*16,[0]*16
    used=set()
    for g in games:
        a,b=[ORDER.index(RESULT_NAMES.get(g[k],g[k])) for k in ("team1","team2")]
        r=int(re.match(r"Swiss round ([1-5])",g["stage"])[1])
        assert (wins[a],losses[a])==(wins[b],losses[b]) and wins[a]+losses[a]==r-1
        assert frozenset([a,b]) not in seen
        seen.add(frozenset([a,b]))
        played=not any(m["map"]=="Default" for m in g["maps"])
        x,y=g["team1score"],g["team2score"]
        w,l=(a,b) if x>y else (b,a)
        assert x!=y
        maps=[]
        for m in g["maps"]:
            if not played or m["status"]!="played":continue
            assert m["team1"]["name"]==g["team1"] and m["team2"]["name"]==g["team2"]
            ma,mb=int(m["team1"]["score"]),int(m["team2"]["score"])
            fa,fb=lineup(m,"team1"),lineup(m,"team2")
            assert ma!=mb and len(set(fa))==len(set(fb))==5
            oa,ob=[len(intersect(field["teams"][i]["roster"],five)) for i,five in [(a,fa),(b,fb)]]
            maps.append(dict(name=m["map"],score=[ma,mb],fiveA=fa,fiveB=fb,overlapA=oa,overlapB=ob))
        if played:
            assert len(maps)==x+y and x==sum(m["score"][0]>m["score"][1] for m in maps)
        indices=[j for j,(oa,ob,ox,oy,ff) in enumerate(OFFICIAL)
                 if j not in used and oa==a and (ob==b or ob is None and r==5)
                 and [ox,oy]==([x,y] if played else [2*int(a==w),2*int(b==w)]) and ff==int(not played)]
        assert len(indices)==1,(g,indices)
        row=indices[0];used.add(row)
        start_of_round=[0,8,16,24,30]
        assert start_of_round[r-1]<=row<start_of_round[r-1]+[8,8,8,6,3][r-1]
        official_days=[8,8,9,9,10,10,11,11,15,15,16,16,17,17,18,18,22,22,23,23,24,24,25,25,29,29,30,30,1,1,2,2,2]
        scheduled=f"2024-{'05' if row>=28 else '04'}-{official_days[row]:02d}"
        wins[w]+=1;losses[l]+=1;rounds[r-1].append([w,l])
        matches.append(dict(id=g["match-id"],day=day(g),officialScheduleDay=scheduled,round=r,bo=3,a=a,b=b,w=w,l=l,
                            teamA=g["team1"],teamB=g["team2"],played=played,score=list(OFFICIAL[row][2:4]),
                            sourceScore=[x,y],fiveA=maps[0]["fiveA"] if maps else None,
                            fiveB=maps[0]["fiveB"] if maps else None,maps=maps,
                            coreEligible=bool(maps) and all(min(m["overlapA"],m["overlapB"])>=3 for m in maps),
                            sourceUrl=g["url"],officialRow=row+1,
                            officialListsBothTeams=OFFICIAL[row][1] is not None))
    actual=[0 if w==3 and l==0 else 1 if w==3 else 2 if w==0 else 3 for w,l in zip(wins,losses)]
    assert len(used)==33 and Counter(actual)=={0:2,1:6,2:2,3:6} and sum(m["played"] for m in matches)==29
    assert [m["id"] for m in matches if m["played"] and not m["coreEligible"]]==[2371689]
    assert set(map(frozenset,rounds[0]))==set(map(frozenset,field["openingPairs"]))
    return dict(id=ID,matches=matches,rounds=rounds,actual=actual,records=list(map(list,zip(wins,losses))),
                administrativeExcluded=sum(not m["played"] for m in matches),source=GUIDE,
                administrativeMatchIds=[m["id"] for m in matches if not m["played"]],
                matchIds=[[m["id"] for m in matches if m["round"]==r] for r in range(1,6)],
                changes=[],coreIneligiblePlayedIds=[m["id"] for m in matches if m["played"] and not m["coreEligible"]],
                eventSource="https://www.hltv.org/events/7700/elisa-invitational-spring-2024")


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive",type=Path,required=True)
    parser.add_argument("--rankings",type=Path,required=True)
    parser.add_argument("--check",action="store_true")
    args=parser.parse_args()
    assert hashlib.sha256(args.archive.read_bytes()).hexdigest()==RAW_SHA
    with gzip.open(args.archive,"rt",encoding="utf8") as f: raw=json.load(f)
    field=field_data(raw,published_rankings(args.rankings))
    for name,doc in [("field",field),("results",results_data(raw,field))]:
        filename=HERE/f"holdout-spring-{name}.json"
        if args.check:
            assert json.loads(filename.read_text(encoding="utf8"))==doc
        else:
            filename.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print("Spring: documented 16 entrants, 15 ratings, 8+8, 33 official scores, 29 played.")


if __name__=="__main__": main()
