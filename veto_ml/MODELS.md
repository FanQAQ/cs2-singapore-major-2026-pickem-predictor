# 固定逐图实力，预测 BO3 实际会选到哪三图

上海两个瑞士阶段的地图集合预测都改善，科隆三个阶段都退步。科隆的赛前同池禁选较少，三阶段的集合损失分别增加 0.094、0.304 和 0.118。真正 Major Stage 3 三届合计 59 场，从 3.0285 降到 3.0214。另选的阿斯塔纳 33 场从 2.8675 降到 2.7317。下表使用自然对数，每场按实际三图集合计算一次，越低越好。过关数、逐局胜率误差和整卡另有按相同路径的独立报告。[预注册](../latent_form/NEXT-VETO.md) · [逐场集合](sets.json) · [整卡及胜率](cards.json)

| 组别 | 完整七步 / 全部实打 BO3 | 原地图 ML | 改用双方禁选习惯 |
| --- | ---: | ---: | ---: |
| 五届首阶段 | 65/65 | 3.0413 | 2.9191 |
| 五届第二阶段 | 65/65 | 2.9962 | 2.9267 |
| 奥斯汀 Stage 3 | 13/13 | 3.0998 | 3.0095 |
| 布达佩斯 Stage 3 | 13/13 | 2.9923 | 2.7508 |
| 科隆 Stage 3 | 33/33 | 3.0146 | 3.1327 |
| EPL S23 Stage 2，既有迁移样本 | 33/33 | 3.0494 | 3.0486 |
| Cluj 2026，既有迁移样本 | 33/33 | 3.0510 | 2.9401 |
| 布加勒斯特 2025 春，既有迁移样本 | 33/33 | 2.9486 | 2.8459 |
| 阿斯塔纳 2025，本次新增留出 | 33/33 | 2.8675 | 2.7317 |

17 个已结束的阶段共有 321 场实打 BO3，均有两张各队选图和一张最后余图。180 场以 2–0 结束，未打决胜图由第七步确定。科隆 S1/S2/S3 分别有 11/8/15 张此类余图。全体平均集合损失为 3.0042 和 2.9281。阿斯塔纳是本轮方法的新增历史留出，其赛果可在后来赛事的已封存训练历史里。新加坡仍待开赛。[阿斯塔纳出处](astana-SOURCES.md) · [科隆第三阶段逐场来源](cologne-outcomes.json)

## 每场开赛前实际知道的信息

