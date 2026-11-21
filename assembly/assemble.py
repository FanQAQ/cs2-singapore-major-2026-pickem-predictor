"""Assemble the offline Pick'Em tool from frozen, pre-stage inputs."""
import json
import hashlib
from copy import copy
from io import BytesIO
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
from zipfile import ZIP_BZIP2, ZIP_DEFLATED, ZIP_LZMA, ZIP_STORED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from experience.features import snapshot as experience_snapshot
from datajob.build_features import roster_key as five
from styles_model.admission import requirements, recent as recent_style

OUT = ROOT / "dist"
INFO = {
    "singapore": ("新加坡 Major 2026", "2026-11-24 — 11-27"),
    "austin": ("奥斯汀 Major 2025", "2025-06-03 — 06-06"),
    "budapest": ("布达佩斯 Major 2025", "2025-11-24 — 11-27"),
    "cologne": ("科隆 Major 2026", "2026-06-02 — 06-05"),
}
RULEBOOK = "https://github.com/ValveSoftware/counter-strike_rules_and_regs/blob/main/major-supplemental-rulebook.md"
MODEL_FILES = {
    "experience": "experience/history.json",
    "pickSignal": "pick_signal/events.json",
    "lanSignal": "lan_signal/events.json",
    "boost": "family/models.json",
    "v4": "strategy_v4/models.json",
    "mapVeto": "map_veto_data/veto.json",
    "mapStrength": "map_strength/events.json",
    "closeSnapshot": "refresh_close/events.json",
    "regionRisk": "region_risk/events.json",
    "vrsRegionStats": "region_vrs_data/events.json",
    "regionVrsModel": "region_vrs_model/events.json",
    "majorForm": "major_form/events.json",
    "earlyFixtures": "history24/fixtures.json",
    "earlyModels": "history24/models.json",
    "rolling": "model_v3/model.json",
    "weights": "model_v3/format_weight.json",
    "recent": "freshness/ratings.json",
    "officialRecent": "vrs_repair/ratings.json",
    "rankings": "datajob/features.json",
    "rosterSources": "datajob/stage_roster_sources.json",
    "fixtures": "fixtures/fixtures.json",
    "base": "fitting/models.json",
    "format": "format_model/model.json",
    "matchups": "styles_model/matchups.json",
    "profiles": "styles_model/profile_evidence.json",
    "logos": "logos/manifest.json",
    "legacyStyles": "styles_model/legacy_ui_rosters.json",
}


def read(relative):
    return json.loads((ROOT / relative).read_text("utf-8"))


def key(name):
    aliases = {"GOSH": "BC.GAME", "PVISION": "PARIVISION"}
    return aliases.get(name.upper(), name.upper()).replace(" ", "")


def save_events(events, **extra):
    chunks = []
    for name, value in {"PICK_DATA": events, **extra}.items():
        payload = json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        chunks.append(f"globalThis.{name}={payload};\n")
    (OUT / "data.js").write_bytes("".join(chunks).encode("utf-8"))


def package_project():
    downloads = OUT / "downloads"
    downloads.mkdir(exist_ok=True)
    limit = 25 * 1024 * 1024
    with TemporaryDirectory(dir=downloads) as workspace:
        archive = Path(workspace) / "project.zip"
        write_project_zip(archive)
        if archive.stat().st_size > limit:
            compact = Path(workspace) / "compact.zip"
            with ZipFile(archive) as source, ZipFile(compact, "w") as output:
                for member in source.infolist():
                    data = source.read(member)
                    choices = {ZIP_DEFLATED: member.compress_size, ZIP_STORED: len(data)}
                    if Path(member.filename).suffix in {".py", ".cjs", ".js", ".css", ".json", ".html", ".md", ".csv", ".txt", ""}:
                        for method in (ZIP_BZIP2, ZIP_LZMA):
                            with ZipFile(BytesIO(), "w", method, compresslevel=9) as probe:
                                probe.writestr("entry", data)
                                choices[method] = probe.getinfo("entry").compress_size
                    method = min(choices, key=choices.get)
                    output.writestr(copy(member), data, compress_type=method, compresslevel=9)
            archive = compact
        if archive.stat().st_size > limit:
            raise ValueError(f"Complete download requires {archive.stat().st_size} bytes. Sites allows {limit} per file.")
        archive.replace(downloads / "pickem-lab.zip")


def write_project_zip(archive):
    folders = ("analysis", "assembly", "datajob", "dist", "engine", "experience", "extra_validation", "family", "fitting", "history24", "history_ui", "fixtures", "forecast_archive", "format_model", "freshness", "logos", "map_eval", "map_model", "map_strength", "map_veto_data", "refresh_close", "region_risk", "region_vrs_data", "region_vrs_model", "region_vrs_eval", "major_form", "major_form_eval", "feature_study", "pick_signal", "lan_signal", "method_eval", "method_archive", "card_alternatives", "lineup_lan", "tail_risk", "robust_card", "integrated_eval", "model_v3", "research_cards", "research_lineup", "strategy_v4", "strategy_v4_eval", "styles_model", "swap", "ui", "vrs_repair")
    with ZipFile(archive, "w", ZIP_DEFLATED, compresslevel=9) as bundle:
        for name in ("README.md", "LICENSE", "THIRD_PARTY.md"):
            bundle.write(ROOT / name, name)
        if (ROOT / ".openai/hosting.json").is_file():
            bundle.write(ROOT / ".openai/hosting.json", ".openai/hosting.json")
        bundle.write(ROOT / ".gitattributes", ".gitattributes")
        for folder in (*folders, "world_rank", "holdout_copenhagen", "holdout_shanghai", "external_forecasts",
                       "residual_rating", "style_scout", "style_stats", "stage_context", "personnel_study",
                       "favorite_risk", "coach_change", "multi_stage", "multi_stage_train",
                       "final_card", "final_ratings", "external_stage", "stage_goals", "epl_transfer", "stage_transfer",
                       "f1bre_card", "f1bre_data", "f1bre_models", "ml_allocation", "latent_form", "veto_ml", "bo5_history", "elite_opponents", "lineup_pairs", "stage1_holdout", "stage3_maps", "cologne_veto", "round_form", "tail_calibration"):
            for path in sorted((ROOT / folder).rglob("*")):
                rel = path.relative_to(ROOT)
                if path.is_file() and not {"cache", "__pycache__", "downloads"}.intersection(rel.parts):
                    bundle.write(path, rel)


