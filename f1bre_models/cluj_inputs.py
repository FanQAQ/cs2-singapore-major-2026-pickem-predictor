"""Rebuild the PGL Cluj-Napoca holdout from the organizer's frozen lineup and archived matches."""
import argparse
import gzip
import hashlib
import html
import json
from pathlib import Path
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from map_veto_data.extract_archive import ARCHIVE_URL, SHA256, key, normalize
from round_form.epl22_inputs import ranking, utc_day

EVENT = "PGL Cluj-Napoca 2026"
ID, START, END = "cluj-2026", "2026-02-14", "2026-02-18"
SEEDS = ["FURIA", "Vitality", "Falcons", "Natus Vincere", "MOUZ", "FaZe", "The MongolZ", "Aurora",
         "B8", "G2", "3DMAX", "Astralis", "PARIVISION", "HEROIC", "paiN", "FUT"]
DRAW_URL = "https://x.com/pglesports/status/2019425790954516977"
ROSTER_URL = "https://news.pglesports.com/news/1770210703731-pgl-cluj-napoca-2026-confirmed-team-rosters"
ROSTER_API = "https://news.pglesports.com/api/articles/1770210703731"
ROSTER_HASH = "947d461c4a1ab4e1ab642d3c834e2dfb7d937f40f0e8ef07f0b456ec8751bf67"
RANK_SOURCE = ("https://github.com/ValveSoftware/counter-strike_regional_standings/blob/"
               "73c71008fb393980255103b93d6b868fb616f5ce/invitation/2026/standings_global_2026_02_02.md")
RANK_HASH = "2dcc74d27a58e5d6ad06ee26479346afe4b41d5bb67dd93fff65bee66af80bca"
ORGS = {"Team Falcons":"Falcons", "Team Vitality":"Vitality", "Aurora Gaming":"Aurora",
        "B8 Esports":"B8", "FaZe Clan":"FaZe", "FUT Esports":"FUT", "G2 Esports":"G2", "paiN Gaming":"paiN"}
ALIASES = {"V$M":"vsm", "Techno4K":"Techno", "huNter":"huNter-"}


def checked(path, digest):
    contents = path.read_bytes()
    if hashlib.sha256(contents).hexdigest() != digest:
        raise ValueError(f"Source snapshot has changed: {path}")
    return contents


def build_field(roster_path):
    source = json.loads(checked(roster_path, ROSTER_HASH))
    assert source["createdAt"] == source["updatedAt"] == "2026-02-04T14:53:55.587Z"
    announced = {}
    for row in re.findall(r"<tr>(.*?)</tr>", source["content"], re.S):
        cells = [html.unescape(re.sub(r"<[^>]*>", "", col)).strip() for col in re.findall(r"<td>(.*?)</td>", row, re.S)]
        if cells[0] == "Organization":
            continue
        name = ORGS.get(cells[0], cells[0])
        names = cells[1].replace(" (IGL)", "").split(", ")
        assert name not in announced and len(names) == 5
        announced[name] = [ALIASES.get(p,p) for p in names]
    assert set(announced) == set(SEEDS) and len({key(p) for five in announced.values() for p in five}) == 80
    ranks = []
    for line in checked(ROOT/"epl_transfer/2026_02_02.md", RANK_HASH).decode().splitlines():
        c = [v.strip() for v in line.split("|")]
        if len(c) >= 5 and c[1].isdigit():
            roster = c[4].split(", ")
            if len(set(map(key,roster))) == 5:
                ranks.append(dict(name=c[3], points=int(c[2]), roster=roster, rank=int(c[1])))
    teams = []
    for seed, name in enumerate(SEEDS, 1):
        r = ranking(announced[name], ranks)
        teams.append(dict(seed=seed, name=name, roster=announced[name], rosterDay=source["createdAt"][:10],
                          rosterSource=ROSTER_URL, points=r["points"], rank=r["rank"], ratingTeam=r["name"],
                          vrsRoster=r["roster"], overlap=r["overlap"]))
    assert len({t["rank"] for t in teams}) == 16
    return dict(id=ID, label=EVENT+" Swiss", start=START, end=END, cutoffExclusive=START,
                cutoff="2026-02-13T23:59:59Z", allBo3=True, entrants=SEEDS, teams=teams,
                pointsAsOf="2026-02-02", rankingPublishedAt="2026-02-02T18:03:49Z",
                rankingSource=RANK_SOURCE, rankingSha256=RANK_HASH, rosterApi=ROSTER_API,
                rosterPublishedAt=source["createdAt"], rosterSha256=ROSTER_HASH,
                drawPublishedAt="2026-02-05T15:00:02Z", openingPairs=[[SEEDS[i], SEEDS[i+8]] for i in range(8)],
                drawSource=DRAW_URL, seedOrderSource="https://www.youtube.com/watch?v=1bOnCMYtXNI",
                pairingSource="https://navi.gg/en/tournaments/pgl-clujnapoca-2026/news")


