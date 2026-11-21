"""Search every 2/6/2 card using the frozen Swiss simulator and independent draw streams."""
import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from numba import set_num_threads

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from f1bre_card.search import evaluate


def run():
    options = argparse.ArgumentParser()
    options.add_argument("--check", action="store_true")
    options.add_argument("--method", choices=["baseline","elo","ml","blend"], help="Cache searches for a single model")
    options.add_argument("--sensitivity", action="store_true")
    args = options.parse_args()
    set_num_threads(6)
    ids = list(json.loads((HERE / "major-fields.json").read_text("utf8"))["fields"]) + ["cluj-2026"]
    if args.sensitivity:
        ids = [f for f in ids if f.endswith("-3") or f == "cluj-2026"]
    methods = [args.method] if args.method else ["baseline", "elo", "ml", "blend"]
    suffix = "exact-seeds.json" if args.sensitivity else "exact.json"
    prior = {}
    for model in methods:
        cache_file=HERE/"cache"/(model+"-"+suffix)
        if cache_file.is_file() and not args.check:
            for field,methods_read in json.loads(cache_file.read_text("utf8")).items():
                prior.setdefault(field,{}).update(methods_read)
    rows = {}
    for field in ids:
        scores = rows[field] = {}
        jobs = [(m, i) for m in methods for i in ([1,2] if args.sensitivity else [0])]
        for method, index in jobs:
            output_key = method + "-" + str(index) if args.sensitivity else method
            with tempfile.TemporaryDirectory() as scratch:
                cmd = ["node", str(HERE / "samples.cjs"), scratch, field, method, str(index)]
                record = json.loads(subprocess.check_output(cmd, encoding="utf8"))
                draws = {k: hashlib.sha256((Path(scratch) / f).read_bytes()).hexdigest() for k,f in record["files"].items()}
                cached = prior.get(field, {}).get(output_key, {})
                if cached.get("streams") == draws and cached["standard"]["card"] == record["released"] and cached["local"]["card"] == record["local"]:
                    scores[output_key] = cached
                    continue
                result = evaluate(record, Path(scratch))["results"]
                scores[output_key] = {"seed":record["seed"], "streams":draws, "standard":result["released"],
                                  "local":result["local"], "full":result["all"]}
        print(field, "verified" if args.check else "searched", flush=True)
    out = json.dumps(rows, separators=(",",":"))+"\n"
    dest = HERE/"cache"/(args.method+"-"+suffix) if args.method else HERE/suffix
    if args.check:
        assert dest.read_text("utf8") == out
    else:
        dest.parent.mkdir(exist_ok=True)
        dest.write_bytes(out.encode("utf8"))


if __name__ == "__main__":
    run()
