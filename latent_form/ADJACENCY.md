# 赛前相邻 BO3 的训练资料

19 个目标共用 12,804 场已核验 BO3 的索引。先用两份完整来源的 **26,953 个系列**重建队伍在赛事中的每次出场，再筛相邻两端，得到 **12,112 对队伍视角的连续 BO3**，分布在 685 项有可用配对的赛事。五人、四人、三人核心分别为 11,225、823、64 对。各目标的 180 日窗口重叠，不能把表中各行相加。新加坡只有 8 项合格赛事，按事先规定的至少 10 项门槛，其尺度取零。[训练协议](TRAINING-NEXT.md) · [原赛前 VRS、逐图与首发来源](../tail_calibration/TRAINING.md)

| 目标 | 用于辅助校准的 BO3 | 相邻对 | 赛事 | 队伍 × 赛事 | 三 / 四 / 五人核心 |
| --- | ---: | ---: | ---: | ---: | --- |
| 奥斯汀 Stage 3 | 2,567 | 2,720 | 146 | 1,178 | 23 / 155 / 2,542 |
| 布达佩斯 Stage 3 | 3,381 | 3,411 | 164 | 1,558 | 10 / 243 / 3,158 |
| 科隆 Stage 3 | 2,132 | 1,678 | 107 | 803 | 3 / 74 / 1,601 |
| Cluj 2026 | 3,114 | 2,949 | 163 | 1,388 | 10 / 169 / 2,770 |
| 布加勒斯特 2025 年 4 月 | 2,286 | 2,373 | 132 | 1,071 | 24 / 134 / 2,215 |
| 新加坡 Stage 1 | 545 | 46 | 8 | 40 | 0 / 1 / 45 |

## 队伍、时间与缺档

