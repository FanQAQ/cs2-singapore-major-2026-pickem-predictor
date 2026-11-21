# 赛前真实禁选记录

每届取模型日期（含当日）往前 90 个自然日，只保留与本届相同七张地图的 BO1 和 BO3。每场须能确认六个有真实行为方的禁选动作，以及最后一张剩余地图。BO1 每队禁三张；BO3 每队禁两张并选一张。比赛地图和比分只用于核对资料的身份和完整性。预测输入是该队在本届开赛前的历史选择，不使用本届实际的禁选顺序。

| 赛事 | 赛前截止 | 有效 BO1 / BO3 场数 | BO1 / BO3 有资料的队伍数（各 16 支） |
| --- | --- | --- | --- |
| 哥本哈根 2024 | 2024-03-04 | 139 / 162 | 16 / 16 |
| 上海 2024 | 2024-11-06 | 122 / 272 | 16 / 16 |
| 奥斯汀 2025 | 2025-06-02 | 135 / 287 | 13 / 16 |
| 布达佩斯 2025 | 2025-11-03 | 9 / 324 | 8 / 16 |
| 科隆 2026 | 2026-06-01 | 21 / 70 | 11 / 16 |
| 新加坡 2026 | 2026-11-02 | 12 / 159 | 8 / 16 |

按真实场次去重，同一届两支参赛队曾经交手时可分别使用双方的选图证据。每队以实际出场五人与本届首发的人员重合归属，至少三人。菜单中的「有资料」包括一场。近期 BO1 较少，尤其布达佩斯与新加坡，覆盖队数和实际样本量需同时查看。

## 统计与复算

`evidence.json.gz` 保存 1,868 条队侧记录，每条含赛前赛事归属、比赛日期、HLTV 比赛 ID 与原始链接、当场该方五人、重合人数、数据来源和四个七维统计。四项依次为禁图次数、选图次数、轮到该队禁图时各图仍可选的次数、轮到该队选图时各图仍可选的次数。单场「该图一直已被对方禁用」和「本队有机会选择却没有选」的分母不同。地图顺序取该届 `map_strength/events.json` 的 `pool`。

在项目根目录离线运行：

```sh
python3 map_veto_data/build.py --check
python3 -m unittest discover -s map_veto_data -p 'test_*.py'
```

## 数据来源与原始提取

- 历史主档取自 2026-03-24 发布的 [zugzugs/hltvy 快照](https://github.com/zugzugs/hltvy/tree/1a00ba2893a63646f0d940e626b6da95d342a187)。`extract_archive.py` 校验固定 SHA-256，按比赛 ID 解析真实七步、逐图双方名单和比分。BO1 的汇总比分可以使用实际回合数（如 13–10）。科隆在主档日期范围之后的部分，用在该届截止日前已经结束的公开比赛补充。
- 新加坡采用 [2026-10-16 smallmeji 公开导出](https://github.com/smallmeji/hltv-cs2-data-public/tree/f9143e44f3eb5dc1870c903f2707b3c131c9a047/teams) 的队伍文件。十月固定快照中的排名不筛选以前的 Major。读取 manifest 所列 49 件 `veto-history-deep.json`，查验选择人、选择顺序、七图完整性与来源记录时间。再用 [2026-11-20 Griffin 公开导出](https://github.com/Griffinxaxa/scrape-hltv-data/tree/f5e3e90fb56fef8adc19bd5e5e898d2741d0ff58/2026-data/archive) 补充 10 月中旬至 11 月 2 日已经结束的比赛。此处未读取 Griffin 的排名与评分，也未读取 11 月 2 日之后的赛果。新加坡的截止为历史事实日期，整理数据的时间在此之后、Major 开赛之前。
- 阵容优先采用原场可核实、所有已打地图相同的双边实际五人，缺少直接证据时以 [Ektarr v11 逐图表](https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11) 跨源核对。须同时匹配双方、日期、赛制、实际已打地图、完整赛果和同场五人。多个可能匹配、名单矛盾、地图池变化或不足三人的记录会被剔除。辅助小样本来自 HLTV 发布的真实比赛页面，原场链接逐条保留。各个存档的生成日与当场已公开的比赛事实日期分别记录，五届历史属于回溯重建。
- 整理后的证据仅含可复核的场次索引及本站用到的派生统计。需要从上游重新整理时，可用 `extract_archive.py archive.gz history.json`、`extract_snapshot.py teams/*/veto-history-deep.json --output snapshot.json`、`extract_singapore_csv.py csv_folder late.json` 输出统一结构，再运行 `prepare.py --games cs2_all_tiers_games.csv --input hltvy=history.json --input smallmeji=snapshot.json --input griffin=late.json`。如需加入手工核验的原场资料，可重复传入 `--input hltv=reviewed.json`。每项含 `url, day, a, b, bo, steps`，并可附实际五名选手的 `lineupA, lineupB`。每一步为 `[a 或 b（剩余地图用 null）, ban/pick/left, map]`。同场重复来源按队伍方向统一后去重，出现矛盾时整场排除。
