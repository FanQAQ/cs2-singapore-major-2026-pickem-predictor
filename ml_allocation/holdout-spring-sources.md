# Elisa 春季独立赛场

Elisa Invitational Spring 2024 Main Swiss 是欧洲线上赛。主办方在 4 月 5 日宣布八队直邀、八队从 Contenders 晋级，4 月 8 日开始的首轮有八个明确对阵，五轮均为 BO3。八个晋级名额还可从 3 月 15 日已打完的 Contenders 全部 33 场独立重算。实际入围组织跨国，参赛地区和线上赛条件与全球 Major 有区别。[主办方赛前发布并按周更新的赛程](https://elisaesports.com/2024/04/05/elisa-invitational-spring-2024-main-swiss-viewers-guide/) · [Contenders 完整赛果](https://www.hltv.org/events/7701/elisa-invitational-spring-2024-contenders)

**赛前输入**在 4 月 8 日 00:00 UTC 截止，首场安排在当日 09:00 UTC。组织方页面后来更新过比分和少数俱乐部名。数据只从其参赛组别和首轮取得输入；队名按当时归属恢复。赛前最新可查实战五人、队员变动报道和 3 月 4 日 Valve 欧洲榜分别留有来源。榜单以发布时间为准，固定提交的原始文件 SHA-256 为 `f5d3fbc3a16556d61b2bc3f46db6ee18a45c808e4dfc944a3d25c9477a205d0a`。16 队中有 15 队在该榜上能唯一匹配至少三人。主办方未发布可核实的完整赛前种子序列，文件中 `seed` 是其名单顺序编号。模型使用的种子估计和后续轮抽签设定详见对照协议。[当时公布的 Valve 榜](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/99a0ba5fff938345d10d500f8b29cd297076573e/standings_europe.md) · [截止前最近的榜单提交](https://api.github.com/repos/ValveSoftware/counter-strike_regional_standings/commits?path=standings_europe.md&until=2024-04-07T23%3A59%3A59Z&per_page=1)

- **B8** 于 4 月 5 日宣布加入 headtr1ck 和 baz，HLTV 同日获悉 OWNER 将让位。赛前能重建五人，此队与已公布 VRS 名单的重合恰为三人。[4 月 5 日报道](https://www.hltv.org/news/38706/headtr1ck-set-on-b8-move)
- **Endpoint** 于 4 月 1 日已失去 swicher 和 sl3nd，剩下 AZUWU、MiGHTYMAX、Surreal。因两名新首发在开赛前缺乏可靠证据，预测只输入这三人。3 月 4 日榜上的 Endpoint 临时上了 HS，和这三人仅重合两人，官方积分按缺失处理。后来使用的 cej0t 和 CRUC1AL 只出现在评分资料中。[赛前三人核心](https://www.hltv.org/news/38672/endpoint-transfer-sl3nd) · [4 月 26 日公布的新人](https://www.hltv.org/news/38852/endpoint-sign-cruc1al-cej0t)
- **ECSTATIC、Espionage** 到 4 月 14 日才分别由 Gaimin Gladiators 和 Sashi 签下全部五人。赛前按原队名、原核心建模。[ECSTATIC 五人转会](https://www.hltv.org/news/38772/gaimin-gladiators-sign-ecstatics-roster-in-return-to-cs) · [Espionage 五人转会](https://www.hltv.org/news/38776/sashi-pick-up-full-espionage-lineup)

**评分资料**另存为 `holdout-spring-results.json`。官方赛程 33 行的胜负与 HLTV 比赛档逐一一致。最后两行的官方页面缺失对手名，分别由实际比赛页补全。四场行政判胜影响排名，未进行地图比赛；主办方记为 2–0、战报以 1–0 的 Default 表示。两场战报早一天登记，故同时保留 `officialScheduleDay` 与战报的 `day`。另外 29 场共打 66 张图，记录每图双方五人及含加时的回合比分。[完整分组和官方比分](https://elisaesports.com/2024/04/05/elisa-invitational-spring-2024-main-swiss-viewers-guide/) · [比赛档案](https://www.hltv.org/events/7700/elisa-invitational-spring-2024) · [末轮 Grannys Knockers 对 Endpoint](https://www.hltv.org/matches/2371689/grannys-knockers-vs-endpoint-elisa-invitational-spring-2024) · [末轮 Gaimin Gladiators 对 HAVU](https://www.hltv.org/matches/2371690/gaimin-gladiators-vs-havu-elisa-invitational-spring-2024)

ex-Preasy 的参赛席位由 4 月 29 日开始赞助该阵容的 Grannys Knockers 延续。末轮在场的 Kristou、TMB、b0RUP、niko、Anlelele 中，仅有前两位是开赛时的原首发。每一张图上双方都保留三人核心的系列赛因此为 28 场，可归属原席位的实战为 29 场。席位总成绩为 2–3，计算竞猜卡时没有对应的得分格。[4 月 29 日签约报道](https://www.dust2.dk/nyheder/47950/grannys-knockers-skriver-under-med-ex-preasy) · [末轮阵容与逐图比分](https://www.hltv.org/matches/2371689/grannys-knockers-vs-endpoint-elisa-invitational-spring-2024)

下载固定提交的两个文件后，在项目根目录执行以下只读命令，可逐字段复算两份 JSON。脚本校验两份源文件的 SHA-256，并在选手核心匹配或赛果重建不一致时停止。[逐场原始数据](https://raw.githubusercontent.com/zugzugs/hltvy/1a00ba2893a63646f0d940e626b6da95d342a187/results.json.gz) · [欧洲积分原文](https://raw.githubusercontent.com/ValveSoftware/counter-strike_regional_standings/99a0ba5fff938345d10d500f8b29cd297076573e/standings_europe.md)

```sh
python ml_allocation/holdout-spring-build.py --archive results.json.gz --rankings standings_europe.md --check
```
