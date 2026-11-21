"""Verify the 33 EPL S23 Stage 1 scorecards available before Stage 2."""
import argparse
import gzip
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from map_veto_data import extract_archive


def read(path):
    return json.loads(path.read_text(encoding="utf8"))


def valid_score(a, b):
    winner, loser = max(a, b), min(a, b)
    return (winner == 13 and 0 <= loser <= 11) or (
        winner >= 16 and (winner - 16) % 3 == 0 and 2 <= winner - loser <= 4
    )


def prepare():
    donor = read(ROOT / "stage1_holdout/field.json")
    results = read(ROOT / "stage1_holdout/field-results.json")
    target = read(ROOT / "epl_transfer/field.json")
    assert donor["id"] == results["id"] == "epl23-stage1"
    assert donor["vrs"]["date"] < donor["start"] <= results["end"] < target["start"]
    expected = {}
    assert len(results["matchIds"]) == len(results["rounds"]) == 5
    for ids, games in zip(results["matchIds"], results["rounds"]):
        assert len(ids) == len(games)
        for mid, (winner, loser, loser_maps) in zip(ids, games):
            assert mid not in expected and winner != loser
            expected[mid] = (donor["entrants"][winner], donor["entrants"][loser], loser_maps)
    assert len(expected) == 33
    rank = donor["vrs"]
    # The shared schema calls the donor interval stage2Start/stage2End.
    # EPL uses Stage 1 as its donor for a Stage 2 target.
    header = dict(id=target["id"], start=target["start"], donorStage=1, donorId=donor["id"],
                  stage2Start=donor["start"], stage2End=donor["end"], rankDay=rank["date"],
                  ratingCutoff=donor["cutoff"], rankSource=(
                      "https://github.com/ValveSoftware/counter-strike_regional_standings/blob/"
                      + rank["commit"] + "/invitation/2026/standings_global_2026_02_02.md"),
                  seriesIndexSource=results["source"], archiveSource=extract_archive.ARCHIVE_URL,
                  archiveSha256=extract_archive.SHA256)
    return header, {t["name"]: t for t in donor["teams"]}, expected


def validate(series, header, teams, expected):
    assert len(series) == len(expected) == 33
    assert [r["id"] for r in series] == [str(mid) for mid in expected]
    previous = read(ROOT / "stage1_holdout/report.json")["matches"]
    baseline = {r["hltvId"]: r["winnerProbability"]["vrs"] for r in previous}
    assert len(previous) == 33 and baseline.keys() == expected.keys()
    for r in series:
        mid = int(r["id"])
        assert r["bo"] == 3 and header["stage2Start"] <= r["day"] <= header["stage2End"]
        assert r["rankDay"] == header["rankDay"] < r["day"] < header["start"]
        assert r["sourceUrl"].startswith(f"https://www.hltv.org/matches/{mid}/")
        names = [r["a"], r["b"]]
        for name, side in zip(names, ("A", "B")):
            team = teams[name]
            lineup = r["five" + side]
            assert lineup == sorted({p.casefold() for p in team["roster"]})
            assert len(lineup) == 5 and team["overlap"] >= 3
            assert r["points" + side] == team["points"] > 0
        assert not set(r["fiveA"]) & set(r["fiveB"])
        maps = r["maps"]
        assert 2 <= len(maps) <= 3 and len({m for m, a, b in maps}) == len(maps)
        assert all(valid_score(a, b) for _, a, b in maps)
        wins_a = sum(a > b for _, a, b in maps)
        score = [wins_a, len(maps) - wins_a]
        assert score == r["score"] and max(score) == 2
        winner = score.index(2)
        assert (names[winner], names[1 - winner], min(score)) == expected[mid]
        probability_a = 1 / (1 + 10 ** ((r["pointsB"] - r["pointsA"]) / 400))
        winner_probability = (probability_a, 1 - probability_a)[winner]
        assert abs(winner_probability - baseline[mid]) < 1e-12


def from_archive(path, header, teams, expected):
    assert hashlib.sha256(path.read_bytes()).hexdigest() == extract_archive.SHA256
    with gzip.open(path, "rt", encoding="utf8") as f:
        rows = [r for r in json.load(f) if r["match-id"] in expected]
    assert Counter(r["match-id"] for r in rows) == Counter(expected.keys())
    facts = {}
    for row in rows:
        n = extract_archive.normalize(row)
        assert n and n["lineupA"] and n["lineupB"], row["match-id"]
        a, b = n["a"], n["b"]
        mid = n["mid"]
        facts[mid] = dict(id=str(mid), day=n["day"], bo=n["bo"], a=a, b=b,
                          fiveA=sorted(p.casefold() for p in n["lineupA"]),
                          fiveB=sorted(p.casefold() for p in n["lineupB"]),
                          pointsA=teams[a]["points"], pointsB=teams[b]["points"],
                          rankDay=header["rankDay"], score=[row["team1score"], row["team2score"]],
                          maps=n["maps"], sourceUrl=n["url"])
    return [facts[mid] for mid in expected]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, help="pinned zugzugs/hltvy results.json.gz")
    parser.add_argument("--write", action="store_true", help="regenerate from --archive")
    args = parser.parse_args()
    if args.write and args.archive is None:
        parser.error("--write requires the pinned --archive")
    header, teams, expected = prepare()
    filename = HERE / "epl-inputs.json"
    if args.archive:
        series = from_archive(args.archive, header, teams, expected)
    else:
        series = read(filename)["fields"][header["id"]]["series"]
    validate(series, header, teams, expected)
    payload = {"fields": {header["id"]: {**header, "series": series}}}
    if args.write:
        with filename.open("w", encoding="utf8", newline="\n") as f:
            f.write(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    else:
        assert read(filename) == payload
    print(f"{len(series)} BO3, {sum(len(g['maps']) for g in series)} played maps, "
          f"{len(teams)} teams; fixed pre-stage VRS {header['rankDay']}.")


if __name__ == "__main__":
    main()
