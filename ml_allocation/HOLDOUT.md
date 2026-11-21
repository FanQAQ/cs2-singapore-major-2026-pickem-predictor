# Elisa Invitational 2024 Main Swiss 留出赛事

春季 4 月 8 日、秋季 8 月 12 日开始。两届均在选卡实验评分前按赛制选定。16 队中 8 支直邀，8 支从 Contenders 晋级，五轮全 BO3，三胜出线。EPL S21–23 在项目中已做过其他实验，S24 改为单个瑞士阶段。两届 Elisa 属于同一赛事系列，训练与阵容历史部分共用，不能当作两个完全独立的 Major。地图模型训练排除两次 Elisa 主赛，更多边界见 [TRAINING.md](TRAINING.md)。[春季主办方](https://elisaesports.com/2024/04/05/elisa-invitational-spring-2024-main-swiss-viewers-guide/) · [秋季主办方](https://elisaesports.com/2024/08/09/elisa-invitational-fall-2024-main-swiss-viewers-guide/) · [ESL S24](https://pro.eslgaming.com/tour/2025/11/esl-pro-league-season-24-additional-information/)

春季的参赛队、临时换人、行政判胜和 33 场复算另见[春季来源](holdout-spring-sources.md)。

## 秋季赛前资料

`holdout-fall-field.json` 记录 16 支原参赛队、双方分组和首轮。Contenders 的 33 场截至主赛前，恰有 8 队三胜。队伍数组按主办方公布首轮的两组顺序编号。主办方赛前预告网页随后持续更新，现页列 Endpoint。8 月 13 日 Endpoint 替代 Sangal 的记录和对 Rhyno 的首战共同确认了原席位。原始签表快照、组内强弱种子和第二轮之后具体抽签优先级仍缺少可核对的赛前资料。研究分别用均匀抽签和赛前排名高低配对验证敏感性。[秋季公告及日程](https://elisaesports.com/2024/08/09/elisa-invitational-fall-2024-main-swiss-viewers-guide/) · [Contenders 对阵](https://www.hltv.org/events/7945/elisa-invitational-fall-2024-contenders) · [替换说明](https://www.hltv.org/matches/2374654/endpoint-vs-rhyno-elisa-invitational-fall-2024) · [赛制及换队记录](https://liquipedia.net/counterstrike/Elisa/Invitational/2024/Fall)

各队五人取 8 月 12 日 UTC 以前最近一次有完整五人、打过地图的比赛，每队附日期与原赛页。这是当时可得的阵容代理。MOUZ NXT 和 Into the Breach 的实际首轮五人与代理各有变动，赛前输入保留原状。Valve 8 月 6 日 18:28:19 UTC 公布的全球榜中，12 队匹配五名原首发，2 队匹配四名。DASH、Meteor 没有足够证据继承积分，填 `null`。两队涉及的 29 个不同对阵在基线给 0.5，地图 ML 缺失处理见 TRAINING.md。[带提交版本的 Valve 全球榜](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/48127d4873dec5504dd18f14006e67da888fab80/standings_global.md)

## 秋季赛果和可复核范围

`holdout-fall-results.json` 保留 9 月 5 日结束前的全部 33 场、逐轮胜负、实际球队和赛页。每轮 8、8、8、6、3 场均符合当轮同战绩、不重复对阵，同队每轮最多打一场。31 场实打，共 75 图。Endpoint 对 Meteor 和 Gaimin Gladiators 对 Sampi 两次行政判胜仅计入最终晋级。剔除 Endpoint 取代原赛前队所打的两场，原队可评分单场为 29，全部达到双方逐图至少三名核心。某图列六名队员时，`coreByMap` 给出任取当场五人仍能保证的最小重合人数。`coreOverlapA/B` 取各边所有实打图的最小值；行政场留空。

主办方历次更新的赛程页可逐轮核对 33 对参赛双方。前四轮列出 30 场结果，其中 29 场比分或判胜完全吻合。Zero Tenacity 对 Rhyno 的官方预告表记为 2–0，三张地图实录为 30–34、16–12、13–10，按实际 2–1 保存，胜者相同。末轮三场在预告表只有对阵，9 月 6 日的主办方晋级名单独立确认三场赢家及全部八支晋级队。以上赛后交叉核对只进入赛果文件。[主办方瑞士阶段表](https://elisaesports.com/2024/08/09/elisa-invitational-fall-2024-main-swiss-viewers-guide/) · [逐图原始比赛记录](https://www.hltv.org/matches/2375241/zero-tenacity-vs-rhyno-elisa-invitational-fall-2024) · [主办方季后赛名单](https://elisaesports.com/2024/09/06/elisa-invitational-fall-2024-playoff-stage-viewers-guide/)

原队身份口径下，Sangal 没有任何可中的格子。按席位继承的敏感性分析中，Endpoint 的 0–3 归该席。`actualByTeamIdentity` 的 3 表示不能在 3–0、普通晋级或 0–3 命中，`actualBySlot` 则记录该席实战的类别。

复算需要 `holdout_fall.py` 标出的 HLTvy 原始比赛档和指定版本的 Valve 全球榜。脚本逐字节检查两者的 SHA-256，再分别生成赛前资料与赛后结果。省略 `--write` 时会逐字段对比已经交付的两个文件。

```sh
python -B ml_allocation/holdout_fall.py /path/to/results.json.gz /path/to/standings_global.md
```
