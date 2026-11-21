from unittest import TestCase

from major_form.build import profile, validation


class ProfileTests(TestCase):
    def setUp(self):
        self.five=['alpha','beta','gamma','delta','epsilon']

    def edition(self, key, day, roster, count):
        sides = self.five if roster is None else roster
        return {'id':key,'label':key,'end':day,'matches':[
            {'a':'Old Club','b':'Other','rosterA':sides,'rosterB':['x','y','z','u','v'],
             'y':1,'p':.5} for _ in range(count)]}

    def test_core_follows_transfer_and_requires_repeat(self):
        ed1=self.edition('old','2024-01-01',self.five[:3]+['p','q'],4)
        ed2=self.edition('new','2024-06-01',self.five,4)
        cutoff='2024-12-01'
        first=profile('New Club',self.five,cutoff,[ed1])
        repeated=profile('New Club',self.five,cutoff,[ed1,ed2])
        other=profile('Old Club',self.five[:2]+['a','b','c'],cutoff,[ed1,ed2])
        self.assertFalse(first['repeat'])
        self.assertTrue(repeated['repeat'])
        self.assertEqual(repeated['byEdition'][0]['teams'],['Old Club'])
        self.assertEqual(first['byEdition'][0]['overlapCounts']['3'],4)
        self.assertEqual(other['series'],0)
        with self.assertRaises(AssertionError):
            profile('New Club',self.five,ed2['end'],[ed2])

    def test_extra_stages_do_not_increase_edition_weight(self):
        short=self.edition('old','2024-01-01',None,4)
        long=self.edition('old','2024-01-01',None,12)
        a=profile('Club',self.five,'2025-01-01',[short])
        b=profile('Club',self.five,'2025-01-01',[long])
        self.assertAlmostEqual(a['estimate'],b['estimate'])
        self.assertFalse(b['repeat'])

    def test_validation_needs_two_editions_and_both_losses(self):
        good=[{'p':.5,'candidate':.51,'y':1} for _ in range(35)]
        poor=[{'p':.5,'candidate':.4,'y':1} for _ in range(35)]
        self.assertFalse(validation([('a',good)])['passed'])
        self.assertTrue(validation([('a',good),('b',good)])['passed'])
        self.assertFalse(validation([('a',good),('b',poor)])['passed'])
