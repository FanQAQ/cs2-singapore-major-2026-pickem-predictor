# DENDELE 的队史与 F1bre 数据检查

DENDELE 以 Sharks 名义参加了 2026 年科隆 Major。7 月 21 日，Sharks 宣布与 DENDELE 合作并启用新名称。新加坡报名五人 doc、gafolo、koala、maxxkor、rdnzao 与科隆五人全部相同。使用历史名单将这一队视为新队会漏掉完整的五人核心。[Sharks 合作公告及报道](https://www.hltv.org/news/45166/sharks-to-play-as-dendele-following-partnership) · [PGL 新加坡报名名单](https://news.pglesports.com/news/1794219566606-pgl-major-singapore-2026-team-rosters) · [新加坡 11 月 2 日 Valve 榜](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/f8c55f250fdef796d708aa32814587932154fa04/invitation/2026/details/2026_11_02/0029--dendele--doc-gafolo-koala-maxxkor-rdnzao.md)

## 公开 Elo 初始化算法能复算到哪里

采用 2026 年 11 月 20 日作为本次研究截止日，按 F1bre 的公开程序回溯 180 天至 5 月 24 日。此时最新一期 Valve 全球榜发布于 5 月 4 日，Sharks 以 1334 分排第 37，参赛五人完整重合，DENDELE 的名称尚未出现。按原程序保留每个不分大小写队名的最高积分后，全球榜有 326 个名称。该分布的均值为 898.626，标准差为 337.411。[5 月官方原始榜单](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/aac2074bc10fd62a8bf0b2146d7edfb67d224bcf/invitation/2026/standings_global_2026_05_04.md) · [F1bre 的积分换算与 Elo 初始化](https://github.com/holygodly/CS2-Major-ELO-PickEm-Predictor/blob/919476c8a97227a407f5950cff82c1d76152be7f/cs2_gen_preresult.py#L1072-L1204) · [F1bre 的队名查找](https://github.com/holygodly/CS2-Major-ELO-PickEm-Predictor/blob/919476c8a97227a407f5950cff82c1d76152be7f/valve_rankings_lookup.py#L108-L165)

| 查询方法 | 可用的旧队资料 | 初始 Elo |
| --- | --- | ---: |
| 查参赛名 DENDELE | 未找到 5 月排名，采用全榜第 5 百分位 | 737.78 |
| 以新加坡首发反查 5 月完整名单 | 唯一最高重合为 Sharks，五人相同 | 1180.65 |

两组统一采用选手评分 1.00，以便衡量历史名称匹配本身的影响。作者自报的是 762 → 约 1187。本次复算支持差异来自历史身份匹配的解释。精确复现作者数字还需作者当时的截止日、完整选手评分及比赛样本。这里的数值均为窗口开始时的 Elo，之后还有比赛回放与胜率计算。

同一次 16 队审计中，13 队能以当时同名且保留至少三人继续继承。Chinggis Warriors 的五月同名队只保留两人。GOSH 在此五月榜上也找不到唯一的三人核心。这两队缺少足够依据继承五月积分。详细逐队结果保存在 `report.json`。

## 现有封存卡

项目在 11 月 2 日的官方榜上用五人匹配到 DENDELE，积分 1466，世界第 29。基础近况保留 21 场，21 场均是同五人。Major 历史特征认出了科隆以 Sharks 身份出赛的四场、其中一胜；选手经历各记录一届。科隆赛果数据源会用队伍后来的名称展示历史比赛，审计按五个选手识别，并交叉核对当时的官方名称。跨届惯性要求重复证据，此队仅有一届，调整量为零。[科隆赛前 Valve 名单](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/510968f54723dcb698ad3b04d396140fc263c239/invitation/2026/details/2026_06_01/0038--sharks--doc-gafolo-koala-maxxkor-rdnzao.md)

11 月 21 日封存的推荐模型给 DENDELE 对 PARIVISION 首场 BO1 42.04% 胜率。模拟给出 3–0 概率 8.57%、普通晋级 36.03%、0–3 概率 13.83%，封存卡将其留空。校验包括 16 队封存顺序、封存矩阵原文件 SHA-256、各队胜率矩阵摘要，以及该队的封存卡位和各档概率。

## F1bre 两个公开仓库的数据边界

检索时间为 2026 年 11 月 21 日。Elo 仓库公开提交中的比赛与评分文件使用 Team A、Team B 等示例队名，两个发行版本均无附加数据文件。ML 仓库的比赛、地图、选手、Valve 排名文件均为示例，也没有其他分支和已发布版本提供新加坡实数。公开 ML 特征代码包含选手与地图信息、阵容稳定性；部分阵容历史按队名分组，跨名核心仍需核实。两仓都能用于验证方法，示例文件无法作为正式比赛观测。本次输入核验使用有日期的 Valve 原榜和项目已封存的数据。[Elo 示例目录](https://github.com/holygodly/CS2-Major-ELO-PickEm-Predictor/tree/919476c8a97227a407f5950cff82c1d76152be7f/data) · [Elo 发行版本](https://github.com/holygodly/CS2-Major-ELO-PickEm-Predictor/releases) · [ML 示例目录](https://github.com/holygodly/CS2-Major-ML-PickEm-Predictor/tree/bb5d4e5f1cf33f3b7dfbbe720954d861a52ecafb/data) · [ML 阵容历史处理](https://github.com/holygodly/CS2-Major-ML-PickEm-Predictor/blob/bb5d4e5f1cf33f3b7dfbbe720954d861a52ecafb/feature_engineering.py#L1053-L1135)

从项目根目录执行 `node f1bre_data/compare.cjs` 可完全离线复核本次初始化对照、官方阵容、已继承的比赛及推荐卡。执行 `node f1bre_data/compare.cjs --write` 可重建本目录的研究报告。
