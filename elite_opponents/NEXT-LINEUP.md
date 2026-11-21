# 换人后，旧阵容的哪部分战绩还能用？

2025 年克卢日开赛时，MOUZ 能继承 25 场 BO3，八场打的是当时的世界前八。25 场全都只保留了当届首发中的四人。赛前报道已明确这是 Spinx 加入后的首秀。到奥斯汀第三阶段，同一套五人已打过 23 场可计入的 BO3，其中 15 场打前八。两个时间点的 MOUZ 不应得到相同的证据权重。下轮只检验旧阵容战绩的权重，球员本人的表现仍可跨队继承。[克卢日赛前首秀消息](https://www.hltv.org/news/40967/pgl-cluj-napoca-schedule-announced) · [逐队数据及可观测首场](lineup_probe.json)

## 80 个赛前参赛席位

每场取已发布的当期全球 Valve 榜，分别统计对前八和其余对手时，参赛五人与当时实际五人重合三、四、五人的场次。比赛双侧都符合时，各计一个队侧。人口是整个 180 日窗内、对局双方均能匹配当时 VRS 的唯一 BO3。奥斯汀沿用上一轮全届排除克卢日 40 场的约定。机器表分别列出每队窗内第一场完整五人 BO3，以及在较宽的 23,524 场系列赛档中可观察到的首场完整五人比赛；后者允许 BO1、BO5 和更早日期。两个字段均仅查到各自锁盘前。来源稀疏时日期可能晚于真实首秀。[原训练人口与防泄漏界限](../tail_calibration/TRAINING.md) · [2026 年 9 月原始榜单](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/d007fa190cda39097a3ddd55bb6455adade117a9/invitation/2026/standings_global_2026_09_07.md)

| 场地 | 历史 BO3 人口 | 对前八，3 / 4 / 5 人 | 对其余，3 / 4 / 5 人 | 窗内可见完整五人 BO3 的队伍 |
| --- | ---: | ---: | ---: | ---: |
| 克卢日 2025 | 2,173 | 13 / 42 / 38 | 86 / 132 / 127 | 15/16 |
| 奥斯汀 Stage 3 | 2,567 减 40 | 7 / 34 / 110 | 19 / 73 / 260 | 16/16 |
| 布达佩斯 Stage 3 | 3,381 | 7 / 39 / 114 | 6 / 85 / 311 | 16/16 |
| 科隆 Stage 3 | 2,172 | 2 / 32 / 111 | 25 / 62 / 230 | 15/16 |
| 新加坡 Stage 1，11 月 21 日 00:00 UTC 截止 | 545 | 1 / 14 / 33 | 12 / 37 / 119 | 13/16 |

克卢日的 3DMAX 有 42 场四人历史，但 bodyy 随完整五人至少在 2 月 10 日实打过一场。Falcons 继承了 27 场三人历史，五人从 1 月 15 日起有五场。Imperial Valkyries 的 tory 在此前卡托维兹由教练临时代打，但克卢日这五人早在 2024 年 2 月就同场，在本窗也有十场。科隆的 MOUZ 遇到另一种情况，全部 33 场只重合四人。俱乐部为 Major 受限的换人名额采用了 xelex 与 Brollan 同队的阵容，此时 Spinx 已是老队员。[克卢日赛前首发及转会](SOURCES.md) · [科隆申报名单](https://www.hltv.org/news/44438/esl-reveals-iem-cologne-major-rosters) · [MOUZ 阵容变化](https://www.hltv.org/news/44408/mouz-set-for-major-overhaul-as-xelex-is-promoted-and-jl-joins-on-loan)

三届 Stage 3 也给出反例。奥斯汀 FURIA 对前八的八场中四场只留三人、四场五人相同，其余对手为 17 / 0 / 7。布达佩斯和科隆两届 FURIA 的全部样本都保留五人。奥斯汀 Spirit 则从一开始就有 32 场五人同场。不能靠一种换人标签解释这两队三次 3–0。三届、两个俱乐部的六格仍然只算三届。[完整席位与样本](lineup_probe.json)

### 新加坡零样本的三个实物核对

| 队伍 | 原 BO3 窗对前八；其余（3 / 4 / 5 人） | 截止前独立证据 |
| --- | --- | --- |
| Wildcard | 0 / 0 / 0；0 / 5 / 0 | 9 月 26 日 17:00 UTC 排定对 NRG 的 LAN BO3，每张图列出 HexT、Cxzi、fr3nd、nEMANHA、reck。[逐图名单](https://www.hltv.org/matches/2398291/wildcard-vs-nrg-ibuypower-masters-fml-2026) |
| Chinggis Warriors | 0 / 0 / 0；0 / 0 / 0 | 10 月 8 日 05:00 UTC 排定对 5star 的 LAN BO3，ROUX、sk0R、fury5k、cool4st、tikuak 实打全部三图。[逐图名单](https://www.hltv.org/matches/2399372/5star-vs-chinggis-warriors-mesa-pro-series-fall-2026) |
| 9z | 0 / 12 / 0；0 / 15 / 0 | 11 月 7 日宣布 history 接替 meyern。公开赛历上一次是 11 月 3 日，下一场是 11 月 24 日。11 月 21 日截止前暂未找到当前五人同场的正式记录。[换人公告](https://www.hltv.org/news/45940/9z-bench-meyern-add-history-as-major-stand-in) · [逐场赛历](https://www.hltv.org/team/9996/9z) |

前两场比赛页都有当天留下的时间记录；原页首次上线的时刻、比赛第一回合实际开始时刻均未知。新加坡窗口只由 Ektarr v11 提供。按固定原档哈希核对，两场前后各两天都找不到对应对阵或赛事名。补证保存在 `publicFullFive`，无须改动原始 545 场及已封存卡。9z 的换人公告和公开赛历另列 `publicRosterCheck`。其余 13 队无须这项定向补证，最早实打日期在逐队 JSON 内。这次检索没有穷尽历史，小表给出的是“至少在该日已经同场”。[完整 16 队及独立证据](lineup_probe.json)

## 下一轮只改变一处权重

已有 90 日实验把阵容稳定度直接加到 V4 的对数胜算。五届首阶段 Brier 从 0.22976 到 0.22829，过关数仍是 2/5，排除奥斯汀后其余四届平均 Brier 略差。V4 回合分差和 MajorForm 已分别对各自的一项历史量使用重合人数权重。原地图 ML 的做法不同：任一旧五人只要达到三人核心就进入同一个样本池，三、四、五人获得相同的时间权重；每人的原队表现另算。新问题是球队层面的地图证据是否过度沿用了离队选手贡献。[90 日阵容实验](../research_lineup/README.md) · [V4](../strategy_v4/METHOD.md) · [MajorForm](../major_form/README.md) · [地图 ML 原代码](../f1bre_models/ml_prepare.py)

预先固定两臂。基线逐项重现原地图 ML。实验臂保留 365 天建模窗与 30 天半衰期，对达到三人继承的每条历史地图，把球队特征的时间权重乘以两两搭档保留比例。五人有十对搭档；三、四、五人留下的比例为 0.3、0.6、1.0。用于计算各图和全队的胜率、回合份额、有效样本量以及全队平均对手积分，仍沿用原有收缩项。选手个人表现、新老双方 VRS、地图抽取权重、预处理、树训练、时间切分和校准均按基线。每条训练观测也按照它**当时**的五人生成特征。旧证据越少，球队胜率和回合份额越靠近原模型的中性先验。上表中的 180 天只用于对齐上轮 BO3 诊断，地图模型继续用原有 365 天。[原地图建模口径](../f1bre_models/ML.md)

锁定首次整卡外部检验 FISSURE Playground 2，2025-09-12 00:00 UTC 截止。9 月 7 日已公开 16 队全 BO3 瑞士轮及 8 场首轮；7 月 7 日全球邀请榜给出的 16 队顺序与首轮完全相符。取固定历史档中的实打双方和胜者，用原引擎逐轮重放，配对一致数为 8 / 8 / 8 / 6 / 3。该届此前只为部分后来的模型提供过历史比赛。没有计算本候选的留出损失和卡分。赛前 9 月 1 日已公告 Astralis 的 Magisk 接替 stavn。[主办方赛事页](https://fissure.pro/events/fpg2-cs) · [赛前首轮与规则](https://www.hltv.org/news/42624/opening-matchups-revealed-for-fissure-playground-2) · [赛前换人](https://www.hltv.org/news/42577/astralis-confirm-magisk-return)

现有原地图 ML 可用训练资料实际有 13,642 张，含 11,007 张树训练、2,425 张独立时间段校准，另有 210 张在切分两侧跨赛事隔离时剔除。训练最后一天 7 月 17 日，校准自 7 月 19 日起，末张图是 9 月 10 日。下一次先按赛前公告重建 16 套五人及替补身份，独立核对 Magisk，使用当时 Ancient、Dust2、Inferno、Mirage、Nuke、Overpass、Train 七图。用原始逐图训练资料重算两套特征，锁定全部 120 对后才计分。同口径先报留出全 33 场 BO3 的 Brier、log loss，以及仅包含上表三种核心样本各自占比的诊断。每场若任一队至少一张旧图只继承三或四人，即列入预先定义的触发子集，报告实际分母，不用两队身份筛选。只有全体两项损失均下降、且子集两项均未退步，才对照 16 队全胜概率的 Brier、十格命中和过关。选卡固定原填法、30 组相同种子、每组 12,000 条生成卡与另 12,000 条检验路径。Stage 3 开发三届逐届报告；一次外部验证不单独触发升级。新加坡未经这一新方案预测，前瞻成绩仍由既有封卡承担。[原地图 ML 重建入口](cluj-ml/build.py) · [训练和时间校准](../ml_allocation/ml_train.py)

从仓库根目录直接运行首条命令，可逐队复算 80 个诊断及留出训练可用量。第二条还校验两份原档哈希，独立重放 FISSURE 全场赛程，并复核两场新加坡赛前资料的原档覆盖。

```sh
python elite_opponents/lineup_probe.py --check
python elite_opponents/lineup_probe.py --check --archive /path/to/hltvy/results.json.gz --ektarr /path/to/cs2_all_tiers_games.csv
```
