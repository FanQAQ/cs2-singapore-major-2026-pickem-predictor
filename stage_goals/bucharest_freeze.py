"""Rebuild the 2026 PGL transfer fixture from an October Valve table and match archive."""
import argparse
import csv
import hashlib
import json
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
TABLE = "https://raw.githubusercontent.com/ValveSoftware/counter-strike_regional_standings/eec4853d7bcf0f1f7efe7f0d901234bef7e98b75/invitation/2026/standings_global_2026_10_05.md"
SOURCES = {
    "rankings": TABLE,
    "seedingDate": "https://www.hltv.org/news/43490/pgl-moves-2026-belgrade-event-to-bucharest",
    "rosters": "https://news.pglesports.com/news/1792407992422-pgl-masters-bucharest-2026-all-16-team-rosters-revealed",
    "changes": "https://www.hltv.org/news/45774/pgl-masters-bucharest-teams-format-schedule-prizes-talent-fantasy",
    "opening": "https://www.hltv.org/news/45731/opening-matchups-set-for-pgl-masters-bucharest",
    "results": "https://www.hltv.org/events/8050/pgl-masters-bucharest-2026",
}
# October 2026 pre-event five-player lineups with the announced Vitality stand-in.
ROSTERS = {
    "Spirit":"magixx zont1x donk sh1ro tN1R", "Vitality":"ZywOo flameZ mezii ropz jL",
    "MOUZ":"torzsi xertioN Spinx xelex PR", "FURIA":"yuurih KSCERATO FalleN molodoy YEKINDAR",
    "G2":"huNter- HeavyGod MATYS NertZ r1nkle", "Aurora":"XANTARES Wicadia woxic Jimpphat kyxsan",
    "Natus Vincere":"b1t Aleksib iM w0nderful makazze", "Legacy":"latto dumau n1ssim arT try",
    "FUT":"dem0n Krabeni dziugss xfl0ud SunPayus", "BetBoom":"s1ren zorte Magnojez Boombl4 d1Ledez",
    "9z":"max HUASOPEEK luchov meyern dgt", "The MongolZ":"bLitz Techno 910 cobrazera nin9",
    "Nemiga":"khaN SYPH0 KaiR0N- robo Xant3r", "Liquid":"NAF EliGE malbsMd Jorko JT",
    "DENDELE":"gafolo rdnzao doc koala maxxkor", "TYLOO":"JamYoung Moseyuh Mercury Jee Zero",
}

def norm(name):
    return {"techno4k":"techno"}.get(name.casefold(),name.casefold())

def build(table, series):
    ranks = []
    for line in table.read_text("utf-8").splitlines():
        cols = [col.strip() for col in line.split("|")]
        if len(cols)>5 and cols[1].isdigit():
            ranks.append((int(cols[1]),int(cols[2]),cols[4].split(", ")))
    teams = []
    for name, roster in ROSTERS.items():
        five = roster.split()
        overlaps = [(len(set(map(norm,five)) & set(map(norm,r))),rank,p,r) for rank,p,r in ranks]
        overlap,rank,points,old = max(overlaps)
        assert overlap>=3 and sum(o==overlap for o,*_ in overlaps)==1, name
        teams.append(dict(name=name,roster=five,rank=rank,points=points,vrsRoster=old,overlap=overlap))
    teams.sort(key=lambda t:t["rank"])
    key = {t["name"].casefold():i for i,t in enumerate(teams)}
    opening = [["Aurora","The MongolZ"],["FUT","TYLOO"],["MOUZ","Liquid"],["Spirit","BetBoom"],
               ["Legacy","Nemiga"],["Vitality","9z"],["FURIA","DENDELE"],["G2","Natus Vincere"]]
    assert all(abs(key[a.casefold()]-key[b.casefold()])==8 for a,b in opening)
    rounds = [[] for _ in range(5)]
    with series.open(encoding="utf-8-sig",newline="") as f:
        for r in csv.DictReader(f):
            if r["event_id"]!="8050": continue
            day = date.fromisoformat(r["scheduled_start_utc"][:10])
            ri = (day-date(2026,10,24)).days
            if not 0<=ri<5: continue
            assert r["best_of"]=="3"
            a,b = [key[r[k].casefold()] for k in ("team1_name","team2_name")]
            if r["winner_team_id"]==r["team2_id"]: a,b=b,a
            else: assert r["winner_team_id"]==r["team1_id"]
            rounds[ri].append(dict(w=a,l=b,match=r["match_url"]))
    assert [len(matches) for matches in rounds] == [8,8,8,6,3]
    return dict(asOf="2026-10-23",start="2026-10-24",event="PGL Masters Bucharest 2026",
                sources=SOURCES,tableSha256=hashlib.sha256(table.read_bytes()).hexdigest(),
                teams=teams,rounds=[sorted(row,key=lambda m:min(m["w"],m["l"])) for row in rounds])

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("valve_table",type=Path)
    p.add_argument("series_csv",type=Path)
    args=p.parse_args()
    payload=build(args.valve_table,args.series_csv)
    (HERE/"bucharest.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
