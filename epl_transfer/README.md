# ESL Pro League S23 第二阶段迁移检验

2026 年 3 月 6 日至 10 日，16 支队打五轮瑞士制 BO3。我们从主办方公布的投票种子开局，逐轮输入真实胜负和地图比分，程序独立得出的配对与实际 33 场全部一致。赛前冻结的旧填法和历史分组填法随后各自在 30 组相同模拟路径上生成整卡，**每组都是旧 5/10、新 5/10**。这是一项外部赛事的一次实绩。不同种子复核模拟稳定性，不能扩充独立样本数。

| 指标 | 原填法 | 历史分组填法 |
| --- | ---: | ---: |
| 固定种子 33719 实际命中 | 5/10 | 5/10 |
| 全胜／普通晋级／全败命中 | 1／4／0 | 1／4／0 |
| 30 组种子实际达标 | 30/30 | 30/30 |
| 独立路径的平均模拟过关率 | 79.53% | 76.08% |

新卡让 FaZe 替换 G2 占普通晋级位，Legacy 替换 B8 占全败位。这四个选位都没有得分。固定的系列赛概率在 33 场 BO3 上的 Brier 为 0.240872。两套填法的赛果得分持平，模拟达标率下降 3.45 个百分点。赛事采用线上比赛、全 BO3 和动态 Elo 配对，其作用是独立检查 8+8 入场规则是否能迁移，Major 三个阶段的过关统计各自保留。

## 截止日期和数据

16 队中直接参赛的是种子 1–6、9、16。组内根据 3 月 2 日 Valve 全球榜积分排序。3 月 5 日及之前的最近公开比赛验证每队的场上五人。3DMAX、Legacy 和 B8 各保留积分榜上的四人，其余 13 队五人完整重合。B8 的 3 月榜仅列四人，这四人同时出现在 2 月榜的完整五人、2 月 17 日比赛的实际五人和俱乐部公布的新名单中。使用 3 月榜 1404 分。[ESL 参赛名单](https://pro.eslgaming.com/csgo/proleague/season23/) · [3 月 2 日 Valve 官方榜](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/3404a877b6ca513a1f508d6b23d20562c4afcc73/invitation/2026/standings_global_2026_03_02.md) · [B8 引援公告](https://t.me/B8esportsGG/3426) · [完整首发名单](https://www.hltv.org/news/43783/b8-sign-s1zzi-on-loan-segukawa-returns-to-academy-roster)

历史分组只用在比赛前已结束的六个 Major 后续阶段，从哥本哈根 Stage 2 到布达佩斯 Stage 3。赛前积分作为整个阶段的固定胜率输入。只让 ESL 内部评分随每场预测比分更新，更新后的评分只用于配对。ESL 的种子不等于入场途径，模拟器始终采用主办方种子，选卡时再映射实际的直邀／晋级分组。每个种子用 12,000 条路径选卡，再用另一批 12,000 条路径估计模拟达标率。[赛前种子与初始评分](https://pro.eslgaming.com/tour/2026/03/esl-pro-league-season-23-team-seeding-and-live-ratings-stage-2/) · [ESL 配对和评分公式](https://pro.eslgaming.com/tour/2025/03/esl-live-ratings/) · [2–0 与 2–1 的差别](https://pro.eslgaming.com/tour/2025/09/epl-s22-team-seeding-and-live-ratings/) · [2026 赛季规则入口](https://pro.eslgaming.com/tour/2025/12/esl-pro-tour-2026-rulebook-update/) · [官方具体比赛规则 PDF](https://drive.google.com/file/d/1ZMxPYAv__yDwI7rNTvCcB8ah_aPWV_gR/view) · [逐场比分](https://www.hltv.org/events/8412/esl-pro-league-season-23-stage-2)

## 复现

在项目根目录执行以下命令。首次检验的设置保存在 `PROTOCOL.md`，此赛事自本次评分起标记为已评估。文件 `actual.json` 仅用于核对配对、计算实绩及 Brier。

```sh
python epl_transfer/rosters.py
node epl_transfer/swiss.cjs
node epl_transfer/evaluate.cjs --check
```