def match_five(target, items, field):
    target = five(target)
    scores = [(len(target & five(item.get(field))), item) for item in items]
    best = max((n for n, _ in scores), default=0)
    matches = [item for n, item in scores if n == best and n >= 3]
    return (matches[0], best) if len(matches) == 1 else (None, 0)


def singapore_style_study(event):
    notes = read("style_scout/singapore.json")
    measurements = read("style_stats/events.json")["singapore"]
    examples = read("style_scout/flash_examples.json")
    names = {team["name"] for team in event["teams"]}
    if (set(notes["teams"]) != names or set(measurements) != names or set(examples) != names
            or not event["asOf"] <= notes["asOf"] < event["date"].split()[0] or event["hasResults"]):
        raise ValueError("Invalid Singapore pre-event style coverage")
    for team in event["teams"]:
        name = team["name"]
        core = five(team["roster"])
        item = notes["teams"][name]
        overlap = len(core & five(item["roster"]))
        required = requirements(name, item)
        item["scenarioEligible"] = (required is not None and required <= core
                                    and recent_style(item["date"], event["date"].split()[0]))
        if (overlap != item["overlap"] or overlap < 3 or item["date"] > notes["asOf"]
                or not {p.casefold() for p in item.get("requiredPlayers", [])} <= core
                or measurements[name]["recent"]["lastMatch"] > notes["asOf"]):
            raise ValueError(f"{name}: invalid scouting evidence")
        for sample in examples[name]:
            if (len(core & five(sample["roster"])) < 3 or sample["day"] > notes["asOf"]
                    or sample["flashAssists"] > sample["assists"] or sample["headshots"] > sample["kills"]):
                raise ValueError(f"{name}: invalid scorecard")
    def public_report(name):
        data = read(f"styles_model/{name}_pair_report.json")
        return {k:v for k,v in data.items() if k != "series"}
    return dict(asOf=notes["asOf"], scouts=notes["teams"], measurements=measurements,
                examples=examples, scoutsReport=public_report("style"), demosReport=public_report("demo"))


def attach_stage_research(event):
    comparison = read("stage_context/report.json")
    favorites = read("favorite_risk/report.json")
    personnel = read("personnel_study/report.json")
    coach = read("coach_change/report.json")
    reports = [comparison, favorites, personnel, coach]
    cutoff = event["styleStudy"]["asOf"]
    stages = comparison["stages"]
    if any(r["asOf"] != cutoff for r in reports) or cutoff >= event["date"].split()[0]:
        raise ValueError("Stage research cutoffs differ from the pre-event snapshot")
    if (set(stages) != set(favorites["stages"]) or stages["singapore"]["result"] is not None
            or any(favorites["stages"]["singapore"][k]["actualOut"] is not None for k in ("model","seeds"))
            or set(personnel["teams"]) != {team["name"] for team in event["teams"]}):
        raise ValueError("Stage research fields or outcomes do not match the Singapore field")
    event["stageComparison"] = comparison
    event["favoriteRisk"] = favorites
    event["personnelStudy"] = personnel
    event["coachChange"] = {**coach,"windows":[{k:v for k,v in w.items() if k != "series"} for w in coach["windows"]]}


def attach_supplemental_inputs(event, sources):
    event_id = event["id"]
    start = event["date"].split()[0]
    profiles = {}
    candidates = []
    for name, row in sources["profiles"].get(event_id, {}).items():
        required = requirements(name, row)
        if required is None or not recent_style(row["date"], start):
            continue
        if event_id == "singapore" and row["date"] > event["rosterAsOf"]:
            continue
        candidates.append(dict(row, required=required))
    for team in event["teams"]:
        allowed = [row for row in candidates if row["required"] <= five(team["roster"])]
        row, overlap = match_five(team["roster"], allowed, "rosterAtSource")
        if row:
            profiles[team["name"]] = dict({k:v for k,v in row.items() if k!="required"}, overlap=overlap)
    event["profileEvidence"] = profiles

    latest = sources["officialRecent"].get(event_id)
    if latest:
        if not (latest["asOf"] <= latest["publishedAt"][:10] < start):
            raise ValueError(f"{event_id}: invalid pre-stage publication date")
        teams = {t["name"]: t for t in event["teams"]}
        if set(latest["teams"]) != set(teams):
            raise ValueError(f"{event_id}: incomplete official rating extraction")
        identical = all(entry["points"] == teams[name]["points"]
                        for name, entry in latest["teams"].items())
        if identical != latest["sameAsBase"]:
            raise ValueError(f"{event_id}: official snapshot and base comparison disagree")
        event["recentRating"] = latest
        event["sources"].extend({"title": latest["basis"] + " · " + latest["asOf"], "url": url}
                                for url in latest["sources"])


