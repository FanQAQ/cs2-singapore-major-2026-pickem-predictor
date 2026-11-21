"""Read the historical post-match account's published series-level HLTV rating tables."""
import argparse
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
import gzip
import hashlib
from io import BytesIO
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlencode
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
API = "https://arctic-shift.photon-reddit.com/api/posts/search"
ACCOUNT = "CS2_PostMatchThreads"
AS_OF = "2026-05-25"  # Latest start of the 180-day Elo replay, before any replay-game result.
ARCHIVE_HASH = "750b0da45142fc797eddb708698d14d269237e59784d6a1d066eddba0ba31551"
FACTS_HASH = "26433821b280b01504172d1db8d4deead539a34c21a02a40e715ed014fcdf03f"
# Fixed calendar windows span whole event seasons and are independent of model outcomes.
WINDOWS = [("2024-02-01","2024-06-03"), ("2024-07-01","2024-12-16"),
           ("2025-01-01","2025-06-23"), ("2025-07-01","2025-12-15"),
           ("2026-01-01","2026-02-14"), ("2026-05-01",AS_OF)]
EARLY = [("CSGOMatchThreads", "2023-09-27","2024-04-26"),
         ("Undercover-Cactus", "2024-03-15","2024-04-02")]


def compressed(data, level=9):
    buf = BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0, compresslevel=level) as f:
        f.write(data)
    return buf.getvalue()


def fetch(cache, early_only):
    cache.mkdir(parents=True, exist_ok=True)
    windows = EARLY if early_only else [(ACCOUNT,a,b) for a,b in WINDOWS]+EARLY
    for account, first, last in windows:
        after = first
        while True:
            query = urlencode(dict(subreddit="GlobalOffensive", author=account, after=after, before=last,
                                   limit=100, sort="asc"))
            prefix = "" if account == ACCOUNT else account+"-"
            file = cache / f"{prefix}{first}--{after}.json.gz"
            if not file.exists():
                req = Request(API+"?"+query, headers={"User-Agent":"CS2 research (historical public match tables)"})
                with urlopen(req, timeout=60) as response:
                    data = response.read()
                posts = json.loads(data)["data"]
                file.write_bytes(compressed(data, 3))
            else:
                posts = json.loads(gzip.decompress(file.read_bytes()))["data"]
            print(first, after, last, len(posts), flush=True)
            if len(posts) < 100 or stamp(posts[-1]["created_utc"])[:10] >= last:
                break
            # The API's after bound is exclusive. Never silently omit equal-second posts.
            assert posts[-2]["created_utc"] < posts[-1]["created_utc"]
            latest = posts[-1]["created_utc"]
            assert str(latest) != str(after)
            after = latest


def stamp(ts):
    assert isinstance(ts, int) and not isinstance(ts, bool) and ts > 0
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def rating_header(line):
    names = [s.strip().strip("*") for s in line.strip().strip("|").split("|")]
    return names in (["Team","K-D","ADR","KAST","Rating"], ["Team","K-D","ADR","Swing","Rating"])


def tables(post):
    lines = post["selftext"].splitlines()
    for i, line in enumerate(lines):
        if not rating_header(line):
            continue
        groups = []
        facts = []
        for row in lines[i+1:]:
            cells = [c.strip() for c in row.strip().strip("|").split("|")]
            if len(groups) == 2 and len(groups[-1]["roster"]) == 5:
                break
            if not row.strip() or row.lstrip().startswith("#"):
                break
            player = re.search(r"\[([^\]]+)\]\(https?://(?:www\.)?hltv\.org/+player/(\d+)/[^)]+\)", cells[0])
            if player and groups:
                if not re.fullmatch(r"\d\.\d\d", cells[-1]):
                    break
                name, rating = player[1], float(cells[-1])
                group = groups[-1]
                group["roster"].append(name)
                group["playerIds"].append(int(player[2]))
                group["playerRatings"].append(rating)
                facts.append(row.strip())
                continue
            team = re.search(r"\*\*([^*]+)\*\*", cells[0])
            if team and len(cells) <= 2:
                if len(groups) >= 2:
                    break
                groups.append(dict(name=team[1], roster=[], playerIds=[], playerRatings=[]))
                facts.append(row.strip())
        if len(groups) == 2 and all(len(g["roster"]) == 5 for g in groups):
            if len({p for t in groups for p in t["playerIds"]}) != 10:
                return None
            for group in groups:
                group["rating"] = round(sum(group["playerRatings"])/5, 4)
            return groups, hashlib.sha256("\n".join(facts).encode()).hexdigest(), i
    return None


