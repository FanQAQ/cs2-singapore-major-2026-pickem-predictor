"""Build pre-stage same-team, same-event consecutive BO3 observations from the full schedules."""
import argparse
import csv
import gzip
import hashlib
import json
import re
import sys
import tempfile
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from itertools import groupby
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from experience.build_history import AMBIGUOUS, TEAM_ALIASES, normalize

FROZEN = ROOT / "tail_calibration/training.json.gz"
OUTPUT = HERE / "adjacency.json.gz"
HASHES = {
    "frozen": "11072635a348e12715aecdc15ea8aef39a18b4cb2ef66d98fa1bd7e32ff4abc1",
    "hltv": "750b0da45142fc797eddb708698d14d269237e59784d6a1d066eddba0ba31551",
    "ektarr": "d99aa6a61c5d9018eef587ce28c026df4dd61406fdd46afe7a8d08bdcdcf2972",
}
HELD_EVENT = "PGL Cluj-Napoca 2026"
ASTANA_EU = "PGL Astana 2026. Закрытая европейская квалификация"
EVENT_ALIASES = {"PGL Astana 2026. Closed European Qualifier": ASTANA_EU}
QUALIFIER = re.compile(r"qualif|отбор|квалиф|regional (?:mrq|rmr)|区域预选", re.I)
REGION = re.compile(
    r"\b(europe\w*|america\w*|asia\w*|ocean\w*|africa\w*|middle east|baltic|nordic|"
    r"china|chinese|austral\w*|brazil\w*|india\w*|mongol\w*|korea\w*|turk\w*|"
    r"japan\w*|german\w*|france|french|swed\w*|poland|polish|iberi\w*|portug\w*|"
    r"argentin\w*|finland|finnish|danish|denmark|benelux|north africa|saudi arabia|"
    r"latam|mena|apac|asean|anz|sea|oce|na|sa|eu|uk|dach|cis|global qualif\w*|"
    r"европ\w*|азиат\w*|американ\w*|глобальн\w*)\b", re.I)
EDITION = re.compile(r"\d|\b(?:[IVX]+)\b")
FIVE_ALIASES = {"v$m":"vsm","hunter-":"hunter","dav1d":"dav1deus","rmn":"roman"}
# Keep named qualifiers and relegations as their own competitions. The explicit suffixes below
# identify an edition for event weighting. Bridges between stages require separate source evidence.
PHASE_SUFFIX=re.compile(r" (?:Stage [1-9]|Opening Stage|Elimination Stage|Main Stage|Play-in|Finals)$",re.I)
CONFIRMED_PHASES=re.compile(
    r"^(?:PGL CS2 Major Copenhagen 2024|Perfect World Shanghai Major 2024|BLAST\.tv Austin Major 2025|"
    r"StarLadder Budapest Major 2025|ESL Pro League Season (?:21|22|23)|IEM (?:Cologne|Katowice) 202[45]|"
    r"IEM Kraków 2026|BLAST Bounty 202[56] Season [12]|BLAST Open London 2025|"
    r"Elisa Invitational (?:Spring|Fall) 2024|Thunderpick World Championship 2024|BetBoom Dacha Belgrade Season 2)$")


def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def shift(day, days):
    return (date.fromisoformat(day)+timedelta(days=days)).isoformat()


def text_id(name):
    return " ".join(unicodedata.normalize("NFKC", name).casefold().split())


def player(name, club):
    name = normalize(name)
    return TEAM_ALIASES.get(normalize(club), {}).get(name, FIVE_ALIASES.get(name, name))


def event_scope(name):
    if not EDITION.search(name):
        return "noEditionMarker"
    if QUALIFIER.search(name) and not REGION.search(name):
        return "unresolvedQualifierRegion"
    return "identified"


def event_edition(label):
    name=EVENT_ALIASES.get(label,label)
    if QUALIFIER.search(name) or re.search(r"\b(?:RMR|Relegation)\b",name,re.I):
        return name
    if name.endswith(" Contenders") and name.startswith(("Elisa Invitational ","YaLLa Compass ")):
        return name.removesuffix(" Contenders")
    return PHASE_SUFFIX.sub("",name)


def minimum_core(rosters):
    if not rosters: return []
    return sorted(set.intersection(*rosters))


