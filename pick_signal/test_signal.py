"""Core continuity, day boundaries and historical pick/control attribution."""
import unittest

from pick_signal.build import History, combined_series, fit, roster


class PickTests(unittest.TestCase):
    def test_pick_contrast_requires_both_roles_on_same_map_and_three_players(self):
        five = roster(['a','b','c','d','e'])
        changed = roster(['a','b','c','g','h'])
        other = roster(['a','b','f','g','h'])
        history = History([
            (10,five,'1','Mirage',True,1,.5),
            (10,five,'2','Mirage',False,0,.5),
            (10,five,'3','Nuke',True,0,.9),
        ])
        full = history.profile(five,11)
        self.assertEqual((full['picks'],full['wins'],full['comparableMaps']), (2,1,1))
        self.assertGreater(full['value'],0)
        self.assertGreater(full['value'],history.profile(changed,11)['value'])
        self.assertEqual(history.profile(other,11)['picks'],0)
        self.assertEqual(history.profile(five,10)['picks'],0)
        self.assertEqual(history.profile(five,101)['picks'],0)

    def test_points_adjust_for_strength(self):
        five = roster(['a','b','c','d','e'])
        values = History([(10,five,'1','A',True,1,.8),
                          (10,five,'2','A',False,1,.4)]).profile(five,11)
        self.assertLess(values['value'],0)
        self.assertEqual(values['expected'],.8)

    def test_one_known_map_does_not_claim_a_full_series_win(self):
        a,b = 'a|b|c|d|e','f|g|h|i|j'
        row = dict(day='2025-01-21',fiveA=a,fiveB=b,pointsA='1000',pointsB='1050',
                   rankDay='2025-01-01',winnerA='1')
        self.assertEqual(combined_series({}, {('a','1'):[row]}), {})
        rating = dict(day=row['day'],lineupA=b,lineupB=a,gap='.5',winner='0',scores='',id='123')
        scores = combined_series({'a':[rating]}, {('a','1'):[row,row]})
        self.assertEqual(len(scores['a']),1)
        self.assertTrue(scores['a'][0][5])
        self.assertEqual(scores['a'][0][4],0)
        self.assertEqual(fit([]),(0.,0.))


if __name__ == '__main__':
    unittest.main()
