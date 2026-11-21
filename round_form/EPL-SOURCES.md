# EPL S23 第一阶段逐图比分

目标是用 2026 年 3 月 6 日第二阶段开赛前已经打完的比赛，检验第一阶段的回合表现能否改善预测。第一阶段于 3 月 1–5 日打完五轮，共 33 场 BO3，实际进行了 79 图、1,799 个回合。20 场以 2–0 结束，13 场打满三图；16 张图有加时，保留实际总比分。[ESL 当届赛事](https://pro.eslgaming.com/csgo/proleague/season23/) · [第一阶段全部赛卡](https://www.hltv.org/results?event=8241)

[逐场数据](epl-inputs.json) 按既有五轮比赛索引排序。每条记录给出 HLTV 比赛编号、原发布页、UTC 比赛日期、实际五人、系列比分及依次进行的每张地图比分；比分顺序均对应 `a`、`b`。只记录实际上场的地图。原始赛卡快照固定于 Git 提交 `1a00ba2893a63646f0d940e626b6da95d342a187`，gzip 的 SHA-256 为 `750b0da45142fc797eddb708698d14d269237e59784d6a1d066eddba0ba31551`。历史档案整理晚于赛事，作为赛后发布比分的回溯证据。逐场比对了既有档案中的 33 个 ID、双方、系列胜负与负方取图数。地图内双方五人须齐全且在同一系列的每一图一致；66 个队次都与第一阶段开赛前登记五人完全一致。[固定快照](https://github.com/zugzugs/hltvy/tree/1a00ba2893a63646f0d940e626b6da95d342a187) · [第一阶段既有比赛索引](../stage1_holdout/field-results.json) · [最后一轮 3DMAX 对 Liquid 赛卡](https://www.hltv.org/matches/2391043/3dmax-vs-liquid-esl-pro-league-season-23-stage-1)

`pointsA`、`pointsB` 沿用第一阶段原实验冻结的 Valve 全球积分。榜单发表于 2 月 2 日 18:03:49 UTC，实力资料截止于 2 月 28 日 23:59:59 UTC。16 支队伍均以当时五人匹配到唯一的历史核心，最低三人重合。原基准在整个阶段使用 `P(A)=1/(1+10^((pointsB–pointsA)/400))`，因此 3 月 2 日发布的排名不会用于中途更新对手实力。主办方的 Live Ratings 只负责瑞士轮配对。[Valve 当期全球榜](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/73c71008fb393980255103b93d6b868fb616f5ce/invitation/2026/standings_global_2026_02_02.md) · [首发资料与排名匹配](../stage1_holdout/SOURCES.md) · [ESL 赛前种子及评分](https://pro.eslgaming.com/tour/2026/02/epl-s23-team-seeding-and-live-ratings/)

共享数据格式中的 `start` 为目标第二阶段开赛日，`donorStage: 1` 标识观察到的上一阶段；`stage2Start`、`stage2End` 在这份 EPL 输入中分别代表第一阶段的起止日期。提取时保留全部 33 场。与第二阶段实际首发逐场匹配后，8 场双方都保有核心，17 场仅一方保有核心，8 场双方均未匹配。所有可继承的 33 个队次恰好都是五人原阵容。第二阶段比赛结果没有进入输入文件。本届的第二阶段曾用于其他模型的迁移检验，使用同一赛事不能增加独立赛事数。[第二阶段五人名单](../epl_transfer/rosters.json) · [先前外部检验](../epl_transfer/README.md)

从项目根目录运行下列命令。首条在离线包内核验资料完整性、分数、阵容和既有赛果。第二条另从固定原始档重新提取并逐项核对。若要重建文件，在第二条末尾加 `--write`。本版逐场 JSON 的 SHA-256 为 `60a3bb79dda1ed975c3cf61ca56a2434665e107ad752e109937a34cfc55889a2`。

```sh
python round_form/epl_inputs.py
python round_form/epl_inputs.py --archive /path/to/results.json.gz
```
