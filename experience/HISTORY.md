# 选手 Major 参赛与夺冠历史

覆盖 DreamHack Winter 2013 至 IEM Cologne 2026 已结束的 24 届 Valve CS:GO / CS2 Major。共 2,557 条「选手 × 届次」参赛记录，每届冠军五人，共 120 个冠军席位。冠军记录归属夺冠时实际出场的选手；队名、教练履历、贴纸和报备替补均不能单独证明选手上场。

CS:GO 数据来自 Matheus Nóbrega 发布的 [HLTV 赛事选手统计摘录，v1 / CC0](https://www.kaggle.com/datasets/matheusnbrega/players-stats-all-csgo-majors/versions/1)。仅保留至少打过一张地图的选手。2018 年波士顿起，Challengers Stage 与后续阶段合并到同一届。交叉检查每阶段 16 支实际参赛队、各队至少五名选手、每届不重复队数和冠军队唯一的五名出场选手。2018 年波士顿实际 23 队，共 116 人；2016 年科隆有 81 人。

CS2 数据采用 [ektarr 的系列赛与地图记录，v11 / CC BY-SA 4.0](https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11)。2024 年两届各核对 73 场，2025 年两届和 2026 年科隆各核对 106 场。已剔除五届分别举行的表演赛。每条正式系列赛的双方五名选手均有数据源内稳定 ID；若其中一行缺昵称，则用该 ID 在同一公开文件内唯一对应的昵称，另查所有可用地图与系列赛阵容一致。决赛取实际完赛比分较高一方的五名选手。历届夺冠队与完赛日期另核对[赛事总表](https://en.wikipedia.org/wiki/Counter-Strike_Major_Championships)。这些汇总事实、队名对齐和数据清洗的派生档案以 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 提供。

缺少统一的跨年代选手 ID，因此使用已核实别名、来源 ID 和国籍拆分同名者。例如 jottA 与 jottAAA、jeorgesnorts 与 Jeorge、piriaz1n 与 piriajr、chay 与 chayJESUS、AhaNg 与 L1haNg 对应各自同一人。历史上的两位 NiKo/niko、两位 Lucky、两位 Zero 均分别记录；同名且缺少足以区分的当前队伍上下文时，查询显示未知。Maden 在此档案中指黑山选手 Pavle Bošković。

复核样例：dupreeh 共参加 19 届、夺冠 5 次；截至科隆 2026，karrigan 与 apEX 各参赛 22 届。新加坡 Stage 1 共 11 位首秀选手，按参赛数据回算的名单与 11 月 5 日公布的[逐人名单](https://pley.gg/cs2/the-17-players-making-their-major-debut-in-singapore/)一致。例如 JBOEN 在科隆虽曾被报为替补，但未上场；11 月新加坡才是首秀。同期 [HLTV 公布的实际首发信息](https://www.hltv.org/news/45950/pgl-reveals-singapore-major-rosters)和 [EF 转入 Aurora 的人员名单](https://www.hltv.org/news/41357/aurora-sign-eternal-fire-roster-in-shock-move)用于核实相应球员。

用 Python 标准库运行 `python experience/build_history.py --cache 缓存目录` 重建 history.json。输入为两份固定版本的 CSV，均在读取时验证 SHA-256。预测只消费各自截止日之前已完赛的届次；文件会包含较晚届次以便重建后来的预测。数据集的统计误标和未公开别名仍可能影响个别选手的次数。

## 首届 CS2 Major 的经验系数

哥本哈根开赛前已有 19 届 CS:GO Major 的选手出场记录。经验系数的估计另需带有双方阵容、赛前实力和胜负的成对比赛。我们从时间最近、沿用 16 队瑞士制揭幕阶段的四届 CS:GO Major 重建了 132 场系列赛，含 80 场 BO1 和 52 场 BO3。来源是 [tedtay 的地图与实际出场记录，固定于 2024 年 1 月 31 日的 Git 修订，MIT](https://github.com/tedtay/CS-GO-Pro-Matches-Comprehensive-Dataset/tree/ce8a5f242a768c5698f8068828eeedc4fc134db1) 和 [2023 年 7 月发布的逐届选手名册，CC0](https://www.kaggle.com/datasets/matheusnbrega/players-stats-all-csgo-majors/versions/1)。两份档案均早于 2024 年 3 月哥本哈根开赛。用于跨版本检验的 CS2 既往赛果来自事后整理的数据集，按照对局日及当时的 Valve 榜重建。这是历史回测。

每个 CS:GO 揭幕阶段按队名和地图比分归并系列赛。原文件的两张选手表偶有左右颠倒，先将两组五人作为无序集合，逐图和该届逐队名册核对。64 份首发五人中，62 份在开赛前六个月的比赛已一同出场，另外两份由赛前公告确认。[Astralis，2021 年 10 月 13 日](https://www.hltv.org/news/32552/gla1ve-returns-for-pgl-major-stockholm-bubzkji-out) · [Virtus.pro，2021 年 10 月 22 日](https://www.hltv.org/news/32606/virtuspro-replace-sanji-with-fl1t-for-pgl-major)

CS:GO 各队的基础地图实力取开赛前 180 天已完成比赛，以五人平均 Elo 对数胜算估计。每场先用该回看窗口内的玩家与队名共现关系对齐两侧玩家，平分的记录剔除。每张地图按实际胜负用 0.1 的步长更新当时十名选手的实力。BO3 基线由单图胜率换算。经验项仍为赛前五人的平均 log(1+参赛届数)、首次参赛占比、冠军玩家占比，作为系列赛胜负模型的三个增量系数。四届的基础实力和参赛经历分别冻结在各自开赛前。

系数沿用 CS2 岭回归方法，迁移时将三个系数减半。启用要求两组独立按时间留出的样本中 Brier 分数和对数损失都降低。第一组依次用之前的 CS:GO 届次训练，在随后三届共检验 99 场。第二组从哥本哈根赛前 323 场阵容／积分已核实的 CS2 非 Major 系列赛出发，306 场能明确解析十人的经验。前 183 场估计 VRS 到单场胜率的斜率，同日不拆分。最后 123 场用于检验既定的迁移系数，日期为 2024 年 2 月 5 日至 3 月 4 日。

| 独立时段 | 场数 | 基础 Brier | 加经验后 Brier | 基础对数损失 | 加经验后对数损失 |
| --- | ---: | ---: | ---: | ---: | ---: |
| CS:GO 后三届，逐届留后 | 99 | 0.2564 | 0.2493 | 0.7063 | 0.6912 |
| 哥本哈根前的 CS2 非 Major | 123 | 0.2229 | 0.2207 | 0.6362 | 0.6310 |

因此在哥本哈根勾选经验时使用经收缩的 CS:GO 系数。这个检验衡量赛前的单场概率表现，无法直接推断通行证的过关率。从上海开始，模型用已有的 CS2 Major 比赛估计该项，避免整段合并 CS:GO 与 CS2 数据。执行 `python experience/build_legacy.py csgo_pro_games_data.csv major-stats.csv` 可重建源文件校验后的精简数据。运行 `node experience/calibrate.cjs` 可复算系数及两个时段的指标。