def build_event(event_id, sources):
    label, dates = INFO[event_id]
    stage = sources["fixtures"][event_id]
    snap = sources["rankings"][event_id]
    stage_roster = sources["rosterSources"][event_id]
    assert stage_roster["rosterAsOf"] < dates.split()[0]
    idx = {name: i for i, name in enumerate(stage["seeds"])}
    lookup = {key(team["name"]): team for team in snap["teams"]}
    teams = [dict(lookup[key(name)], name=name) for name in stage["seeds"]]
    rounds = [[[idx[w],idx[l]] for w,l in row] for row in stage["rounds"]]
    model = sources["base"][event_id]
    rolling = sources["rolling"][event_id]
    active = {"|".join(sorted(five(t["roster"]))) for t in teams}
    roster_model = dict(masks=rolling["masks"], lineupValues={
        k:v for k,v in rolling["lineupValues"].items() if k in active})
    recent = sources["recent"].get(event_id)
    if recent:
        if recent["asOf"] >= dates.split()[0]:
            raise ValueError("Expected a pre-stage rating")
        verified = {}
        for t in teams:
            row, overlap = match_five(t["roster"], recent["teams"].values(), "roster")
            if row:
                verified[t["name"]] = dict(row, overlap=overlap, monthlyOverlap=row["overlap"])
        recent = dict(recent, teams=verified, available=bool(verified),
                      kind="daily-estimate", provider="HLTV", rankScope="global",
                      basis="HLTV 全球 VRS 估算", sources=[recent["source"]],
                      sameAsBase=all(verified[t["name"]]["points"] == t["points"]
                                     for t in teams if t["name"] in verified) and len(verified) == len(teams))
    previous = [dict(name=n, roster=r) for n,r in sources["legacyStyles"].get(event_id, {}).items()]
    legacy_styles = {}
    for t in teams:
        entry, _ = match_five(t["roster"], previous, "roster")
        if entry:
            legacy_styles[t["name"]] = entry["name"]
    as_of = "2026-11-21" if event_id == "singapore" else dates.split()[0]
    prior = experience_snapshot(sources["experience"], teams, as_of)
    exp_sources = [dict(title="Major 选手出场名册 · "+label, url=sources["experience"]["sources"][source]["url"])
                   for source,label in [("csgo","CS:GO"),("cs2","CS2")]]
    return dict(
        id=event_id, label=label, date=dates, asOf=snap["asOf"], rosterAsOf=stage_roster["rosterAsOf"], rosterChanges=stage_roster["teamUpdates"], teams=teams, rounds=rounds,
        hasResults=bool(rounds), featureAvailability={f:any(t[k] for t in teams)
            for f,k in [("form","n"),("strong","ns"),("weak","nw")]},
        sources=list(dict.fromkeys([snap["source"], *stage["sources"], RULEBOOK])) + exp_sources + [dict(title=v["label"], url=v["url"]) for v in stage_roster["sources"]] + [
            {"title":"比赛赛制记录 · " + url.split("/datasets/")[1].split("/versions/")[0], "url":url}
            for url in sources["format"][event_id]["sources"]] +
            ([{"title":f"HLTV · {recent['asOf']} 临赛 VRS 估算", "url":recent["source"]}] if recent else []),
        formatWeight=dict(weight=sources["weights"][event_id]["weight"],asOf=snap["asOf"]), rollingModel=roster_model, recentRating=recent, model=model, formatModel=sources["format"][event_id], matchups=sources["matchups"][event_id],
        logos=sources["logos"][event_id], experience=prior,
        legacyStyleTeams=legacy_styles,
        coverage=f"{sum(t['points'] is not None for t in teams)} / 16 支队伍有与首发至少三人重合的赛前 VRS 积分。缺少可核实积分时采用本阶段已知积分中位数。",
        trainingNote=f"基础模型用本阶段前的 {model['n']:,} 场比赛拟合。近期状态、对强队、对弱队的每种组合独立取参。",
        methodNote="每次模拟均按胜负重排五轮对手。两胜或两负的对局采用 BO3，其余采用 BO1。开启地图策略后按两队赛前禁选和分图表现估胜率。阵容取赛前确认的首发。")


def early_event(event_id, sources):
    stage = sources["earlyFixtures"][event_id]
    event = dict(sources["earlyModels"][event_id])
    seeds = stage["seeds"]
    original = event["teams"]
    lookup = original if isinstance(original, dict) else {t["name"]: t for t in original}
    teams = [lookup[name] for name in seeds]
    if any(five(t["roster"]) != five(stage["rosters"][name]) or not five(t["roster"])
           for name,t in zip(seeds,teams)):
        raise ValueError(f"{event_id} stage roster mismatch")
    idx = {name:i for i,name in enumerate(seeds)}
    rounds = [[[idx[w],idx[l]] for w,l in matches] for matches in stage["rounds"]]
    if event["asOf"] >= stage["date"]:
        raise ValueError(f"{event_id} ranking cutoff must precede its first match")
    prior = experience_snapshot(sources["experience"],teams,stage["date"])
    notes = dict(event.get("historyNotes", {}))
    return dict(event, id=event_id, label=stage["label"], date=stage["date"]+" — "+stage["endDate"],
                teams=teams, rounds=rounds, rosterAsOf=stage["asOf"], hasResults=True,
                experience=prior, historyNotes=notes, logos={}, rosterChanges={},
                sources=[*stage["sources"], *event.get("sources",[])],
                featureAvailability={k:any(t.get(field,0) for t in teams) for k,field in
                                     [("form","n"),("strong","ns"),("weak","nw")]})


