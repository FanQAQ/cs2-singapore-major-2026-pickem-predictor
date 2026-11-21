import unittest
from prepare import choices, identify

POOL='Ancient Anubis Dust2 Inferno Mirage Nuke Train'.split()
BAN3=[['a','ban','Ancient'],['b','ban','Anubis'],['a','pick','Dust2'],['b','pick','Inferno'],
      ['b','ban','Mirage'],['a','ban','Nuke'],[None,'left','Train']]


class VetoTests(unittest.TestCase):
    def test_available_only(self):
        result=choices({'bo':3,'steps':BAN3},POOL)
        self.assertEqual(result['a']['banOpportunities'],[1,1,1,1,1,2,2])
        self.assertEqual(result['a']['pickOpportunities'],[0,0,1,1,1,1,1])

    def test_reject_wrong_pool_missing_or_unknown_actor(self):
        for idx,part,val in [(0,0,None),(6,2,'Overpass'),(3,2,'Dust2')]:
            steps=[s.copy() for s in BAN3]
            steps[idx][part]=val
            self.assertIsNone(choices({'bo':3,'steps':steps},POOL))
        self.assertIsNone(choices({'bo':1,'steps':BAN3},POOL))

    def test_no_mock_from_played_maps(self):
        self.assertIsNone(choices({'bo':3,'steps':[['a','pick','Nuke']]},POOL))


if __name__=='__main__':
    unittest.main()
