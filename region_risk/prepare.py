"""Extract audited non-Major LAN series and point-in-time regional ranking matches."""
import argparse
import bisect
import csv
import gzip
import hashlib
import io
import itertools
import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "map_veto_data"))
import extract_archive as archive
import extract_singapore_csv as griffin

REGIONS = ("americas", "asia", "europe")
FMT = re.compile(r"^Best of [13] \(LAN\)$", re.I)
EXCLUDE = re.compile(r"\b(major|rmr|mrq)\b", re.I)
FIELDS = "day tournament id bo a b ra rb pointsA pointsB y snapshot overlapA overlapB".split()


def five(names):
    return tuple(sorted(unicodedata.normalize("NFKC", n).strip().casefold() for n in names or []))


def read_tables(dirs):
    tables = defaultdict(dict)
    origins = {}
    for directory in dirs:
        for file in sorted(directory.rglob("*.md")):
            if not re.fullmatch(r"(?:standings_(?:asia|europe|americas)_\d{4}_\d{2}_\d{2}|\d{4}-\d{2}-\d{2}-(?:asia|americas|europe))\.md", file.name):
                continue
            raw = file.read_bytes()
            body = raw.decode()
            header = re.search(r"(Americas|Europe|Asia) as of (\d{4}-\d{2}-\d{2})",body[:180].replace("_","-"),re.I)
            if not header:
                raise ValueError(str(file))
            reg, stamp = header[1].lower(),header[2]
            rows = []
            for ln in body.splitlines():
                cells=[c.strip() for c in ln.strip("|").split("|")]
                if len(cells)>=4 and cells[0].isdigit() and cells[1].isdigit():
                    roster=five(cells[3].split(","))
                    if len(set(roster)) == len(roster) == 5:
                        rows.append((roster,reg,int(cells[1])))
            if not rows:
                raise ValueError(str(file))
            if reg in tables[stamp] and tables[stamp][reg] != rows:
                raise ValueError(f"Conflicting regional tables: {file}")
            tables[stamp][reg] = rows
            serial=json.dumps(rows,ensure_ascii=False,separators=(',',':')).encode()
            origins[(stamp,reg)] = hashlib.sha256(serial).hexdigest()
    indexes={}
    for day, regions in tables.items():
        if set(regions)!=set(REGIONS):
            continue
        index=defaultdict(set)
        for rows in regions.values():
            for row in rows:
                for triple in itertools.combinations(row[0],3):
                    index[triple].add(row)
        indexes[day]=index
    hashes={stamp:{reg:origins[stamp,reg] for reg in REGIONS} for stamp in sorted(indexes)}
    return indexes,hashes


def match(index, roster):
    roster=five(roster)
    candidates=set()
    for triple in itertools.combinations(roster,3):
        candidates.update(index.get(triple, ()))
    if not candidates:
        return None
    ranked=sorted(((len(set(roster).intersection(row[0])),row) for row in candidates),reverse=True)
    if len(ranked)>1 and ranked[0][0]==ranked[1][0]:
        return None
    overlap, (_,region,points)=ranked[0]
    return region,points,overlap


