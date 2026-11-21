"""Regression cases for a club transfer, a rebuild, and head-to-head direction."""
import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from datajob.build_features import roster_key
from format_model.build import lineup_series
from styles_model.build import history_rows, stats


class Matchups(unittest.TestCase):
    def setUp(self):
        self.day = dt.date(2026, 11, 1)
        self.a = roster_key(['A', 'B', 'C', 'D', 'E'])
        self.b = roster_key(['V', 'W', 'X', 'Y', 'Z'])
        self.old = dict(date='2026-10-01', id='1', a='Enemy', b='OldOrg', y='0',
                        pointsA='1000', pointsB='1000',
                        lineupA='v|w|x|r|s', lineupB='A|b|C|m|n')

    def test_h2h_transfers_both_cores_and_reorients_winner(self):
        wrong = dict(self.old, id='2', a='CurrentClub', b='Enemy', lineupA='a|b|l|m|n')
        incomplete = dict(self.old, id='3', lineupB='a|b|c|d')
        collision = dict(self.old, id='4', lineupA='v|w|x|r|A')
        series, _ = history_rows([self.old, wrong, incomplete, collision])
        self.assertEqual(stats(series, self.day, self.a, self.b), (1, 1, .5))
        self.assertEqual(stats(series, self.day, self.b, self.a), (1, 0, .5))
        self.assertEqual(stats(series, dt.date(2026, 10, 1), self.a, self.b), (0, 0, 0))
        self.assertEqual(stats(series, self.day, self.a, roster_key(['v','w','1','2','3'])), (0, 0, 0))

    def test_format_follows_core_and_joins_using_old_club_label(self):
        base = dict(event='test', date='2026-10-20', team='NewOrg', historicalTeam='OldOrg',
                    opponent='Enemy', lineup='A|b|C|m|n', opponentLineup='v|w|x|r|s',
                    ownPoints='1300', oppPoints='1200', y='1', matchInSnapshot='1')
        rows = [base, dict(base), dict(base, lineup='a|b|j|l|u', matchInSnapshot='2'),
                dict(base, opponentLineup='', matchInSnapshot='3')]
        queried = []
        def match(row, a, b):
            queried.append((a,b))
            return 3
        team = dict(name='NewOrg', roster=['a','b','c','d','e'])
        self.assertEqual(lineup_series(rows, 'test', team, match), [(3, 1., 1)])
        self.assertEqual(set(queried), {('OldOrg','Enemy')})
        self.assertEqual(lineup_series(rows,'test',dict(roster=['a','b','c','d']),match), [])


if __name__ == '__main__':
    unittest.main()
