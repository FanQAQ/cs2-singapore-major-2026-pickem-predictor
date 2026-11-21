# BO3 强弱校准使用的赛前 VRS 对局

训练集有 **12,804 场唯一的实打 BO3**。每场记录双方实际五人、对应的赛前 Valve 积分、地图比分和真实赢家。积分差为 A 队减 B 队的整数积分，换算基础胜率时使用 `1 / (1 + 10 ** (-gap / 400))`。这套数据只训练原始 VRS 胜率的斜率。网站推荐模型使用自己过去做出的赛前胜率，见 [校准协议](PROTOCOL.md)。

每个目标取开赛前 180 个自然日。新加坡首阶段尚未开赛，本次资料冻结于 2026-11-21 00:00 UTC，最后一场可核实比赛在 11 月 14 日。各阶段的完整时间窗、实际首末样本日、来源排除原因及索引都保存在 `training.json.gz`。不同目标的窗口可以重叠；同一场比赛在每个目标的模型中只计一次。

| 赛事 | Stage 1 | Stage 2 | Stage 3 |
| --- | ---: | ---: | ---: |
| 哥本哈根 2024 | 1,529 | 1,554 | — |
| 上海 2024 | 2,356 | 2,312 | — |
| 奥斯汀 2025 | 2,584 | 2,562 | 2,567 |
| 布达佩斯 2025 | 3,359 | 3,355 | 3,381 |
| 科隆 2026 | 2,265 | 2,204 | 2,172 |
| EPL S21 | — | 2,143 | — |
| EPL S22 | — | 3,045 | — |
| EPL S23 | — | 3,471 | — |
| 新加坡 2026，赛前 | 545 | — | — |

**逐场实打证据。** 2023-10-04 至 2026-03-23 的有效样本来自固定版 `zugzugs/hltvy`，共 12,088 场。逐场要求原记录为 BO3，至少打完两张地图、赢家达到两图、每张实打地图双方实际五人一致、地图比分与系列赢家一致。每张图第一半场须正好 12 回合，避免 CS:GO 到 CS2 过渡期混入 MR15；复用的历史解析器还要求七图禁选能与实打地图相符。解析缺失会使部分真实 BO3 无法入样。另一段的 716 场取自 Ektarr 固定版 v11。每场所有实打地图必须能关联双方固定的十个选手 ID、合法 MR12 比分、完整系列分以及双方非零实战击杀；保留完整加时比分。两个来源均排除明确标注表演、慈善、弃赛、行政判胜或地图优势的比赛。未标注的赛事性质仍取决于上游记录。网页及数据集是在赛后整理，历史实验属于回溯重建。[HLTV 事实档案固定版本](https://github.com/zugzugs/hltvy/tree/1a00ba2893a63646f0d940e626b6da95d342a187) · [Ektarr v11](https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11) · [Ektarr 派生事实的 CC BY-SA 4.0 许可](https://creativecommons.org/licenses/by-sa/4.0/)

**排名的真实发布日期。** `training-releases.json` 保留 44 次历史发布的原始 Git 提交、精确 UTC 公布时间、文件路径与 74 份原始表的 SHA-256。2024 年 8 月前按当时的地区榜合并，同一阵容、同一积分的跨地区重复行只保留一次；此后取每月第一份官方全球榜，2026 年 9 月同时保留公开修正。特别是榜面写 2026-09-07 的初版在 09-08 23:01:46 UTC 才发布，重算版在 09-09 18:45:20 UTC 发布。按 UTC 公布日严格早于比赛最早可能日期选择最近快照。当时确实没有新榜时沿用最后一份已发布榜，样本中最久相隔 77 天；不同年份采用当时的积分尺度。阵容匹配需要双方各自有唯一最佳三人核心。身份不明的同昵称不参与人数比较。有 15,935 个队侧完整五人一致、6,642 个四人一致、3,031 个三人一致。[Valve 历史提交](https://github.com/ValveSoftware/counter-strike_regional_standings/commits/main/) · [9 月初版](https://github.com/ValveSoftware/counter-strike_regional_standings/commit/d007fa190cda39097a3ddd55bb6455adade117a9) · [9 月修订](https://github.com/ValveSoftware/counter-strike_regional_standings/commit/84ccfa4d751fa3801ae6430097a9a66f104ee131)

**截止与去重。** HLTV 起赛时间为 UTC 毫秒。Ektarr 日期未注明时区，`earliestUtcDay` 与 `latestUtcDay` 分别取显示日期前后一个 UTC 自然日。只有整个可能区间位于目标窗口内，且为过午夜的 BO3 额外预留一整日，才使用赛果。两段数据时域互斥，交界处日期不明的 Ektarr 记录排除。第二层去重按不分 A/B 的完整阵容、各图名称和双方比分进行，比对相邻日期，避免来源内重复或不同 ID 重复。每行包含归属 ID、逐图结果、排名日与 UTC 发布时间，供离线逐条检查。新加坡窗口只有 Ektarr 来源，覆盖比早期完整历史档稀疏，需要按 545 个实际样本解释。

**为何重建训练表。** 原项目 `strategy_v4/series.csv.gz` 的分差来自对局之前的历史 VRS，2024 年和后续资料均按当场阵容回查，部分行可对上 Ektarr 的逐图比分。原档按已有预测场地展开，后期表从该次排名抽取的队伍明细生成；同场可跨预测场地重复，缺比分的小行不能可靠判断 BO 属性。此次改为先读取整份公开对局档后独立还原每一场当时的积分与 BO 类型，训练人口无需用到目标参赛名单。[原表提取方法](../strategy_v4/METHOD.md)

**复算。** 单独核验下载包只需 Python 标准库。源头重建还需项目原有 NumPy、SciPy 依赖、固定版 HLTV 的 `results.json.gz` 和 Ektarr 的 `cs2_all_tiers_games.csv`。`training_fetch.py` 下载并核对原始公布提交的榜单，缓存齐全时无需联网。两份原始对局档的 SHA-256 也在复用的上游解析器内固定。产物 SHA-256 为 `11072635a348e12715aecdc15ea8aef39a18b4cb2ef66d98fa1bd7e32ff4abc1`。

```sh
python tail_calibration/training_audit.py
python tail_calibration/training_fetch.py /path/to/valve-release-cache
python tail_calibration/training.py --ranks /path/to/valve-release-cache --hltvy /path/to/results.json.gz --ektarr /path/to/cs2_all_tiers_games.csv
```
