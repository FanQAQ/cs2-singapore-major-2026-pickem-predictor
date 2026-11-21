# EPL S21 第二阶段留出样本

这是一场此前没有用来选择本轮校准参数的独立赛事。16 队于 2025 年 3 月 7–11 日在斯德哥尔摩进行第二阶段，33 场均为实打 BO3，共 79 张地图。赛前输入截止于 3 月 6 日 23:59:59 UTC；八支直邀队与第一阶段的八支晋级队共同参加。它是一次外部瑞士轮检验，正式 Major 的阶段过关数另行统计。[选定留出时的研究记录](../stage_goals/METHOD.md) · [ESL 赛事及邀请规则](https://pro.eslgaming.com/tour/2025/01/esl-pro-league-season-21-team-invites/)

## 赛前阵容与实力

3 月 6 日的首轮预告列出了全部 16 队的五人。逐队名单和 3 月 7 日前最近一次完整实战阵容逐人相符，赛后又以该阶段每张图的五人核验了全部 66 个队次。主办方公告将最终报名截止日设为 2 月 15 日；可查资料包括公开的参赛五人和实际赛卡，未获得十六队的原始签字报名表。[3 月 6 日首轮及五人名单](https://www.hltv.org/news/41133/esl-pro-league-21-stage-2-first-round-matches-set) · [每队赛前阵容与原场链接](epl21-field.json)

3 月 3 日 17:49:38 UTC 发布的 Valve 全球邀请榜是截止日前最近提交。对每队的赛前五人在全榜寻找唯一重合最多的阵容。14 队有五人重合，MIBR 有四人、SAW 有三人。TYLOO 按五人核心对应全球第 117、740 分；同名队标不会影响匹配结果。Valve 积分用于估计单场胜率，ESL 的实时评分用于排对手。[当时的 Valve 提交](https://github.com/ValveSoftware/counter-strike_regional_standings/commit/293e01e588b5e751ee0b306dc2958765dc63dce0) · [全球榜](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/293e01e588b5e751ee0b306dc2958765dc63dce0/invitation/2025/standings_global_2025_03_03.md)

## 主办方公布的 240 票和抽签

ESL Counter-Strike 在 3 月 6 日 14:29 UTC 公布十六个种子，18:30 UTC 公布每队对另外 15 支队伍的完整排序。按 ESL 当季规则对每支队的 15 个得票名次计算均值及总体标准差，保留均值上下 1.5 个标准差范围内的票，再用保留票的平均名次作为起始评分。240 票中剔除 24 票，按均值排序完整复原主办方十六个种子。代码保留原始投票、被排除的投票队和名次、保留票数及其名次总和。以下仅为展示保留两位小数，重放使用完整均值。[ESL 赛前播种图](https://x.com/ESLCS/status/1897655742146007083) · [ESL 公布的四张投票表](https://x.com/ESLCS/status/1897716421922045960) · [ESL 计算实例及标准差口径](https://pro.eslgaming.com/tour/2025/02/epl-season-21-team-selected-seeding-and-live-ratings/)

| 首轮 | 较高种子及起始评分 | 对手种子及起始评分 |
| --- | --- | --- |
| 1 对 16 | Spirit 1.40 | TYLOO 15.00 |
| 2 对 15 | Vitality 1.50 | MIBR 13.50 |
| 3 对 14 | Natus Vincere 2.86 | SAW 13.14 |
| 4 对 13 | MOUZ 4.00 | FURIA 11.57 |
| 5 对 12 | G2 5.23 | paiN 11.50 |
| 6 对 11 | The MongolZ 5.79 | GamerLegion 10.14 |
| 7 对 10 | Eternal Fire 6.29 | 3DMAX 10.00 |
| 8 对 9 | Falcons 7.00 | Liquid 8.69 |

S21 在 2–0 和 2–1 后采用同样的评分变动。若当前赢家及输家的赛前实时评分分别为 W、L，赢家评分减去 `5 × (1 − 1 / (1 + 10^((W − L − 8) / 10)))`，输家加上相同数值。每轮在同战绩组内避免重赛，找各对评分和偏离本组两倍平均评分的平方和最小的配法。S22 才给 2–1 半额评分变动。按照 S21 的办法，五轮分别重现 8/8、8/8、8/8、6/6、3/3 场。33 场均能复原地图和系列胜者，没有行政判胜或从概率误差分母剔除的比赛。[ESL 3 月 1 日当季公式](https://pro.eslgaming.com/tour/zh/2025/03/esl-live-ratings/) · [S22 的修订](https://pro.eslgaming.com/tour/2025/09/epl-s22-team-seeding-and-live-ratings/) · [逐场比分与重放](epl21-results.json)

## 离线复算

指定目录放入项目已经使用的两个原始资料。HLTV 赛卡快照 `results.json.gz` 的 SHA-256 为 `750b0da45142fc797eddb708698d14d269237e59784d6a1d066eddba0ba31551`，3 月 3 日 Valve 榜使用原文件名 `standings_global_2025_03_03.md`，SHA-256 按项目现有指纹核验。脚本先构建赛前对象，再读取目标比赛的比分。默认将结果与已发布的两个 JSON 核对，显式传入 `--write` 才重新写盘。[原始赛卡快照](https://github.com/zugzugs/hltvy/tree/1a00ba2893a63646f0d940e626b6da95d342a187) · [Valve 文件指纹](../stage3_maps/inputs-snapshots.json)

```sh
python tail_calibration/epl21_inputs.py /path/to/cache
```
