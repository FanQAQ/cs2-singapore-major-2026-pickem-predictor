# 首发、教练与明星火力

## 赛前检验口径

2026-11-21，检验以下两个独立假设，训练与留出沿用 2026-09-01 的时间切分，先固定特征与准入。保留现有封存预测。

1. 以比赛当日之前至少拿过一次 HLTV Major MVP 的在场选手定义「往届 MVP」。只比较一方有得主、另一方没有的差异。同一队不按奖杯或得主人头叠加。使用可核实完整首发、赛前 VRS 分差和胜负的历史系列赛训练一个零中心收缩系数。基本胜率按项目 VRS 分差除以 400 的十进制逻辑函数估计。包括没有标签差异的比赛以便显示总体覆盖。
2. 从 2026-05-02 已发布的 3–4 月录像库提取每个完整阵容内**同一个人**的总击杀占比，最高者为该阵容的主要火力点。五人组至少覆盖 4 图、2 个系列、50 次队伍击杀。预测后续比赛时，要求所属核心重合至少三人且该领先者本人仍在阵。若最高重合度对应多个合格阵容，以样本地图最多者为先，仍平手则跳过该场。该项使用 5 月 2 日后才开始的系列赛，单独比较火力更集中的一方是否超出其 VRS 预期。10 个百分点的份额差为一个特征单位。对局双方都符合条件才计入。
3. 两种系数单独训练，正则项均为系数平方乘二。时间留出期比较 Brier 和对数损失，并列出 BO1、BO3、赛制未核实的样本量。时间内可关联的同天、同队双方使用同一来源快照，保留该快照内再赛。未达到 50 场相关训练对局时，系数取零；未通过单场检验不升级默认推荐。明星过往荣誉和当期火力是不同的观察。

新加坡 16 队的报名教练以 11 月 9 日 PGL 公告和各队资料核对。报名、兼任替补及已经在现场临场指导是不同的事实。本届尚未开赛。11 月 14 日版赛前记分板只用于说明当期个人数据，按本届完整五人在此前 90 天的共同上场地图统计。该资料不回填更早比赛。

## 结果和取舍

| 单独新增的特征 | 训练系列赛 | 9 月起的留出系列赛 | VRS Brier → 加特征 | VRS 对数损失 → 加特征 |
| --- | ---: | ---: | --- | --- |
| 至少一人曾获 Major MVP | 7,088 场，其中 1,050 场双方标签不同 | 810 场，其中 100 场双方标签不同 | 0.264962 → 0.264749 | 0.766431 → 0.765670 |
| 阵中同一名火力点的击杀集中度 | 541 场 | 371 场 | 0.264474 → 0.265341 | 0.759028 → 0.762021 |

9 月 1 日至 11 月 1 日的 100 场 MVP 标签不同的系列赛，Brier 从 0.246358 至 0.244629。训练系数指向有得主的一方在 VRS 预期基础上略弱，可能混有年龄、角色、对手等差异。19 场能核实赛制的 BO1 中 Brier 从 0.255991 升到 0.257716。另外 222 场 BO3 从 0.257966 到 0.257749，569 场缺乏完整地图赛制。两项特征都保留作观察。每个对照使用相同对局，候选项只修正已有 VRS 对数胜算。两个研究样本不同，因此只在各自行内比较。录像期间只有 3–4 月，离秋季验证已久；同一击杀占比也会受角色、交手难度、地图和经济局影响。

另用每届自身赛前快照可查的比赛、严格早于该届排名基准日的数据，单独重估 MVP 系数，再叠加到当届现行推荐模型矩阵。保持原填法、24,000 条模拟路径、成对随机种子。固定种子的五届合计均为 27/50、3/5 过关、0–3 两格均累计 5/10。上海 4→4，科隆 4→4，科隆首阶段没有符合定义的往届 MVP 首发。30 个种子中过关届数 2 组增加、26 组持平、2 组减少。上海第二阶段固定种子 6/10→3/10，过关种子从 30/30 变为 19/30。该阶段已参与以前的填卡研究，此处用作额外压力检查。新加坡赛前封存卡继续采用原配置。

100 Thieves 的同阵容旧窗口为 8 月 24 日至 10 月 17 日，29 图 15 个系列，poiii 的总击杀占比最高（23.0%）。另外用临赛档案的 10 月 22 日至 11 月 20 日窗口核对，收录 10 月 29 日至 11 月 17 日的 19 图 8 个系列、405 回合。19 张地图全部为赛前公布的完整五人，按三人或四人继承额外计入的地图为零。该批地图中 sirah 311 杀，poiii 297，device 293，rain 282，Gizmy 271。两组来源的覆盖范围不同，时间窗口各自列明。队伍内部份额在 18.6% 至 21.4% 之间。封存卡把该队填普通晋级，3–0 概率为 18.84%，3–1/3–2 为 46.44%，合计晋级概率为 65.28%。首轮对 Chinggis Warriors 的 BO1 胜率为 66.37%。