def player_key(name):
    return "".join(c for c in name.lower() if c.isalnum())


def match_index(file):
    if hashlib.sha256(file.read_bytes()).hexdigest() != ARCHIVE_HASH:
        raise ValueError("Unexpected match archive")
    by_day, by_id = defaultdict(list), {}
    for r in json.loads(gzip.decompress(file.read_bytes())):
        dt = stamp(int(r["date"])//1000)
        game = next((m for m in r.get("maps", []) if m.get("players") and m.get("status") == "played"), None)
        if not game:
            continue
        sides = frozenset(frozenset(player_key(v["name"]) for v in pp) for pp in game["players"].values())
        mid = int(r["match-id"])
        played = [m for m in r["maps"] if m.get("status") == "played"]
        halves = [re.match(r"^\((\d+):(\d+)", m.get("half_scores","")) for m in played]
        mr12 = all(h and sum(map(int,h.groups())) == 12 for h in halves)
        obj = (mid, dt, r["url"], sides, mr12)
        by_day[date.fromisoformat(dt[:10])].append(obj)
        by_id[mid] = obj
    return by_day, by_id


def extract(post, by_day, by_id):
    if post["author"] not in {ACCOUNT, *(w[0] for w in EARLY)} or "Post-Match Discussion" not in post["title"]:
        return None, "outside post type"
    body = post["selftext"]
    hltv = re.search(r"https?://(?:www\.)?hltv\.org/+matches/(\d+)/[\w%-]+", body, re.I)
    result = tables(post)
    if not result:
        return None, "incomplete series table"
    groups, digest, idx = result
    before = "\n".join(body.splitlines()[:idx]).lower()
    # Series header is explicit in BO3. BO1s have just one map's player-rating table.
    if re.search(r"full match stats|full match statistics", before) and "individual map stats" not in before:
        scope = "series"
    elif (sum(map(rating_header, body.splitlines())) == 1
          and len(re.findall(r"^\s*\*\*[A-Za-z0-9]+:\*\*\s*\d+\s*[-–]\s*\d+",body,re.M)) == 1):
        scope = "single-map"
    else:
        return None, "series scope unverified"
    created, first = post["created_utc"], post.get("retrieved_on")
    if not first:
        return None, "missing capture"
    meta = post.get("_meta", {})
    second, edited = meta.get("retrieved_2nd_on"), post.get("edited")
    if (meta.get("is_edited") or edited) and not second:
        return None, "edited without second capture"
    available = max(first, created, second or 0, int(edited or 0))
    if first < created or (second and second < first):
        return None, "invalid archival chronology"
    if stamp(available)[:10] >= AS_OF:
        return None, "capture after project cutoff"
    title = post["title"].split(" / ")
    if len(title) < 3:
        return None, "unknown event"
    posted = date.fromisoformat(stamp(created)[:10])
    sides = frozenset(frozenset(player_key(n) for n in t["roster"]) for t in groups)
    if hltv:
        mid, url = int(hltv[1]), hltv[0]
        game = by_id.get(mid)
        if game and (game[3] != sides or not 0 <= (posted-date.fromisoformat(game[1][:10])).days <= 1):
            return None, "independent match disagreement"
    else:
        matched = [g for d in (posted, posted-timedelta(days=1)) for g in by_day[d] if g[3] == sides]
        if len(matched) != 1:
            return None, "no unique match ID"
        game = matched[0]
        mid, url = game[0], game[2]
    if posted < date(2024,1,1) and (not game or not game[4]):
        return None, "early MR12 unconfirmed"
    return dict(day=game[1][:10] if game else stamp(created)[:10], author=post["author"],
                seriesStartUtc=game[1] if game else None, publishedAt=stamp(created), firstArchivedAt=stamp(first),
                secondArchivedAt=stamp(second) if second else None,
                editedAt=stamp(edited) if isinstance(edited,int) and edited>1 else None,
                archiveMarksEdited=bool(meta.get("is_edited") or edited), availableAt=stamp(available), scope=scope,
                seriesId=mid, event=title[1].split(" - ")[0].strip(), teams=groups, tableSha256=digest,
                identitySource="post" if hltv else "ten-player match", hltvUrl=url,
                sourceUrl="https://www.reddit.com"+post["permalink"]), None


def build(cache, archive):
    posts = {}
    windows = [(ACCOUNT,a,b) for a,b in WINDOWS]+EARLY
    for file in sorted(cache.glob("*.json.gz")):
        for p in json.loads(gzip.decompress(file.read_bytes()))["data"]:
            day = stamp(p["created_utc"])[:10]
            if not any(p["author"] == a and start <= day < end for a,start,end in windows):
                continue
            if p["id"] in posts:
                assert posts[p["id"]] == p
            posts[p["id"]] = p
    assert posts
    rows, rejects, conflicts = {}, Counter(), set()
    by_day, by_id = match_index(archive)
    for p in posts.values():
        row, reason = extract(p, by_day, by_id)
        if row is None:
            rejects[reason] += 1
        elif row["seriesId"] in conflicts:
            rejects["conflicting copies"] += 1
        elif row["seriesId"] not in rows:
            rows[row["seriesId"]] = row
        else:
            old = rows[row["seriesId"]]
            table_values = lambda s: {p:r for t in s["teams"] for p,r in zip(t["playerIds"], t["playerRatings"])}
            if table_values(old) != table_values(row):
                conflicts.add(row["seriesId"])
                del rows[row["seriesId"]]
                rejects["conflicting copies"] += 2
            else:
                rows[row["seriesId"]] = min([old,row],key=lambda r:(r["availableAt"],r["sourceUrl"]))
                rejects["duplicate series"] += 1
    assert len(rows)+sum(rejects.values()) == len(posts)
    return dict(archiveApi=API, cutoffExclusive=AS_OF, matchArchiveSha256=ARCHIVE_HASH,
                windows=windows, postCount=len(posts), excluded=dict(sorted(rejects.items())),
                rows=sorted(rows.values(), key=lambda r:(r["availableAt"], r["seriesId"])))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cache", type=Path)
    parser.add_argument("archive", type=Path, help="Pinned HLTvy results.json.gz, used only to verify canonical match IDs, lineups and start dates")
    parser.add_argument("--fetch", action="store_true")
    parser.add_argument("--early-only", action="store_true", help="Fetch the historical post-match authors first")
    parser.add_argument("--fetch-only", action="store_true", help="Download input pages without generating JSON")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    if args.fetch:
        fetch(args.cache, args.early_only)
    if args.fetch_only:
        sys.exit(0)
    data = build(args.cache, args.archive)
    facts = json.dumps(data, ensure_ascii=False,separators=(",",":")).encode()
    if hashlib.sha256(facts).hexdigest() != FACTS_HASH:
        raise ValueError("Source pages differ from the frozen player-rating evidence or are incomplete.")
    binary = compressed(facts)
    target = HERE/"player-priors.json.gz"
    if args.write:
        target.write_bytes(binary)
    else:
        assert json.loads(gzip.decompress(target.read_bytes())) == json.loads(gzip.decompress(binary))
    print(len(data["rows"]), data["excluded"])
