# 入场组别在旧版 Major 的迁移检验

先固定口径，再读取这次实验此前没有评分的 CS:GO Legends Stage 赛果。斯德哥尔摩 2021 只提供第一批先验，安特卫普 2022、里约 2022、巴黎 2023 按时间顺序检验。三个阶段均使用本届之前的旧版 Major 训练。CS2 的五届赛果不进入这组训练。

此处检验入场途径和同组实力名次能否提供终局分档的信息。旧版 Major 使用各届赛制，原生竞猜格数和计分方式也不同。将四档战绩编码为全胜、普通晋级、全败、其他出局，单独核算逐队多分类 Brier；这里不声称已用 CS:GO 赛制复算 CS2 的十格卡。项目另以 CS2 联赛检验整卡。

- 每阶段的八支直邀、八支晋级和日期取开赛前公布的对阵表。预先核对参赛队、上一阶段晋级的球队和比赛实际首发。本阶段的最终战绩只用于这期评价及以后训练。
- 为兼容 VRS 诞生前的赛事，用已核实首发在过去 90 天的系列赛胜率排组内位次。每侧须与目标五人直接重合至少三人。在胜负两侧各加五场中性样本向 50% 收缩。只用截至开赛前一天已结束的比赛，含上一阶段。转会可以按人匹配。通过赛前该队最近一场五人的同队记录确认队员身份，缺少证据时标明覆盖。
- 对照是已知 16 队的边际战绩分布（2／6／2／6，各除以 16）以及只参考同一入场组历史、不考虑组内排名的对照。候选对更早赛事使用与 CS2 相同的同组名次权重 3、2、1，以及 9 份边际分布保底。组别对照把相同总历史权重平均分配给该组八队，以单独比较组内名次的价值。检查三场留出赛的逐队 Brier 总和和均值，越低越好。

| 留出赛事 | 仅已知终局比例 | 入场组均值 | 入场组及相近实力名次 |
| --- | ---: | ---: | ---: |
| 安特卫普 2022 | 0.68750 | 0.64704 | 0.63857 |
| 里约 2022 | 0.68750 | 0.73519 | 0.75427 |
| 巴黎 2023 | 0.68750 | 0.74947 | 0.75648 |
| 48 个球队阶段合计均值 | 0.68750 | 0.71057 | 0.71644 |

组内名次在安特卫普改善了球队最终档位预测，在里约和巴黎则使误差增加。旧赛制、入场资格和实力排序数据也与今天有差异。以上成绩支持继续在未来 CS2 Major 封存后检验，不能补足正式 Stage 3 的届数。

开赛前一轮的名单与首轮对阵见[斯德哥尔摩](https://www.hltv.org/news/32674/navi-heroic-headlines-pgl-stockholm-legends-stage-opening-matches)、[安特卫普](https://www.hltv.org/news/33791/opening-matches-of-pgl-major-antwerp-legends-stage-set)、[里约](https://www.hltv.org/news/34983/two-top-5-matchups-in-first-round-of-iem-rio-legends-stage)、[巴黎](https://www.hltv.org/news/36256/two-top-five-matchups-set-for-first-round-blast-paris-major-legends-stage)。安特卫普 Cloud9 接收 Gambit 全队，BIG 使用 RMR 晋级名单，与正式锁定名册相符。[Cloud9 的赛前阵容公告](https://cloud9.gg/cloud9-returns-to-counter-strike/) · [安特卫普报名规则与名单](https://www.hltv.org/news/33720/starting-rosters-subs-and-coaches-locked-in-for-pgl-major-antwerp)

`legacy_fields.json` 保留各队赛前五人、最近核实日期、三人核心有效样本、冻结排名输入及独立赛果。64 个参赛席位的赛前首发均与实际阵容吻合。比赛回合与旧版项目共用同一版公开地图档案，按日期、赛事和双方归并为系列赛，过滤重复地图和不能确定系列赛胜方的记录。下载固定版本后，可运行 `python3 final_card/legacy_fields.py /path/to/csgo_pro_games_data.csv --check` 复核源文件 SHA-256 和全部冻结输入，再运行 `node final_card/legacy_check.cjs --check`。[固定版本比赛档案](https://github.com/tedtay/CS-GO-Pro-Matches-Comprehensive-Dataset/blob/ce8a5f242a768c5698f8068828eeedc4fc134db1/csgo_pro_games_data.csv)
