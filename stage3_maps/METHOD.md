# 如何在开赛前估计两队会打哪些地图

对于每届 16 队，研究程序先生成 120 种对阵的 BO3 概率，然后模拟对手和晋级路径。赛后比分只用来验证配对和计分。奥斯汀与布达佩斯的第三阶段各有 20 场 BO1、13 场 BO3；科隆全 33 场 BO3。三届共 40 场 BO1、59 场 BO3，EPL 的另 33 场 BO3 单列。[赛制、图池和换图日期](pools.json) · [预设口径](PROTOCOL.md)

**分图实力**沿用网站已有的赛前公式。每张地图用历史双方 VRS 和 BO 赛制估计原胜率，再看超预期胜负。每队在某图的偏差先减去其全地图总体偏差，避免将原模型已有的全队实力再算一遍。窗口 90 天，半衰期 45 天，保留越多原首发权重越高。每张图以约 12 张五五开地图的信息量收缩到零。一支队反复打同一个阵容时，每场再除以窗口内双方对阵的系列数。判断对手阵容也要求至少三人重合，不受换队名影响。[既有分图公式](../map_strength/README.md) · [赛前档案生成程序](profiles.py)

**真实禁选候选**只取历史同七图池、能核实禁图/选图行动方和当时可选地图的 BO3。两队都无证据时取原胜率；一方缺证据时，它从余下地图中等概率行动。两队均有分图数据的地图才可产生相对实力修正。通过 35 种合法三图组合等概率时精确复现原 BO3 胜率，再按可能的禁选顺序改变各组合所占权重。Major 和 ESL 高种子都能选先后手，赛前各按一半处理。Major 的最后两禁为 B、A；ESL 的为 A、B。[网站地图推演](../map_model/METHOD.md) · [Valve 当期规则](https://github.com/ValveSoftware/counter-strike_rules_and_regs/blob/a22f91da503d3afc00045fdad339bc6a3cd19c98/major-supplemental-rulebook.md#map-pick-ban) · [ESL 赛季规则](https://drive.google.com/file/d/1ZMxPYAv__yDwI7rNTvCcB8ah_aPWV_gR/view)

**出场频率对照**只知道历史打过的地图。每方各图出场量加一个均匀先验，两队取几何均值，三张图的权重相乘并在 35 组内归一。只有从换图次日开始、赛前实际打过的 BO3 地图用于频率估计；同一时期若特定赛事迟换图，仍可能存在误差。打成 2–0 时第三图未上场，也会使出场频率与计划图池有差异。两种方法单独评分。

**瑞士轮与整卡**使用正式推荐的条件全胜率和末位种子填法。一个种子先给 12,000 条选卡路径，再给 12,000 条独立评估路径；30 组随机数以相同顺序用于各模型。EPL 以赛前 VRS/400 为基础胜率，采用其自身实时评分安排对阵。该评分按 2–0／2–1 不同幅度更新，模拟比分仍使用此前独立 ESL 实验的等概率单图近似。上述模型之间只改变 BO3 系列胜率。[EPL 原实验](../epl_transfer/README.md) · [对照与实际评分程序](evaluate.cjs)

在项目根目录执行以下命令可离线重算。档案计算复用项目 Python 3.10+、NumPy、SciPy 的已有统计模块，瑞士轮和整卡评分使用 Node。

```sh
python stage3_maps/test_profiles.py
python stage3_maps/profiles.py --check
node map_model/check.cjs
node stage3_maps/evaluate.cjs --check
```
