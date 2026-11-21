import unittest

from extract_archive import normalize


def bo1():
    teams = ['Team A', 'Team B']
    names = ['Ancient','Anubis','Dust2','Inferno','Mirage','Overpass','Nuke']
    return {
        'team1':teams[0], 'team2':teams[1], 'team1score':11, 'team2score':13,
        'date':1700000000000, 'format':'Best of 1 (LAN)', 'match-id':17,
        'url':'https://www.hltv.org/matches/17/example',
        'veto':[f'{i+1}. {teams[i%2]} removed {name}' for i,name in enumerate(names[:6])]+['7. Nuke was left over'],
        'maps':[{'map':'Nuke','status':'played','team1':{'name':teams[1],'score':'13'},
                 'team2':{'name':teams[0],'score':'11'},
                 'players':{'team1':[{'name':f'b{i}'} for i in range(5)],
                            'team2':[{'name':f'a{i}'} for i in range(5)]}}],
    }


class ArchiveNormalization(unittest.TestCase):
    def test_bo1_round_or_series_score_and_reversed_map_sides(self):
        for reported in [(11,13),(0,1)]:
            row=bo1()
            row['team1score'],row['team2score']=reported
            match=normalize(row)
            self.assertEqual(match['bo'],1)
            self.assertEqual(match['steps'][0],['a','ban','Ancient'])
            self.assertEqual(match['maps'],[['Nuke',11,13]])
            self.assertEqual(match['lineupA'],[f'a{i}' for i in range(5)])

    def test_reject_conflicting_results_and_ambiguous_veto(self):
        row=bo1()
        row['team1score']=12
        self.assertIsNone(normalize(row))
        row=bo1()
        row['veto'][3]='4. Unknown removed Inferno'
        self.assertIsNone(normalize(row))
        row=bo1()
        row['veto'][5]='6. Team B removed Ancient'
        self.assertIsNone(normalize(row))


if __name__=='__main__':
    unittest.main()
