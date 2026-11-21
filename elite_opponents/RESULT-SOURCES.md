# 克卢日 2025 首阶段赛后核对

这份核对专供评分。赛前建模只读取各队赛前五人、截止日排名和此前已完成的比赛。克卢日这次的赛后资料来自 PGL 官方赛事页供「Results → Groups」按钮读取的数据，以及固定版本 HLTvy 保存的 HLTV 比赛记录。两个来源均逐场列出双方、比赛日期和比分。[主办方页面](https://www.pglesports.com/cs2/pgl-cluj-napoca-2025/) · [页面公开的原始数据](https://www.pglesports.com/_next/static/chunks/app/cs2/pgl-cluj-napoca-2025/page-57328c2d57fb9ba3.js) · [固定版本 HLTV 归档](https://raw.githubusercontent.com/zugzugs/hltvy/1a00ba2893a63646f0d940e626b6da95d342a187/results.json.gz)

2025 年 2 月 14–18 日，五轮分别实打 8、8、8、6、3 场。33 场都是 BO3，20 场以 2–0 结束、13 场以 2–1 结束。两源的 33 场系列胜者、比分、所有 79 张实打地图及其回合比分一致。主办方的「de_dust 2」和归档的「Dust2」统一为同一张地图，未打的决胜图不计实打。每场在原始归档均可核实当时十人的五对五名单。根据全部五轮逐队累计算出 2 支 3–0、3 支 3–1、3 支 3–2、3 支 2–3、3 支 1–3 与 2 支 0–3。全胜的是 FaZe 和 The MongolZ，第三轮分别战胜 MOUZ、paiN。[逐场赛后事实](truth.json) · [HLTV 赛事总表](https://www.hltv.org/events/8043/pgl-cluj-napoca-2025) · [FaZe 第三场](https://www.hltv.org/matches/2379346/mouz-vs-faze-pgl-cluj-napoca-2025) · [The MongolZ 第三场](https://www.hltv.org/matches/2379348/pain-vs-the-mongolz-pgl-cluj-napoca-2025)

正式评分按赛前种子顺序对齐 16 队，保留每场的轮次、两队、实打比分和依据。验证全部 33 场两两配对后再考虑整卡。审计采用比赛系列胜负，BO1 和 BO3 按当时真实赛制分开。奥斯汀与布达佩斯的第三阶段各有 20 场 BO1、13 场 BO3，科隆第三阶段有 33 场 BO3。这三届用于开发，在独立留出之外报告。调整只用于 BO3，BO1 的两臂概率相同。[三届既有比赛事实](../veto_ml/cards.json) · [逐场 BO3 来源与打图信息](../veto_ml/truth.json.gz) · [预先登记的检验](../bo5_history/NEXT-ELITE.md)

评分器要求调用者提供封存文件及经确认的 SHA-256，核对后才读取这次的实际比赛。eligible 代表至少一侧核心满足历史场次条件且对手属于目标时点世界前八，changed 代表 BO3 胜率数值实际变化。只有全体 33 场和 eligible 子集上的 Brier、对数损失四项都严格下降，且 33/33 配对成功，才执行同种子的整卡对照。单场概率、比分都按文件列出的 A、B 队顺序。独立验卡使用固定的 30 个种子，每种子每臂分别以 12,000 条路径搜索、12,000 条独立路径审计。所有 16 队的 3–0 Brier 用审计概率；过关、十格和 3–0 命中按实际赛果。[评分器](score.cjs)

## 概率修正的正式结果

**克卢日全部四项检验均退步，未启动候选的 30 种子整卡模拟。** 33 场中有 8 场符合触发条件，8 场胜率均实际发生变化，另外 25 场两臂相同。8 场中只有 Falcons 胜 MOUZ 一场提高了实际赢家的赛前胜率。FaZe 在三连胜过程中的两场尤其突出，对 MOUZ 的胜率由 57.70% 降至 40.41%，对 Eternal Fire 由 48.63% 降至 36.41%。这次独立检验支持保留原地图胜率。[每场两臂概率、比分及四项门槛](scores.json)

| 赛事与分母 | 实打 BO3 | Brier 原 → 修正 | 对数损失原 → 修正 |
| --- | ---: | --- | --- |
| 克卢日，首次外部检验 | 33 | .19688 → .21542 | .57727 → .61616 |
| 克卢日，预定触发子集 | 8 | .18726 → .26374 | .56102 → .72141 |
| 奥斯汀 Stage 3，开发 | 13 | .16086 → .17019 | .48801 → .51866 |
| 布达佩斯 Stage 3，开发 | 13 | .23133 → .23057 | .65655 → .65897 |
| 科隆 Stage 3，开发 | 33 | .21025 → .22030 | .59798 → .62337 |

首次矩阵封存后、任何模型评分之前，发现 2 月 12 日已经发表的开赛指南将 tory 列为 Imperial Valkyries 的首发、bubble 列为教练。首版保留但从未送入评分。修正首发后重新训练并封存的二版是唯一用于评分的矩阵；评分程序拒绝接受首版 SHA-256。二版确定的 16 队赛前五人与 33 场实打的全部 66 侧阵容逐人一致。开发集逐场的 day 为 HLTV 归档中的 UTC 开赛日，另以 stageArchiveDay 保留原库日期。奥斯汀有五场、布达佩斯有两场原库日期晚一个日历日，同一比赛的轮次、队名与胜者均已核实。[2 月 12 日赛事指南](https://www.hltv.org/news/40977/pgl-cluj-napoca-2025-teams-format-schedule-prizes-talent-fantasy) · [二次封存原件](matrices-v2.json) · [开发集逐图实绩](truth-development.json)

从仓库根目录可用两份公开原件离线核对事实。输入 SHA-256 分别为 HLTvy 的 `750b0da45142fc797eddb708698d14d269237e59784d6a1d066eddba0ba31551` 和主办方赛事数据的 `ac9e479c9cbcaa00d34b8c4259e66998acc14992b363b2d56105d6ddd6cae92b`。

~~~sh
python elite_opponents/truth.py --archive /path/to/results.json.gz --official /path/to/page-57328c2d57fb9ba3.js
node elite_opponents/score.cjs --matrix elite_opponents/matrices-v2.json --sha256 6b6c8e6d562f402ceaa9ef84e434e810250da556487c7d4752d0e6a7f8838fc9 --check
~~~
