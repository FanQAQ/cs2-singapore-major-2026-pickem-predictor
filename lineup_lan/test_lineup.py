import unittest
from build import stage


FIELDS = {'A':{'roster':['one','TWO','rMn','four','five']}, 'B':{'roster':['six','seven','eight','nine','ten']}}
TARGET = {'asOf':'2026-06-01','teams':FIELDS}


def match(mid, day, title, a, b, cross, y, rated=True):
    return dict(id=str(mid),day=day,tournament=title,a=a,b=b,ra='europe',rb='asia' if cross else 'europe',
                pointsA='1500' if rated else '',pointsB='1500' if rated else '',y=str(y),snapshot='2025-12-01')


class LineupAudit(unittest.TestCase):
    def test_credits_and_cutoff(self):
        other = 'u|v|w|x|z'
        series = [
            # Only two players traveled together. They keep individual history.
            match(1,'2026-03-01','Cup','one|two|a|b|c',other,True,1),
            # Past club retained three starters, including a verified name variant.
            match(2,'2026-03-02','Cup','one|two|roman|a|b',other,True,1),
            # Two regions in the field, but the two teams here come from one region.
            match(3,'2026-03-03','Cup',other,'one|two|roman|four|five',False,1),
            # Same region all tournament.
            match(4,'2026-03-05','Local','one|two|roman|four|five',other,False,1),
            # Unique ranked game before cutoff, tournament's last unranked game afterward.
            match(5,'2026-05-31','Ongoing','one|two|roman|four|five',other,True,1),
        ]
        calendar={('2026','Cup'):('2026-03-01','2026-03-03'),('2026','Local'):('2026-03-04','2026-03-05'),
                  ('2026','Ongoing'):('2026-05-31','2026-06-02')}
        event=stage(TARGET,series,calendar)
        self.assertEqual(event['series'],3)
        team=event['teams']['A']
        self.assertEqual((team['coreN'],team['fullFiveN'],team['crossCoreN']),(2,1,1))
        players=team['players']
        self.assertEqual([(p['n'],p['outsideCoreN'],p['crossN']) for p in players],[(3,1,2),(3,1,2),(2,0,1),(1,0,0),(1,0,0)])
        self.assertEqual(players[0]['teamResidual'],0.0625)
        self.assertEqual(players[2]['teamResidual'],0.)
        self.assertEqual(players[3]['teamResidual'],round(-0.5/6,6))
        no_data=event['teams']['B']
        self.assertEqual(no_data['coverage'],'noCore')
        self.assertTrue(all(p['n']==0 and p['teamResidual'] is None for p in no_data['players']))

    def test_split_roster_and_unrated_appearance(self):
        # Four current teammates opposed each other in earlier lineups.
        g=match(1,'2026-05-01','Split','one|two|a|b|c','four|five|six|x|y',True,0,False)
        r=stage(TARGET,[g],{('2026','Split'):('2026-05-01','2026-05-01')})
        a=r['teams']['A']
        self.assertEqual(a['coreN'],0)
        self.assertEqual([p['outsideCoreN'] for p in a['players']],[1,1,0,1,1])
        self.assertTrue(all(p['ratedN']==0 and p['teamResidual'] is None for p in a['players']))


if __name__ == '__main__':
    unittest.main()