def schedules(hltv_file, ektarr_file):
    with gzip.open(hltv_file, "rt", encoding="utf8") as f:
        archive=json.load(f)
    for g in archive:
        time=datetime.fromtimestamp(g["date"]/1000,timezone.utc)
        day=time.date().isoformat()
        if not "2023-09-27"<=day<="2026-03-23": continue
        names=[g["team1"],g["team2"]]
        cores=[[],[]]
        for m in g["maps"]:
            if m.get("status")!="played": continue
            for col in ("team1","team2"):
                name=m[col].get("name")
                if name not in names: continue
                idx=names.index(name)
                fives={player(p["name"],name) for p in (m.get("players") or {}).get(col,[])}
                # A six-player map does not identify the exact five who played together.
                cores[idx].append(fives-AMBIGUOUS-{""} if len(fives)<=5 else set())
        keys=[str(g[col+"-id"]) if g[col+"-id"] else "name:"+text_id(g[col]) for col in ("team1","team2")]
        yield dict(id="hltv:"+str(g["match-id"]),source="hltv",event=g["event"],labels=[g["event"]],
                   day=day,time=time.isoformat(),clubs=names,keys=keys,cores=list(map(minimum_core,cores)),
                   format=g["format"] or "",stage=g["stage"] or "")
    del archive
    groups=defaultdict(list)
    with ektarr_file.open(encoding="utf-8-sig",newline="") as file:
        for row in csv.DictReader(file):
            if "2026-03-24"<row["datetime"][:10]<"2026-11-21" and row["match_id"]:
                groups[row["match_id"]].append(row)
    for mid,rows in groups.items():
        labels=sorted({g["tournament"] for g in rows})
        events={EVENT_ALIASES.get(l,l) for l in labels}
        assert len(events)==1,(mid,labels)
        first=rows[0]
        names=[first["team1"],first["team2"]]
        keys=list(map(text_id,names))
        assert all([text_id(r["team1"]),text_id(r["team2"])]==keys and
                   r["datetime"][:10]==first["datetime"][:10] for r in rows)
        cores=[]
        for s in (1,2):
            rosters=[]
            for r in rows:
                if r["is_total"]!="False": continue
                ids={r[f"team{s}_player{i}_id"] for i in range(1,6)}-{"","0"}
                rosters.append(ids)
            cores.append(minimum_core(rosters))
        yield dict(id="ektarr:"+mid,source="ektarr",event=events.pop(),labels=labels,day=first["datetime"][:10],
                   time=first["datetime"],clubs=names,keys=keys,cores=cores,format=first["bestOf"],stage="")


def identity_timeline(games):
    """Resolve participants forward, never using later match results or later roster decisions."""
    key_to_team, last_known, last_key = {}, {}, {}
    uncertain=defaultdict(set)
    previous_appearance={}
    breaks=[]
    for day, group in groupby(games, key=lambda g:g["day"]):
        todays=list(group)
        by_key=defaultdict(list)
        for g in todays:
            for side,key in enumerate(g["keys"]):
                by_key[key].append((g,side))
        # Resolve all labels playing today against the preceding day before updating any history.
        decisions={}
        for key,appearances in by_key.items():
            known=[set(g["cores"][s]) for g,s in appearances if len(g["cores"][s])>=3]
            core=set(minimum_core(known))
            existing=key_to_team.get(key)
            if existing is not None and (len(core)<3 or existing not in last_known or len(core&last_known[existing])>=3):
                decisions[key]=existing
                continue
            # A previously used label with a new core starts a new stint, unless an unambiguous
            # earlier participant has already fielded that core and is not represented separately today.
            overlaps={team:len(core&five) for team,five in last_known.items() if last_key[team] not in by_key}
            maximum=max(overlaps.values(),default=0)
            best=[t for t,n in overlaps.items() if n==maximum and n>=3]
            if len(best)==1:
                decisions[key]=best[0]
            else:
                g,s=appearances[0]
                decisions[key]=g["id"]+"/"+str(s)
                for team in best: uncertain[team].add(day)
                if len(best)>1: uncertain[decisions[key]].add(day)
            if existing is not None and decisions[key]!=existing:
                previous,side=previous_appearance[key]
                current,next_side=appearances[0]
                breaks.append([previous["seq"],current["seq"],side,next_side,"existingLabelChangedCore"])
        # Two separately listed labels cannot silently inherit the same team across a simultaneous day.
        repeated=Counter(decisions.values())
        for key,team in decisions.items():
            appearances=by_key[key]
            if repeated[team]>1:
                uncertain[team].add(day)
                g,s=appearances[0];team=g["id"]+"/"+str(s)
                uncertain[team].add(day)
            key_to_team[key]=team
            last_key[team]=key
            confirmed=[set(g["cores"][s]) for g,s in appearances if len(g["cores"][s])>=3]
            if confirmed: last_known[team]=set(minimum_core(confirmed))
            for g,s in appearances:
                g["teams"][s]=team
            previous_appearance[key]=appearances[-1]
        for g in todays:
            assert g["teams"][0]!=g["teams"][1],g["id"]
    return uncertain,breaks


