from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SINGAPORE_OBSERVATION = date(2026, 11, 20)
START = {name:date.fromisoformat(day) for name,day in {
    'copenhagen':'2024-03-17','shanghai':'2024-11-30','austin':'2025-06-03',
    'budapest':'2025-11-24','cologne':'2026-06-02','singapore':'2026-11-24'}.items()}

def close_day(event):
    prior = START[event] - timedelta(days=1)
    return min(prior, SINGAPORE_OBSERVATION) if event=='singapore' else prior
