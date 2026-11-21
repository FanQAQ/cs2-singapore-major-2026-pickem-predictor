"""Rebuild the Shanghai confirmatory field using only evidence available before Stage 2."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from holdout_copenhagen.freeze import freeze_field, write_or_check

DIRECT = {
    'G2': 'NiKo huNter- Snax m0NESY malbsMd',
    'Natus Vincere': 'Aleksib iM b1t jL w0nderful',
    'Vitality': 'apEX ZywOo flameZ Spinx mezii',
    'Spirit': 'chopper sh1ro magixx zont1x donk',
    'MOUZ': 'Brollan siuhy torzsi Jimpphat xertioN',
    'FaZe': 'karrigan rain frozen ropz broky',
    'HEROIC': 'NertZ TeSeS sjuush degster kyxsan',
    '3DMAX': 'Maka Lucky Djoko Ex3rcice Graviti'
}
QUALIFIERS = ['The MongolZ', 'Liquid', 'GamerLegion', 'FURIA', 'paiN', 'Wildcard', 'BIG', 'MIBR']

if __name__ == '__main__':
    write_or_check(freeze_field('shanghai', '2024-11-06', DIRECT, QUALIFIERS, '2024-12-03', '2024-12-05'),
                   HERE/'field.json')
