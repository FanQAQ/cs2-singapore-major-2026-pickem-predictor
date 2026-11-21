# 下一项检验：同一组七图 ML 胜率，真实禁选习惯能否更准地预报 BO3？

先在每个场地锁定全部 120 种潜在对阵的七图胜率与两套选图分布，再接入目标赛事的禁选真值和赛果。这次只核对了覆盖，尚未计算候选卡分。

原禁选研究用队伍的逐图战绩残差估计地图实力，以七图等可能时还原线上 BO3 胜率为锚点。原地图 ML 则直接给每对对手预测七张图，以双方历史上场频率的几何均值给出地图权重，并从七图中依次不放回抽取三图。此前缺少的对照是让两套选图方法乘上**完全相同的七个 ML 胜率**。这能单独检验选图选择是否足以改善系列赛预测。[旧禁选实验](../stage3_maps/PROTOCOL.md) · [科隆补档](../cologne_veto/RESULTS.md) · [地图 ML 的原权重](../f1bre_models/ML.md)

## 现有赛前覆盖

以同七图池、赛前 90 天 BO3 和至少三名原首发为准，逐队核对球队名和图池。下表第二、三列都是**对阵数**，需双方各满足条件。五份是描述覆盖厚度的分界，本次拟议算法不以此调参。

| 场地 | 双方各至少 1 份禁选 | 双方各至少 5 份禁选 | 每队观察范围 |
| --- | ---: | ---: | ---: |
| 奥斯汀 Stage 3 | 120/120 | 120/120 | 11–25 |
| 布达佩斯 Stage 3 | 120/120 | 120/120 | 11–28 |
| 科隆 Stage 3，含科隆 Stage 2 补档 | 120/120 | 3/120 | 1–5 |
| EPL S23 Stage 2 | 120/120 | 120/120 | 6–18 |
| 合计 | 480/480 | 363/480 | |

从项目根目录用 PowerShell 复算。命令只读取赛前模型和禁选样本数。

```powershell
@'
import gzip, json
from itertools import combinations
from pathlib import Path
def read(name):
    p = Path(name)
    raw = gzip.decompress(p.read_bytes()) if name.endswith(".gz") else p.read_bytes()
    return json.loads(raw)
fields = {**read("f1bre_models/ml.json.gz")["fields"], **read("ml_allocation/ml.json.gz")["fields"]}
enhanced = read("cologne_veto/eval-profiles.json")["augmentedVeto"]
for key, profile in read("stage3_maps/profiles.json").items():
    field = fields[key]
    veto = enhanced if key == "cologne-2026-3" else profile["mapVeto"]["teams"]
    assert set(field["teams"]) == set(veto) and set(field["pool"]) == set(profile["mapVeto"]["pool"])
    assert len(field["mapProbabilities"]) == 120
    counts = [veto[t]["bo3"]["n"] for t in field["teams"]]
    print(key, [sum(min(a,b) >= k for a,b in combinations(counts,2)) for k in (1,5)], min(counts), max(counts))
'@ | python -
```

## 固定一个候选并检验两层收益

1. 用原 ML 的前瞻特征、七图顺序和逐图概率。基准保留旧的几何均值权重和无放回分布，须先重现原 BO3 矩阵。候选复用旧禁选行为计数、动作发生时的可选机会数、45 天半衰期、同一对手重复降权和 4 个先验机会的平滑。在此枚举器中以相同概率平均“队 1 是 A”和“队 2 是 A”，据赛前规则处理选禁次序。Major 的末两禁为 B、A，EPL S23 为 A、B。新外部赛事另核规则。缺一方习惯则该方按剩余合法图均匀选，两方全缺时回到原 ML 基准。BO1 及单图 ML 概率原样使用。[既有禁选枚举](../map_model/model.js) · [规则资料](../stage3_maps/POOLS.md)
2. 对七图取三图的 35 个无序集合。基准把每个集合 6 种抽取顺序的概率相加；候选把合法六步选禁产生同一集合的概率相加。若三图单图胜率为 p、q、r，两组均用 `pq+pr+qr−2pqr` 算系列胜率，仅改变集合权重。按图名对齐原件，核三图集合质量总和为 1、BO3 反向互补，以及同一权重是否重现原矩阵。
3. **先评分选图。** 真实标签为各队一张选图和禁选结束时的最后余图。预测交卡前这三张均未知。赛后从目标赛事完整七步记录提取三图集，以集合对数损失 `−ln P(实际集合)` 比较。2–0 的决胜图虽未开打，完整禁选仍能确定其图名。缺可靠余图、弃赛或与图池不符时标出原因和分母，绝不按已打两图补猜决胜图。现有 HLTvy 源中奥斯汀、布达佩斯、EPL S23 的目标瑞士轮 BO3 分别有 13/13、13/13、33/33 场带七步记录；实际评分前仍需核对行动方及合法顺序。科隆须另核完整目标七步覆盖，科隆 Stage 2 的赛前资料不能用作 Stage 3 真值。
4. **再评分比赛和观众卡。** 对所有实打 BO3 独立记录赢家概率的 Brier 与对数损失，即使该场缺地图集真值，也可进入此项分母。保持原配对规则、填卡策略和 30 个配对种子，比较阶段真实过关数、总命中与 0–3 命中，逐届披露科隆稀疏样本。地图集更容易预测、系列结果更容易预测和整张卡达五格各自计分。

## 留出安排

三届 Major 已用于开发，EPL S23、Cluj 2026 和 2025 春季布加勒斯特也已用于本项目其他方法，只作迁移检查。新增、单列 PGL Astana 2025 的 16 队全 BO3 瑞士阶段。选择依据是赛前已公开首轮，原始档中 33/33 场瑞士 BO3 有七步禁选，本轮未计算其候选概率、选图损失或卡分。部分更晚赛事的既有 ML 训练历史可包含这项比赛，故“留出”专指本次候选选择和这项赛事本身开打前的预测。下一轮先以 2025-05-10 截止重建该场地的 16 队赛前阵容、VRS、七图 ML 与同核心禁选，确认 PGL 的 BO3 规则和 33 场真实配对，再作一次固定方案检验。若无法证实资料，将缺项写明并保留这项既定分母。外部赛事不计作真 Major Stage 3。[PGL 赛事资料](https://www.pglesports.com/cs2/pgl-astana-2025/) · [赛前首轮公告](https://www.hltv.org/news/41597/pgl-astana-opening-matchups-revealed) · [赛前赛制说明](https://www.hltv.org/news/41628/pgl-astana-teams-format-schedule-prizes-talent-fantasy)
