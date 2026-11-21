"""Convert the pinned public gzip snapshot into temporary, fact-only match rows.

Usage: python extract_archive.py results.json.gz normalized.json
The output contains all eligible source dates. The consumer restricts the pool,
cutoff and lineup separately for each Major.
"""
import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import re
import unicodedata

REPOSITORY = "https://github.com/zugzugs/hltvy"
COMMIT = "1a00ba2893a63646f0d940e626b6da95d342a187"
SHA256 = "750b0da45142fc797eddb708698d14d269237e59784d6a1d066eddba0ba31551"
ARCHIVE_URL = f"https://raw.githubusercontent.com/zugzugs/hltvy/{COMMIT}/results.json.gz"
MAPS = {s.casefold(): s for s in ("Ancient", "Anubis", "Cache", "Dust2",
        "Inferno", "Mirage", "Nuke", "Overpass", "Train", "Vertigo")}


def key(text):
    text = unicodedata.normalize("NFKC", str(text)).casefold()
    return "".join(c for c in text if c.isalnum())


def normalize(record):
    a, b = record.get("team1", ""), record.get("team2", "")
    sides = {key(a): "a", key(b): "b"}
    if len(sides) != 2 or "" in sides or record.get("enrich_failed"):
        return None
    fmt = re.fullmatch(r"Best of ([13])(?:\s*\([^)]*\))?", record.get("format", "").strip(), re.I)
    raw_steps = record.get("veto", [])
    if not fmt or len(raw_steps) != 7:
        return None
    bo = int(fmt[1])
    mid = record["match-id"]
    day = datetime.fromtimestamp(int(record["date"]) / 1000, timezone.utc).date().isoformat()
    steps = []
    for order, text in enumerate(raw_steps, 1):
        numbered = re.fullmatch(r"(\d+)\.\s+(.+)", text.strip())
        if not numbered or int(numbered[1]) != order:
            return None
        action = re.fullmatch(r"(.+?) (removed|picked) (\S+)", numbered[2], re.I)
        if action:
            actor = sides.get(key(action[1]))
            if not actor:
                return None
            verb = {"removed": "ban", "picked": "pick"}[action[2].casefold()]
            name = action[3]
        else:
            leftover = re.fullmatch(r"(\S+) was left over", numbered[2], re.I)
            if not leftover or order != 7:
                return None
            actor, verb, name = None, "left", leftover[1]
        name = MAPS.get(name.casefold())
        if name is None:
            return None
        steps.append([actor, verb, name])
    if len({m for _,_,m in steps}) != 7 or steps[-1][1] != "left":
        return None
    if any(sum(1 for s,v,_ in steps if s == who and v == "pick") != (bo == 3) for who in "ab"):
        return None
    if any(sum(1 for s,v,_ in steps if s == who and v == "ban") != (2 if bo == 3 else 3) for who in "ab"):
        return None
    scheduled = {m for _,v,m in steps if v in ("pick", "left")}
    played = []
    samples = {"a": [], "b": []}
    for row in record.get("maps", []):
        if row.get("status") != "played":
            continue
        map_name = MAPS.get(row.get("map","").casefold())
        if not map_name or map_name not in scheduled:
            return None
        score = {}
        for side in ("team1", "team2"):
            team = row.get(side, {})
            who = sides.get(key(team.get("name", "")))
            if not who or who in score:
                return None
            try:
                score[who] = int(team["score"])
            except (KeyError, TypeError, ValueError):
                return None
            players = [p.get("name","").strip() for p in (row.get("players") or {}).get(side, [])]
            samples[who].append(sorted(players, key=key))
        if score["a"] == score["b"] or min(score.values()) < 0:
            return None
        played.append([map_name, score["a"], score["b"]])
    if len({p[0] for p in played}) != len(played) or len(played) not in ({1} if bo == 1 else {2,3}):
        return None
    won_a = sum(x > y for _, x, y in played)
    reported = (record.get("team1score"), record.get("team2score"))
    # BO1 result lists often report round scores instead of a 1–0 map count.
    if reported != (won_a, len(played)-won_a) and not (bo == 1 and reported == tuple(played[0][1:])):
        return None
    if max(won_a, len(played)-won_a) != bo//2+1:
        return None

    def lineup(side):
        rows = samples[side]
        if not rows:
            return None
        identity = {key(p) for p in rows[0]}
        if "" in identity or len(identity) != 5 or any(len(r) != 5 or {key(p) for p in r} != identity for r in rows):
            return None
        return rows[0]

    aa, bb = lineup("a"), lineup("b")
    if aa and bb and {key(p) for p in aa} & {key(p) for p in bb}:
        aa, bb = None, None
    url = record.get("url","").replace("https://hltv.org/", "https://www.hltv.org/")
    if not url.startswith(f"https://www.hltv.org/matches/{mid}/"):
        return None
    return dict(mid=mid,url=url,day=day,a=a,b=b,bo=bo,steps=steps,
                lineupA=aa,lineupB=bb,maps=played,source="zugzugs/hltvy")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if hashlib.sha256(args.archive.read_bytes()).hexdigest() != SHA256:
        raise SystemExit("The archive does not match the pinned snapshot.")
    with gzip.open(args.archive,"rt") as f:
        records = json.load(f)
    matches = {}
    for raw in records:
        try:
            match = normalize(raw)
        except (TypeError,ValueError,OverflowError):
            continue
        if match is None:
            continue
        if match["mid"] in matches and matches[match["mid"]] != match:
            raise ValueError(f"Conflicting source rows for {match['mid']}")
        matches[match["mid"]] = match
    result = sorted(matches.values(), key=lambda m: (m["day"],m["mid"]))
    args.output.write_text(json.dumps(result,ensure_ascii=False,separators=(",",":"))+"\n")
    print(len(result), "normalized BO1/BO3 series;", sum(bool(x["lineupA"] and x["lineupB"]) for x in result), "with both lineups")


if __name__ == "__main__":
    main()
