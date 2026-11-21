"""Build the eight 16-team post-opening Swiss fields from dated repository snapshots."""
import csv
import gzip
import json
import math
import sys
import unicodedata
from collections import Counter
from datetime import date, timedelta
from pathlib import Path
from statistics import median

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from experience.features import snapshot as experience_snapshot
from format_model.build import global_scales, team_contrast
from lan_signal import build as lan
from major_form.build import profile as major_profile
SEEDS_2024 = {
    "copenhagen": "https://www.hltv.org/news/38552/spirit-vs-cloud9-headlines-elimination-stage-round-1",
    "shanghai": "https://www.hltv.org/news/40466/perfect-world-shanghai-major-elimination-stage-opening-round-set",
}
SCORE_2024 = {"copenhagen": "7148/pgl-cs2-major-copenhagen-2024",
              "shanghai": "7524/perfect-world-shanghai-major-2024"}
ARCHIVE = "https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11"


def read(file):
    return json.loads((ROOT / file).read_text(encoding="utf-8"))


def players(roster):
    # Verified same-player aliases in the Valve and series archives.
    aliases = {"niko@ba": "niko", "lucky@fr": "lucky", "snowzin": "snow",
               "dav1d": "dav1deus", "dav1deu$": "dav1deus", "dev1ce": "device",
               "ahang": "l1hang", "rmn": "roman"}
    values = [unicodedata.normalize("NFKC", p).strip().casefold() for p in roster]
    return frozenset(aliases.get(p, p.split("@")[0]) for p in values)


def early_form(team, series, as_of):
    """Same 90-day VRS residual and five-series shrinkage as history24.build.Form."""
    lineup = players(team["roster"])
    lower = (date.fromisoformat(as_of) - timedelta(days=89)).isoformat()
    obs = []
    for row in series:
        assert row["day"] <= as_of
        if row["day"] < lower:
            continue
        p = 1 / (1 + 10 ** (-float(row["gap"]) / 4))
        y = int(row["winner"])
        for side, win, prob in (("lineupA", y, p), ("lineupB", 1-y, 1-p)):
            shared = len(lineup & players(row[side].split("|")))
            if shared >= 3:
                obs.append((win, prob, shared))
    groups = [obs, [r for r in obs if r[1] <= .35], [r for r in obs if r[1] >= .65]]
    counts = Counter(r[2] for r in obs)
    return dict(zip(("form", "strong", "weak"),
                    (sum(y-p for y, p, _ in group)/(len(group)+5) for group in groups)),
                n=len(obs), coreAudit={"retained": {str(k): counts[k] for k in (3, 4, 5)}})


def early_formats(parent, teams, cutoff, original):
    """The archived labelled training window covers 85 days for directly seeded teams."""
    with (ROOT/"history24/fit_examples.csv").open(encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if r["event"] == parent and r["bestOf"] in ("1", "3")]
    labelled = [(r["date"], int(r["bestOf"]), float(r["vrsPer100"]), int(r["y"])) for r in rows]
    assert all(0 <= (date.fromisoformat(cutoff)-date.fromisoformat(day)).days < 85 for day, *_ in labelled)
    base, share, scales = global_scales(labelled)
    assert abs(share-original["shareBO3"]) < 1e-6
    for t in teams:
        if "format" in t:
            continue
        five = players(t["roster"])
        history = []
        for r, (_, bo, gap, y) in zip(rows, labelled):
            if len(five & players(r["lineupA"].split("|"))) >= 3:
                history.append((bo,gap,y))
            elif len(five & players(r["lineupB"].split("|"))) >= 3:
                history.append((bo,-gap,1-y))
        t["format"] = team_contrast(history,scales,base)


