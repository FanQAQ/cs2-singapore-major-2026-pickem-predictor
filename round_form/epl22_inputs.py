"""Reconstruct the S22 leave-out field before scoring; use the two pinned public files."""
import argparse
import gzip
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from map_veto_data.extract_archive import key, normalize, SHA256

STAGE1 = "ESL Pro League Season 22 Stage 1"
STAGE2 = "ESL Pro League Season 22"
FIRST, LAST, START, END = "2025-09-28", "2025-10-02", "2025-10-04", "2025-10-08"
ID = "epl22-stage2"
RANK = "2025-09-01"
COMMIT = "ec65cbf461daa5977d57f80561437961326cfc51"
SEED_SOURCE = "https://pro.eslgaming.com/tour/2025/10/epl-s22-stage-2-team-seeding-and-live-ratings/"
SEEDS = [
    ("Vitality", 1.36), ("The MongolZ", 2.13), ("Spirit", 2.46), ("MOUZ", 3.85),
    ("Falcons", 4.85), ("FURIA", 5.31), ("G2", 6.77), ("Aurora", 7.00),
    ("Natus Vincere", 8.23), ("FaZe", 9.54), ("3DMAX", 11.31), ("Astralis", 11.77),
    ("GamerLegion", 12.00), ("Inner Circle", 13.85), ("HOTU", 14.00), ("Gentle Mates", 14.20),
]
FORFEIT = 2385936
# Announced after the most recent completed series and before Stage 2.
CHANGES = {
    "Spirit": dict(day="2025-09-08", out="zont1x", incoming="tN1R",
                   source="https://teamspirit.gg/article/68bee1f769dddf002394f8e2",
                   corroboration="https://www.hltv.org/news/42432/official-spirit-sign-tn1r-to-replace-zont1x"),
    "FaZe": dict(day="2025-09-29", out="rain", incoming="Twistzz",
                 source="https://www.hltv.org/news/42809/faze-announce-rain-benching",
                 corroboration="https://www.youtube.com/watch?v=5kCEwlhxpOo"),
}


def utc_day(raw):
    return datetime.fromtimestamp(int(raw["date"]) / 1000, timezone.utc).date().isoformat()


def rank_table(file):
    raw = file.read_bytes()
    expected_hash = json.loads((ROOT / "stage3_maps/inputs-snapshots.json").read_bytes())[RANK]
    assert hashlib.sha256(raw).hexdigest() == expected_hash
    rows = []
    for line in raw.decode().splitlines():
        cells = [t.strip() for t in line.split("|")]
        if len(cells) < 5 or not cells[1].isdigit():
            continue
        roster = cells[4].split(", ")
        if len(set(map(key, roster))) == 5:
            rows.append(dict(name=cells[3], points=int(cells[2]), roster=roster, rank=int(cells[1])))
    return rows


def ranking(five, ranks):
    observed = set(map(key, five))
    assert len(observed) == 5
    scores = [(len(observed.intersection(map(key, row["roster"]))), row) for row in ranks]
    scores.sort(key=lambda item: -item[0])
    count, best = scores[0]
    assert count >= 3 and count > scores[1][0], (five, scores[:2])
    return dict(**best, overlap=count)


