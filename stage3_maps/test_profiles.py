"""The same opponent's repeat series should not add a second independent vote."""
from copy import deepcopy
import unittest

from profiles import build


class OpponentWeights(unittest.TestCase):
    def test_repeat_series_retains_one_weight_and_other_opponent_remains_independent(self):
        pool = ['Ancient','Anubis','Dust2','Inferno','Mirage','Nuke','Overpass']
        teams = [{'name':str(t), 'roster':[f't{t}p{i}' for i in range(5)]} for t in range(16)]
        field = {'id':'cologne-2026-3','pool':pool,'start':'2026-06-11','teams':teams,'maps':[]}
        def add(sid,opponent):
            for i,m in enumerate(pool[:3]):
                won=i!=1
                field['maps'].append({'day':'2026-06-08','series':sid,'gameId':sid+m,'map':m,'bo':3,
                    'fiveA':teams[0]['roster'],'fiveB':teams[opponent]['roster'],'rankDay':'2026-06-01',
                    'pointsA':1500,'pointsB':1500,'roundsA':13 if won else 5,'roundsB':5 if won else 13,
                    'winnerA':int(won)})
        add('first',1)
        once=build(deepcopy(field),{'observations':[]})
        add('repeat',1)
        twice=build(deepcopy(field),{'observations':[]})
        self.assertEqual(once['appearances']['0'],twice['appearances']['0'])
        self.assertEqual(once['mapStrength']['teams']['0']['maps']['Ancient']['logitOffset'],
                         twice['mapStrength']['teams']['0']['maps']['Ancient']['logitOffset'])
        self.assertEqual(twice['coverage']['0']['seriesWithRepeatOpponent'],2)
        add('different',2)
        extra=build(field,{'observations':[]})
        self.assertAlmostEqual(extra['appearances']['0']['Ancient'],2*once['appearances']['0']['Ancient'])
        self.assertEqual(extra['mapVeto']['teams']['0']['bo3']['n'],0)


if __name__=='__main__':
    unittest.main()
