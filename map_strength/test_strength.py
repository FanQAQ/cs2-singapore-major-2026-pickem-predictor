import unittest

from build import map_prior, profile, team_for


class MapStrengthTest(unittest.TestCase):
    def test_inverse_format(self):
        for gap in (-800, -10, 0, 90, 1100):
            map_p = map_prior(gap, 3)
            self.assertAlmostEqual(map_p**2 * (3-2*map_p), map_prior(gap, 1), places=10)
            self.assertAlmostEqual(map_p + map_prior(-gap, 3), 1, places=10)

    def test_specialization_and_fallback(self):
        pool = ['Dust2','Nuke','Anubis']
        def game(name, win):
            return {'map':name,'series':'2','date':'2025-05-01','y':win,'weight':1,'prior':.5}
        one = [game('Nuke', 1)]*6
        self.assertTrue(all(m['logitOffset']==0 for m in profile(pool,one)['maps'].values()))
        both = profile(pool,one+[game('Dust2',0)]*6)['maps']
        self.assertGreater(both['Nuke']['logitOffset'], 0)
        self.assertEqual(both['Dust2']['logitOffset'], -both['Nuke']['logitOffset'])
        self.assertEqual(both['Anubis']['logitOffset'], 0)

    def test_match_players_across_transfers(self):
        entrants = {'Team A':set('abcde'), 'Team B':set('fghij')}
        self.assertEqual(team_for(set('afcde'), entrants), ('Team A',4))
        self.assertIsNone(team_for(set('fgxyz'), entrants))
