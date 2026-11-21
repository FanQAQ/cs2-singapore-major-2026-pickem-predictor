# 赛事内队伍状态的下一项检验

以下是拟合及查看候选卡分前登记的训练方案。2026-11-21 已从两份源档重建完整赛程、按独立赛事估计参数，并完成正式阶段与留出赛事的验证。[训练记录](TRAINING.md) · [整卡结果](TRAINED-RESULTS.md)

1. 对既有 17 个阶段的各自赛前窗口复用 12,804 个已验证 BO3 的档案，再为 2026-02-14 开赛的 PGL Cluj-Napoca 补建同样的 180 天窗。Cluj 本届从所有估参中排除。比赛早于目标开赛，积分榜已在对局前公布，双方各自实际五人有唯一至少三人核心。[逐场资料与发布时间](../tail_calibration/TRAINING.md)
2. 先从两份固定版本的原始赛程整理所有 BO 和缺统计比赛，再对训练行配对。要求同一来源、同届同一赛事、同队连续两次出场、不同日期和不同对手，保留至少三名可区分的共同选手。保留原赛事名称、资格赛地区与原始 ID。遇赛区不明确、同日顺序不明、核心有多个等强匹配或中间另有比赛，不能形成相邻对。分别记录共享五人、四人、三人以及缺失原因。
3. 在目标之前的同一历史窗，用已有 VRS 校准斜率给出各场赛前胜率 p。该斜率是对训练人群内的辅助拟合。先算各队视角残差 y−p，再算同队相邻两场的残差乘积。队伍在一个赛事中的多对观察等权平均，再在赛事内对队伍等权平均，最后对赛事等权平均。以赛事为聚类单位计算平均协方差与 95% 区间。
4. 与现有引擎一致，每队在整届某次模拟中取同概率的 +s 或 −s。对每个 p 重心校正，使四种双方状态组合的平均比赛胜率严格等于 p。设 d(p,s) 为本队处于正状态或负状态时、平均掉对手状态后两种胜率之差的一半。同队对不同对手的理论残差乘积为 d(p₁,s)d(p₂,s)。按步骤 3 的相同权重求其平均，以二分反解 s，范围沿用既有 [0,0.5]。协方差非正，或总相邻对少于 40，或独立赛事少于 10 时取零。记录触及上限、样本量、时间覆盖以及区间。每个目标只估一个全体共用尺度。[已有状态引擎](../engine/engine.js) · [早期线性近似](../region_risk/build.py)
5. 输出在 `latent_form/training.json` 的 `targets[id]`，包含 start、cutoffExclusive、series、events、teamEvents、pairs、scale、covariance、covarianceCI95、coreOverlap 与排除计数。

## 训练前的原始数据核验

从项目根目录运行以下命令。第一条只需 Python 标准库，第二条复用原项目的 NumPy、SciPy 环境。目录中的榜单需符合 `tail_calibration/training-releases.json` 列出的固定提交和哈希。两种数据源均已逐字节对过，44 期 Valve 排名的 74 份原表全部匹配。12,804 条 BO3 的带前缀比赛 ID 全部能回连到原始赛程，赛事名、UTC 日或原显示日期与训练行一致。[来源版本、下载和运行方式](../tail_calibration/TRAINING.md)

```sh
python -B tail_calibration/training_audit.py
python -B tail_calibration/training.py --hltvy results.json.gz --ektarr cs2_all_tiers_games.csv --ranks valve-release-cache
```

重建相邻关系需要额外读取原始赛程。HLTvy 的 `results.json.gz` 按系列一行，含 `match-id`、UTC 毫秒、事件名、阶段、BO、双方俱乐部 ID 和逐图选手。2023-09-27 至 2026-03-23 共 24,582 行。Ektarr v11 的 CSV 包含逐图行与系列总行，2026-03-25 至冻结日共有 2,371 个不同 `match_id`。其中 4,742 个 `team1_id`、`team2_id` 各自只出现于一个系列，不能标识跨场队伍。须从同一来源、同届同赛区的俱乐部名称和可辨选手核心重建身份，并保留每次出场。仅在末端选两场合格 BO3。原始比赛缺个人统计、非 BO3 或行政判胜时仍能阻断相邻。对同名参赛实体、历史改名和地区不明确的资格赛，单列无法确证的匹配。Ektarr 的 `7287899` 与 `7298940` 均将同一场 Astana 欧洲预选用英、俄两个赛事名记录，按 `match_id` 去重并保留两个原标签。Ektarr 区间日期含时区不确定性，两场可能 UTC 日期相交时需单独记数。

各目标取 180 个自然日。实际有可用 BO3 的日数见表。「有观测日」按去重后的 `day` 计，不能视为其余日子没有比赛。Cluj 在本研究方案中事先登记，后来也用于 F1bre 对照。它的窗口已包含在现有资料并集中，无需追加网络采集。在 EPL S23 和科隆三个阶段的每个训练窗中，原来各有 40 场事件名恰为 `PGL Cluj-Napoca 2026` 的比赛，含淘汰赛。**拟合辅助 VRS 斜率和估计相邻残差协方差都须剔除这 40 场。** 同城其他年份另有比赛，按确切届次识别。

| 目标 | 剔除后 BO3 | 有观测日 / 180 | 最早至最晚观测日 |
| --- | ---: | ---: | --- |
| 奥斯汀 Stage 3 | 2,567 | 172 | 2024-12-14 至 2025-06-10 |
| 布达佩斯 Stage 3 | 3,381 | 179 | 2025-06-07 至 2025-12-02 |
| 科隆 Stage 3 | 2,132 | 147 | 2025-12-13 至 2026-06-08 |
| EPL S23 第二阶段 | 3,431 | 173 | 2025-09-07 至 2026-03-04 |
| Cluj 2026 | 3,114 | 173 | 2025-08-18 至 2026-02-12 |
| 新加坡 Stage 1 | 545 | 121 | 2026-05-26 至 2026-11-14 |

可用下列标准库代码离线重算表中系列数、日期和排除数量。原来的 17 个目标直接读各自窗口。Cluj 另加一个开赛前窗口。新加坡按数据冻结日 11 月 21 日截止。

```python
import gzip, json
from datetime import date, timedelta

with gzip.open("tail_calibration/training.json.gz", "rt", encoding="utf8") as file:
    data = json.load(file)
windows = {k: (v["windowStart"], v["cutoffExclusive"]) for k, v in data["targets"].items()}
windows["cluj-2026"] = ("2025-08-18", "2026-02-14")
for target, (start, cutoff) in windows.items():
    rows = [r for r in data["rows"] if r["earliestUtcDay"] >= start
            and date.fromisoformat(r["latestUtcDay"]) + timedelta(days=1) < date.fromisoformat(cutoff)]
    eligible = [r for r in rows if r["event"] != "PGL Cluj-Napoca 2026"]
    days = sorted({r["day"] for r in eligible})
    print(target, len(eligible), len(days), days[0], days[-1], len(rows) - len(eligible))
```

新加坡窗口仅有 Ektarr 资料。准备度检查按同一赛事与参赛队名串联完整赛程，跳过全部资格赛、同日有多场的端点、UTC 可能日期重叠、同一对手和不足三人核心的组合，得到 46 对候选、8 个原赛事名。它提示正式实现必须披露覆盖缺口。这一筛查尚未完成改名及资格赛消歧，也未拟合参数。完成核对后若仍不足协议规定的 10 个独立赛事，则该场地取零尺度。
