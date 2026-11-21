"""Reconstruct each stage's last public, pre-opening Valve standings from its release commit."""
import argparse
import hashlib
import json
import sys
from datetime import date, timedelta
from pathlib import Path
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from datajob.build_features import Standings, core_overlap, matched_row, parse_rows, roster_key

REPO = "ValveSoftware/counter-strike_regional_standings"
WEB = f"https://github.com/{REPO}"
API = f"https://api.github.com/repos/{REPO}"

# Git commit and file object IDs at publication, not files retrieved from today's main.
RELEASES = {
    "copenhagen": ("2024-03-17", "2024-03-04T23:55:04Z", "99a0ba5fff938345d10d500f8b29cd297076573e", {
        "europe": ("standings_europe.md", "e36bf9f273f1cf435f5cda12827c4351fc021ee6"),
        "americas": ("standings_americas.md", "91c9b827710e7f1cccdac8598fc3341afcc7987b"),
        "asia": ("standings_asia.md", "c3379d18b11abee3cb191ebdb17147a765418eb4")}),
    "shanghai": ("2024-11-30", "2024-11-25T16:10:05Z", "8a8657be12dc322d1141fe6263cf8270c718b605", {
        "global": ("live/2024/standings_global_2024_11_25.md", "7a51bee9d42eb8f65daa623e0a083125daa5e56c")}),
    "austin": ("2025-06-03", "2025-06-02T17:58:00Z", "1ce8398c0be1970319488c23cfd0d4077eaec04a", {
        "global": ("invitation/2025/standings_global_2025_06_02.md", "5a38ee6a5ab97f725568847478384efeb053db30")}),
    "cologne": ("2026-06-02", "2026-06-01T17:15:49Z", "510968f54723dcb698ad3b04d396140fc263c239", {
        "global": ("invitation/2026/standings_global_2026_06_01.md", "841110dda813a7a1a910e8beaefa0f90ad113d37")}),
}


def normalized(lineup):
    # Same identities used by history24/build.py. Preserve the original handles
    # in the published source row while matching stage and ranking lineups.
    aliases = {"rmn": "roman", "ahang": "l1hang", "snowzin": "snow", "dev1ce": "device"}
    return [aliases.get(p.casefold(), p) for p in lineup]


def build(verify_online=False):
    earlier = json.loads((ROOT / "history24/models.json").read_text())
    monthly = json.loads((ROOT / "datajob/features.json").read_text())
    results = {}
    for event, (opening, published, revision, tables) in RELEASES.items():
        day = published[:10]
        last_full_day = date.fromisoformat(opening) - timedelta(days=1)
        if day > last_full_day.isoformat():
            raise ValueError(f"{event}: published too late")
        history_url = f"{API}/commits?until={last_full_day}T23:59:59Z&per_page=1"
        if verify_online:
            commit = json.load(urlopen(history_url, timeout=30))[0]
            if commit["sha"] != revision or commit["commit"]["committer"]["date"] != published:
                raise ValueError(f"{event}: earlier published revision mismatch")

        rows = []
        urls = []
        for scope, (relative, blob) in tables.items():
            urls.append(f"{WEB}/blob/{revision}/{relative}")
            raw = (HERE / "sources" / f"{day}-{scope}.md").read_bytes()
            ident = hashlib.sha1(f"blob {len(raw)}\0".encode() + raw).hexdigest()
            if ident != blob or day not in raw.splitlines()[0].decode().replace("_", "-"):
                raise ValueError(f"{event}: invalid standings {relative}")
            for rank, points, club, players, *_ in parse_rows(raw.decode()):
                five = [p.strip() for p in players.split(",")]
                if roster_key(five):
                    rows.append(dict(name=club, rank=int(rank), rankScope=scope, points=int(points),
                                     roster=normalized(five), sourceRoster=five))
        index = Standings(rows)
        base = earlier[event] if event in earlier else monthly[event]
        fresh = {}
        for team in base["teams"]:
            lineup = normalized(team["roster"])
            row = matched_row(index, team["name"], lineup)
            if row is None:
                raise ValueError(f"{event}: no unambiguous core for {team['name']}")
            overlap = core_overlap(lineup, row["roster"])
            fresh[team["name"]] = dict(points=row["points"], rank=row["rank"], rankScope=row["rankScope"],
                                       roster=row["sourceRoster"], sourceName=row["name"], overlap=overlap)
        if len(fresh) != 16:
            raise ValueError(f"{event}: missing stage entrants")
        same = day == base["asOf"]
        comparison = ({t["name"]:t for t in base["teams"]} if same else base["recentRating"]["teams"])
        for name, row in fresh.items():
            if (row["rank"], row["points"]) != (comparison[name]["rank"], comparison[name]["points"]):
                raise ValueError(f"{event}: archived rank/points mismatch for {name}")
        regional = "global" not in tables
        results[event] = dict(kind="official-latest", provider="Valve",
                              basis="Valve 官方地区榜" if regional else "Valve 官方全球榜",
                              sameAsBase=same, rankScope="regional" if regional else "global",
                              asOf=day, monthlyAsOf=base["asOf"], publishedAt=published,
                              available=True, source=f"{WEB}/tree/{revision}" if regional else urls[0],
                              sources=urls, historySource=history_url, teams=fresh)
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-online", action="store_true", help="also check the last pre-stage commit via GitHub")
    parser.add_argument("--check", action="store_true", help="compare the offline rebuild with ratings.json")
    args = parser.parse_args()
    result = build(args.verify_online)
    output = HERE / "ratings.json"
    encoded = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if output.read_text() != encoded:
            raise SystemExit("Ratings differ from the checked-in reconstruction.")
    else:
        output.write_text(encoded, encoding="utf-8")
    for event, data in result.items():
        five = sum(r["overlap"] == 5 for r in data["teams"].values())
        print(f"{event}: {data['asOf']} ({five}/16 exact fives), sameAsBase={data['sameAsBase']}")
