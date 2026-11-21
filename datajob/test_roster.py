"""Roster-continuity boundary cases and regression against frozen, auditable series."""
import csv
import json
import unittest
from collections import Counter
from datetime import date
from pathlib import Path

import build_features as v

HERE = Path(__file__).resolve().parent
FORMER_EF = ('XANTARES', 'woxic', 'Wicadia', 'MAJ3R', 'jottAAA')
SINGAPORE_EF = ('jottAAA', 'Kvem', 'MisteM', 'regali', 'soulfly')


def ranking(name, players, rank=1):
    return dict(name=name, roster=list(players), rank=rank, points=1850-rank,
                detail=f'details/{rank}-{name}.md')


class CoreContinuity(unittest.TestCase):
    def test_full_transfer_with_a_reused_name(self):
        unrelated = ('one', 'two', 'three', 'four', 'five')
        prior = v.Standings([ranking('Eternal Fire', FORMER_EF),
                             ranking('Aurora', unrelated, 2)])
        for retained in (5, 4, 3, 2, 0):
            current = FORMER_EF[:retained] + SINGAPORE_EF[1:1 + min(5-retained,4)]
            if len(current) == 4:
                current += ('sixth',)
            with self.subTest(retained=retained):
                row = v.matched_row(prior, 'Aurora', current)
                self.assertEqual(row and row['name'], 'Eternal Fire' if retained >= 3 else None)
        self.assertEqual(v.core_overlap(SINGAPORE_EF, FORMER_EF), 1)
        self.assertIsNone(v.matched_row(prior, 'Eternal Fire', SINGAPORE_EF))

    def test_known_distinct_five_required(self):
        good = [' a ', 'B', 'C', 'D', 'Ｅ']
        self.assertEqual(v.roster_key(good), frozenset('abcde'))
        prior = v.Standings([ranking('T', good)])
        for bad in (None, ['a','b','c','d'], ['a','b','c','d','A'],
                    ['a','b','c','d','TBD'], ['a','b','c','d',None], list('abcdef')):
            self.assertIsNone(v.matched_row(prior, 'T', bad))

    def test_best_unique_core_and_no_transitive_identity(self):
        a, b, c = list('abcde'), list('abcfg'), list('afghi')
        prior = v.Standings([ranking('old',a), ranking('new',b,2)])
        self.assertEqual(v.matched_row(prior,'old',b)['name'], 'new')
        self.assertIsNone(v.matched_row(prior,'old',list('abcxy')))
        self.assertEqual(v.core_overlap(a,b), 3)
        self.assertEqual(v.core_overlap(b,c), 3)
        self.assertIsNone(v.matched_row(v.Standings([ranking('old',a)]),'old',c))

    def test_dual_source_and_strict_lag(self):
        a, b = v.roster_key(FORMER_EF), v.roster_key(list('pqrst'))
        old_a = ('Aurora', 'Complexity', 0, a)
        other = ('Complexity', 'Aurora', 1, b)
        self.assertIsNone(v.resolve_game([old_a]))
        self.assertIsNone(v.resolve_game([old_a,other,('other','Aurora',1,v.roster_key(list('pqrxy')))]))
        self.assertIsNone(v.resolve_game([old_a,('other','Aurora',1,a)]))
        game = v.resolve_game([old_a, other, old_a])
        day, prior_day = date(2025,4,11), date(2025,4,7)
        self.assertFalse(list(v.rated_games({(day,'1016'):game}, {})))
        past = v.Standings([ranking('Eternal Fire',a),ranking('Complexity',b,2)])
        self.assertFalse(list(v.rated_games({(day,'1016'):game}, {day:past})))
        (_,record), = v.rated_games({(day,'1016'):game}, {prior_day:past,day:past})
        self.assertEqual(record[0], prior_day)
        self.assertEqual(record[1][1]['name'], 'Eternal Fire')

    def test_frozen_entrants_and_both_signs_of_transfer(self):
        features = json.loads((HERE/'features.json').read_text())
        anchors = v.stage_rosters()
        actual = Counter()
        with (HERE/'history.csv').open(encoding='utf8',newline='') as source:
            rows = list(csv.DictReader(source))
        for r in rows:
            entrant = v.display_name(r['event'],r['team'])
            five = anchors[r['event']][entrant]
            self.assertEqual(v.core_overlap(five,r['lineup'].split('|')),int(r['coreOverlap']))
            self.assertIn(int(r['coreOverlap']), (3,4,5))
            self.assertIn(int(r['ownVrsOverlap']), (3,4,5))
            self.assertIn(int(r['oppVrsOverlap']), (3,4,5))
            self.assertEqual(len(v.roster_key(r['opponentLineup'].split('|'))), 5)
            self.assertLess(r['snapshot'],r['date'])
            actual[r['event'],entrant,r['coreOverlap']] += 1
        for event, frozen in features.items():
            for t in frozen['teams']:
                audit = t['coreAudit']
                self.assertEqual(t['roster'], anchors[event][t['name']])
                self.assertEqual(t['n'],sum(audit['retained'].values()))
                self.assertEqual(t['available'],sum(audit['candidates'].values()))
                for n in ('3','4','5'):
                    self.assertEqual(audit['retained'][n], actual[event,t['name'],n])
        updated = next(r for r in rows if r['event']=='austin' and r['team']=='Complexity'
                       and r['matchInSnapshot']=='1016')
        self.assertEqual((updated['opponent'],updated['monthlyOpponent'],updated['oppVrsOverlap'],
                          updated['oppPoints']), ('Aurora','Eternal Fire','5','1792'))
        ef = next(t for t in features['singapore']['teams'] if t['name']=='Eternal Fire')
        self.assertEqual(v.core_overlap(ef['roster'],FORMER_EF),1)
        self.assertEqual(ef['coreAudit']['retained'],{'3':0,'4':1,'5':36})


if __name__=='__main__':
    unittest.main()