def region_entry(team, tables):
    five = players(team["vrsRoster"])
    regions = [reg for reg, rows in tables.items() if reg != "global"
               and any(players(row[2]) == five for row in rows)]
    region = regions[0] if len(regions) == 1 else None
    rows = tables.get(region, [])[:11]
    shared = [len(players(team["roster"]) & players(row[2])) for row in rows]
    best = max(shared, default=0)
    own = shared.index(best) if best >= 3 and shared.count(best) == 1 else None
    other = [row[0] for i, row in enumerate(rows) if i != own][:10]
    depth = median(other) if len(other) == 10 and not (best >= 3 and own is None) else None
    return dict(roster=team["roster"], region=region, depth=depth, excludedSelf=own is not None and own < 10)


def extra_features(fields):
    experience = read("experience/history.json")
    major = read("major_form/evidence.json")["editions"]
    lan_models = read("lan_signal/events.json")
    matches, identities = lan.read_games()
    history = lan.History(matches)
    for field in fields:
        key, day, teams = field["parent"], field["asOf"], field["teams"]
        field["experience"] = experience_snapshot(experience, teams, day)
        prior = [e for e in major.values() if e["end"] < day]
        for t in teams:
            name, roster = t["name"], t["roster"]
            t["majorForm"] = major_profile(name, roster, day, prior)
            # Weight and source cutoff are identical to those fitted for the edition.
            snapshot = lan_models[key]
            end = lan.ordinal(snapshot["asOf"])
            assert snapshot["asOf"] < snapshot["stageStart"] < field["date"]
            rows = history.observations(identities.roster(roster, name), end)
            t["lan"] = dict(roster=roster, n=len(rows), bo1=sum(bo==1 for _,bo,*rest in rows),
                            latest=max((lan.iso(g.day) for g,*rest in rows), default=None),
                            rmr=sum("rmr" in g.tournament[1].casefold() for g,*rest in rows),
                            observations=[[bo,round(p,8),y,round(w,8)] for _,bo,p,y,w in rows])
            old = snapshot["teams"].get(name)
            if old and players(old["roster"]) == players(roster):
                assert old["observations"] == t["lan"]["observations"]


def score_fixture(teams, games, rounds, formats):
    # Resolve participants by the actual five players, independently of provider team names.
    by_lineup = {players(team["roster"]): i for i, team in enumerate(teams)}
    assert len(by_lineup) == 16
    actual = {}
    for game in games:
        a, b = (by_lineup[players(game[key])] for key in ("rosterA", "rosterB"))
        winner, loser = (a, b) if game["y"] == 1 else (b, a)
        assert (winner, loser) not in actual and (loser, winner) not in actual
        actual[winner, loser] = game["bo"]
    assert [len(row) for row in rounds] == [8, 8, 8, 6, 3]
    expected = {(w, l): f for row, fr in zip(rounds, formats) for (w, l), f in zip(row, fr)}
    assert len(actual) == len(expected) == 33 and actual == expected
    assert all(abs(w-l) == 8 for w, l in rounds[0])
    wins, losses = [0]*16, [0]*16
    all_bo3 = set(actual.values()) == {3}
    for row, fr in zip(rounds, formats):
        for (w, l), bo in zip(row, fr):
            assert (wins[w], losses[w]) == (wins[l], losses[l])
            assert bo == (3 if all_bo3 or wins[w] == 2 or losses[w] == 2 else 1)
            wins[w] += 1
            losses[l] += 1
    return all_bo3


