# PGL Bucharest 2025 春季赛前地图模型

用 2025-04-06 开赛前的 16 队、80 名实际公布的首发，以及赛前已经发布且至少保留三人的 VRS 积分，重建地图 ML。矩阵顺序沿用[赛前名单](../bucharest-field.json)的球队顺序。Liquid 包含 siuhy，paiN 包含 deemO。每支队能继承 86–267 张过往地图，80 名选手都有可用 ADR、KAST、每回合击杀。档案版 Rating 的公开时间晚于本场，训练和查询均未使用该数值。

图池为 Dust2、Mirage、Inferno、Nuke、Train、Ancient、Anubis。该季欧洲预选决赛在 3 月 12 日已逐一列出七图，与正赛资料相符。对所有 120 种潜在配对以历史出场频率给七图加权，重算 120 个 BO1、120 个 BO3；1 月后的 Train 等场次使用各自当时的真实图名。[3 月预选的七步选禁](https://www.hltv.org/matches/2379929/og-vs-betclic-pgl-bucharest-2025-europe-closed-qualifier) · [正赛图池](https://www.hltv.org/events/8044/pgl-bucharest-2025) · [主办方赛程](https://www.pglesports.com/cs2/pgl-bucharest-2025/)

训练、收缩、校准和聚合沿用[地图 ML](../../ml_allocation/TRAINING.md)的冻结实现。截止日为 2025-04-06 00:00 UTC，最后入样比赛日为 4 月 4 日。前 365 天共 13,308 张合格地图，其中 10,235 图训练、2,760 图校准、313 图因两边同赛事或分割处可用性而剔除。训练最后一场为 2 月 9 日，校准从 2 月 11 日开始，前后两部分的来源赛事、系列 ID 均无重叠。目标正赛入样 0 图。搭建预测时只打开赛前场地名单；赛果评分由另一入口独立执行。

```sh
python latent_form/bucharest-ml/build.py --check --model-only
python latent_form/bucharest-ml/build.py --check --hltvy /path/to/results.json.gz --ektarr /path/to/games.csv --ranks /path/to/verified-rankings
```

第一条使用四份包内特征文件重新训练并独立积分全部系列概率；第二条从固定原始资料起核对训练矩阵和 120 对查询，再重训模型。产物使用 [ml.json.gz](ml.json.gz) 中的 `fields["bucharest-2025-april"]`，包含七图顺序、16 队行列名、逐图及 BO1/BO3 概率。它是本轮新增的历史检验，有些原始事实取自赛后整理的固定档案。
