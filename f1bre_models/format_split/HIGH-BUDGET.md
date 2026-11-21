# 增加模拟次数后，哪支队换了位置？

固定 BO1 Elo、BO3 地图 ML 和推荐填法。每组先合并 30 批路径，再选一次完整的十格；另用 30 批独立路径估计过关概率。主种子为此前网页使用的 33719。下表用实赛的五轮终局给十格计分，30 组种子衡量抽样波动。每行只有一届真实赛事。[事先登记的比较](CONVERGENCE.md) · [全部 Major 卡面](convergence.json)

| 场地 | 主种子，1.2 万 → 36 万 | 30 个种子中过关数，1.2 万 → 36 万 | 大预算主卡 0–3 命中 |
| --- | ---: | ---: | ---: |
| 奥斯汀 Stage 3 | 4 → 4 | 8 → 0 | 1/2 |
| 布达佩斯 Stage 3 | 3 → 5 | 18 → 28 | 0/2 |
| 科隆 Stage 3 | 5 → 5 | 26 → 30 | 1/2 |
| 上海 2024 欧洲 RMR A，首次整卡留出 | 4 → 5 | 18 → 30 | 2/2 |
| 克卢日 2026，全 BO3 复核 | 6 → 6 | 30 → 30 | 1/2 |

大预算主卡在三届 Stage 3 过 2/3，中 14/30。相同胜率的小预算为 1/3、12/30。线上 v33 原推荐为 1/3、9/30，三届各得 5、2、2 格。组合相对 v33 多过一届的有 28 组，2 组持平；相对同胜率的小预算，多过一届 10 组，持平 15 组，少过一届 5 组。奥斯汀的小预算偶尔能过关，大预算全部落在四格。按原登记的「只在少数组改善」条件，大预算继续作为研究卡，三阶段正式计分保留原卡和原口径。

布达佩斯两种预算的 30 张卡都选 Falcons 全胜。另一个全胜位，FURIA 从 18 次增加到 28 次，Vitality 从 6 次降到 0 次，MOUZ 从 6 次降到 2 次。FURIA 实际全胜，主卡因此在全胜和普通晋级各多中一格。布达佩斯主卡在独立的 36 万次核分中过关率为 29.04%。种子上的实赛命中频率不能当成新加坡的过关概率。

## 上海留出的赛前资料

资格赛于 2024-11-17 开始。按 10 月公布的种子核对八场首轮；11 月 13 日发布的 Valve 全球榜与 14 队现五人完全匹配，Vitality 和 UNiTY 各匹配四人。登记名单与实际换人公告、最后一次赛前出场逐队核对。SAW 使用 Ag1l、Falcons 使用 s1mple、fnatic 使用 nawwk、GamerLegion 使用 Tauson、Cloud9 使用 interz。Vitality 恢复 mezii，UNiTY 仍由 M1key 出赛。35 场赛后逐图五人均与赛前推定一致。[主办方报名与替补说明](https://www.hltv.org/news/40041/pw-shanghai-major-rmr-rosters-revealed) · [首轮公布](https://www.hltv.org/news/40068/perfect-world-confirm-opening-rmr-matchups) · [Vitality 教练说明](https://www.hltv.org/news/40000/jackz-to-stand-in-for-mezii-at-blast-world-final) · [UNiTY 赛前资料](https://www.playzone.cz/clanky/223262-m1keyho-dny-v-unity-jsou-secteny-jeho-posledni-tanec-bude-v-boji-o-vysneny-major) · [逐队来源](rmr_a/field.json)

先生成并记录 120 对胜率的 SHA-256，再读取该赛事的实际比分。这是历史重建。ML 的 11,524 张候选训练图最晚比赛日为 11 月 15 日，按日期和赛事隔离训练与校准。Elo 重放的锚点全球积分榜为 5 月 6 日，RMR 沿用此前资格赛的 Elo 缩放。20 场 BO1 上，原地图 ML 和 Elo 的 Brier 分别为 .18807、.19474，对数损失分别为 .56453、.57306。13 场 BO3 均用地图 ML，Brier 为 .23201，对数损失 .65284。两种模拟预算完全共用这些单场概率。[封存胜率](rmr_a/odds.json) · [输入指纹](rmr_a/LOCK.sha256) · [逐场计分](rmr_a/scores.json)

五轮全部 33 场配对经引擎复原，第四名和第七名附加赛单独保存。RMR 有七个 Major 名额，本文只用五轮瑞士赛的八支三胜队计十格。大预算主卡把 BetBoom 填入普通晋级，替换 Sangal。两卡在共同的 360,000 条独立路径中过关 147,092 和 148,355 次。克卢日过去参与过地图 ML 检验，这次用它检查全 BO3 的预算变化；它与首次使用的 RMR A 分列。[上海逐场事实](rmr_a/matches.json) · [上海两种预算](rmr_a/budgets.json) · [克卢日两种预算](rmr_a/cluj.json)

## 复算与前瞻记录

```sh
node f1bre_models/format_split/convergence.cjs /path/to/checkpoints --check
python f1bre_models/format_split/rmr_a/forecast_a.py --hltvy /data/results.json.gz --ranks /data/valve --check
python f1bre_models/format_split/rmr_a/grade_a.py --hltvy /data/results.json.gz --check
node f1bre_models/format_split/rmr_a/budgets.cjs --check
node f1bre_models/format_split/rmr_a/budgets.cjs --cluj --check
node f1bre_models/format_split/summary.cjs
```

新加坡 Stage 3 赛程为全 BO3。等 Stage 2 结束、报名阵容与截止时间确认后，现有地图 ML 封卡入口会同时保存 36 万次选出的十格和独立核分结果。完赛后分别给它和原推荐计分。下一项在新的全 BO3 场地直接比较整套候选和现行推荐。[前瞻命令及输入要求](../../ml_allocation/PROSPECTIVE.md) · [下一项对照](NEXT-FULL.md)
