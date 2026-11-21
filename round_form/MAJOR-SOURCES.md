# 三届 Major 第三阶段开赛前的实际回合比分

`major-inputs.json` 保存三个第二阶段的完整 99 场系列赛，所有队伍均保留，包括未晋级者。每场有日期、轮次、在场十人、真实地图名与完整回合比分、系列分、对应的赛前 Valve 积分和原场链接。所有地图比分按 `a`、`b` 相同方向存放。比分保留加时，例如 22–20，不折算为 13–11。

| 预测目标 | 取数阶段及 UTC 日期 | 目标开赛日 | 系列赛 | 已打地图 | 加时地图 |
| --- | --- | --- | ---: | ---: | ---: |
| 奥斯汀 Stage 3 | Stage 2，2025-06-07 至 06-10 | 06-12 | 33 | 51 | 6 |
| 布达佩斯 Stage 3 | Stage 2，2025-11-29 至 12-02 | 12-04 | 33 | 51 | 6 |
| 科隆 Stage 3 | Stage 2，2026-06-06 至 06-09 | 06-11 | 33 | 51 | 2 |

**取数和核对。** 奥斯汀、布达佩斯逐场取 HLTV 赛后战报，复用 `zugzugs/hltvy` 固定档案 `1a00ba2893a63646f0d940e626b6da95d342a187`。筛选两个赛事的 Stage 2 链接，验证每张实打地图上的双方五人一致、地图顺序与当场真实禁选一致、回合总分合法、地图胜者累计到系列总分。科隆取 BLAST.tv 33 场比赛详情及当场阵容。随后用既有第二阶段全部 33 场的实际五人、逐轮种子对阵、BO 与系列胜者分别核验。所有三届都得到 20 场 BO1、13 场 BO3。输出保留核验档案的系列 ID，实际五人逐一对齐后再采用仓库统一的选手昵称。比如智利选手 dav1d 和 dav1deuS 为同一人。[固定 HLTV 数据](https://github.com/zugzugs/hltvy/tree/1a00ba2893a63646f0d940e626b6da95d342a187) · [科隆 BLAST 赛程](https://blast.tv/cs/tournaments/iem-cologne-major-2026/match?view=results) · [选手别名](https://liquipedia.net/counterstrike/Dav1deuS)

另用其他比赛报道按地图名核对双方的回合比分，153 张均一致。奥斯汀 32 场和布达佩斯 33 场用 BLAST 赛事页核验，科隆 33 场用 Reloader。奥斯汀 paiN–Nemiga 的 BLAST 第二阶段 BO1 条目挂载了计划日期为 06-13 的地图，已经晚于目标第三阶段开赛，整条的地图不能用于核对。该场改用 06-07 当天 Dust2 Brasil 的实战报道，与 HLTV 比赛记录均确认唯一地图为 Dust2、paiN 以 13–7 获胜。[BLAST 奥斯汀赛程](https://blast.tv/cs/tournaments/austin-major-2025-finals/match?view=results) · [BLAST 布达佩斯赛程](https://blast.tv/cs/tournaments/budapest-major-finals-2025/match?view=results) · [科隆 Reloader 赛程](https://reloader.gg/esports/cs2/event/iem-cologne-2026) · [paiN–Nemiga 同日战报](https://www.dust2.com.br/noticias/62284/pain-ganha-primeira-no-blasttv-austin-major) · [同场 HLTV](https://www.hltv.org/matches/2382426/pain-vs-nemiga-blasttv-austin-major-2025-stage-2)

**时间和积分。** 主表 `day` 是 UTC 日。奥斯汀有 5 场在 21:20–22:35 UTC 开始，第二份赛果表的日期已跨至次日，均与 UTC+3 换日一致。两侧名单必须完整对齐、同一阶段仅有这一对阵、赛制和胜者相符，再依据原始毫秒时间戳确认 UTC 日。保留 `verifierDay` 便于核查。四份赛前全球邀请榜使用 `stage3_maps/inputs-snapshots.json` 内固定的 SHA-256。`pointsA/B`、`rankDay` 对应严格早于当场的月榜，`stageStartPointsA/B` 与 `stageStartRankDay` 固定在第二阶段开赛前。布达佩斯 12-02 的三场可以看到 12-01 月榜。198 个队侧都得到至少三人核心对应且无并列歧义。主模型的实际先验另行采用在原实验中锁定的赛前 BO 胜率。[Valve 历史邀请榜](https://github.com/ValveSoftware/counter-strike_regional_standings/tree/f8c55f250fdef796d708aa32814587932154fa04/invitation)

**复算。** 输入表可在下载包内离线运行模型。本次于 2026-11-21 回溯重建，赛前冻结预测单另行保存。重新生成时，将固定的 `results.json.gz`、2025-06-02、11-03、12-01 和 2026-06-01 四份原名 Valve 月榜置于同一缓存目录。默认逐字节核对 JSON；加 `--write` 才覆写输入表。额外跨来源核对需要缓存 `austin-blast.html`、`budapest-blast.html` 两个赛事结果页，科隆缓存命名见 [此前的数据来源说明](../cologne_veto/SOURCES.md)。

```sh
python round_form/major_inputs.py --cache /path/to/sources
python round_form/major_inputs.py --cache /path/to/sources --check-other-scores /path/to/cologne-reloader
```
