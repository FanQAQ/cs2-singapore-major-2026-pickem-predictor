# 新加坡 Stage 1 的赛前同五人 BO3

**对 16 支参赛队，公开的 Griffin 比赛档可在原库之外补证 65 场同五人 BO3，共 154 张实打地图。** 冻结前 180 天内，原库中有 141 场至少一侧正好是新加坡报名五人的系列。合并后可确认 206 场。这个数字回答「哪些比赛当时已经有数据」，过关数和原先封存的推荐卡仍按各自原件计分。[逐队、逐场和逐图记录](sg-coverage.json) · [新加坡锁定名单与原预测](../f1bre_models/singapore-forecast.json)

| 队伍 | 原库 | Griffin 实证 | 重合 | 新增 | 待核 | 合并 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ninjas in Pyjamas | 10 | 6 | 2 | 4 | 0 | 14 |
| PARIVISION | 13 | 11 | 7 | 4 | 0 | 17 |
| HEROIC | 18 | 15 | 9 | 6 | 0 | 24 |
| FaZe | 20 | 12 | 8 | 4 | 0 | 24 |
| Liquid | 20 | 12 | 11 | 1 | 0 | 21 |
| Eternal Fire | 20 | 16 | 10 | 5 | 1 | 25 |
| 100 Thieves | 13 | 11 | 3 | 8 | 0 | 21 |
| 9z | 0 | 0 | 0 | 0 | 0 | 0 |
| M80 | 11 | 0 | 0 | 0 | 0 | 11 |
| DENDELE | 11 | 7 | 4 | 3 | 0 | 14 |
| Imperial | 1 | 9 | 0 | 9 | 0 | 10 |
| Wildcard | 0 | 6 | 0 | 6 | 0 | 6 |
| GOSH | 9 | 10 | 8 | 2 | 0 | 11 |
| FlyQuest | 1 | 9 | 0 | 9 | 0 | 10 |
| Chinggis Warriors | 0 | 8 | 0 | 8 | 0 | 8 |
| Lynn Vision | 5 | 3 | 0 | 3 | 0 | 8 |
| **全部，按独立系列去重** | **141** | **121** | **55** | **65** | **1** | **206** |

表中每队按队侧计数。两支参赛队互打，同一场会出现在两队的行里；最后一行每场只计一次。每行合并数都等于原库加新增。原库全窗有 545 场带双方赛前 Valve 积分的 BO3，其中 141 场涉及至少一支完整新加坡五人。新增 65 场在这里核对了阵容与地图事实，尚未统一核对这些系列发生前发布的双方 VRS。两个来源没有抓全整个 180 天的职业赛事。[原库构建和日期边界](../tail_calibration/TRAINING.md)

## 三支原库未出现完整五人的队

- **Chinggis Warriors，新增 8 场、22 图。** 10 月 20–29 日对手分别是 WXM、NEXVOID、Lynn Vision、Rare Atom、the ONE、The Audacity、5star、The Audacity。同一个对手在不同轮遇到两次，分别有比赛编号、实打比分与五名上场者。[10 月 20 日对 WXM](https://www.hltv.org/matches/2399578/chinggis-warriors-vs-wxm-macemedia-void-autumn-cup-2026) · [10 月 29 日对 5star](https://www.hltv.org/matches/2399924/5star-vs-chinggis-warriors-mesa-pro-series-halloween-cup-2026)
- **Wildcard，新增 6 场、14 图。** 10 月 30 日至 11 月 1 日面对 Hacha、BESTIA、Hacha、NRG、BARCA 和 100 Thieves。逐图出场者均为 Cxzi、fr3nd、HexT、nEMANHA 和 reck。上次另查到的 9 月 26 日对 NRG、Chinggis Warriors 10 月 8 日对 5star，均早于 Griffin 最早收录的 10 月 15 日，本表未额外叠加人工记录。[逐场单号与回合分](sg-coverage.json) · [两场更早的独立见证](NEXT-LINEUP.md)
- **9z，仍为 0 场。** Griffin 有 7 场 BO3 实出 dgt、max、HUASOPEEK、luchov、meyern，与封存五人只重合四名。报名的第五人是 history，这四张表没有他的实出地图数据。这是来源覆盖缺口。[11 月 9 日的 Major 名单公告](https://www.hltv.org/news/45950/pgl-reveals-singapore-major-rosters) · [七场的日期、编号与队员](sg-coverage.json)

## 数据确实已在当时公开

沿用原库的 UTC 窗口，2026 年 5 月 25 日起至 11 月 21 日 00:00（不含）。四张 CSV 固定于公开 Git 提交 `f5e3e90fb56fef8adc19bd5e5e898d2741d0ff58`，提交时刻为 11 月 20 日 02:47:07 UTC。该版 985 个系列的开始时间从 10 月 15 日 10:00 到 11 月 19 日 23:00。快照在 11 月 20 日 02:30:31–02:44:23 UTC 抓取，比赛开始、已完赛页面抓取和仓库提交分列。程序同时验证 Git blob 与本地 SHA-256，逐场记录提供开始和抓取时刻。[固定版本的四张资料表](https://github.com/Griffinxaxa/scrape-hltv-data/tree/f5e3e90fb56fef8adc19bd5e5e898d2741d0ff58/2026-data/archive) · [提交及文件对象](https://github.com/Griffinxaxa/scrape-hltv-data/commit/f5e3e90fb56fef8adc19bd5e5e898d2741d0ff58)

在 985 个系列中，12 场不是 BO3，另外 24 场缺少完整逐图同五人证据，剩 949 场可以做名册匹配。逐场要求标记完赛、无弃赛/行政判胜、两张或三张实打图、合法 MR12 胜负及第一半场 12 回合。每张图的双方五个实际 player_id 须与该系列五人表完全一致，并有真实击杀记录，回合胜者和系列比分需互相校验。100 Thieves 的 rain（8183）、9z 的 max（12092）均有同昵称选手，逐图用 HLTV ID 区分。[筛选与身份核查代码](sg_coverage.py)

两源日期用原库所记 UTC 可能区间。51 场通过双方十人、所有实打图及其回合比分匹配。另 4 场按同日、本队五人、对面至少四人、每张图及回合比分完全相同且唯一匹配后去重。仍有一场 10 月 16 日 Eternal Fire–Betclic，两源十人、对阵及赛果相同，但 Dust2 在 Griffin 是 11–13、原库是 10–13。该条留给复核，原库的比赛本已计数，合并时未加第二次。[争议系列及逐图来源](https://www.hltv.org/matches/2399654/eternal-fire-vs-betclic-pgl-bucharest-2027-closed-qualifier) · [对照记录](sg-coverage.json)

将固定提交的四张 CSV 放在同一目录后，可从仓库根目录复算。

~~~sh
python elite_opponents/sg_coverage.py --archive /path/to/griffin/archive --check
~~~
