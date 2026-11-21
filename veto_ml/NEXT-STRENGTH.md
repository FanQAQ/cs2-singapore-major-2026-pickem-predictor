# 为什么阿斯塔纳的 NiP 被填进 0–3

**原 ML 认为 NiP 的 0–3 概率是全场第二，最后让它占据卡位的是第 16 种子。** 主种子 33719 的 12,000 条独立检验路径给 NiP 35.72% 的 0–3 概率、12.73% 的晋级概率。ODDIK 的 0–3 概率更高（42.06%）。现行填法先选八支晋级队，再从剩余八队中挑初始种子最末的两支作 0–3。30 组种子都填了 NiP 和 HOTU。NiP 最后 3–2，HOTU 1–3，ODDIK 2–3。模拟中的 35.72% 并不预言必然出局；此例可分别检查强弱估计和卡位规则。[阶段概率和卡](cards.json) · [填卡代码](../engine/engine.js)

| 赛前或赛后核对项 | NiP | HOTU | ODDIK | M80 | GamerLegion |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3 月种子所据的全球名次 → 5 月公布的全球名次 | 185 → 44 | 151 → 54 | 67 → 83 | 36 → 34 | 13 → 9 |
| 原 ML 可继承的过去一年地图数 | 36 | 31 | 269 | 162 | 120 |
| 对其余 15 队各打一场的 BO3 平均胜率 | 31.11% | 33.89% | 22.44% | 33.68% | 67.10% |
| 原 ML 主种子模拟的 0–3 概率 | 35.72% | 24.10% | 42.06% | 23.82% | 3.03% |
| 实际瑞士轮 | 3–2 | 1–3 | 2–3 | 0–3 | 0–3 |

对照包含同场全部 16 队，表中选取 NiP、另一个 0–3 卡位、概率最高的队和实际两支 0–3 队。NiP 的 36 张历史地图仅多于 HOTU，其余 15 队中位数为 161 张。模型对 NiP 的 15 个可能对手只在面对 ODDIK 时给出过半胜率，首轮对 Virtus.pro 为 21.1%。原模型已使用 5 月榜 977 分，开幕五人与 5 月榜完全相同，与 3 月榜共享四人。NiP 五人的 ADR、KAST 等基础数据均有覆盖；按当时版本可核验的个人 Rating 在这届全部 80 人均缺。排名、地图覆盖、个人数据和种子各自可查，现有观测无法分解哪项输入造成了多少胜率变化。[开幕五人与两期 VRS](astana-field.json) · [模型输入](astana-ml/ml-queries.json) · [完整 16 队诊断脚本](strength_diagnostic.py)

### 赛前就能查到的缺口

