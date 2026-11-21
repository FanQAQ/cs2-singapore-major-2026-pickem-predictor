# F1bre 阵容 Elo

这项研究复刻 F1bre 的赛前 Elo 概率生成器，并用各届当时的阵容、积分和比赛重建输入。作者公开的队伍、完整比赛、选手数据是样例，无法还原其私人数据库或逐队原始预测。相同点为 180 天回放、VRS 标准化、选手评分先验、K 权重、分差校准及按 BO 类型积分的临场波动。[作者 Elo 固定版本](https://github.com/holygodly/CS2-Major-ELO-PickEm-Predictor/blob/919476c8a97227a407f5950cff82c1d76152be7f/cs2_gen_preresult.py) · [作者 ML 固定版本](https://github.com/holygodly/CS2-Major-ML-PickEm-Predictor/tree/bb5d4e5f1cf33f3b7dfbbe720954d861a52ecafb) · [实验预注册](ELO-PROTOCOL.md)

## 输入可以追溯到哪里

作者的新加坡二编正文给出 DENDELE 继承 Sharks 后初始约 1187，原帖的实力评分配图仍显示 762.4。本项目的 1187.13 来自按五人核心重建的输入。原帖这张配图与文字所对应的版本存在差异。[F1bre 新加坡原帖](https://www.xiaoheihe.cn/app/bbs/link/197229714)

`elo-data.json.gz` 中每场保留来源 ID、原赛事名、日期与时间、两队当场五人、赛制和每张实打地图的回合比分。完整资料共有 23,524 场，HLTV 档案贡献 22,617 场，Ektarr v11 贡献 907 场。HLTV 取 2023-09-27 之后可核实的 CS2 MR12 比赛，截至 2026-03-23；最早实际保留的是 2023-10-04。Ektarr 只接在其后，并在日期交界保留一天间隔。系列内换人、无法验证十人、地图与系列赢家不符、缺合法图分或明确行政判胜的记录不训练。Ektarr 的完整地图要求同场十个选手 ID 一致、每队确有实战击杀；源表没有原始 Rating 字段。[HLTV 档案固定版](https://github.com/zugzugs/hltvy/tree/1a00ba2893a63646f0d940e626b6da95d342a187) · [Ektarr v11，CC BY-SA 4.0](https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11)

上述 23,524 场包含 4,119 场 BO1、19,178 场 BO3 和 227 场 BO5，共 51,020 张实打地图。原始 HLTV 数据中有 24,582 个候选系列，Ektarr 时间段有 1,403 个候选系列；这些是来源实际收录范围。每个目标只使用其时间窗内的数据。核验后的压缩事实档 SHA-256 为 `5e2c5d6af8a1d6af8b4626611aedef9e01d2775556b6259825476d2f9707ffe6`。

初始 VRS 取窗口起点之前已公布的最后一期榜，总共用到八次发布。全榜只按不分大小写的队名保留最高分计算总体均值、标准差和线性插值第 5 分位。阵容仍按有五人佐证的榜单行识别。早于 2024 年 8 月使用当时的地区表合并。各场地输出实际榜日、原始 Git 提交及公布时间。[44 次原始发布与哈希](../tail_calibration/training-releases.json) · [Valve 排名仓库](https://github.com/ValveSoftware/counter-strike_regional_standings)

HLTV 曾替换过全站历史比赛的 Rating。因此，仅在比赛日期早于窗口起点并且评分档案也已公开时使用该评分。2026-03-24 14:38:06 UTC 固定发布的 `results.json.gz` 可以用于新加坡五月的起点。更早的起点使用归档时间也已核实的赛后原帖，取完整系列五人评分，或 BO1 的唯一一图。每个 HLTV 比赛 ID 只计一次；一个目标核心在某场最多计一侧。每队保留起点评分、使用的原比赛 ID 及最晚可用时间，缺可信资料时明确取 1.0。[固定发布](https://github.com/zugzugs/hltvy/commit/1a00ba2893a63646f0d940e626b6da95d342a187) · [HLTV 对历史 Rating 的更新说明](https://www.hltv.org/news/40051/introducing-rating-21) · [原帖采集程序](player_priors.py)

## 一场比赛怎样更新

1. 比赛开始时按双方实际登场五人各找唯一最佳历史核心。至少三人相同才能继承。选手改投新队后，后续对局按新去向判断。相同队名不能使失去核心的队继承 Elo；改名且核心保留仍可继承。对榜单上有多个候选的选手，实际五人须给出唯一最佳匹配。每次比赛只根据当时可见的阵容写入队史，最终报名名单在回放结束后用于读取参赛队 Elo。
2. 有排名的队使用 `1000 + 200 × z` 并限制在 400 至 1600，再以 70% VRS 和 30% 经可信度修正的 Rating 合并。无排名以全榜第 5 分位为基点。本实现对所有比赛中的队伍统一初始化。作者只给目标队使用 70/30，其他队用完整 VRS；统一规则避免把未来参赛身份用于过去的赛程。缺 VRS 时先验的 10/30 场分界采用可验证的先验比赛数，作者的完整 CSV 历史出场数未公开。
3. 每场胜负更新一次 Elo。K=40，乘以 BO1/3/5 的 0.8/1/1.2、离目标截止的 50 天指数衰减和 0.5/0.75/1 的对手可靠性。已有 VRS 队按作者的 15 场可靠度起步。阶段胜率先压缩场地内 Elo 分差，再把两队独立的赛前波动积分。全场只有 BO3 时仍提供 BO1 的反事实概率，实际赛制由计分器决定。
4. 每个历史目标均在开赛日之前结束训练。HLTV 的 UTC 比赛开始日留一个完整自然日给跨夜赛程；Ektarr 的无时区日期另外两端各留一天。只要可信时间跨界即剔除，可能漏掉前一阶段的最后一日。180 天窗口中缺席覆盖的赛事不能贡献 Elo；当前报名队均有至少一场可继承的已核实比赛。Cluj 2026 整届未用于任何目标的回放或选手先验。

## 各阶段的实际覆盖

每格依次为该阶段的窗口内实打系列数／有合格选手先验的参赛队数。每格的参赛队分母均为 16，每个场地 16 队都继承到了真实比赛。哥本哈根两阶段的 180 日窗口起点都早于 CS2 正式发行，因此所有队的 CS2 选手先验均为 1.0。

| 场地 | Stage 1 | Stage 2 | Stage 3 |
| --- | ---: | ---: | ---: |
| 哥本哈根 2024 | 3,272／0 | 3,341／0 | — |
| 上海 2024 | 4,668／13 | 4,546／15 | — |
| 奥斯汀 2025 | 4,424／15 | 4,390／16 | 4,415／16 |
| 布达佩斯 2025 | 4,865／16 | 4,874／16 | 4,912／16 |
| 科隆 2026 | 3,361／15 | 3,269／16 | 3,227／16 |
| 新加坡 2026 | 695／15 | 待确定 | 待确定 |

Cluj 单一瑞士轮留出使用 4,819 场、11,065 张图，16 队均有合格选手先验。新加坡的窗口使用 95 场 BO1、584 场 BO3 和 16 场 BO5；只有 GOSH 的起点缺合格评分。DENDELE 用五人继承 Sharks 的 1,334 分 VRS，开窗时可核实 44 场选手评分，收缩后的队均先验为 1.1441，初始 Elo **1187.13**。该核心在 180 天内回放 14 场，阶段模拟前的 Elo 是 **1165.21**。末期对局来源的收录较稀疏，分数不代表完整职业生涯。

方法与来源相同的 15 份矩阵已全部复算，压缩结果 SHA-256 为 `f0b5dede43ee4556d7595eccdd60d5ef2b32b23674d1fc2ca2605f9e550be74a`。[压缩胜率与各队来源](elo.json.gz) · [历史评分与覆盖](PLAYER-PRIORS.md)

## 复算

模型与独立检查只读取下载包内的资料。逐场来源重建另外使用原始 CSV、HLTV 的压缩 JSON 和已经核对 SHA 的 Valve 历史快照缓存。原始解析复用项目的 NumPy 与 SciPy 依赖。数值审计用另一种高斯积分网格独立复算全部 3,600 个赛制配对概率，以及各队起点 Elo、阵容覆盖与时间窗。[公共积分抓取入口](../tail_calibration/training_fetch.py)

```sh
python f1bre_models/elo.py --check
node f1bre_models/elo_check.cjs
python f1bre_models/elo_inputs.py --fetch /path/to/match-cache
python tail_calibration/training_fetch.py /path/to/valve-release-cache
python f1bre_models/elo_inputs.py --hltv /path/to/results.json.gz --ektarr /path/to/cs2_all_tiers_games.csv --ranks /path/to/valve-release-cache --check
```