def pair_filter(g,s,h,t,scope,day_counts,time_counts,uncertain,old,new):
    if g["event"]==HELD_EVENT: return "withheldCluj",[]
    if scope!="identified": return scope,[]
    if old is None or new is None: return "endpointOutsideVerifiedBO3",[]
    if g["phase"]!=h["phase"] and not CONFIRMED_PHASES.fullmatch(g["event"]): return "unverifiedPhaseTransition",[]
    if g["day"]==h["day"]: return "sameDay",[]
    if ((g["source"]=="ektarr" and (day_counts[g["day"]]>1 or day_counts[h["day"]]>1)) or
        time_counts[g["time"]]>1 or time_counts[h["time"]]>1):
        return "ambiguousWithinDayOrder",[]
    if old["latestUtcDay"]>=new["earliestUtcDay"]: return "overlappingUtcDates",[]
    if any(g["day"]<=d<=h["day"] for d in uncertain): return "ambiguousCoreIdentity",[]
    previous_opponent=set(g["cores"][1-s])
    next_opponent=set(h["cores"][1-t])
    if g["teams"][1-s]==h["teams"][1-t] or len(previous_opponent&next_opponent)>=3:
        return "repeatOpponent",[]
    common=sorted(set(g["cores"][s])&set(h["cores"][t]))
    if len(common)<3: return "weakCore",common
    return "",common


def index_series(rows, original):
    old_windows=original["targets"]
    targets={k:(w["start"],w["windowStart"],w["cutoffExclusive"]) for k,w in old_windows.items()}
    for key,day in (("cluj-2026","2026-02-14"),("bucharest-2025-april","2025-04-06")):
        begin=shift(day,-180)
        # Original options cover the entire new window, including the overnight-completion buffer.
        for n in range(179):
            d=shift(begin,n)
            assert any(w["windowStart"]<=d and shift(d,1)<w["cutoffExclusive"] for w in old_windows.values())
        targets[key]=(day,begin,day)
    out={}
    for key,(start,lo,hi) in targets.items():
        ix=[i for i,r in enumerate(rows) if lo<=r["earliestUtcDay"] and shift(r["latestUtcDay"],1)<hi]
        if key in old_windows: assert ix==old_windows[key]["indices"]
        keep=[i for i in ix if rows[i]["event"]!=HELD_EVENT]
        days=sorted({rows[i]["day"] for i in keep})
        out[key]=dict(start=start,windowStart=lo,cutoffExclusive=hi,seriesIndices=keep,series=len(keep),
                      seriesWithheld=len(ix)-len(keep),seriesObservedDays=len(days),firstDay=days[0],lastDay=days[-1])
    return out