- 每个场地按固定的 16 队生成全部 120 对阵，每对保留七个 ML 概率。原算法由历史出图频率的几何均值生成三次不放回抽样，把六种顺序相加。候选枚举两队各有一半机会先手的六个真实禁选步骤，对每种路径的两个选图和余图计入对应集合。两算法均用三张图中至少赢两张的概率求和；BO1 沿用原矩阵。[地图 ML](../f1bre_models/ML.md) · [禁选算法](../map_model/model.js)
- 旧四场地直接使用既有的同池 BO3 动作/机会数。其余场地按截至锁盘前一日的 90 天重建。历史当场五人与该队至少三人重合，双方均要能在当场之前公开的 VRS 继承至少三人。每份选择按重合人数除以五、45 日半衰以及同核心对手在已核实赛程中出现的次数倒数加权。对每队的实际可选机会加 4 个平滑机会，未观察到的一方在合法余图中均匀行动。双方都缺数据时使用原 ML 全套分布。[资料筛选](profiles.py) · [逐队证据](weighted-sides.json.gz)
- Major 为 A禁、B禁、A选、B选、B禁、A禁；EPL S23 的后两禁为 A、B。PGL 三个外部赛事沿用正式开赛前同办赛事、资格赛可观察到的 B、A 顺序。阿斯塔纳当届资格赛有 230/232 场，上一站布加勒斯特正赛有 40/40 场如此。Cluj 2026 的上一届同城赛和上一站 PGL Masters Bucharest 均为 40/40。布加勒斯特欧洲封闭预选为 56/56。它们是对开赛前办赛惯例的估计。[Valve 与 ESL 规则](../stage3_maps/POOLS.md) · [Cluj 留档场次](https://www.hltv.org/matches/2379326/mouz-vs-big-pgl-cluj-napoca-2025) · [布加勒斯特资格赛](https://www.hltv.org/matches/2379885/eclot-vs-rebels-pgl-bucharest-2025-europe-closed-qualifier)
- 科隆 Stage 3 的旧 25 份同池 BO3 加上此前 Stage 2 的完整七步。Stage 2 的 13 场 BO3 中有 11 场至少一方继承到本届 Stage 3，合计 36 场能贡献禁选。每队 1–5 场，仅 3/120 个对阵的双方都至少有 5 场。Cluj 有 71 个独立 BO3，每队 2–10 场。新加坡预先封存时能用 146 个独立 BO3、158 个队侧记录、每队 3–18 场，120 对均有双方资料，91 对双方各至少 5 场。最后一份合格禁选为 11 月 2 日；这 146 场不代表收全直到 11 月 20 日的全球比赛。[科隆补档](../cologne_veto/RESULTS.md) · [全部赛场和各队最后证据日](profiles.json.gz)
- 阿斯塔纳用 5 月 9 日已公布的 G2 与 paiN 教练替补阵容，在开幕 16 队的 80 个位置逐一核实。之后的换人未用于回填。模型截止 2025-05-10，历史最后实打日为 5 月 8 日。10,601 张图训练，2,327 张图校准，464 张隔离切分边界。该窗无可用选手 Rating 观测，以原 ML 的其他既有指标和缺失处理预测。目标赛事开打后的训练地图数为 0。[场地与临阵名单](astana-field.json) · [训练审计](astana-ml/ml.json.gz)

## 本地复算

在仓库根目录运行。第一组使用下载包内中间数据核验逐图训练、两套分布及真实三图评分。Node 单独调用原 JS 内的枚举器，逐个核对 18 个场地的 75,600 个集合概率。最大绝对误差为 5.2×10⁻¹⁵ 以内。从保留到八位的逐图 ML 胜率复算原始 BO3 时，最大绝对误差为 7.3×10⁻⁹ 以内。

```sh
python veto_ml/astana-ml/build.py --part model --check
python veto_ml/build.py --check
node veto_ml/verify.cjs
python veto_ml/score_sets.py --check
```

从完整原件开始时，把 HLTvy 文件按原名保存为 `results.json.gz`，提供 Ektarr v11 实际比赛 CSV、对应 Git 提交的 Valve 月榜和 Griffin 的五张冻结 CSV。两个脚本分开重建赛前输入与赛后真值。所有文件哈希随产物留存。

```sh
python veto_ml/astana-ml/build.py --hltvy /data/results.json.gz --ektarr /data/games.csv --ranks /data/valve --check
python veto_ml/profiles.py --hltvy /data/results.json.gz --ektarr /data/games.csv --ranks /data/valve --griffin /data/griffin --check
python veto_ml/score_sets.py --archive /data/results.json.gz --check
```

赛前全场矩阵 SHA-256 为 `50e83020dcea7c3244dd0fbd2fc625be71f0f39074b3b97b822a0720578c3aa4`，阿斯塔纳逐图 ML 为 `09685704c5a1305efe62a45d0ead5a10db143aa3dac4da2ef175e00988c61195`。真值档为 `4e3606305aa8af2590093e160c2ee5c915ca29ef95f5147f9ddc209c5be91ea8`。每场赛后诊断的 `actualSetBo3` 表示赛后给定真实三图、仍使用赛前逐图 ML 时的队 a 胜率，只供诊断；赛前的两套 BO3 分布均独立封存于 `models.json.gz`。[预测及输入哈希](models.json.gz) · [集合评分和赛果链接](sets.json)
