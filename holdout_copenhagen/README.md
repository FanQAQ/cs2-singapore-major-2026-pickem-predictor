# 哥本哈根 2024 第二阶段留出回放

2024 年 3 月 21–24 日，哥本哈根 Elimination Stage，16 队，33 场。旧五届开发集只评估各届首阶段。此次首次将本阶段用于整卡策略检验。同一届首阶段及其部分队伍进入过开发集，第二阶段的赛果也曾用于后续届的历史特征。这是一阶段的回顾性检验。后续实验如据此调整策略，应将它计为已使用的验证集。

## 开赛前输入

实力、训练样本与近期战绩冻结在 3 月 4 日，参赛资格与首轮配对截至 3 月 20 日。八支直接参赛队伍采用 3 月 5 日报道中的首发和种子。另八支沿用首阶段赛前首发，按第二阶段公布的首轮配对确定 9 至 16 号种子。比赛中途没有调整球队实力。[3 月 5 日名单与种子](https://www.hltv.org/news/38424/pgl-major-copenhagen-attendees-finalized) · [3 月 20 日首轮赛程与赛制](https://www.hltv.org/news/38552/spirit-vs-cloud9-headlines-elimination-stage-round-1)

`freeze.py` 从项目冻结的 Valve 三张 3 月 4 日区域榜中选取与参赛五人重合最多的唯一记录，至少须有三名共同选手。16 支队伍在本次均与榜上五人完全重合。使用 `strategy_v4/build.py` 和原逐场资料生成 16 队截至 3 月 4 日的 90 天表现，对每一场也以三名共同选手为下限。八支第一阶段晋级队的特征逐项与原发布值复核。[欧洲](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/99a0ba5fff938345d10d500f8b29cd297076573e/standings_europe.md) · [美洲](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/99a0ba5fff938345d10d500f8b29cd297076573e/standings_americas.md) · [亚洲](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/99a0ba5fff938345d10d500f8b29cd297076573e/standings_asia.md)

`fixture.cjs` 把这些赛前资料代入网站对应届的推荐模型、系数和特征开关。3 月 4 日赛制校正的可靠性权重为 0，赛区 VRS 功能所需的官方全球表当时尚未发布，所以 BO1、BO3 两张胜率矩阵相同。赛前资料与赛后赛果经两个不同函数读取，可单独构造完整胜率矩阵。

## 独立计分

按固定种子 33719，12,000 条路径填卡，另外 12,000 条估计该卡的模拟表现。然后再从 `major_form/all_stages.json` 读取第二阶段胜者、对手与赛制。程序核对 66 个参赛方的当场首发与赛前名单，实际瑞士轮 33 场全部按官方种子和规则重放匹配。赛后资料沿用项目中按 CC BY-SA 4.0 归属的 Ektarr v11 派生记录。[原数据集](https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11) · [HLTV 比赛与逐轮结果](https://www.hltv.org/events/7148/pgl-cs2-major-copenhagen-2024)

固定推荐得到 **5/10**，其中 3–0 命中 1/2，普通晋级 4/6，0–3 命中 0/2。20 场 BO1 的 Brier 为 0.20241，对数损失 0.59322。13 场 BO3 的 Brier 为 0.22138，对数损失 0.62658。`baseline.json` 保存胜率矩阵摘要、每格实际战绩及逐场预测概率。卡片类别 0、1、2、3 分别表示 3–0、普通晋级、0–3、未填写。

从项目根目录运行。Python 重建依赖项目原有的 NumPy 与 SciPy；Node 检查直接使用冻结输入。

```sh
python -X utf8 holdout_copenhagen/freeze.py --check
node holdout_copenhagen/check.cjs
```
