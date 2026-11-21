from datetime import date
import unittest

from lan_signal.build import Game, History, fit, ordinal, profile


class TestRecentLAN(unittest.TestCase):
    def test_core_date_and_tournament_exclusions(self):
        d = date(2025, 3, 1).toordinal()
        roster = frozenset('abcde')
        opp = frozenset('vwxyz')
        examples = [(-121, 'old', roster), (-3, 'prior', frozenset('abcfg')),
                    (-2, 'same', roster), (0, 'current', roster),
                    (1, 'tomorrow', roster), (-2, 'next', frozenset('abfgk'))]
        games = [Game(i, d+delta, ('2025',name), 3, five, opp, .5, 1)
                 for i,(delta,name,five) in enumerate(examples)]
        sample = History(games).observations(roster, d, ('2025','same'))
        self.assertEqual([s[0].match for s in sample],[1,3])
        self.assertLess(sample[0][-1], sample[1][-1])
        self.assertGreater(profile(sample,.5,3), profile(sample,.1,3))
        self.assertGreater(profile(sample,.5,3), profile(sample,.5,1))
        self.assertEqual(profile(sample[:1],.5,3), 0.)

    def test_training_future_cannot_change_weight(self):
        cut = ordinal('2025-03-01')
        rows = [(cut-2, 'e', .5, 1, .1),(cut, 'e', .3, 1, .3)]
        future = [(cut+1, 'next', .3, 0, .7)]
        self.assertEqual(fit(rows,cut), fit(rows+future,cut))
        self.assertGreater(fit(rows,cut)[0], 0.)
