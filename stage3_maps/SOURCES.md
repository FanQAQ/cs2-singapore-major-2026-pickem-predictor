# 第三阶段的赛前逐图资料

每场实验都使用目标阶段开赛日前的 90 个 UTC 自然日，开赛当日全部排除。`field-maps.json` 保存双方当场五人、地图、回合比分、比赛日期和比赛当时的双方 Valve 积分。`field-veto.json` 保存可回查原场链接的禁图、选图及机会次数。四组资料截至 2026 年 11 月 21 日完成回溯整理，前三组分别属于真正的 Major 第三阶段。EPL 是这个地图实验的外部检验，同一赛事此前用过其他策略。

| 赛场 | 阶段开赛日 | 可用逐图资料日期 | 独立系列赛 | 地图 | 已核实的同池 BO1 / BO3 禁选 | 有 BO3 禁选的参赛队 |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 奥斯汀 Stage 3 | 2025-06-12 | 03-14 至 06-10 | 266 | 555 | 52 / 214 | 16/16 |
| 布达佩斯 Stage 3 | 2025-12-04 | 09-05 至 12-02 | 268 | 606 | 33 / 235 | 16/16 |
| EPL S23 Stage 2 | 2026-03-06 | 2025-12-06 至 2026-03-05 | 160 | 376 | 2 / 142 | 16/16 |
| 科隆 Stage 3 | 2026-06-11 | 03-13 至 06-09 | 167 | 362 | 0 / 25 | 12/16 |

每场均有 16/16 队的实际地图。有两支本届参赛队交手时，表中的地图、系列赛和禁选都只计一次。科隆 G2、BetBoom、Monte、B8 都有逐图回合比分，严格核验后可用的赛前 BO3 禁选为零。其余 12 队各有 1 至 5 场，最后一条真实禁选在 3 月。以这组数据解释科隆的队伍禁选偏好时，时效与覆盖均有明显限制。

## 来源及筛选

- 真实比赛与七步禁选来自 HLTV 赛后战报的公开历史快照，固定 Git 提交为 `1a00ba2893a63646f0d940e626b6da95d342a187`，原始 `results.json.gz` 的 SHA-256 为 `750b0da45142fc797eddb708698d14d269237e59784d6a1d066eddba0ba31551`。覆盖至 2026-03-23。只收实际已打的地图，检查每张图双方的五人一致、系列赛胜负、BO 类型、禁选行为方和剩余地图。真实禁选必须能还原该队每次选择时尚可选择的地图。四个七维数组依次为 `ban`、`pick`、`banOpportunities`、`pickOpportunities`，列顺序为该届 `field.pool`。[原始数据快照](https://github.com/zugzugs/hltvy/tree/1a00ba2893a63646f0d940e626b6da95d342a187)
- 从 2026-03-24 起，使用 Ektarr 的 v11 `cs2_all_tiers_games.csv` 补充科隆窗口。原始 CSV SHA-256 为 `d99aa6a61c5d9018eef587ce28c026df4dd61406fdd46afe7a8d08bdcdcf2972`。每场检查地图唯一、实际五人、逐图胜者及与系列赛汇总的对应。`ektarr:` 标识回指该源的数字 ID。这部分只有实际出场和胜负，没有完整禁选。所有 Ektarr 派生事实沿用 CC BY-SA 4.0。[Ektarr v11](https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11) · [许可](https://creativecommons.org/licenses/by-sa/4.0/)
- 赛前 VRS 使用 Valve 已发布的全球月度邀请榜。使用冻结提交 `f8c55f250fdef796d708aa32814587932154fa04` 内 `invitation/YYYY/standings_global_YYYY_MM_DD.md`。14 份文件的 SHA-256 在 `inputs-snapshots.json`。每一场都使用日期严格早于该场的最近一期月榜，最久相差 35 天。队名变更允许继承，双方都须与该期榜单内唯一最佳匹配阵容重合至少三人。任一侧匹配不足或最佳匹配有歧义即排除。这些年月档是历史版本，比赛事实虽发生在预测日前，整理时间晚于当届赛事。[Valve 冻结版本](https://github.com/ValveSoftware/counter-strike_regional_standings/tree/f8c55f250fdef796d708aa32814587932154fa04/invitation)
- 阶段参赛队与五人取仓库的 `multi_stage/inputs.json` 及 EPL 的 `epl_transfer/rosters.json`。每条地图须至少有一方的实战五人与该阶段某支参赛队重合至少三人。旧池的比赛只能贡献仍在目标七图内的已打地图。真实禁选要求该场的七个步骤恰好覆盖同一套七图；例如 EPL 窗口有 16 场的地图可用、禁选因图池不同无法使用。逐赛事的官方地图与禁选规则见 [地图池核对](POOLS.md)。
- 科隆 Stage 2 的 33 场在 Stage 3 前全部结束。尝试通过赛事索引补全上一阶段 HLTV 逐场战报时，仅有 15 页成功返回，余下的请求受到限流；这批载入不完整的手工资料没有进入实验。由 Ektarr 验证通过的前阶段地图仍可进入比分样本。没有从两局结束的系列中反推未打的第三张图或哪支队伍禁图。[科隆 Stage 2 日期、队伍与赛程](https://www.hltv.org/events/9029/iem-cologne-major-2026-stage-2)

## 复算

下载包包含两张固定输入表，本地运行 `python stage3_maps/profiles.py --check` 可从这些表复核模型输入。若要从上游复核原始提取，把 HLTV gzip 和 14 个原名月榜置于同一个目录，并指向上述 Ektarr CSV。在项目根目录运行下列命令。原始输入核对涉及仓库中已有的 Python 依赖 NumPy 和 SciPy。默认模式逐字节核对已发布的 JSON，显式加 `--write` 时才重新写入。

```sh
python stage3_maps/inputs.py --cache /path/to/source-cache --ektarr /path/to/cs2_all_tiers_games.csv
```

两份产物的 SHA-256 分别为 `d98be042c23d4cbf17880135267144bc74e6c02823b437e46495d2ab707c5478`（逐图）和 `9d44aca1999f0f8d515688386e393dc98544b489e75d9e1891183a25b53ca14c`（禁选）。
