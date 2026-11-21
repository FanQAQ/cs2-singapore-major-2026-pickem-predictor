# 六届首阶段的分地图实力

每届用赛前 90 天的逐图比赛估计队伍在哪些地图相对擅长。每张图保留双方当场五人、实际上场的地图、胜者及赛前上一期 VRS 积分。BO1 和 BO3 系列都需要能用完整逐图比分还原系列总比分。历史比赛至少有一方与当届首发重合三人。即使俱乐部名称变化也按实际选手归属。对手的赛前积分快照也需要与其当场五人至少重合三人，且排名匹配唯一。独立地图以源比赛和地图 ID 去重，出现比分、五人或标识冲突的系列赛排除。

在每张图的历史数据中，用比赛前的双方积分差建立预期胜率。BO1 采用 Elo 的 400 分刻度，对 BO3 先求解同实力三图模型的单图预期概率，即使最终打成 2–0 也按 BO3 的赛制计算。每图残差为实际胜负减预期胜率，按 45 天半衰期和保留原阵容的比例加权。设某队某张图的加权残差和为 E，按相同权重累加 p(1−p) 得到信息量 I。在全图上汇总求队伍总体表现 T = ΣE / ΣI。该地图的对数几率修正量为 (E − I×T) / (I + 3)。这一收缩强度约相当于添加 12 张五五开的中性地图。只有一种地图的队伍无法分辨图间差异，该队修正为零。缺少指定地图时该图修正也为零。

评级只使用比赛日期之前的快照，当前 Major 阶段的赛果没有参与。只记当届实际采用的七张地图。六个阶段的地图池按 HLTV 赛事页的 **Map pool** 栏单独核对，链接见 `events.json` 的 `poolSource`。历史样本是对能够核实的赛前事实作的重建，公开数据源的保留范围随年代和赛区变化。

| 首阶段 | 特征截止 | 历史系列赛 | 不重复地图 | 具备地图数据的参赛队 |
| --- | --- | ---: | ---: | ---: |
| 哥本哈根 | 2024-03-04 | 79 | 158 | 13/16 |
| 上海 | 2024-11-06 | 164 | 377 | 16/16 |
| 奥斯汀 | 2025-06-02 | 119 | 254 | 16/16 |
| 布达佩斯 | 2025-11-03 | 126 | 299 | 15/16 |
| 科隆 | 2026-06-01 | 83 | 190 | 13/16 |
| 新加坡 | 2026-11-02 | 160 | 366 | 15/16 |

同一场两支 Major 队伍对打时可同时形成两队的赛前样本，因此逐队样本量之和可能大于不重复地图数。分图数据与 V4 的回合净胜特征采用各自的取数方式。分图数据可直接将比赛中实际登场的双方名单匹配至当时积分榜，共同比赛样本不要求另有相同场次的 Valve 比赛明细。新加坡的 Chinggis Warriors 未获有效地图样本，FlyQuest、Imperial 分别只有两图。

## 来源和复现

`maps.csv.gz` 是从 Ektarr 职业比赛档案 v11 合并赛前 Valve 积分得到的派生事实表，沿用 CC BY-SA 4.0。取数过程仅保留训练所需的赛前事实。Ektarr 原 CSV 的 SHA-256 在 `history24/build.py` 中固定，近年 Valve 月榜使用 `datajob/build_features.py` 的固定 Git 提交，早期地区榜对应历史版本详见 `history24/METHOD.md`。[Ektarr v11](https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11) · [Valve 排名档案](https://github.com/ValveSoftware/counter-strike_regional_standings) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

从站点源码根目录执行下列命令复算已冻结的数据。依赖 Python、NumPy 和 SciPy。

```sh
python map_strength/build.py --check
python -m unittest discover -s map_strength -p 'test_*.py'
```

如已取得上述版本的原始 CSV，可用下列命令复核原始提取。早期 Valve 地区榜缓存在指定的目录，近期月榜复用 datajob 的缓存和固定下载版本。

```sh
python map_strength/prepare.py --maps /path/to/cs2_all_tiers_games.csv --historic-ranking-cache /path/to/vrs-cache --check
```
