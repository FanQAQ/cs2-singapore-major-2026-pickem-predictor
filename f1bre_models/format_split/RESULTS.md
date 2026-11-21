# BO1 用 Elo，BO3 用地图 ML

2026 年 11 月 21 日。奥斯汀欧洲 MRQ 的 20 场 BO1 误差下降，通过了事先规定的单场检验。用相同填法和随机数回放十格卡，这届资格赛从 1/10 到 2/10。三届正式 Stage 3 在发布种子仍中 4、3、5 格，只过一届。首页继续使用现行推荐。[网页对照](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/#verify/f1bre/formats) · [试验方案](../NEXT-FORMAT.md)

| 主种子 33719 | 本站推荐，过关 · 格数 | 原地图 ML | BO1 Elo ＋ BO3 ML | 组合的 0–3 命中 |
| --- | --- | --- | --- | --- |
| Stage 1 | 3/5 · 27 | 2/5 · 19 | 2/5 · 22 | 5/10 |
| Stage 2 | 4/5 · 25 | 3/5 · 27 | 3/5 · 23 | 4/10 |
| Stage 3 | 1/3 · 9 | 1/3 · 12 | 1/3 · 12 | 2/6 |
| 欧洲 MRQ | — | 0/1 · 1 | 0/1 · 2 | 0/2 |

上海首阶段原 ML 中 3 格，组合中 7 格，本站推荐中 4 格。科隆首阶段分别是 2、2、4 格。科隆 Stage 3 全为 BO3，原 ML 与组合的每个种子所选的十格和独立核分概率逐项相同，主种子均中 5 格。Stage 2 的组合在上海维持 7 格，科隆从 7 格降至 5 格。[逐种子卡面](cards.json) · [原 ML 与首页对照卡](../report.json)

同一组概率使用 12,000 次模拟选卡，另用 12,000 次模拟估计过关率。30 组配对种子中，组合相对原 ML 的 Stage 3 过关数在 22 组增加、8 组持平。组合达到至少 2/3 的有 20 组；10 组未达到，其中包括网页发布种子。布达佩斯的 3–0 席位在 FURIA、Vitality 与 MOUZ 之间变化，30 张卡中 18 张得 5 格、12 张得 3 格。MRQ 有 28 组多中格、2 组持平，各组均未过关。五届 Stage 2 则在全部 30 组少中格。[独立选卡与核分程序](cards.cjs)

下一轮检验把选卡模拟从 12,000 提至 360,000 后，布达佩斯的全胜位能否稳定下来。赛制、模型、填法、主种子及另一个外部检验场地已登记。[可直接接续的实验方案](CONVERGENCE.md)

| 实打赛事 | BO1 场数 | BO1 Brier 原 ML → 组合 | BO1 对数损失原 → 组合 | BO3 场数，两法共用同一胜率 | BO3 Brier / 对数损失 |
| --- | ---: | --- | --- | ---: | --- |
| 五届 Stage 1 | 100 | .23667 → .24143 | .66348 → .67593 | 65 | .21441 / .61951 |
| 五届 Stage 2 | 100 | .23912 → .24492 | .67945 → .68249 | 65 | .21454 / .63372 |
| 三届 Stage 3 | 40 | .21673 → .21068 | .62599 → .61173 | 59 | .20401 / .58666 |
| 欧洲 MRQ | 20 | .29346 → .24988 | .78665 → .69341 | 13 | .28100 / .75846 |

## 为什么还要核实赛制与换人公告

2025-04-14 开赛。BLAST 公布的名单和 Valve 的 4 月 7 日全球榜确定了 16 个种子，逐队再与赛前实打名单比对。同一榜内 BC.Game 有第 22、121 名两条，PARIVISION 有第 35、181 名两条。五人核心分别匹配第 22、35 名。9 Pandas 在 4 月 13 日已用 mo0N 替代 anarkez，四人核心继承积分。[BLAST 邀请](https://blast.tv/cs/news/blasttv-austin-major-and-mrq-invites) · [Valve 排名快照](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/548080058dd97a23a13fdfbb02ed8503d46b1dee/invitation/2025/standings_global_2025_04_07.md) · [9 Pandas 赛前实际五人](https://www.hltv.org/matches/2381503/wopa-vs-9-pandas-european-pro-league-season-24)

逐图审核发现初次锁定漏掉了 fnatic 的俱乐部公告。4 月 11 日已宣布 b0RUP 替换 KRIMZ，4 月 7 日榜单和该队上一场比赛尚是 KRIMZ。保留两套赛前矩阵和指纹，在看汇总误差前单独重算受影响的 15 种配对，其余 105 种逐项相同。用 KRIMZ 时 BO1 Brier 为 .29122 → .24988，对数损失 .78203 → .69341。换 b0RUP 后，Elo 继续按相同四人核心继承团队分，这 15 对的 Elo 概率相同；ML 概率随队员特征变化。此场地的首发纠错发生在检查真实名单之后。[俱乐部原文](https://fnatic.com/community/5801-cs2-update) · [更正时间及口径](ROSTER.md) · [初版矩阵](odds.json) · [十五处更正](correction.json) · [两版评分](scores.json)

赛前新闻概述了前两轮 BO1。BLAST 的实打记录还确认第三轮 1–1 组四场均为 BO1。按阶段五轮核对 33/33 场，另两场第六、第八名附加赛单列。正式晋级名额为六个，外部十格卡按五轮瑞士轮终局评分。[赛前排期](https://www.hltv.org/news/41424/astralis-to-face-og-in-eu-mrq-round-1) · [BLAST 的 1–1 单图赛记录](https://blast.tv/cs/tournaments/austin-major-2025-mrq-eu/match/0c18a037/astralis-ence) · [完整赛程与比分](matches.json)

## 复算

Elo 使用 180 天内 4,281 场系列、9,110 张地图，按原模型月榜政策从 2024-10-02 的 Valve 邀请榜锚定。ML 一年窗口含 13,412 张可用地图，10,297 张拟合、2,671 张校准、444 张因时间或赛事边界排除。可用于训练的最后比赛日是 4 月 12 日。训练标签、每行原特征与旧基准档逐项核对。实际比分经两份预测锁定后再评分；后续同届资料仅供赛后核对。[初版训练程序](forecast.py) · [逐场评分](grade.py)

```text
python f1bre_models/format_split/mrq.py --hltvy /data/results.json.gz --ranks /data/valve --check
python f1bre_models/format_split/forecast.py --hltvy /data/results.json.gz --ranks /data/valve --check
python f1bre_models/format_split/correct_lineup.py --hltvy /data/results.json.gz --ranks /data/valve --check
python f1bre_models/format_split/grade.py --hltvy /data/results.json.gz --check
node f1bre_models/format_split/cards.cjs --check
```
