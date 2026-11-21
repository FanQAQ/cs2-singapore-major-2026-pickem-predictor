"""Shared admission rules for dated, team-wide scouting observations."""
from datetime import date


def requirements(name, item):
    if not item.get('usableForHistory', name != 'BetBoom'):
        return None
    players = item.get('requiredPlayers', ['nitr0'] if name == 'NRG' else [])
    return frozenset(p.casefold() for p in players)


def recent(source_day, game_day):
    age = (date.fromisoformat(game_day) - date.fromisoformat(source_day)).days
    return 0 < age <= 180