def build(arch,grif,tables):
    indexes,hashes=read_tables(tables); dates=sorted(indexes)
    def lookup(stamp, inclusive=False):
        idx=(bisect.bisect_right if inclusive else bisect.bisect_left)(dates,stamp)-1
        if idx<0:
            return None
        day=dates[idx]
        if (date.fromisoformat(stamp)-date.fromisoformat(day)).days>60:
            return None
        return day,indexes[day]
    with gzip.open(arch,'rt') as f:
        if hashlib.sha256(arch.read_bytes()).hexdigest()!=archive.SHA256:
            raise ValueError("Historical tournament archive does not match the pinned version")
        records=json.load(f)
    samples=[]
    bounds=defaultdict(list)
    for r in records:
        title=r.get('event','')
        fmt=r.get('format','')
        if '(lan)' in fmt.lower() and title and not EXCLUDE.search(title):
            d=datetime.fromtimestamp(int(r['date'])/1000,timezone.utc).date().isoformat()
            bounds[(d[:4],title)].append(d)
        if FMT.fullmatch(fmt) and title and not EXCLUDE.search(title):
            parsed=archive.normalize(r)
            if parsed:
                samples.append((parsed,title))
    env={r['hltv_match_id']:r for r in griffin.load(grif,'series')}
    for row in env.values():
        d=row['scheduled_start_utc'][:10]
        if d and row['environment'].strip().lower()=='lan':
            bounds[(d[:4],row['event_name'])].append(d)
    for rec in griffin.build(grif):
        meta=env[str(rec['mid'])]
        if meta['environment'].strip().lower()=='lan' and not EXCLUDE.search(meta['event_name']):
            samples.append((rec,meta['event_name']))
    seen={}
    for s,title in samples:
        day=s['day']
        if day<'2024-01-01' or day>'2026-11-02' or not s['lineupA'] or not s['lineupB']:
            continue
        snap=lookup(day)
        if snap is None: continue
        la,lb=five(s['lineupA']),five(s['lineupB'])
        ra,rb=match(snap[1],la),match(snap[1],lb)
        if not ra or not rb:continue
        scores=s['maps']
        wins=sum(m[1]>m[2] for m in scores)
        row=dict(day=day,tournament=title,id=s['mid'],bo=s['bo'],a='|'.join(la),b='|'.join(lb),
                 ra=ra[0],rb=rb[0],pointsA=ra[1],pointsB=rb[1],y=int(wins>len(scores)-wins),snapshot=snap[0],
                 overlapA=ra[2],overlapB=rb[2])
        if row['id'] in seen and seen[row['id']]!=row:raise ValueError('Conflict in LAN series')
        seen[row['id']]=row
    content=io.StringIO()
    w=csv.DictWriter(content,fieldnames=FIELDS,lineterminator='\n');w.writeheader()
    w.writerows(sorted(seen.values(),key=lambda row:(row['day'],row['id'])))
    fields={}
    for source in ('history24/models.json','datajob/features.json'):
        for eid,e in json.loads((ROOT/source).read_text()).items():
            day,table=lookup(e['asOf'],True)
            assert day==e['asOf']
            teams={}
            for t in e['teams']:
                r=match(table,t['roster'])
                teams[t['name']]=dict(roster=t['roster'],region=r[0] if r else None,
                                      overlap=r[2] if r else 0)
            fields[eid]=dict(asOf=day,teams=teams)
    competitions=sorted({(r['day'][:4],r['tournament']) for r in seen.values()})
    schedule=[dict(year=y,event=e,first=min(bounds[y,e]),last=max(bounds[y,e])) for y,e in competitions]
    return content.getvalue().encode(),json.dumps(fields,ensure_ascii=False,separators=(',',':'))+'\n',json.dumps(schedule,ensure_ascii=False,separators=(',',':'))+'\n',json.dumps(hashes,separators=(',',':'))+'\n'


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--archive',type=Path,required=True)
    ap.add_argument('--griffin-dir',type=Path,required=True)
    ap.add_argument('--tables',type=Path,nargs='+',required=True)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    evidence,anchors,schedule,hashes=build(args.archive,args.griffin_dir,args.tables)
    if args.check:
        assert gzip.decompress((HERE/'evidence.csv.gz').read_bytes())==evidence
        assert (HERE/'anchor.json').read_text()==anchors
        assert (HERE/'schedule.json').read_text()==schedule
        assert (HERE/'ranking_hashes.json').read_text()==hashes
    else:
        (HERE/'evidence.csv.gz').write_bytes(gzip.compress(evidence,mtime=0))
        (HERE/'anchor.json').write_text(anchors)
        (HERE/'schedule.json').write_text(schedule)
        (HERE/'ranking_hashes.json').write_text(hashes)
    print(len(evidence.splitlines())-1,'matched non-Major LAN series')
