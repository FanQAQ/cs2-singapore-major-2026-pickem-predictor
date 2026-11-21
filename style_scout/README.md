# 新加坡首阶段赛前球探档案

资料截止 2026 年 11 月 21 日。新加坡首阶段 11 月 24 日开赛。这个目录记录 16 支参赛队在此前赛事的行为，供查看推荐依据和研究对位使用。

## 阅读球队档案

`singapore.json` 每队有战术描述、原文、发布日期、当时出场的五名选手及其阵容来源。12 条来自选手或指挥采访，3 条来自作者的多场分析，1 条来自两场 BO3 的首轮交火统计。FaZe、9z 和 GOSH 各保留来源时的四名选手，其余 13 队保留五人。逐队原始链接见各记录的 `url` 和 `rosterUrl`。新加坡五人名单与项目内的 [首发快照](../datajob/stage_rosters.json) 对照。

标签使用项目已有的三个方向。`duel` 描述争首杀、为步枪突破创造空间等主动接战方式。`system` 描述战术安排、支援和分工。`tempo` 可描述队员何时按局势改变原计划，其中几队的采访仅谈决策自由度，回合时长和提速频率没有测量。置信度是对这段文字能否解释对应情境的编辑判断，不代表胜率。

只有 11 队资料描述整队通常如何行动，标作 `usableForHistory`。9z、M80、DENDELE 有具体的个人角色证据，Chinggis Warriors 有两场具体比赛的数据，Lynn Vision 的例子是较早的一张 Nuke。后五队可在网页展示观察，不能单凭这些观察给整队增加对位胜率。历史重放需比较发布日期与比赛日期，排除已经开始的比赛，再核对至少三人核心及 `requiredPlayers`。同一类标签对不同地图、攻守方和时代可以有不同表现，对位方向和效应大小需单独验证。

## 首图的闪助、首杀与爆头

`flash_examples.json` 收录每队两场赛前系列赛的第一张实际比赛地图。记录日期为 10 月 6 日至 11 月 19 日。优先从可复核且有首图详细统计的赛前近期比赛选样。15 队由固定版本的公开场次和地图索引取样。索引没有覆盖 M80 在 10 月初的两场 ESL Pro League，改按 HLTV 赛程与两场赛事页取样。每条记录的链接指向对应地图的详细数据。[Griffin 比赛索引](https://github.com/Griffinxaxa/scrape-hltv-data/tree/f5e3e90fb56fef8adc19bd5e5e898d2741d0ff58/2026-data/archive) · [Spirit 对 M80](https://www.hltv.org/matches/2398749/spirit-vs-m80-esl-pro-league-season-24) · [Legacy 对 M80](https://www.hltv.org/matches/2398746/legacy-vs-m80-esl-pro-league-season-24)

在 HLTV 取该队五人攻守合计栏。K (hs) 提供全部武器的击杀数及爆头击杀数，A (f) 提供助攻及其中的闪光助攻，Op.K-D 提供首杀和首死。计算每回合闪助时用两张图的闪助总数除以实际回合总数。计算爆头击杀占比时分母是全队总击杀。回合可能没有被记作首杀的交火，例如地图 244553 的 18 回合中登记了 17 次首杀。看道具效果还需考虑对手、地图、使用次数和经济。两张首图无法代表长期水平。

全样本共有 32 条队伍地图记录，涉及 29 张不同地图，合计 694 个队伍回合和 170 次闪助。29 条记录首发五人相同，3 条保留四人。若同一张图的双方都入样，两侧各自计数。地图 243084 的 Inferno 上，Chinggis Warriors 五人共 75 杀、43 次爆头击杀、28 次助攻，其中 3 次是闪助，首杀与首死为 9 比 14。[HLTV 地图统计](https://www.hltv.org/stats/matches/mapstatsid/243084/chinggis-warriors-vs-5star)

## 复核

`python -B style_scout/verify.py` 核对资料日期、16 队覆盖、首发、样本数和字段范围。另将 Griffin 对应版本的 `series.csv`、`maps.csv`、`player_stats.csv` 放在同一目录，运行 `python -B style_scout/verify.py --archive PATH`。脚本沿用项目的三个 SHA-256 校验值，核实 30 条记录的系列赛、首图、日期、对手、回合数、五人名单，并逐条验证击杀等于 `side=both` 的五名队员 `kills` 合计。两张 M80 首图另外用系列赛主页分地图的五人 K-D 核对，保存在 `m80_flash.json`。对 Spirit 为 51 杀，对 Legacy 为 62 杀。Griffin 的逐人表不含闪助分项，这一列由每张图的 HLTV 详细统计给出。