def build(hltv_file,ektarr_file):
    for key,file in [("hltv",hltv_file),("ektarr",ektarr_file),("frozen",FROZEN)]:
        assert digest(file)==HASHES[key],f"Source hash mismatch: {file}"
    with gzip.open(FROZEN,"rt",encoding="utf8") as f: original=json.load(f)
    rows=original["rows"]
    sources={r["id"]:i for i,r in enumerate(rows)}
    assert len(sources)==len(rows)==12804
    schedule=sorted(schedules(hltv_file,ektarr_file),key=lambda g:(g["day"],g["time"],g["id"]))
    assert len({g["id"] for g in schedule})==len(schedule)==26953
    by_event=defaultdict(list)
    aliases={"hltv":{},"ektarr":{}}
    for seq,g in enumerate(schedule):
        g["seq"]=seq;g["teams"]=[None,None]
        g["phase"]=g["event"]
        g["event"]=event_edition(g["phase"])
        for raw in g["labels"]:
            assert event_edition(raw)==g["event"]
            if raw!=g["event"]: aliases[g["source"]][raw]=g["event"]
        if g["id"] in sources:
            r=rows[sources[g["id"]]]
            assert (r["day"],event_edition(r["event"]))==(g["day"],g["event"])
            assert list(map(text_id,[r["a"],r["b"]]))==list(map(text_id,g["clubs"])),g["id"]
            if g["source"]=="hltv":
                for side,n in enumerate(("fiveA","fiveB")):
                    assert set(g["cores"][side])==set(r[n])-AMBIGUOUS,(g["id"],g["cores"][side],r[n])
            else: assert all(len(p)==5 for p in g["cores"])
        by_event[(g["source"],g["event"])].append(g)
    assert set(sources)<=set(g["id"] for g in schedule)
    pairs, rejected, identity_breaks = [],[],[]
    for (source,event),games in sorted(by_event.items()):
        event_key=source+"|"+event
        uncertainty,breaks=identity_timeline(games)
        identity_breaks.extend(breaks)
        teams=defaultdict(list)
        for g in games:
            for side,team in enumerate(g["teams"]): teams[team].append((g,side))
        scope=event_scope(event)
        event_position={g["seq"]:i for i,g in enumerate(games)}
        for team,appearances in sorted(teams.items()):
            day_counts=Counter(g["day"] for g,s in appearances)
            time_counts=Counter(g["time"] for g,s in appearances)
            for (g,s),(h,t) in zip(appearances,appearances[1:]):
                left,right=sources.get(g["id"]),sources.get(h["id"])
                reason,common=pair_filter(g,s,h,t,scope,day_counts,time_counts,uncertainty[team],
                                        rows[left] if left is not None else None,
                                        rows[right] if right is not None else None)
                if not reason:
                    middle=games[event_position[g["seq"]]+1:event_position[h["seq"]]]
                    labels={g["keys"][s],h["keys"][t]}
                    shared=set(common)
                    if any(record["keys"][side] in labels or len(shared.intersection(record["cores"][side]))>=3
                           for record in middle for side in (0,1)):
                        reason="interveningClubOrCore"
                if reason:
                    rejected.append([g["seq"],h["seq"],s,t,reason]);continue
                pairs.append(dict(left=left,right=right,sideLeft=s,sideRight=t,leftId=g["id"],rightId=h["id"],
                                  event=event_key,team=team,source=source,overlap=len(common),commonCore=common,
                                  scheduleLeft=g["seq"],scheduleRight=h["seq"]))
    pairs.sort(key=lambda p:(p["scheduleRight"],p["scheduleLeft"],p["sideRight"]))
    targets=index_series(rows,original)
    for target in targets.values():
        valid=set(target["seriesIndices"])
        ix=[n for n,p in enumerate(pairs) if p["left"] in valid and p["right"] in valid]
        selected=[pairs[n] for n in ix]
        lo,hi=target["windowStart"],target["cutoffExclusive"]
        def inside(g):
            plus=int(g["source"]=="ektarr")
            return lo<=shift(g["day"],-plus) and shift(g["day"],1+plus)<hi
        raw_in=[inside(g) for g in schedule]
        dropped=Counter(reason for a,b,s,t,reason in rejected if raw_in[a] and raw_in[b])
        broken=sum(raw_in[a] and raw_in[b] for a,b,s,t,why in identity_breaks)
        target.update(indices=ix,pairs=len(ix),events=len({p["event"] for p in selected}),
                      teamEvents=len({(p["event"],p["team"]) for p in selected}),
                      coreOverlap=dict(sorted(Counter(p["overlap"] for p in selected).items())),
                      excluded=dict(sorted(dropped.items())),newCoreStints=broken)
    fields=["id","source","event","labels","day","time","format","stage","clubs","keys","cores","teams","phase"]
    return dict(version=1,frozenRowsSha256=HASHES["frozen"],observations="../tail_calibration/training.json.gz",
                inputHashes=HASHES,eventAliases=aliases,targets=targets,pairs=pairs,scheduleFields=fields,
                schedule=[[g[k] for k in fields] for g in schedule],
                rejectedFields=["scheduleLeft","scheduleRight","sideLeft","sideRight","reason"],
                rejected=rejected,identityBreaks=identity_breaks)


