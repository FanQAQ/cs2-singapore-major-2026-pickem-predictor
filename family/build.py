"""Train a pre-stage boosted series-win model for each selectable feature set."""
import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path

import numpy as np
from sklearn.ensemble import GradientBoostingClassifier

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
FIELDS = ("vrsPer100", "formDiff", "strongDiff", "weakDiff")
STAGES = {
    "copenhagen": "2024-03-17", "shanghai": "2024-11-30",
    "austin": "2025-06-03", "budapest": "2025-11-24",
    "cologne": "2026-06-02", "singapore": "2026-11-24",
}
RATE = 0.04


def examples():
    grouped = defaultdict(list)
    paths = [ROOT / "fitting" / "fit_examples.csv", ROOT / "history24" / "fit_examples.csv"]
    for path in paths:
        if not path.exists():
            continue
        with path.open(encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                grouped[row["event"]].append(row)
    return grouped


def encode(tree, columns, node=0):
    """Index original feature columns so the browser can share one input vector."""
    left, right = tree.children_left[node], tree.children_right[node]
    if left == right:
        return float(tree.value[node, 0, 0])
    return [columns[tree.feature[node]], float(tree.threshold[node]),
            encode(tree, columns, left), encode(tree, columns, right)]


def fitted(x, y, columns):
    selected = x[:, columns]
    # Equal probability of being shown on the left or right. Both rows stay on
    # the same side of each edition cutoff; no duplicated rows reach validation.
    train_x = np.concatenate((selected, -selected))
    train_y = np.concatenate((y, 1-y))
    learner = GradientBoostingClassifier(n_estimators=80, learning_rate=RATE, max_depth=2,
                                         min_samples_leaf=50, random_state=7301)
    return learner.fit(train_x, train_y)


def build(ids, source, check):
    result = {}
    check_rows = []
    for event_id in ids:
        rows = source.get(event_id)
        if not rows:
            raise ValueError(f"Missing pre-stage examples for {event_id}")
        last = max(row["date"] for row in rows)
        if last >= STAGES[event_id]:
            raise ValueError(f"Training reaches {event_id} opening day")
        x = np.array([[float(r[k]) for k in FIELDS] for r in rows])
        y = np.array([int(r["y"]) for r in rows])
        if not np.isfinite(x).all() or set(y) != {0, 1}:
            raise ValueError(f"Invalid training features or outcomes for {event_id}")
        masks = {}
        for mask in range(8):
            columns = [0] + [k for k in range(1, 4) if mask & (1 << (k-1))]
            model = fitted(x, y, columns)
            masks[mask] = [encode(t.tree_, columns) for t in model.estimators_[:, 0]]
            if check:
                z = np.vstack((x[::max(1, len(x)//13)], np.zeros(4)))
                forecast = (model.predict_proba(z[:, columns])[:,1] +
                            1-model.predict_proba(-z[:, columns])[:,1]) / 2
                check_rows.append(dict(event=event_id, mask=mask, x=z.tolist(), p=forecast.tolist()))
        result[event_id] = dict(n=len(rows), firstMatch=min(r["date"] for r in rows),
                                lastMatch=last, rate=RATE, masks=masks)
    return result, check_rows


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--events", nargs="+", choices=STAGES, default=list(STAGES))
    cli.add_argument("--out", type=Path, default=HERE / "models.json")
    cli.add_argument("--check", action="store_true",
                     help="Compare all feature masks against browser inference (requires Node.js)")
    args = cli.parse_args()
    models, checks = build(args.events, examples(), args.check)
    encoded = json.dumps(models, separators=(",", ":"), allow_nan=False)
    if args.check:
        import subprocess
        subprocess.run(["node", str(HERE / "check.cjs")], check=True,
                       input=json.dumps(dict(models=models, cases=checks)), text=True)
    args.out.write_text(encoded + "\n", encoding="utf-8")
    print(", ".join(f"{event}: {m['n']}" for event, m in models.items()))


if __name__ == "__main__":
    main()
