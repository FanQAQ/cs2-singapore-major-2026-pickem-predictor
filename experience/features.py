"""Read each edition once, then aggregate the starting five as of its forecast."""
import math
import unicodedata


def normalize(name):
    return unicodedata.normalize("NFKC", name).strip().casefold()


def snapshot(history, teams, as_of):
    aliases = {normalize(a): normalize(b) for a, b in history.get("aliases", {}).items()}
    def identity(name):
        handle = normalize(name)
        return aliases.get(handle, handle)

    prior = sorted((e for e in history["events"] if e["endDate"] < as_of),
                   key=lambda e: e["endDate"])
    assert len({e["id"] for e in prior}) == len(prior)
    # A marked gap is preserved as an unknown lifetime total. A usable complete
    # window still gives comparable, explicitly windowed features to both sides.
    full = bool(prior) and prior[0]["endDate"].startswith("2013") and all(e["attendanceComplete"] for e in prior)
    complete_events = [e for e in prior if e["attendanceComplete"]]
    titles_full = bool(prior) and prior[0]["endDate"].startswith("2013") and all(
        e.get("championsComplete", len(e["champions"]) == 5) for e in prior)
    def records(events, field):
        return [{identity(p) for p in event[field]} for event in events]

    attended = records(complete_events, "players")
    champions = records(prior, "champions")
    uncertain = {identity(p) for e in prior for p in e.get("unresolved", [])}
    uncertain.update(identity(p) for p in history.get("unresolved", []))
    result = {}
    club_aliases = {normalize(team): {normalize(a): normalize(b) for a, b in values.items()}
                    for team, values in history.get("teamAliases", {}).items()}
    for team in teams:
        players = []
        specific = club_aliases.get(normalize(team["name"]), {})
        ids = [specific.get(normalize(p), identity(p)) for p in team["roster"]]
        assert len(ids) == len(set(ids)) == 5
        for name, player in zip(team["roster"], ids):
            appearances = None if player in uncertain else sum(player in played for played in attended)
            wins = None if player in uncertain else sum(player in winners for winners in champions)
            players.append(dict(name=name, appearances=appearances, titles=wins))
        stats = dict(players=players, vector=None)
        if complete_events and all(p["appearances"] is not None and p["titles"] is not None for p in players):
            appearances = [p["appearances"] for p in players]
            zero = sum(x == 0 for x in appearances)
            few = sum(1 <= x <= 2 for x in appearances)
            champs = sum(p["titles"] > 0 for p in players)
            stats.update(zero=zero, few=few, champions=champs,
                         vector=[sum(math.log1p(x) for x in appearances)/5, zero/5, champs/5])
        result[team["name"]] = stats
    return dict(asOf=as_of, editions=len(complete_events), priorEditions=len(prior),
                full=full, titlesFull=titles_full, teams=result,
                latest=prior[-1]["endDate"] if prior else None)
