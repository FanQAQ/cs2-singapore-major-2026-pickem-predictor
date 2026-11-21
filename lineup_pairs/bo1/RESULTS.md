# 换人后再降权，能提高单图预测吗？

2026 年 11 月 21 日。上海 Major 2024 欧洲 RMR B 是上一轮预先指定的混合赛制留出。地图 ML 对 20 场 BO1 的 Brier 从 0.23490 升至 0.24629，对数损失从 0.66026 升至 0.68564。两项误差均变大，额外降权未进入整卡试验。[上一轮登记](../RESULTS.md) · [本轮方案](PROTOCOL.md) · [逐场胜率](scores.json)

| 概率口径 | 场数 | Brier 原 → 新 | 对数损失原 → 新 |
| --- | ---: | ---: | ---: |
| BO1，按赛前地图抽取概率 | 20 | 0.23490 → 0.24629 | 0.66026 → 0.68564 |
| BO1，赛后代入实打地图 | 20 | 0.23334 → 0.24674 | 0.65488 → 0.68650 |
| BO3，按赛前地图抽取概率 | 13 | 0.24782 → 0.25364 | 0.68863 → 0.70303 |

降权提高了 6 场 BO1 实际赢家的胜率，降低了其余 14 场。变化最大的是 B8 对 Aurora。Aurora 的赛前胜率从 42.01% 降至 35.82%，随后赢下比赛。代入实打地图后误差仍更高，差异在给定地图的预测里也存在。20 场来自同一次赛事。[比赛记录](https://www.hltv.org/matches/2377030/b8-vs-aurora-perfect-world-shanghai-major-2024-europe-rmr-b)

## 赛前资料

开赛日为 2024-11-21。16 队按十月公布的欧洲榜播种，实力取 11 月 13 日全球榜。15 队五人与全球榜全部一致，Astralis 为四人一致，按赛前公告用 br0 替换 device。NIP 的赛前换人公告和实际比赛均确认 jocab。五轮的 33 场瑞士轮逐轮核对，对阵吻合 8、8、8、6、3 场。第七名附加赛 Spirit 2–0 NIP 单列。RMR 有七个正式晋级名额。[开局配对](https://www.hltv.org/news/40068/perfect-world-confirm-opening-rmr-matchups) · [Valve 十月欧洲榜](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/81a4bcd9cd775715530400b85bfa6dfef4dafc5a/live/2024/standings_europe_2024_10_15.md) · [十一月全球榜](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/9a0c127dc05a3f91a308a28995db6a58494e0889/live/2024/standings_global_2024_11_13.md) · [首发和换人来源](field.json) · [逐场比分](matches.json)

固定原 16 项特征和 XGBoost 3.0.2。回放一年窗口内已可用的 11,271 张地图，8,823 张训练树、1,699 张校准，749 张因跨校准边界或同一赛事而排除。最近的输入地图来自 11 月 19 日。校准含同届 RMR A 已完成且满足两天延迟的 48 张地图。两臂对所有合格行复核旧特征和标签，仅改变团队与地图历史的权重。按赛前首发与积分锁定全部 120 对和七张地图，再另行读取赛果。[预测与抽图权重](odds.json) · [评分实现](validate.py)

G2 与 TSM 的 NiKo/niko 是两个人，3DMAX 与 Sashi 的 Lucky 也是两个人。报名与实打阵容按 HLTV 个人资料区分，核对得到 80 人。两臂沿用同一套历史选手特征与昵称处理。[四位个人资料及各队比赛证据](field.json)

下一项预登记检验固定地图 ML 的 BO3，只在 BO1 使用 180 天 Elo。先用奥斯汀欧洲 MRQ 独立核验，再决定是否进行正式阶段的整卡对照。[实验口径与下一步](../../f1bre_models/NEXT-FORMAT.md)

## 复算

从上方 Valve 两份固定版本下载排名原件。`--ranks` 使用项目原有按发布提交存放的月榜目录，归档指纹与依赖见[上一级实验](../RESULTS.md)。

```text
python lineup_pairs/bo1/inputs.py --hltvy /data/results.json.gz --seeds /data/standings_europe_2024_10_15.md --points /data/standings_global_2024_11_13.md --check
python lineup_pairs/bo1/odds.py --hltvy /data/results.json.gz --ranks /data/valve --check
python lineup_pairs/bo1/validate.py --hltvy /data/results.json.gz --check
```
