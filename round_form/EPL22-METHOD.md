# EPL S22 第二阶段的独立留出

在运行本轮模型或查看候选卡分前选定整届瑞士阶段。赛制是 16 队全 BO3，其中八队刚从前一阶段晋级。项目此前引用了主办方对实时种子的规则说明，未使用本阶段给模型计分。原有 S23 外部样本和这份新增留出分别报告。

1. 队名、种子及实时配对的初始值采用主办方 2025-10-03 的表。每队以 10-04 开赛前最后一场可核对的五人为起点，逐一核对名单变动。以开赛前已公开的最后一份 Valve 全球邀请积分（09-01）匹配队伍核心。若最新参赛五人与赛前已公布的变阵有冲突，以有日期的新公告为准。第一阶段的比赛使用当场双边五人与同一份已发布排名。附上排名行、同员数和取证链接。先生成赛前输入，再独立加载目标赛果。[ESL 官方第二阶段种子](https://pro.eslgaming.com/tour/2025/10/epl-s22-stage-2-team-seeding-and-live-ratings/)
2. 第一阶段 09-28 至 10-02 的五轮 33 场是回合分差的唯一来源。第二阶段 10-04 至 10-08 的五轮只用于核对赛程和计分。两阶段均检查队名、ID、五轮场数和胜负晋级分组。沿用同一参数、赛制模拟与 30 个种子，拟合和选卡均不读取目标阶段赛果。
3. 第二阶段首轮 G2 对 FaZe 有官方判负、没有打图。真实十格取赛事产生的全部 33 场正式胜负。概率误差只评实际上场的 32 场，逐轮验证配对。复盘时比较无 Elo 更新和按标准 2–0 判胜调整能否还原主办方实际配对；若多个规则给出相同结果，则明确其不可辨识。赛前预测不预设弃赛，不因某种规则是否有利于候选卡而挑选规则。FaZe 在开赛后的阵容调整另记为留出赛限制。[当场记录](https://www.hltv.org/matches/2385936/g2-vs-faze-esl-pro-league-season-22)

## 赛前五人有哪些变化

第一阶段共 33 场、83 张实打地图。八支晋级队 FURIA、G2、3DMAX、Astralis、GamerLegion、Inner Circle、HOTU、Gentle Mates 都有 9 月 30 日至 10 月 2 日的当场五人证据。六支直邀队 Vitality、The MongolZ、MOUZ、Falcons、Aurora、Natus Vincere 的赛前五人可在 9 月最后一场有完整阵容的系列赛中核实。另两支直邀队在上次比赛之后宣布了换人。16 队的最后一场原始赛卡、日期和五人名单逐队存于 `target.teams[].rosterEvidence`；匹配 9 月 Valve 榜时，11 队五人重合、4 队四人、1 队三人。[完整赛前资料](epl22-inputs.json) · [主办方十六队及原始种子](https://pro.eslgaming.com/tour/pt/2025/10/epl-s22-stage-2-team-seeding-and-live-ratings/)

| 队伍 | 开赛前可知的变更 | 用于预测的五人 | 对应的九月 VRS |
| --- | --- | --- | --- |
| Spirit | 9 月 8 日官宣 tN1R 接替 zont1x | chopper、donk、sh1ro、tN1R、zweih | 第 1，2017 分，四人重合 |
| FaZe | 9 月 29 日宣布 rain 进入替补席，Twistzz 首发，jcobbb 留队 | broky、frozen、jcobbb、karrigan、Twistzz | 第 12，1635 分，三人重合 |

Spirit 的队伍公告及 FaZe 的告别视频均发布在开赛前。FaZe 同日的五人名单得到赛前报道印证。它与主办方收到的报名表有差别，报名表列 rain 首发、Twistzz 替补。10 月 4 日首轮弃赛之后，俱乐部决定让 rain 在余下赛事替代 jcobbb，Twistzz 继续出场。这次临时更换只记录于赛后资料；已知的预计阵容与后来实际出场五人相同的有 15 队。[Spirit 公告](https://teamspirit.gg/article/68bee1f769dddf002394f8e2) · [FaZe 的 9 月 29 日视频](https://www.youtube.com/watch?v=5kCEwlhxpOo) · [同日公布五人](https://www.hltv.org/news/42809/faze-announce-rain-benching) · [当日报名与弃赛记录](https://www.hltv.org/news/42844/faze-forfeit-esl-pro-league-match-against-g2) · [FaZe 赛中声明](https://x.com/FaZeEsports/status/1974492381710791163)

## 弃赛怎样影响后续配对

ESL 当季规定 2–0 获取全额 Live Rating 变动，2–1 获取一半。找到的公开规则没有单列本场行政判胜的权重。复盘先采用实际胜负推进战绩和避免重赛，按方案比较全额和零变动，并追加半额对照。各轮与真实对阵相符的场数如下。[ESL 当季配对及评分说明](https://pro.eslgaming.com/tour/pt/2025/10/epl-s22-stage-2-team-seeding-and-live-ratings/) · [逐轮重放](epl22-results.json)

| G2 对 FaZe 的 Live Rating 处理 | 第 1 轮 | 第 2 轮 | 第 3 轮 | 第 4 轮 | 第 5 轮 | 总计 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 按 2–0 全额变动 | 8/8 | 8/8 | 8/8 | 6/6 | 3/3 | 33/33 |
| 按 2–1 半额变动（追加核查） | 8/8 | 8/8 | 8/8 | 6/6 | 3/3 | 33/33 |
| 两队均保持原评分 | 8/8 | 8/8 | 8/8 | 6/6 | 1/3 | 31/33 |

零变动方案在末轮排不出 The MongolZ 对 Natus Vincere、G2 对 3DMAX。全额和半额都能还原所有对阵，实际权重无法由签表唯一确定。复盘程序沿用全额约定，两者产生相同的实际配对与最终战绩。赛卡显示 G2 行政胜 1–0，没有任何地图回合；胜率误差的分母始终为 32 场。归档程序可用固定的 HLTV 压缩档和 9 月 1 日 Valve 榜重新核验全部三种方案。赛后五人和行政判胜只出现在结果文件。[赛果与实际参赛五人](epl22-results.json) · [逐场原始快照](https://github.com/zugzugs/hltvy/tree/1a00ba2893a63646f0d940e626b6da95d342a187)

```sh
python round_form/epl22_inputs.py /path/to/archive-and-september-ranking
```
