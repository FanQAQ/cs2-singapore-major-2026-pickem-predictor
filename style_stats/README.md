# 队伍打法的数据与口径

新加坡队伍采用项目的赛前五人名单。每张历史地图须保留至少三名名单中的选手，允许核心更名或转会。关联时对选手名作 Unicode NFKC、去前后空格及大小写归一，未识别的改名可能造成漏计。每条来源分别显示日期和样本量。

## 进攻方交火、补枪和 AWP

[Blanchon 发布的 OpenCS2 demo metadata](https://huggingface.co/datasets/blanchon/opencs2_dataset_demo/tree/912a363098feec3f220e41d68634d2f71676c28b) 采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。冻结版本于 2026-05-02 发布，比赛时间为 2026-03-23 至 04-20。原始 1,988 张地图分存在 137 个索引分片，核验 SHA-256 后筛除两张无法完整匹配双方各五名活跃选手的地图或计数无效的地图，得到 860 个系列赛的 1,986 张。重新计算后的聚合数据保存在 `maps.json.gz`。

| 字段 | 含义 |
| --- | --- |
| earlyContact | T 方回合中，首次敌对击杀早于本图双方所有有效回合中位时间的比例，正好相等计半。时间从冻结结束算起，任意一方均可先击杀。 |
| trade | T 方击杀中，死者在同回合内、此前 1–320 个时间戳 tick 曾击杀 T 方队员的比例。 |
| awp | T 方全部击杀中由 AWP 完成的比例。 |
| rifleHS | T 方步枪击杀中，以爆头完成的比例。分母只有击杀，无法由此计算命中率。 |
| utilityFinish | T 方击杀中由 HE 或燃烧伤害完成的比例，表示道具收尾。 |

仅使用冻结结束至回合结束之间的敌对击杀；没有敌对击杀的回合不进入首次交火分母。地图与对手会影响交火节奏。旧 demo 的打法数据不能代表新加坡开赛周的即时状态。

`cohort.json` 按完全相同的五人组合列出 526 组记录。分位参照系中的 349 组均须覆盖至少四图、两个不同系列、35 个有效 T 方回合及 50 次 T 方击杀，每组权重相同。从前三个指标选主轴；主轴至少位于第 70 百分位，且领先第二名至少五个百分点，才标为该类。其余达到样本要求的队伍记为 mixed，样本不足记为 unknown。该标签描述观测特征，克制效果由独立的后续赛果验证。`events.json` 按指定目标五人聚合达到三人重合的地图；新加坡 11 队有地图、10 队达到分类门槛。科隆开赛前已可访问同一来源，早于该冻结版发布的赛事不可使用。

## 近期击杀分布和助攻

[Ektarr 的 Counter-Strike Pro Matches v11](https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11) 于 2026-11-14 发布。此来源及其汇总按 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 使用。原表 `cs2_all_tiers_games.csv` SHA-256 为 `d99aa6a61c5d9018eef587ce28c026df4dd61406fdd46afe7a8d08bdcdcf2972`。本项目摘取、核验、按选手核心聚合数据。`boxscores.json.gz` 仅涵盖新加坡 90 天窗口（08-23 至 11-20）内原版实际收录的 1,184 图、545 个系列。

过滤总计行、重复地图、非五人/人名重复、ID 缺失/重复及统计缺失的行。每图第一名击杀数之和除以全队各图总击杀，表示逐图击杀集中度，最高者可更换。助攻总数除以击杀总数，表示每次击杀对应的记分牌助攻。覆盖新加坡全部 16 队；13 队达到四图、两个系列的比较要求，对照 111 个合格五人组。该数据不用于科隆等旧赛事。

## 实际闪光弹投掷

`flash_matches.json` 收录 21 个公开 [Bo3.gg 比赛页](https://bo3.gg/matches/liquid-vs-parivision-03-11-2026/grenades) 的事实记录，每条保留原始网址、比赛日期、五人名单、双方投闪总数及各图比分。资料检索于 2026-11-21。检索队名及 Grenades 页面后，核对双方的 flash 表、五名选手投掷数与团队合计、比赛胜负与逐图比分；剔除出现未满 13 分结束地图的系列。对每个新加坡五人核心从已收集页面选最近一至两场。比赛日期介于 09-08 至 11-04，均为此前其他赛事。每回合投闪等于全队两边合计投掷数除以这些系列实际打完的总回合数，包含加时。16 队均有可回查的样本，队伍样本量为 41–151 回合。结果只反映列出的系列，未按对手、地图、经济或攻守方标准化。此来源没有进入相克权重。HLTV flash assist 属于帮助队友完成击杀的次数，与 Bo3.gg 的投掷次数分别展示。

## 离线复核

从项目根目录运行，无需安装第三方包。请先运行第一条，再运行第二条。

```sh
python -B style_stats/boxscores.py --check
python -B style_stats/build.py --check
```

需要重提取原始输入时，先准备单独索引缓存和 pyarrow；近期原表可在上述 Kaggle 版本获取。各字段定义及筛选条件以这些脚本为准。

```sh
python -B style_stats/fetch.py /path/to/opencs2-index
python -B style_stats/extract.py /path/to/opencs2-index
python -B style_stats/boxscores.py --csv /path/to/cs2_all_tiers_games.csv
python -B style_stats/build.py
```
