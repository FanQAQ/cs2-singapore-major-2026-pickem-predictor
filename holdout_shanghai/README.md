# 上海 2024 第二阶段留出回放

2024 年 12 月 5–8 日的 Elimination Stage，16 队、33 场。哥本哈根第二阶段第一次用于选卡对照之后，本阶段单独保留给定稿候选作第二次检验。其首阶段属于五届开发集，两阶段有八支队伍重合。原始赛果已在项目历史档案中，用过本阶段比较新策略后，应记录候选版本和首次评分，再次参考得分调整的新策略需另找留出样本。

## 胜率输入

沿用上海首阶段的 11 月 6 日实力榜、同日截止的训练样本和冻结系数。前八队从 11 月 25 日公布的种子及阵容取值；晋级八队采用原首阶段报名阵容，全部种子按 12 月 3 日发布的 1–16 名单排定。首阶段资格、首轮配对进入瑞士轮，首阶段胜负没有进入实力估计。[Valve 历史全球榜](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/f8c55f250fdef796d708aa32814587932154fa04/invitation/2024/standings_global_2024_11_06.md) · [11 月 25 日种子及阵容](https://www.hltv.org/news/40395/valve-releases-major-seeding-ranking-update) · [12 月 3 日完整种子及 8 场首轮](https://www.hltv.org/news/40466/perfect-world-shanghai-major-elimination-stage-opening-round-set)

赛前首发与全球榜逐人匹配，15 队重合五人。Vitality 的榜上成员 JACKZ 由比赛首发 mezii 替代，四名共同成员足以继承该条积分。每支队的 90 天近期表现也以当场直接匹配的三人核心为下限。Liquid 与 Wildcard 的名单出现在多张区域榜，全球积分均可确认，区域归属留空。

两项附加修正在上海冻结配置中的实际权重均为 0。赛制校正的方向验证不足，跨区 VRS 系数也没有通过预设的赛前验证。因此 16 队均可用网站当时的推荐模型原样生成 BO1／BO3 胜率矩阵，全部潜在对阵保留统一的基础胜率。额外线下赛和 BO3 自选图开关沿用当届回放的默认关闭状态。

## 基线与复现

发布种子 33719 的原推荐卡命中 **7/10**，分别为 3–0 命中 1/2、普通晋级 5/6、0–3 命中 1/2。20 场 BO1 的 Brier 为 0.21345，对数损失 0.61659；13 场 BO3 分别为 0.16952 和 0.52320。选择卡片使用 12,000 条路径，模拟估计另用 12,000 条路径。现场首发经 66 个参赛方逐人核验，五轮 33 场配对、胜者及赛制经重放核验。逐场概率和实际战绩见 `baseline.json`。[HLTV 逐轮赛果](https://www.hltv.org/events/7524/perfect-world-shanghai-major-2024) · [Ektarr v11 系列赛原始资料，派生字段采用 CC BY-SA 4.0](https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11)

从项目根目录运行。两届共享逐场输入重建和评分流程，各自保存参赛名单、来源及逐场结果。

```sh
python -X utf8 holdout_shanghai/freeze.py --check
node holdout_shanghai/check.cjs
```