NiP 在 1 月以 r1nkle、Snappi、sjuush、arrozdoce、ewjerkz 组队。Snappi 在开赛前的采访解释了新核心拿不到邀请、初期使用 JACKZ、随后通过公开预选和较小 LAN 积累排名的过程。阿斯塔纳欧洲闭门预选有 32 队争一个名额；NiP 在其中 6 胜 1 负，胜过 B8、fnatic 和 Metizport。4 月拉斯维加斯又击败 NRG 和 Sharks 夺冠。按统一的赛前 90 天窗、相同至少三人核心、归档可核实且已留一个跨夜日的系列，NiP 共 21 胜 9 负；同为资格赛晋级的 HOTU 为 11 胜 2 负，却只在主赛赢一场。这些对手和赛级不同，不能把资格赛胜率直接当作 Major 级别胜率。[NiP 公布新阵容](https://nip.gl/pages/new-look-ninjas) · [Snappi 于 4 月 29 日的采访](https://www.dust2.us/news/60816/snappi-on-the-vrs-grind-its-a-slow-climb-where-you-need-to-take-every-step) · [欧洲资格赛赛程](https://www.hltv.org/news/41334/snappis-nip-end-hunt-for-first-lan-with-pgl-astana-qualification)

原地图 ML 读取 HLTvy 时调用七步禁选解析器，该入口只接受 BO1 和 BO3，**两个有完整比分、阵容和对手积分的 BO5 决赛因赛制被跳过**。4 月 1 日 NiP 3–2 击败 Metizport；按当日已公开榜，双方分别 646、974 分，NiP 沿用四人。4 月 28 日 UTC，NiP 3–0 胜 Sharks，双方分别 820、860 分，十人均可匹配当期排名。两场合计 6 胜 2 负的八张图均未进入原 ML。其余队同样漏掉赢图和输图。16 队合计九场不同 BO5、33 张实打地图，九场双方均能通过赛前至少三人的 VRS 校验。放回八张图会怎样，仍须重训后检验。[原 ML 解析入口](../f1bre_models/ml_prepare.py) · [已支持 BO5 的独立地图校验](../f1bre_models/elo_inputs.py) · [欧预决赛地图](https://www.hltv.org/matches/2381016/ninjas-in-pyjamas-vs-metizport-pgl-astana-2025-europe-closed-qualifier) · [拉斯维加斯决赛地图](https://www.hltv.org/matches/2382112/sharks-vs-ninjas-in-pyjamas-fragadelphia-las-vegas-2025)

在原 ML 的 13 个已完成 Major 阶段，主种子共填 26 个 0–3 格，11 个命中，5 支被填队最终晋级。四个发生在 Stage 2，奥斯汀的 Lynn Vision、Legacy 和布达佩斯的 PARIVISION、Imperial 都是从 Stage 1 以 3–2 晋级。另一个是科隆 Stage 1 的 FlyQuest。外部四场的八格中只有 NiP 最终晋级。阶段晋级队有刚打完的上阶段为证，NiP 的可用信号来自欧洲预选和地方 LAN，两类应分别报告。[各阶段封存的模型研究卡](cards.json)

### 下一项固定检验

第一条命令可复算完整 16 队、同窗口 BO5 源 ID 和所有 34 格的真实结果。要逐场校验九场 BO5 的双方榜单，加 `--ranks` 指向项目已有的 Valve 快照缓存。

```text
python veto_ml/strength_diagnostic.py
```

1. **只改变历史覆盖。** 对所有队补入公开归档中实打 BO5 的地图，复用既有比分、MR12、五人、日期、三人核心和双方赛前 VRS 核验。以系列 ID 加地图名去重，排除开图优势、弃权和身份歧义。保留此前全部排除集。用增补图刷新双方历史特征与选手基础计数；训练和校准的目标地图 ID、划分、超参数、30 天半衰期、抽图分布算法、16 队种子与填卡程序在两臂一致。地区、冠军称号和种子升幅均不另加手工分。每个目标的 120 对 BO3 全部冻结后才能读取该阶段实际赛果。
2. **先登记外部检验。** 选择 2025 年 10 月 26 日开赛的 PGL **Masters** Bucharest。它有 16 队全 BO3 瑞士、赛前首轮公告，项目此前整卡用过的是 2025 年 4 月 Bucharest 和 2026 年 10 月 Masters。该届只作一次该方法的外部整卡检验；部分较晚阶段的原始训练史可能含其比赛。成立前须确认两队赛前阵容、最新 VRS、真实种子及五轮 33/33 重放，缺证列出。用目标自身开始日前的数据，完全隔离其对局。阿斯塔纳此时已用于发现问题，只能作为开发案例。[10 月 21 日公布的首轮](https://www.hltv.org/news/42988/pgl-masters-bucharest-opening-matches-set) · [PGL 赛事介绍](https://www.youtube.com/watch?v=jlRZ9Poylsg)
3. **固定分母。** 每阶段全部实打 BO1 与 BO3 分别计 Brier、对数损失；16 队均计 0–3 事件 Brier，每张卡两个 0–3 槽与十格和过关另计。在五届 S1、五届 S2、三届真实 S3 及外部留出分别报告，沿用 30 组共同路径，每组训练与复核各 12,000 条。另对同一原 ML 矩阵展示初始种子填法与现有纯概率填法的 0–3 差别，保持填法对照独立于新数据。先验证资料覆盖是否增加，再判断单场、0–3 概率和实际过关是否一并改善。