def build_field(records, ranks):
    # Select by past dates and the official pre-stage list only.
    teams = []
    for seed, (name, rating) in enumerate(SEEDS, 1):
        eligible = (r for r in records if "2025-08-05" <= utc_day(r) < START
                    and name in (r.get("team1"), r.get("team2")))
        for witness in sorted(eligible, key=lambda r: int(r["date"]), reverse=True):
            norm = normalize(witness)
            if not norm:
                continue
            five = norm["lineupA" if name == norm["a"] else "lineupB"]
            if five:
                break
        else:
            raise ValueError(f"No earlier lineup for {name}")
        evidence = [dict(kind="playedLineup", day=norm["day"], source=norm["url"], roster=five)]
        if name in CHANGES:
            change = CHANGES[name]
            assert norm["day"] < change["day"] < START
            assert change["out"] in five and change["incoming"] not in five
            five = sorted((change["incoming"] if p == change["out"] else p for p in five), key=key)
            evidence.append(dict(kind="announcedChange", **change))
        rank = ranking(five, ranks)
        teams.append(dict(name=name, seed=seed, roster=five, points=rank["points"],
                          ratingRoster=rank["roster"], overlap=rank["overlap"], rank=rank["rank"],
                          rosterDay=evidence[-1]["day"], rosterSource=evidence[-1]["source"],
                          rosterEvidence=evidence))
    donor = []
    stage_wins = Counter()
    for raw in sorted(records, key=lambda r: int(r["date"])):
        if raw.get("event") != STAGE1 or not FIRST <= utc_day(raw) <= LAST:
            continue
        row = normalize(raw)
        assert row and row["bo"] == 3 and len(row["lineupA"]) == len(row["lineupB"]) == 5
        x, y = (ranking(row["lineup"+side], ranks) for side in ("A", "B"))
        aw = sum(a > b for _, a, b in row["maps"])
        bw = len(row["maps"]) - aw
        assert [aw, bw] == [raw["team1score"], raw["team2score"]]
        stage_wins[row["a"] if aw > bw else row["b"]] += 1
        donor.append(dict(id=str(row["mid"]), round=int(re.search(r"Swiss round (\d)", raw["stage"])[1]),
                          day=row["day"], bo=3, a=row["a"], b=row["b"], fiveA=row["lineupA"], fiveB=row["lineupB"],
                          rankDay=RANK, pointsA=x["points"], pointsB=y["points"], rankOverlap=[x["overlap"], y["overlap"]],
                          score=[aw, bw], maps=row["maps"], sourceUrl=row["url"]))
    assert len({r["id"] for r in donor}) == len(donor) == 33
    assert [sum(r["round"] == i for r in donor) for i in range(1, 6)] == [8, 8, 8, 6, 3]
    advanced = {name for name, wins in stage_wins.items() if wins == 3}
    entrants = [name for name, _ in SEEDS]
    assert len(advanced) == 8 and advanced <= set(entrants)
    target = dict(id=ID, start=START, end=END, entrants=entrants, teams=teams,
                  liveRatings=[rating for _, rating in SEEDS], direct=[i for i,t in enumerate(entrants) if t not in advanced],
                  seedingDate="2025-10-03", seedingSource=SEED_SOURCE, rankingDate=RANK,
                  rankingPublishedAt="2025-09-01T16:58:36Z", rankingSource=(
                  "https://github.com/ValveSoftware/counter-strike_regional_standings/blob/"
                  + COMMIT + "/invitation/2025/standings_global_2025_09_01.md"))
    prior = dict(id=ID, start=START, stage2Start=FIRST, stage2End=LAST, donorStage=1, series=donor)
    return dict(target=target, priorStage=prior)


def draw(pool, ratings, played):
    """Minimize ESL's squared deviation from the group mean without rematches."""
    pool = sorted(pool, key=lambda i: (ratings[i], i))
    middle = 2 * sum(ratings[i] for i in pool) / len(pool)

    def choices(remaining):
        if not remaining:
            yield 0, []
            return
        first, *others = remaining
        for j in reversed(range(len(others))):
            second = others[j]
            pair = tuple(sorted((first, second)))
            if pair in played:
                continue
            cost = (ratings[first] + ratings[second] - middle) ** 2
            for rest_cost, rest in choices(others[:j] + others[j+1:]):
                yield cost + rest_cost, [pair] + rest

    return min(choices(pool), key=lambda option: option[0])[1]


def administrative_replay(rounds, ids, administrative_weight):
    ratings = [rating for _, rating in SEEDS]
    wins, losses, played, summary = [0]*16, [0]*16, set(), []
    for i, games in enumerate(rounds):
        groups = {}
        for team in range(16):
            if wins[team] < 3 and losses[team] < 3:
                groups.setdefault((wins[team], losses[team]), []).append(team)
        if i == 0:
            forecast = {(seed, 15 - seed) for seed in range(8)}
        else:
            forecast = {pair for group in groups.values() for pair in draw(group, ratings, played)}
        actual = {tuple(sorted((w, l))) for w, l, _ in games}
        summary.append(dict(round=i+1, expected=len(actual), matched=len(forecast & actual),
                            unmatchedActual=[list(p) for p in sorted(actual-forecast)]))
        for mid, (winner, loser, loser_maps) in zip(ids[i], games):
            assert tuple(sorted((winner, loser))) not in played
            wins[winner] += 1
            losses[loser] += 1
            played.add(tuple(sorted((winner, loser))))
            weight = administrative_weight if mid == FORFEIT else (0.5 if loser_maps else 1.0)
            difference = ratings[winner] - ratings[loser]
            swing = weight * 5 * (1 - 1 / (1 + 10**((difference - 8)/10)))
            ratings[winner] -= swing
            ratings[loser] += swing
    return summary