def audit_summary(report):
    audit = read("analysis/audit.json")
    stability = read("analysis/stability-v2.json")
    extra = read("extra_validation/report.json")
    match_labels = {
        "seedLadder":"原版赛事种子（积分梯度）", "vrs":"原版仅 VRS", "pooled":"旧版全特征（合并赛制）",
        "v2":"旧版全特征（区分赛制）"
    }
    match_rows = [dict(label=label, **audit["forecastScores"][key]) for key,label in match_labels.items()]
    match_rows.extend([dict(label="原版基准（五届 Stage 1）", **report["current"]),
                       dict(label="回合净胜＋校准状态（五届 Stage 1）", **report["v4"])])
    repeats = []
    for row in stability["rows"]:
        item = row["experiments"][0]["observed"]
        if item is None:
            continue
        hist = {int(k):v for k,v in item["histogram"].items()}
        repeats.append(dict(label=INFO[row["event"]][0], defaultHits=item["playedCard"],
            low=min(hist), high=max(hist), passed=sum(v for k,v in hist.items() if k >= 5), n=sum(hist.values())))
    names = {"vrs":"仅 VRS", "vrsFormat":"VRS＋原始赛制差异", "guarded":"原版基准（VRS＋赛制收缩）", "blend":"种子与 VRS 各半",
             "v2":"状态＋赛制（修订后阵容）", "rollingFormat":"阵容走势＋全特征（区分赛制）"}
    independent = [dict(label=names[k], correct=round(m["hitRate"]*m["n"]), **m)
                   for k,m in extra["models"].items() if k in names]
    return dict(matchRows=match_rows, stability=repeats, variants=report["variants"],
                extra=dict(n=extra["n"], models=independent))