- **HLTvy**。读取 2023-09-27 至 2026-03-23 的 24,582 个系列。源内比赛 ID 唯一，原始开赛时间为 UTC 毫秒。队伍按该项赛事内的俱乐部 ID 追踪，缺 ID 时用该队名。跨图只保留每张实打图都可确认的选手，遇到六人上图则该图不提供可靠五人。已核验 BO3 的原名经既有别名表规范化，身份未消歧的同名不计入核心。同队同一时刻有多个出场记录时，不凭比赛 ID 推断先后。[原始档案固定提交](https://github.com/zugzugs/hltvy/tree/1a00ba2893a63646f0d940e626b6da95d342a187)
- **Ektarr v11**。读取分界日之后、冻结之前的 2,371 个不同系列 ID。总行和逐图行属于同一个系列，全部纳入赛程序列。该段 4,742 个俱乐部 ID 各自仅出现于一场，赛内追踪使用规范队名和实际选手 ID；不能依靠俱乐部 ID 跨场连接。两端都是已核验 BO3 时，参与者都有五个真实 ID。显示日期的可能 UTC 区间为前后一日，只有两端区间互不重叠才成对。同一显示日有多场的队伍，该日各场不作为相邻对端点。这个约束对新加坡的 545 场尤其重要。源内两场 Astana 2026 欧洲预选混用英俄赛事名，保留两种原文并归为同一明确赛区。[固定数据版本](https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11) · [派生事实许可](https://creativecommons.org/licenses/by-sa/4.0/)
- **队伍继承**。按赛事和日期向前处理。现有队名或 ID 出现能确认的新核心，若与上一阵容不足三人则另开记录。队名变更时，只把新实体关联到拥有唯一最多、至少三名相同选手且当天未以其他名独立参赛的前一实体。并列候选会留下身份不明的阻断日。21 次已用队名换成不同核心的记录另存于 `identityBreaks`。每条合格相邻对还须直接核验两端有三至五名共同选手，对手既非同一参赛实体，也不能保留相同三人核心。
- **完整赛程序列**。BO1、BO5、行政胜负、无选手统计和无可匹配 VRS 的系列都占据出场位置。赛程中的相邻边只有两端均为核验过的 BO3 才能接受。检查还会搜索中间另一个队名下的出场，只要该名与任一端同名或拥有两端共同三人核心就阻断。源内资料未收录的比赛无法借此排除，尤其应保留对后段 Ektarr 覆盖的限制。
- **赛前边界**。每窗沿用原表的时区和跨午夜完赛留量。两个额外窗口分别为 2025-08-18 至 2026-02-14 前的 Cluj，以及 2024-10-08 至 2025-04-06 前的布加勒斯特。脚本检查其全部日期均被原冻结训练窗口并集覆盖。所有目标均从辅助校准和相关性估值两处剔除完整的 Cluj 2026；布加勒斯特 2025 只在自身目标前截断，原有目标的资料口径不变。两届 Elisa 的完整 180 日窗存在中间日期缺档，本表没有将其加入待估目标。

## 如何识别同一届赛事

先保留来源的赛事和阶段原文，再按公认的届次、地区和正式阶段分组。明确的资格赛、RMR、降级赛保持其完整名称，跨地区、届次和独立资格赛均不连接。缺少具体地区的资格赛和没有届次标识的重复名称不提供配对。对于同一届的 Stage 1、Opening Stage、Finals 等明确后缀，按同一赛事计权，避免名单拆分使一届取得多个赛事权重。YaLLa 和 Elisa 同季的 Contenders 也采用同一赛事权重；跨阶段连接还要有赛制证据。每项原名映射可在 `eventAliases` 查到。

主办方明确说明的 Major、ESL Pro League S21–23、IEM 科隆和卡托维兹 2024/25、IEM 克拉科夫 2026、BLAST Bounty、BLAST Open London、Elisa 2024、Thunderpick 2024 和 BetBoom Dacha Belgrade S2，在两个赛段确实相接且满足相同队伍、阵容和时间规则时可以成对。其他赛段共 57 条可能的跨段连接保留为「未证实赛段关系」排除。以 HLTV 的 EPL S23 为例，Stage 1、Stage 2 和 Finals 三个原名共同代表第 23 季，只有一个赛事权重。[Major 各阶段赛制和种子](../multi_stage/inputs.json) · [ESL S23 三阶段](https://pro.eslgaming.com/csgo/proleague/season23/) · [IEM 科隆 2024](https://eslfaceitgroup.com/press/everything-you-need-to-know-ahead-of-intel-extreme-masters-cologne-2024/) · [IEM 2024 名额与独立资格赛](https://pro.eslgaming.com/tour/2023/11/slot-distribution-and-qualifier-announcement-for-the-2024-esl-pro-tour/) · [ESL 2025 赛制](https://pro.eslgaming.com/tour/pt/2024/10/esl-pro-tour-2025/) · [克拉科夫 2026](https://pro.eslgaming.com/tour/zh/2026/01/intel-extreme-masters-krakow-2026-team-invites/)

BLAST 的赛历区分一届比赛内的线上轮次与场馆决赛。Elisa 称 Main Swiss 是同季的第二阶段，另设独立公开预选。Thunderpick 则分别说明了赛前地区预选和同届线上正赛通往线下决赛的结构。[BLAST 手册](https://assets.blast.tv/rulebook/Blast%2BPremier%2BHandbook%2B2025%2BJuly%2BUpdates.pdf) · [Elisa 官方赛事指南](https://elisaesports.com/2024/04/05/elisa-invitational-spring-2024-main-swiss-viewers-guide/) · [Thunderpick 正赛安排](https://thunderpick.io/blog/thunderpick-world-championship-group-stages) · [BetBoom Dacha 两阶段赛制](https://www.hltv.org/news/39685/betboom-dacha-belgrade-s2-teams-format-schedule-prizes-talent)

## 离线使用与核验

`adjacency.json.gz` 的 SHA-256 为 `8d9bd4f0098d8bcbc6bc754d1c3db9df7e9556389a9ece8075c02fc1c5ed10f5`。所有数组索引从 0 起。单场特征与标签直接引用 `../tail_calibration/training.json.gz`，该文件哈希为 `11072635a348e12715aecdc15ea8aef39a18b4cb2ef66d98fa1bd7e32ff4abc1`。

| 字段 | 含义 |
| --- | --- |
| `targets[id].seriesIndices` | 本窗用于估 VRS 校准斜率的全部单场在原 BO3 表 `rows` 中的位置 |
| `targets[id].indices` | 本窗用于估协方差的相邻对在 `pairs` 中的位置 |
| `pairs[].left/right` | 两端在原 BO3 表中的行号，并附原比赛 ID |
| `sideLeft/sideRight` | 0 取 A 视角，1 取 B 视角；胜率及胜负须同时转向 |
| `source/event/team` | 比赛来源、带来源标识的规范赛事届次、赛内稳定队伍；按队伍和赛事嵌套等权 |
| `overlap/commonCore` | 两场直接可确认的共同选手数与身份。HLTvy 使用昵称，Ektarr 使用其个人 ID |
| `scheduleLeft/scheduleRight` | 两次出场在全赛程中的位置。列名存于 `scheduleFields`，包括原名、阶段、时间、双方俱乐部和实际核心 |
| `rejected/identityBreaks` | 无法作为样本的相邻边或同名队伍更换核心；列序见 `rejectedFields`，另给各目标的排除计数 |

以下命令均为只读。第一条只需下载包和 Python 标准库，能检查原赛程中相邻边的完整分类和每个目标截止时的队伍归属。第二条从两份固定的公开源档完整重建，并与产物逐字节比较。

```sh
python -B latent_form/adjacency.py --audit
python -B latent_form/adjacency.py --check --hltvy results.json.gz --ektarr cs2_all_tiers_games.csv
```