def results(records):
    names = [t for t, _ in SEEDS]
    rounds, ids = [[] for _ in range(5)], [[] for _ in range(5)]
    roster_seen, links = {}, []
    for raw in sorted(records, key=lambda r: int(r["date"])):
        if raw.get("event") != STAGE2 or not START <= utc_day(raw) <= END:
            continue
        a, b = raw["team1"], raw["team2"]
        mid = int(raw["match-id"])
        rd = int(re.search(r"Swiss round (\d)", raw["stage"])[1]) - 1
        if mid == FORFEIT:
            assert (a, b, raw["team1score"], raw["team2score"]) == ("G2", "FaZe", 1, 0)
            assert all(m["status"] != "played" for m in raw["maps"])
            winner, loser, loser_maps = a, b, 0
        else:
            data = normalize(raw)
            assert data and data["bo"] == 3 and data["lineupA"] and data["lineupB"]
            for side in ("a", "b"):
                team = data[side]
                five = data["lineup"+side.upper()]
                sample = dict(roster=five, firstDay=data["day"], source=data["url"])
                first = roster_seen.setdefault(team, sample)
                assert set(map(key, first["roster"])) == set(map(key, five)), team
            aw, bw = raw["team1score"], raw["team2score"]
            winner, loser = (a, b) if aw > bw else (b, a)
            loser_maps = min(aw, bw)
        rounds[rd].append([names.index(winner), names.index(loser), loser_maps])
        ids[rd].append(mid)
        links.append(raw["url"].replace("https://hltv.org/", "https://www.hltv.org/"))
    assert len(set(sum(ids, []))) == 33 and len(roster_seen) == 16
    assert list(map(len, rounds)) == [8, 8, 8, 6, 3]
    replay = {label: administrative_replay(rounds, ids, weight)
              for label, weight in (("twoZeroMovement", 1.0), ("twoOneMovement", 0.5), ("noMovement", 0.0))}
    assert [r["matched"] for r in replay["twoZeroMovement"]] == [8, 8, 8, 6, 3]
    assert [r["matched"] for r in replay["twoOneMovement"]] == [8, 8, 8, 6, 3]
    assert [r["matched"] for r in replay["noMovement"]] == [8, 8, 8, 6, 1]
    return dict(id=ID, end=END, rounds=rounds, matchIds=ids, administrativeMatchIds=[FORFEIT],
                playedRosters=roster_seen, sources=links, administrativeReplay=replay,
                administrativeDescription=dict(matchId=FORFEIT, actualMaps=0,
                    winner="G2", loser="FaZe", probabilityScoring=False,
                    roundResultSource="https://www.hltv.org/news/42844/faze-forfeit-esl-pro-league-match-against-g2",
                    rosterUpdateSource="https://x.com/FaZeEsports/status/1974492381710791163"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cache", type=Path, help="Folder with results.json.gz and standings_global_2025_09_01.md")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    archive = args.cache / "results.json.gz"
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == SHA256
    with gzip.open(archive, "rt", encoding="utf8") as stream:
        records = json.load(stream)
    field = build_field(records, rank_table(args.cache / "standings_global_2025_09_01.md"))
    truth = results(records)
    mismatches = {}
    for row in field["target"]["teams"]:
        name = row["name"]
        known = set(map(key, row["roster"]))
        observed = set(map(key, truth["playedRosters"][name]["roster"]))
        if known != observed:
            mismatches[name] = [sorted(known-observed), sorted(observed-known)]
    assert mismatches == {"FaZe": [["jcobbb"], ["rain"]]}
    for label, data in [("inputs", field), ("results", truth)]:
        dest = HERE / ("epl22-" + label + ".json")
        if args.write:
            dest.write_bytes((json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode())
        else:
            assert json.loads(dest.read_bytes()) == data


if __name__ == "__main__":
    main()