def build_results(archive, field):
    checked(archive, SHA256)
    with gzip.open(archive, "rt", encoding="utf8") as f:
        records = json.load(f)
    rounds, ids, matches = [[] for _ in range(5)], [[] for _ in range(5)], []
    for raw in sorted((g for g in records if g.get("event") == EVENT and START <= utc_day(g) <= END),
                      key=lambda g: (int(g["date"]), int(g["match-id"]))):
        rd = int(re.search(r"Swiss round (\d)", raw["stage"])[1]) - 1
        g = normalize(raw)
        assert g and g["bo"] == 3
        for n,five in [(g["a"],g["lineupA"]), (g["b"],g["lineupB"])]:
            assert set(map(key,five)) == set(map(key,field["teams"][SEEDS.index(n)]["roster"])), (n,five)
        sa, sb = raw["team1score"], raw["team2score"]
        ai, bi = SEEDS.index(g["a"]), SEEDS.index(g["b"])
        w, l = (ai, bi) if sa > sb else (bi, ai)
        rounds[rd].append([w, l, min(sa,sb)])
        ids[rd].append(g["mid"])
        matches.append(dict(id=g["mid"], day=g["day"], round=rd+1, bo=3, a=g["a"], b=g["b"],
                            fiveA=g["lineupA"], fiveB=g["lineupB"], score=[sa,sb], maps=g["maps"], sourceUrl=g["url"]))
    assert list(map(len, rounds)) == [8,8,8,6,3] and len(set(sum(ids,[]))) == 33
    replay_js = ("require('./engine/engine.js');"
                 "const r=CS.replay(JSON.parse(require('node:fs').readFileSync(0,'utf8')));"
                 "if(!r.ok||r.matched!==33)throw Error(JSON.stringify(r));"
                 "console.log(JSON.stringify(r.rounds.map(x=>({round:x.round,expected:x.expected.length,matched:x.matched}))));")
    replay = subprocess.run(["node","-e",replay_js], input=json.dumps(rounds), cwd=ROOT, text=True,
                            capture_output=True, check=True)
    return dict(id=ID, end=END, rounds=rounds, matchIds=ids, administrativeMatchIds=[], matches=matches,
                pairingReplay=json.loads(replay.stdout), archiveSource=ARCHIVE_URL, archiveSha256=SHA256)


def output(name, obj, write):
    p = HERE/f"cluj-{name}.json"
    data = (json.dumps(obj, indent=2, ensure_ascii=False)+"\n").encode()
    if write:
        p.write_bytes(data)
    else:
        assert p.read_bytes() == data, p


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("roster", type=Path, help="JSON from "+ROSTER_API)
    parser.add_argument("archive", type=Path, nargs="?", help="Pinned results.json.gz for the results file")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    field = build_field(args.roster)
    output("field", field, args.write)
    print("field:", [(t["name"],t["overlap"]) for t in field["teams"]])
    if args.archive:
        results = build_results(args.archive, field)
        output("results", results, args.write)
        print("replay:", results["pairingReplay"], "maps:",sum(len(m["maps"]) for m in results["matches"]))