def build():
    OUT.mkdir(exist_ok=True)
    sources = {key_: read(path) for key_, path in MODEL_FILES.items()}
    release = read("method_eval/report.json")
    stage_selection = {stage["id"]: stage["selectedBefore"] for stage in release["stages"]}
    player_evidence = read("lineup_lan/events.json")
    contrasts = read("major_form/contrast.json")
    events = [build_event(event_id, sources) for event_id in INFO]
    events.extend(early_event(event_id, sources) for event_id in sources["earlyFixtures"])
    for ev in events:
        attach_supplemental_inputs(ev, sources)
        ev["boostModel"] = sources["boost"][ev["id"]]
        model = sources["v4"][ev["id"]]
        if model["asOf"] != ev["asOf"] or set(model["teams"]) != {t["name"] for t in ev["teams"]}:
            raise ValueError(f"{ev['id']}: new model cutoff or entrant mismatch")
        ev["v4Model"] = model
        for field in ("mapVeto", "mapStrength"):
            dataset = sources[field][ev["id"]]
            if dataset["asOf"] != ev["asOf"] or set(dataset["teams"]) != {t["name"] for t in ev["teams"]}:
                raise ValueError(f"{ev['id']}: {field} cutoff or entrant mismatch")
            ev[field] = dataset
        if set(ev["mapStrength"]["pool"]) != set(ev["mapVeto"]["pool"]) or len(set(ev["mapStrength"]["pool"])) != 7:
            raise ValueError(f"{ev['id']}: map pool mismatch")
        close = sources["closeSnapshot"][ev["id"]]
        region = sources["regionRisk"][ev["id"]]
        names = {team["name"] for team in ev["teams"]}
        start = ev["date"].split()[0]
        if not (ev["asOf"] == close["baseAsOf"] <= close["asOf"] < start):
            raise ValueError(f"{ev['id']}: close forecast dates out of order")
        if not (region["asOf"] < start and set(region["teams"]) == names and set(close["profiles"]) == names):
            raise ValueError(f"{ev['id']}: team membership or date mismatch")
        ev["closeSnapshot"], ev["regionRisk"] = close, region
        ranks = sources["vrsRegionStats"][ev["id"]]
        adjustment = sources["regionVrsModel"][ev["id"]]
        if ranks["asOf"] != ev["asOf"] or adjustment["asOf"] != ranks["asOf"] or set(adjustment["teams"]) != names:
            raise ValueError(f"{ev['id']}: regional VRS cutoff or field mismatch")
        ev["vrsRegionStats"], ev["regionVrsModel"] = ranks, adjustment
        major = sources["majorForm"][ev["id"]]
        if major["asOf"] != ev["asOf"] or set(major["teams"]) != names:
            raise ValueError(f"{ev['id']}: Major performance cutoff or roster mismatch")
        ev["majorForm"] = major
        contrast = contrasts[ev["id"]]
        if contrast["asOf"] != major["asOf"] or set(contrast["teams"]) != names:
            raise ValueError(f"{ev['id']}: ordinary LAN comparison cutoff or field mismatch")
        ev["majorContrast"] = contrast
        evidence = player_evidence[ev["id"]]
        if set(evidence["teams"]) != names or evidence["asOf"] != region["asOf"] or evidence["asOf"] > close["asOf"]:
            raise ValueError(f"{ev['id']}: inconsistent player history snapshot")
        ev["lineupLan"] = evidence
        for field in ("lanSignal", "pickSignal"):
            profile = sources[field][ev["id"]]
            if not profile["asOf"] < start or set(profile["teams"]) != names:
                raise ValueError(f"{ev['id']}: {field} cutoff or field mismatch")
            ev[field] = profile
        selection = release["selected"] if ev["id"] == "singapore" else stage_selection[ev["id"]]
        if set(selection) != {"tree", "recommended"} or not set(selection.values()) <= {"base", "lan", "pick", "both"}:
            raise ValueError(f"{ev['id']}: missing a validated default for one of the models")
        ev["methodSelection"] = selection
        if ev["id"] == "singapore":
            ev["featureRelease"] = release
            ev["styleStudy"] = singapore_style_study(ev)
            attach_stage_research(ev)
            swaps = read("card_alternatives/singapore.json")
            if swaps["event"] != ev["id"] or set(swaps["methods"]) != set(selection):
                raise ValueError("Singapore swap records do not match the two methods")
            if set(swaps["byFingerprint"]) != set(swaps["methods"].values()):
                raise ValueError("Missing confirmed swap result for a default card")
            ev["cardAlternatives"] = swaps
        sources_for_maps = [ev["mapStrength"]["poolSource"], {"title":"Valve Major 选图规则","url":RULEBOOK}]
        sources_for_maps.extend(ev["mapVeto"].get("sources", []))
        for dataset in (close, region, ranks, major, ev["lanSignal"], ev["pickSignal"]):
            for entry in dataset.get("sources", []):
                if isinstance(entry, str):
                    entry = {"title": "赛前补充资料", "url": entry}
                if isinstance(entry, dict) and entry.get("url", "").startswith("https://"):
                    sources_for_maps.append(entry)
        existing_links = {r if isinstance(r, str) else r["url"] for r in ev["sources"]}
        for resource in sources_for_maps:
            if isinstance(resource, dict) and resource.get("url") and resource["url"] not in existing_links:
                ev["sources"].append(resource)
                existing_links.add(resource["url"])
    for source, target in [
        ("family/boost.js","boost.js"), ("map_model/model.js","map-model.js"),
        ("refresh_close/model.js","close-model.js"), ("region_risk/model.js","region-risk.js"),
        ("robust_card/robust.js","robust-card.js"), ("region_vrs_model/model.js","region-vrs.js"),
        ("major_form/model.js","major-form.js"), ("lan_signal/model.js","lan-signal.js"),
        ("pick_signal/model.js","pick-signal.js"), ("assembly/methods.js","methods.js"),
        ("multi_stage/inputs.js","stage-inputs.js"), ("multi_stage_train/model.js","stage-training.js"),
        ("final_card/rules.js","stage3-card.js"),
        ("card_alternatives/alternatives.js","card-alternatives.js"),
        ("card_alternatives/confirm-worker.js","alternatives-worker.js"),
        ("assembly/method-validation.js","method-validation.js"),
        ("strategy_v4/predict.js","v4.js"), ("swap/swap.js","swap.js"),
        ("history_ui/history.js","history.js"), ("history_ui/history-worker.js","history-worker.js"),
        ("ui/index.html","index.html"), ("ui/app.js","app.js"), ("ui/style.css","style.css"),
        ("ui/fango-lab.png","fango-lab.png"),
        ("ui/style-report.js","style-report.js"), ("ui/singapore-skyline.webp","singapore-skyline.webp"),
        ("ui/event-context.js","event-context.js"),
        ("ui/f1bre-study.js","f1bre-study.js"),
        ("ui/bo5-history.js","bo5-history.js"),
        ("ui/elite-opponents.js","elite-opponents.js"),
        ("ui/pick-constraints.js","pick-constraints.js"),
        ("ui/swiss-board.js","swiss-board.js"), ("ui/swiss-board.css","swiss-board.css"),
        ("model_v3/rolling.js","rolling.js"), ("engine/engine.js","engine.js"), ("format_model/format.js","format.js"),
        ("styles_model/style.js","style-model.js"), ("assembly/adapter.js","adapter.js"),
    ]:
        shutil.copyfile(ROOT / source, OUT / target)
    logo_paths = {asset for e in events for asset in e["logos"].values()}
    for name in logo_paths:
        path = Path(name)
        if path.is_absolute() or ".." in path.parts or path.parts[0] != "logos":
            raise ValueError(f"Unexpected logo path {name}")
        (OUT / path).parent.mkdir(exist_ok=True, parents=True)
        shutil.copyfile(ROOT / path, OUT / path)
    save_events(events)
    later_teams = read("extra_validation/strengths.json")
    later_x = {e["id"]:experience_snapshot(sources["experience"], list(later_teams[e["id"]]["teams"].values()),
                    e["experience"]["asOf"])
               for e in events if e["id"] in later_teams}
    experience = json.loads(subprocess.check_output(["node", str(ROOT / "experience/calibrate.cjs")],
                            input=json.dumps(later_x), text=True))
    for ev in events:
        ev["experience"]["model"] = experience["models"][ev["id"]]
        ev["experience"]["validation"] = experience["results"]
        ev["experience"]["laterValidation"] = experience["laterResults"]
    save_events(events)
    report = json.loads(subprocess.check_output(["node", str(ROOT / "assembly/backtest.cjs")], text=True))
    # Copy sealed records verbatim, including the earlier unshrunk format comparison.
    (OUT / "forecasts").mkdir(exist_ok=True)
    shutil.copyfile(ROOT / "external_forecasts/singapore-stage1-2026-11-21.json",
                    OUT / "forecasts/singapore-stage1-external-2026-11-21.json")
    for frozen in sorted((ROOT / "forecast_archive").glob("*.json")):
        shutil.copyfile(frozen, OUT / "forecasts" / frozen.name)
    summary = audit_summary(report)
    validation = ROOT / "strategy_v4_eval/report.json"
    holdout = read(validation)["holdoutSummary"] if validation.exists() else None
    map_report_path = ROOT / "map_eval/report.json"
    map_audit = read(map_report_path) if map_report_path.is_file() else None
    stability_path = ROOT / "map_eval/stability.json"
    map_stability = read(stability_path) if stability_path.is_file() else None
    integrated_path = ROOT / "integrated_eval/report.json"
    integrated = read(integrated_path) if integrated_path.is_file() else None
    feature_research = read("feature_study/report.json")["totals"]
    rank_report_path = ROOT / "region_vrs_eval/report.json"
    rank_report = read(rank_report_path) if rank_report_path.is_file() else None
    major_report_path = ROOT / "major_form_eval/report.json"
    major_report = read(major_report_path) if major_report_path.is_file() else None
    for ev in events:
        if integrated and ev["hasResults"]:
            ev["integratedStage"] = next(s for s in integrated["stages"] if s["id"] == ev["id"])
        stage_audit = next((s for s in map_audit["stages"] if s["id"] == ev["id"]), None) if map_audit else None
        if stage_audit:
            ev["mapCoverage"] = stage_audit["coverage"]["actual"]
        ev["auditSummary"] = summary
        archive = ROOT / "forecast_archive" / (ev["id"] + "-stage1-default-2026-11-21.json")
        if archive.is_file():
            dest = OUT / "forecasts" / archive.name
            ev["frozenForecast"] = dict(path=str(dest.relative_to(OUT)), asOf="2026-11-21",
                sha256=hashlib.sha256(archive.read_bytes()).hexdigest())
        if ev["id"] in report["presets"]:
            ev["historyPresets"] = report["presets"][ev["id"]]
        if ev["id"] == "singapore":
            ev["mapDefault"] = False
            ev["integratedDefault"] = False
            ev["defaultStrategy"] = "regionVrs"
            ev["featureStudy"] = feature_research
            methods_archive = ROOT / "method_archive/singapore-stage1-methods-2026-11-21.json"
            if methods_archive.is_file():
                dest = OUT / "forecasts" / methods_archive.name
                shutil.copyfile(methods_archive, dest)
                ev["methodsForecast"] = dict(path=str(dest.relative_to(OUT)), asOf="2026-11-21",
                    sha256=hashlib.sha256(dest.read_bytes()).hexdigest())
            if major_report:
                ev["majorFormAudit"] = major_report
            major_archive = ROOT / "forecast_archive/singapore-stage1-major-form-2026-11-21.json"
            if major_archive.is_file():
                ev["majorFormForecast"] = dict(path="forecasts/"+major_archive.name, asOf="2026-11-21",
                    sha256=hashlib.sha256(major_archive.read_bytes()).hexdigest())
            if rank_report:
                ev["regionVrsAudit"] = rank_report
            ranked_archive = ROOT / "forecast_archive/singapore-stage1-region-vrs-2026-11-21.json"
            if ranked_archive.is_file():
                ev["regionVrsForecast"] = dict(path="forecasts/"+ranked_archive.name, asOf="2026-11-21",
                    sha256=hashlib.sha256(ranked_archive.read_bytes()).hexdigest())
            if integrated:
                ev["integratedAudit"] = integrated
            close_archive = ROOT / "forecast_archive/singapore-stage1-integrated-2026-11-21.json"
            if close_archive.is_file():
                ev["integratedForecast"] = dict(path="forecasts/"+close_archive.name, asOf="2026-11-21",
                    sha256=hashlib.sha256(close_archive.read_bytes()).hexdigest())
            if map_audit:
                ev["mapAudit"] = map_audit
            if map_stability:
                ev["mapStability"] = dict(map_stability["pairedPassCount"], n=len(map_stability["seeds"]))
            map_archive = ROOT / "forecast_archive/singapore-stage1-map-veto-2026-11-21.json"
            if map_archive.is_file():
                ev["mapForecast"] = dict(path="forecasts/"+map_archive.name, asOf="2026-11-21",
                                         sha256=hashlib.sha256(map_archive.read_bytes()).hexdigest())
            if holdout:
                ev["v4Holdout"] = holdout
            v4_archive = ROOT / "forecast_archive/singapore-stage1-v4-2026-11-21.json"
            if v4_archive.is_file():
                ev["v4Forecast"] = dict(path="forecasts/"+v4_archive.name, asOf="2026-11-21",
                                        sha256=hashlib.sha256(v4_archive.read_bytes()).hexdigest())
            comparison = ROOT / "forecast_archive" / "singapore-stage1-model-comparison-2026-11-21.json"
            if comparison.is_file():
                ev["strategyForecast"] = dict(path="forecasts/"+comparison.name, asOf="2026-11-21",
                                              sha256=hashlib.sha256(comparison.read_bytes()).hexdigest())
        ev["backtests"] = report["cards"]
        ev["validationByFormat"] = report["formats"]
    from multi_stage.inputs import build_events
    later = build_events()
    if later != read("multi_stage/inputs.json"):
        raise ValueError("Stage inputs differ from the snapshot used by the trainer. Run multi_stage/inputs.py first.")
    stage_payload = {"PICK_LATER": later}
    save_events(events, **stage_payload)
    if "--prepare-stage-training" in sys.argv:
        return
    calibration = read("multi_stage_train/models.json")
    study = read("multi_stage_train/report.json")
    singapore = next(event for event in events if event["id"] == "singapore")
    singapore["stageTrainingStudy"] = {key: study[key] for key in ("groups", "defaultGate", "holdout")}
    calendar = read("stage_goals/singapore-schedule.json")
    if ([row["stage"] for row in calendar["stages"]] != [1, 2, 3] or
            any(row["knownEntrants"] + row["unknownAdvancingSpots"] != 16 for row in calendar["stages"]) or
            any(len(team["announcedStartingFive"]) != 5 for row in calendar["stages"] for team in row.get("directInvites", []))):
        raise ValueError("Invalid announced Singapore fields")
    singapore["stageSchedule"] = calendar
    verified = json.loads(subprocess.check_output(["node", str(ROOT / "stage_goals/rolling.cjs")], text=True))
    frozen_stages = verified["records"]
    singapore["prospectiveStages"] = [entry for entry in frozen_stages if entry["edition"] == "singapore-2026"]
    singapore["officialWindows"] = verified["windows"]
    tail = read("tail_calibration/summary.json")
    tail_fields = {item["id"]: item for item in read("tail_calibration/report.json")["stages"]}
    study_file = "forecasts/singapore-stage1-bo3-calibration.json"
    (OUT / study_file).parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / "tail_calibration/singapore-study.json", OUT / study_file)
    singapore["tailForecastFile"] = study_file
    singapore["f1ModelCompare"] = json.loads(subprocess.check_output(
        ["node", str(ROOT / "f1bre_models/website.cjs")], text=True, encoding="utf-8"))
    singapore["mlAllocation"] = read("ml_allocation/summary.json")
    singapore["stageForm"] = json.loads(subprocess.check_output(
        ["node", str(ROOT / "latent_form/website.cjs")], text=True, encoding="utf-8"))
    singapore["vetoML"] = json.loads(subprocess.check_output(
        ["node", str(ROOT / "veto_ml/website.cjs")], text=True, encoding="utf-8"))
    shutil.copyfile(ROOT / "veto_ml/singapore-forecast.json", OUT / singapore["vetoML"]["forecast"]["webFile"])
    singapore["bo5History"] = json.loads(subprocess.check_output(
        ["node", str(ROOT / "bo5_history/website.cjs")], text=True, encoding="utf-8"))
    shutil.copyfile(ROOT / "bo5_history/singapore-forecast.json", OUT / singapore["bo5History"]["forecast"]["webFile"])
    singapore["eliteOpponents"] = json.loads(subprocess.check_output(
        ["node", str(ROOT / "elite_opponents/website.cjs")], text=True, encoding="utf-8"))
    singapore["rosterEvidence"] = read("lineup_pairs/singapore.json")
    swaps = read("lineup_pairs/ef-swaps.json")
    singapore["rosterEvidence"]["efSwaps"] = {"paths": swaps["count"], "changes": {
        arm: {r["team"]: (r["passes"]-model["original"])/swaps["count"] for r in model["swaps"]}
        for arm, model in swaps["worlds"].items()}}
    research_cards = json.loads(subprocess.check_output(
        ["node", str(ROOT / "ml_allocation/prospective.cjs"), "web"], text=True, encoding="utf-8"))
    for research in research_cards:
        source_file = Path(research.pop("sourceFile"))
        web_file = OUT / research["webFile"]
        web_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source_file, web_file)
    singapore["stage3MlForecasts"] = [row for row in research_cards if row["edition"] == "singapore-2026"]
    shutil.copyfile(ROOT / "f1bre_models/singapore-forecast.json", OUT / "forecasts/singapore-stage1-f1bre-models.json")
    singapore["tailScore"] = json.loads(subprocess.check_output(
        ["node", str(ROOT / "tail_calibration/singapore.cjs"), "--score"], text=True, encoding="utf-8"))
    singapore["tailCalibration"] = {}
    for field in ("s21", "s22", "s23", "stage1", "stage2", "stage3"):
        result = tail[field]
        methods = {}
        for name, row in result["methods"].items():
            errors = row["errors"]["bo3"]
            methods[name] = {"hits": row["hits"], "passes": row["passes"], "brier": errors["brier"], "logLoss": errors["logLoss"]}
            if name.endswith("Cal"):
                pair = row["paired"]["passes"]
                if sum(pair.values()) != 30:
                    raise ValueError("Incomplete paired comparison: " + field)
                methods[name]["paired"] = pair
        samples = {row["errors"]["bo3"]["n"] for row in result["methods"].values()}
        if len(samples) != 1 or any(sum(b["n"] for b in bins) not in samples for bins in result["upsetBins"].values()):
            raise ValueError("Inconsistent BO3 denominators: " + field)
        fits = [tail_fields[event]["fits"]["vrs"]["n"] for event in result["events"]]
        singapore["tailCalibration"][field] = {"events": len(result["events"]), "n": samples.pop(),
            "trainingRange": [min(fits), max(fits)], "bins": result["upsetBins"], "methods": methods}
    for web_file in {card["webFile"] for entry in frozen_stages for card in entry["cards"]}:
        output = OUT / web_file
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / "forecast_archive" / Path(web_file).relative_to("forecasts"), output)
    allocation = read("final_card/report.json")
    third = allocation["summaries"]["stage3"]
    paired = [a-b for a,b in zip(third["historical"]["passBySeed"],third["current"]["passBySeed"])]
    transfer = read("stage_goals/bucharest-report.json")["summary"]
    sensitivity = read("final_card/stability.json")
    omitted = next(row for row in sensitivity["summary"] if row["id"]=="cologne-2026-3")["sourceOmissions"]
    singapore["stage3Trial"] = {
        "locations": [{"id": s["id"], "original": s["results"]["current"]["hits"][0],
                       "candidate": s["results"]["historical"]["hits"][0]}
                      for s in allocation["stages"] if s["stage"] == 3],
        "originalCategories": third["current"]["categories"], "candidateCategories": third["historical"]["categories"],
        "more": sum(n>0 for n in paired), "same": paired.count(0), "fewer": sum(n<0 for n in paired),
        "forwardPasses": third["forward"]["passes"], "bucharest": [transfer[k]["hits"] for k in ("base","grouped")],
        "cologneOmission": [omitted[k]["passed"] for k in ("full","shanghai")]}
    singapore["reverseStageStudy"] = read("stage_transfer/summary.json")
    maps = read("stage3_maps/summary.json")
    singapore["stage3MapStudy"] = {
        "major": {k: {"passes": v["fixedPasses"], "hits": v["fixedHits"], "brier": v["bo3"]["brier"],
                      "bo3": v["bo3"]["n"], "changed": v["bo3"]["changed"]} for k, v in maps["major"].items()},
        "external": {k: {"hits": v["fixedHits"], "brier": v["bo3"]["brier"], "bo3": v["bo3"]["n"]}
                     for k, v in maps["external"].items()}}
    veto = read("cologne_veto/eval-report.json")
    envelope = read("cologne_veto/map-range.json")
    agreement = read("cologne_veto/official-crosscheck.json")["summary"]["BO3"]
    if (veto["id"] != envelope["id"] or veto["targetMatches"] != envelope["summary"]["games"]
            or veto["pairsCompared"] != envelope["summary"]["potentialPairs"]
            or agreement["verified"] != veto["sourceCoverage"]["bo3"]["verified"]):
        raise ValueError("Cologne studies must use the same Stage 3 field and games")
    singapore["stage3MapStudy"]["cologne"] = {
        "evidence": {bo: {key: row[key] for key in ("total", "verified")} for bo, row in veto["sourceCoverage"].items()},
        "eligible": veto["additionalEligibleBO3"], "seeds": len(veto["seeds"]), "agreeing": agreement["allStepsAgree"],
        "trials": {key: {"teams": row["vetoTeams"], "hits": row["fixedHits"], "brier": row["bo3"]["brier"],
                         "passes": row["passesAcrossSeeds"]} for key, row in veto["summary"].items()
                   if key in ("old25", "added", "agreementOnly")},
        "range": envelope["summary"]}
    round_summary = read("round_form/summary.json")
    allocation_summary = read("round_form/allocation-summary.json")
    singapore["roundForm"] = {}
    for field_id, methods in {"major": round_summary["major"], **round_summary["byStage"]}.items():
        base = methods["base"]
        cross = allocation_summary["major"] if field_id == "major" else allocation_summary["byStage"][field_id]
        if (cross["baseDefault"]["fixedHits"] != base["fixedHits"] or
                cross["roundDefault"]["fixedHits"] != methods["roundShare"]["fixedHits"]):
            raise ValueError("Allocation study did not reproduce both default cards: " + field_id)
        paired = methods["roundShare"]["pairedVsMapScore"]["passes"]
        if sum(paired.values()) != len(base["passes"]):
            raise ValueError("Round-form comparison must cover all paired seeds")
        singapore["roundForm"][field_id] = {
            "events": len(base["fixedByStage"]), "seeds": len(base["passes"]), "roundVsMap": paired,
            "bo3": base["errors"]["bo3"]["n"], "bo1": base["errors"]["bo1"]["n"],
            "allocation": {"base": {"standard": cross["baseDefault"]["fixedHits"], "grouped": cross["baseGrouped"]["fixedHits"]},
                           "roundShare": {"standard": cross["roundDefault"]["fixedHits"], "grouped": cross["roundGrouped"]["fixedHits"]}},
            "methods": {name: {"hits": row["fixedHits"], "passes": row["fixedPasses"],
                               "brier": row["errors"]["bo3"]["brier"], "slots": row["fixedSlots"]}
                        for name, row in methods.items()}}
    split = read("stage_transfer/source-stages.json")
    holdout = read("stage1_holdout/report.json")
    if holdout["pairedMatchups"] != 33 or not all(x["bo1"]["n"] == 0 and x["bo3"]["n"] == 33 for x in holdout["summary"].values()):
        raise ValueError("External stage must reproduce its 33 all-BO3 matches")
    singapore["reverseStageStudy"]["firstStageSources"] = {
        "separate": {k: {"hits": v["hits"], "passes": v["passes"]} for k, v in split["all"]["metrics"].items()},
        "eligible": len(split["withEarlierThird"]["events"]), "paired": split["withEarlierThird"]["stage3OnStage2"]["passes"],
        "shanghai": next(s["changes"]["earlierDonors"] for s in split["stages"] if s["id"] == "shanghai"),
        "external": {k: {"hits": v["hits"], "passes": v["passingSeeds"], "brier": v["bo3"]["brier"]}
                     for k, v in holdout["summary"].items()}, "seeds": len(holdout["seeds"])}
    compare = read("f1bre_card/singapore.json")
    identity = read("f1bre_data/report.json")
    search = compare["rows"][0]
    result = search["results"]
    exact = result["all"]
    fixed = read("f1bre_card/summary.json")["historical"]["fixedTotals"]
    if (search["id"] != "singapore" or search["teams"] != [t["name"] for t in singapore["teams"]]
            or result["released"]["card"] != read("forecast_archive/singapore-stage1-seed-conditional-2026-11-21.json")["card"]):
        raise ValueError("External search study must match the frozen Singapore field and recommendation")
    singapore["f1breStudy"] = {
        "visited": exact["visited"], "searchPaths": compare["searchN"], "auditPaths": compare["singaporeConfirmN"],
        "released": result["released"]["counts"]["confirm"], "best": exact["top"][0]["counts"]["confirm"],
        "reranked": exact["top"][exact["selected"]]["counts"]["confirm"],
        "historical": {k: fixed[k] for k in ("released", "allRechecked")},
        "recent": identity["singapore"]["recentUsed"], "cologne": identity["singapore"]["majorSeries"],
        "dendeleFirst": identity["singapore"]["firstBo1"]}
    series_counts = {}
    for field in [*events, *later]:
        if field["date"].split()[0] < singapore["date"].split()[0] and field.get("rounds"):
            stage = str(field.get("stage", 1))
            series_counts[stage] = series_counts.get(stage, 0) + sum(len(row) for row in field["rounds"])
    if calibration["singapore"]["nByStage"] != series_counts:
        raise ValueError("Singapore training counts differ from completed Swiss fixtures")
    if {event["id"] for event in [*events, *later]} != set(calibration):
        raise ValueError("Missing a pre-event calibration model")
    stage_payload["PICK_STAGE_TRAINING"] = calibration
    profiles = read("final_card/profiles.json")
    if set(profiles) != {field["id"] for field in later if field["stage"] == 3}:
        raise ValueError("Stage 3 card profiles differ from official Stage 3 fields")
    stage_payload["PICK_STAGE3_PROFILES"] = profiles
    save_events(events, **stage_payload)
    presets = json.loads(subprocess.check_output(["node", str(ROOT / "assembly/later-presets.cjs")], text=True))
    save_events(events, **stage_payload, PICK_STAGE_PRESETS=presets)
    package_project()
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    build()
