# 阿斯塔纳 2026：地图 ML 能否取代全 BO3 场地的正式推荐？

在还原的 PGL Astana 全 BO3 瑞士轮中，**正式推荐、地图 ML 的常规预算卡和大预算卡各中 6/10**，分档均为全胜 1/2、普通晋级 4/6、全败 1/2。三套方案各自的 30 个固定种子全部过关。正式推荐在一组中命中 5 格，其余 29 组命中 6 格。地图 ML 的两种预算在这 30 组都中 6 格。真实赛事只有一届。[事先确定的检验](../NEXT-FULL.md) · [逐组卡面和独立审计](scores.json)

| 33 场实打 BO3 | Brier，越小越好 | 对数损失，越小越好 |
| --- | ---: | ---: |
| 正式推荐胜率 | 0.20177 | 0.58857 |
| 地图 ML 胜率 | 0.18929 | 0.55705 |

主种子的正式卡与大预算 ML 卡给出相同十格选择。地图 ML 在该场地改善了单场预测，额外路径没有增加主卡的命中。三组快速初筛的正式推荐分别中 5、6、6 格，地图 ML 各中 6 格。日常先用小样本。本次完整比较沿用已经登记的种子及预算用于检验外推。[主卡与快速筛选](cards.json) · [大预算主卡](candidate-large.json)

## 阵容、时间和赛制

- 首轮对阵逐组匹配 4 月 6 日的积分顺序。实力快照取已经公布的 5 月 4 日排名；瑞士轮 5 月 9 日开赛。赛前报道确认 MOUZ、Falcons、Fisher College 及 K27 的换人。K27 的 fame 接替 relaxxie，四人核心保留。临时版曾照用榜上五人，现保留原卡及原胜率。更正后 K27 的单场 BO3 胜率最大变化为对 magic 的 3.15 个百分点。[首发与逐队来源](field.json) · [K27 的赛前报道](https://www.hltv.org/news/44439/k27-sign-fame-on-short-term-loan)
- 对照采用实际网站模型入口、基于更早四届赛事选出的默认特征，重建 1,442 场双方报告、931 场近期拟合样本、赛制校准及地区排名。地图 ML 使用 12,331 张训练地图和 2,068 张校准地图，输入最晚 5 月 1 日。赛果只在锁定修订卡后评分。该场地是历史回放，首发另用开场实际五人核验。[正式实力输入](v4-strength.json) · [赛制校准](format.json) · [地区排名](region.json)
- 33 场比分分别核对 Ektarr 和 Pushbuild，五轮配对全部重现。Fisher College 的 TH0R 在 Ektarr 使用曾用名 th0rsteinnf。5 月 11 日对 The Huns 的系列赛在 Ektarr 缺少选手名单，另核对十名实际选手。附加资料只用于回放审计。[逐轮赛果](actual.json) · [这场的十名首发](https://www.hltv.org/matches/2394139/the-huns-vs-fisher-college-pgl-astana-2026)

用源文件复算时，先运行 `field.py`、`valve_inputs.py`、`strength.py`、`classic.py`、`region.py`、`series_format.py` 和 `forecast.py`，各项命令接受 `--help`。再运行 `node f1bre_models/format_split/astana/lock.cjs`、`python f1bre_models/format_split/astana/actual.py --ektarr /data/cs2_all_tiers_games.csv --pushbuild /data/cs2_liquipedia_series.csv` 和 `node f1bre_models/format_split/astana/grade.cjs`。对照文件如有差异会报错；已保存的结果可以直接查看。
