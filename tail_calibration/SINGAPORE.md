# 新加坡首阶段的 BO3 赛前校准检验

四套预测于北京时间 **2026 年 11 月 21 日 18:23:48** 封存。赛事方当时将首场安排在 11 月 24 日 12:00，Valve 官方锁盘的精确时间未获核实。此次封存使用真实生成时刻。原推荐、两套校准与两套基础概率的比较均以第一阶段为限，成绩待赛后核验。[赛事方赛程与时间证据](../stage_goals/singapore-schedule.json) · [原推荐封卡](../forecast_archive/singapore-stage1-seed-conditional-2026-11-21.json) · [下载四套研究预测](singapore-study.json)

| 研究方法 | 3–0 | 普通晋级 | 0–3 | 模型模拟过关率 | 模拟期望命中 |
| --- | --- | --- | --- | ---: | ---: |
| 生产推荐 · 原始 BO3 | Ninjas in Pyjamas、Eternal Fire | PARIVISION、HEROIC、FaZe、Liquid、100 Thieves、Imperial | Chinggis Warriors、Lynn Vision | 25.27% | 3.62 |
| 生产推荐 · 校准 BO3 | 同上 | 同上 | 同上 | 26.39% | 3.66 |
| Valve 积分 / 400 · 原始 BO3 | Ninjas in Pyjamas、PARIVISION | HEROIC、FaZe、Liquid、Eternal Fire、100 Thieves、M80 | Chinggis Warriors、Lynn Vision | 32.30% | 3.91 |
| Valve 积分 / 400 · 校准 BO3 | 同上 | 同上 | 同上 | 22.64% | 3.49 |

校准改变了胜率，在固定种子下两组各自的十格选人保持一致。完赛后，四套预测可以分别检验 BO3 概率误差，但两组各自的整卡分数将相同。表中过关率来自各自模型独立的复核路径，无法用它比较哪张卡在现实中更可靠。原生产推荐的十格、每队四种结局概率、过关率、期望命中和 0 至 10 格的模拟分布逐项通过了原封卡比对。

**两条线分别训练。** 生产推荐校准使用此前 13 个完整 Major 阶段的 189 场 BO3，最晚比赛日为 6 月 15 日，斜率为 1.14955。该项直接使用预注册评估中保存的赛前胜率，统一换算到胜方视角，封存时与历史赛前模型逐场重算所得的斜率差小于 10⁻¹²。Valve 积分线使用 545 场双方均保留至少三名原首发的 BO3，训练窗口从 5 月 25 日至 11 月 21 日之前，最新可用比赛为 11 月 14 日，斜率为 0.29687。新加坡使用 11 月 2 日的 Valve 积分与赛前确认首发。两组均保留原推荐 BO1。[预注册协议](PROTOCOL.md) · [样本和截止](TRAINING.md)

**复算和评分。** 封存包含 120 种配对的 BO1 与四套 BO3 胜率、16 支队伍的四类结局概率，以及四张卡。生产种子为 33719，选卡与复核各用 12,000 条路径。研究封存有效载荷的 SHA-256 为 `974365c59195d943c967d29a7812924c0df99844ad0133eb1288c712b3cc511b`。在项目根目录执行以下只读命令。

```sh
node tail_calibration/singapore.cjs --check
node tail_calibration/singapore.cjs --score
```

评分与网站共用 `forecast_archive/prospective/results/singapore-2026-stage1.json`。没有正式赛果文件时返回「待评分」。有文件时先按官方域名、证据文件、赛后日期、16 队种子、每场赛制及五轮 33 场配对核验，再分别输出十格命中、各栏命中队、是否过关，以及 BO1 和 BO3 的场数、Brier 与自然对数损失。遇到弃赛，录入赛果时须在该场写入 `"played": false`。行政判胜影响十格，单场误差只计实打场次。省略该字段表示这场比赛实打。[正式结果读取与重放](../stage_goals/prospective.cjs) · [官方来源核验](../stage_goals/public-records.cjs)