教练能参与的环节有战前准备、半场沟通和战术暂停。gla1ve 的四个 Major 冠军来自他与 device 搭档时的选手生涯。100T 在 2025 年 12 月给了他首份教练工作，Gizmy 自 2026 年夏季担任场上指挥。以往的逐场训练记录缺少当日实际执教者、执教起止及暂停时点。单纯用教练身后的战绩会把所在阵容的实力算到教练身上，现阶段未估计独立教练胜率系数。[100T 任命 gla1ve](https://www.hltv.org/news/43479/100-thieves-unveil-gla1ve-as-head-coach) · [rain 采访](https://www.hltv.org/news/45268/rain-on-moving-away-from-igling-i-think-my-personality-is-maybe-a-little-bit-too-chill) · [Valve 赛制与沟通限制](https://github.com/ValveSoftware/counter-strike_rules_and_regs/blob/main/major-supplemental-rulebook.md)

## 数据与复现

- 24 届 HLTV Major MVP 的获奖日存于 `awards.json`。来源为 HLTV 自己颁奖的公告或公告中的往届清单，每届与项目历史档案的结束日期核对。此处的定义覆盖一类有可核实荣誉的选手。未获 Major MVP 的选手也可能是队伍的主要火力点。[HLTV 历届名单](https://www.hltv.org/news/33884/rain-claims-pgl-major-antwerp-mvp-award)
- 16 队教练来自 PGL 报名公告并用各队 HLTV 资料页核实，链接保存在 `coaches.json`。各队页面「Coach of ...」的队内时长（换算为月）和收录执教地图数冻结于 11 月 21 日，范围是教练与该组织合作，包括之前不同阵容。gla1ve 为 11 个月、208 图；HEROIC 的 Snappi 为 1 个月、38 图，Chinggis Warriors 的 Redka 为 16 个月、300 图。首发沿用项目按实际出场公告修订的 `stage_rosters.json`，包括 9z 的 history。[PGL 报名资料](https://news.pglesports.com/news/1794219566606-pgl-major-singapore-2026-team-rosters) · [替补和首发变动报道](https://www.hltv.org/news/45950/pgl-reveals-singapore-major-rosters)
- `demo_players.json.gz` 为 Blanchon 的 OpenCS2 数据的派生计数，按 CC BY 4.0 提供。版本 `912a363098feec3f220e41d68634d2f71676c28b`，公开时间 2026-05-02。与 `style_stats` 相同的 1,986 张已核实地图上分别累计每名队员自冻结结束到回合结束间的敌对击杀，含攻守两方。将相同五人放在一起，求各人总击杀占比。[数据集与许可](https://huggingface.co/datasets/blanchon/opencs2_dataset_demo/tree/912a363098feec3f220e41d68634d2f71676c28b)
- `recent_maps.json.gz` 是 Ektarr 的 Counter-Strike Pro Matches v11 的派生数据，摘取当前五人合计回合与个人击杀，该部分及其派生汇总按 CC BY-SA 4.0 提供。原 CSV SHA-256 为 `d99aa6a61c5d9018eef587ce28c026df4dd61406fdd46afe7a8d08bdcdcf2972`。[Ektarr v11](https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11)
- `focus_maps.json.gz` 保存 100T 更近一批地图记分板的事实计数及逐张 HLTV 链接。使用项目已核实 SHA-256 的 Griffin 赛前快照 `f5e3e90fb56fef8adc19bd5e5e898d2741d0ff58`。只取已完赛、无弃权的系列，按双方各五个独立选手、全图双方合计回合及 `side=both` 约束。[Griffin 档案](https://github.com/Griffinxaxa/scrape-hltv-data/tree/f5e3e90fb56fef8adc19bd5e5e898d2741d0ff58/2026-data/archive)

项目根目录离线复核时，先装配现行网站，再依次运行以下命令。第二条会重跑 30 个配对种子的整卡实验。

```sh
python -B personnel_study/build.py --check
node personnel_study/cards.cjs --check
```

重新提取原料可运行 `python personnel_study/extract.py --csv PATH --demo DIR --griffin DIR`，录像转换需要 pyarrow。解压后的现成输入只需 Python 标准库。完整重建顺序为 `python personnel_study/build.py`、`node personnel_study/cards.cjs`、`python personnel_study/build.py`。最终报告含五届和额外上海第二阶段的整卡摘要。