def audit(data):
    assert digest(FROZEN)==data["frozenRowsSha256"]==HASHES["frozen"]
    with gzip.open(FROZEN,"rt",encoding="utf8") as f: rows=json.load(f)["rows"]
    schedule=[dict(zip(data["scheduleFields"],line)) for line in data["schedule"]]
    previous={}; events=defaultdict(list)
    links=set()
    for seq,g in enumerate(schedule):
        g["seq"]=seq
        events[(g["source"],g["event"])].append(g)
        for side,team in enumerate(g["teams"]):
            k=g["source"],g["event"],team
            if k in previous: links.add((*previous[k],seq,side))
            previous[k]=seq,side
    seen=set()
    for p in data["pairs"]:
        a,b=p["scheduleLeft"],p["scheduleRight"]
        s,t=p["sideLeft"],p["sideRight"]
        assert (a,s,b,t) in links and (a,s,b,t) not in seen
        seen.add((a,s,b,t))
        g,h=schedule[a],schedule[b]
        x,y=rows[p["left"]],rows[p["right"]]
        assert p["leftId"]==x["id"]==g["id"] and p["rightId"]==y["id"]==h["id"]
        assert p["source"]==g["source"]==h["source"]
        assert p["event"]==g["source"]+"|"+g["event"] and g["event"]==h["event"]!=HELD_EVENT
        assert event_edition(x["event"])==event_edition(y["event"])==g["event"]
        assert g["phase"]==h["phase"] or CONFIRMED_PHASES.fullmatch(g["event"])
        assert event_scope(g["event"])=="identified" and p["team"]==g["teams"][s]==h["teams"][t]
        assert g["teams"][1-s]!=h["teams"][1-t] and len(set(g["cores"][1-s])&set(h["cores"][1-t]))<3
        assert x["latestUtcDay"]<y["earliestUtcDay"] and x["day"]!=y["day"]
        assert p["commonCore"]==sorted(set(g["cores"][s])&set(h["cores"][t]))
        assert 3<=len(p["commonCore"])==p["overlap"]<=5
    rejected={(a,s,b,t) for a,b,s,t,why in data["rejected"]}
    assert seen.isdisjoint(rejected) and seen|rejected==links
    for target in data["targets"].values():
        cutoff=target["cutoffExclusive"]
        valid={i for i,row in enumerate(rows) if row["event"]!=HELD_EVENT and
               row["earliestUtcDay"]>=target["windowStart"] and shift(row["latestUtcDay"],1)<cutoff}
        assert target["seriesIndices"]==sorted(valid)
        ix=[i for i,p in enumerate(data["pairs"]) if p["left"] in valid and p["right"] in valid]
        assert ix==target["indices"]
        assert target["events"]==len({data["pairs"][i]["event"] for i in ix})
        assert target["teamEvents"]==len({(data["pairs"][i]["event"],data["pairs"][i]["team"]) for i in ix})
        assert len(ix)==target["pairs"]==sum(target["coreOverlap"].values())
        # Check the live prefix of every competition straddling this cutoff using only its earlier roster evidence.
        for games in events.values():
            if not games[0]["day"]<cutoff<=games[-1]["day"]: continue
            old=[g for g in games if g["day"]<cutoff]
            prefix=[dict(g,teams=[None,None]) for g in old]
            identity_timeline(prefix)
            assert [g["teams"] for g in old]==[g["teams"] for g in prefix]
    assert len(data["targets"])==19


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hltvy",type=Path)
    parser.add_argument("--ektarr",type=Path)
    parser.add_argument("--audit",action="store_true",help="verify the bundled schedule, BO3 rows and all 19 windows")
    parser.add_argument("--check",action="store_true")
    args=parser.parse_args()
    if args.audit:
        with gzip.open(OUTPUT,"rt",encoding="utf8") as f: data=json.load(f)
        audit(data)
    else:
        if not args.hltvy or not args.ektarr: parser.error("supply --hltvy and --ektarr or choose --audit")
        data=build(args.hltvy,args.ektarr)
        audit(data)
        raw=(json.dumps(data,ensure_ascii=False,separators=(",",":"))+"\n").encode()
        if args.check:
            assert gzip.decompress(OUTPUT.read_bytes())==raw
        else:
            with tempfile.NamedTemporaryFile(dir=HERE,delete=False) as f:
                temp=Path(f.name)
            try:
                with temp.open("wb") as f,gzip.GzipFile(filename="",fileobj=f,mode="wb",mtime=0) as gz: gz.write(raw)
                temp.replace(OUTPUT)
            finally:
                temp.unlink(missing_ok=True)
    print({k:(t["series"],t["pairs"],t["events"]) for k,t in data["targets"].items()})


if __name__=="__main__": main()
