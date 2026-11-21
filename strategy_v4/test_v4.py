"""Checks for roster continuity, time ordering and parity with the web predictor."""
import json
import subprocess
import unittest
from itertools import combinations

import numpy as np
from scipy.special import expit

from strategy_v4.build import AppearanceHistory, HERE, ROOT, design, lineup, read


class StrategyV4Tests(unittest.TestCase):
    def test_no_same_day_observation_and_core_threshold(self):
        history = AppearanceHistory()
        roster = lineup('abcde')
        history.add(50, roster, 1, .25, .2)
        self.assertEqual(history.profile(50, roster)['n'], 0)
        next_day = history.profile(51, roster)
        self.assertEqual((next_day['ns'], next_day['nw'], next_day['nRound']), (1, 0, 1))
        self.assertAlmostEqual(next_day['strong'], .75/6)
        self.assertEqual(history.profile(51, lineup('abxyz'))['n'], 0)
        three = history.profile(51, lineup('abcxy'))
        self.assertEqual(three['nRound'], 1)
        self.assertLess(three['round'], next_day['round'])
        self.assertEqual(history.profile(141, roster)['nRound'], 0)

    def test_published_fits_in_browser(self):
        data = json.loads((HERE/'models.json').read_text())
        sources = {**read('datajob/features.json'), **read('history24/models.json')}
        expected = []
        js_cases = []
        for event_id, model in data.items():
            rows = model['teams']
            names = list(rows)
            source = sources[event_id]
            points = {t['name']:t['points'] for t in source['teams']}
            self.assertEqual(set(rows), set(points))
            self.assertLessEqual(model['lastRoundMatch'], model['asOf'])
            self.assertLessEqual(model['lastMatch'], model['asOf'])
            stage = dict(v4Model=model,teams=[dict(name=t) for t in names])
            js_cases.append(dict(stage=stage, points=[points[t] for t in names]))
            for mask in range(16):
                weights = model['masks'][str(mask)]['beta']
                for k in range(4):
                    if not mask & 1 << k:
                        self.assertEqual(weights[k+1], 0.)
                for i, j in combinations(range(len(names)), 2):
                    a,b = names[i],names[j]
                    gap = (points[a]-points[b])/100
                    x = design(gap, model['calibrationSlope'], rows[a], rows[b])
                    expected.append(expit(np.dot(weights,x)))
                    opposite = design(-gap, model['calibrationSlope'], rows[b], rows[a])
                    np.testing.assert_allclose(np.add(x,opposite), 0, atol=1e-12)
                    if not (rows[a]['nRound'] and rows[b]['nRound']):
                        self.assertEqual(x[4], 0)
        script = """
        require('./strategy_v4/predict.js');
        const input = JSON.parse(require('fs').readFileSync(0,'utf8'));
        const values = [];
        for (const {stage,points} of input) for(let mask=0; mask<16; mask++) {
          const flags = {form:mask&1,strong:mask&2,weak:mask&4,roundMargin:mask&8};
          for(let i=0;i<16;i++) for(let j=i+1;j<16;j++)
            values.push(PickV4.probability(stage,flags,points,i,j));
        }
        console.log(JSON.stringify(values));
        """
        generated = subprocess.check_output(['node','-e',script], cwd=ROOT,
                                            input=json.dumps(js_cases), text=True)
        np.testing.assert_allclose(json.loads(generated), expected, rtol=0, atol=2e-12)


if __name__ == '__main__':
    unittest.main()