def build_events():
    """Return compact records. The browser shares each edition's frozen fitted coefficients."""
    stages, strengths = read("extra_validation/stages.json"), read("extra_validation/strengths.json")
    profiles = read("strategy_v4/later_teams.json")
    full = read("major_form/all_stages.json")["editions"]
    early_base = read("history24/models.json")
    with gzip.open(ROOT/"region_vrs_data/tables.json.gz", "rt", encoding="utf-8") as f:
        rankings = json.load(f)
    with gzip.open(ROOT/"strategy_v4/series.csv.gz", "rt", encoding="utf-8") as f:
        series = [r for r in csv.DictReader(f) if r["event"] in SEEDS_2024]
    fields = []
    for parent in SEEDS_2024:
        folder = "holdout_" + parent
        field = read(folder+"/field.json")
        teams = field["teams"]
        day, as_of = field["stageStart"], field["asOf"]
        prior = [r for r in series if r["event"] == parent]
        opening = {t["name"]: t for t in early_base[parent]["teams"]}
        for t in teams:
            t["vrsCoreOverlap"] = t.pop("coreOverlap")
            t.update(early_form(t, prior, as_of))
            old = opening.get(t["name"])
            if old:
                assert t["n"] == old["n"]
                assert all(math.isclose(t[k], old[k], abs_tol=1e-7) for k in ("form", "strong", "weak"))
                t["format"] = early_base[parent]["formatModel"]["teams"][t["name"]]
        early_formats(parent, teams, as_of, early_base[parent]["formatModel"])
        rounds, formats = [[] for _ in range(5)], [[] for _ in range(5)]
        names = [t["name"] for t in teams]
        for g in read(folder+"/baseline.json")["games"]:
            rounds[g["round"]-1].append([names.index(g["winner"]), names.index(g["loser"])])
            formats[g["round"]-1].append(g["bestOf"])
        fields.append(dict(id=f"{parent}-2024-2", parent=parent, stage=2, date=day, asOf=as_of,
                           fieldAsOf=field["fieldAsOf"], teams=teams, rounds=rounds, formats=formats,
                           stageSources=[dict(title="阶段种子及首轮对阵", url=SEEDS_2024[parent]),
                                         dict(title="逐轮赛果", url="https://www.hltv.org/events/"+SCORE_2024[parent]),
                                         dict(title="系列赛与实到五人", url=ARCHIVE)]))
    for eid, stage in stages.items():
        parent, n = stage["parent"], stage["stage"]
        snap = strengths[parent]
        teams = [dict(snap["teams"][name], seed=i+1, profile=profiles[parent][name])
                 for i, name in enumerate(stage["entrants"])]
        fields.append(dict(id=eid, parent=parent, stage=n, date=stage["start"], asOf=snap["date"],
                           teams=teams, rounds=stage["rounds"], formats=stage["formats"],
                           stageSources=[dict(title="阶段种子", url=stage["seedSource"]),
                                         dict(title="逐轮赛果", url=stage["resultsSource"]),
                                         dict(title="系列赛归档", url=stage["scoreArchive"]),
                                         dict(title="Valve 阶段前积分", url=snap["source"])]))
    for e in fields:
        games = [g for g in full[e["parent"]]["matches"] if g["stage"] == e["stage"]]
        assert e["asOf"] < e["date"] == min(g["day"] for g in games)
        e["endDate"] = max(g["day"] for g in games)
        e["allBo3"] = score_fixture(e["teams"], games, e["rounds"], e["formats"])
        assert e["allBo3"] == (e["id"] == "cologne-2026-3")
        if e["allBo3"]:
            e["stageSources"].insert(0, dict(title="ESL 公布全阶段 BO3 赛制",
                url="https://pro.eslgaming.com/tour/2026/02/iem-cologne-2026-stage-3-update/"))
        for i, t in enumerate(e["teams"]):
            assert t["seed"] == i+1 and len(players(t["roster"])) == len(players(t["vrsRoster"])) == 5
            assert len(players(t["roster"]) & players(t["vrsRoster"])) == t["vrsCoreOverlap"] >= 3
            t["regionVrs"] = region_entry(t, rankings[e["asOf"]])
    assert len(fields) == 8
    extra_features(fields)
    return fields


if __name__ == "__main__":
    # This standalone file is also the learner's input before site reassembly.
    packed = json.dumps(build_events(), ensure_ascii=False, separators=(",", ":"))+"\n"
    out = HERE/"inputs.json"
    if "--check" in sys.argv:
        assert out.read_text(encoding="utf-8") == packed
    else:
        out.write_bytes(packed.encode("utf-8"))
