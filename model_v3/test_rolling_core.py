"""Run with python3 model_v3/test_rolling_core.py from the project root."""
from datetime import date, timedelta
import unittest

from build import RollingForm, K


def series(mid, day, a, b, left='Eternal Fire', right='Opponent'):
    return dict(id=mid, date=day.isoformat(), a=left, b=right, pointsA='1000', pointsB='1000',
                lineupA='|'.join(a), lineupB='|'.join(b), y='1')


class RollingCoreTest(unittest.TestCase):
    def setUp(self):
        self.day = date(2025, 4, 5)
        self.a = ['a', 'b', 'c', 'd', 'e']
        self.b = ['f', 'g', 'h', 'i', 'j']
        self.form = RollingForm()
        self.initial = series('1', self.day, self.a, self.b)
        self.form.observed([self.initial])

    def test_direct_overlap_and_decay(self):
        for overlap in range(6):
            lineup = self.a[:overlap] + [f'new{i}' for i in range(5-overlap)]
            value = K * .5 * overlap / 5 if overlap >= 3 else 0.
            self.assertAlmostEqual(self.form.lineup_value(self.day, lineup), value)
            self.assertAlmostEqual(self.form.lineup_value(self.day + timedelta(days=45), lineup), value/2)
        self.assertEqual(self.form.lineup_value(self.day, ['a', 'b', 'c', 'C', 'e']), 0.)
        self.assertEqual(self.form.lineup_value(self.day, ['a', 'b', 'c']), 0.)
        self.assertEqual(self.form.lineup_value(self.day, ['a', 'b', 'c', 'd', ' ']), 0.)

    def test_transfer_and_rebuild_and_same_day(self):
        # Same five under a new org should keep the bonus, same org with two returnees should lose it.
        new = ['a', 'b', 'x', 'y', 'z']
        opponents = ['p', 'q', 'r', 's', 't']
        nxt = self.day + timedelta(days=1)
        move = series('2', nxt, self.a, opponents, left='Aurora')
        rebuild = series('3', nxt, new, opponents)
        other = series('4', self.day, self.a, opponents, left='Aurora')
        index = RollingForm().observed([rebuild, move, self.initial])
        self.assertGreater(index[(nxt.isoformat(),'2')][2], 0.)
        self.assertEqual(index[(nxt.isoformat(),'3')][2], 0.)
        together = RollingForm().observed([self.initial, other])
        self.assertEqual(together[(self.day.isoformat(),'4')][2], 0.)


if __name__ == '__main__':
    unittest.main()
