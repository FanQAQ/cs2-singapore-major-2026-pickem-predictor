# 五届 Major 首轮实际五人与地图 ML 首发

五届 Major 的 13 个瑞士阶段共 **208 个队次，208 个首轮五人全部与模型输入一致**。共核 104 场、116 张实打地图，两边合计 232 次地图阵容，232 次均一致。首轮没有缺逐图名单的场次，也没有发现系列内换人。新加坡尚未开赛，独立研究场地 Cluj 2025 也不在这个分母中。[逐队对照、对手和比赛链接](roster-audit.json) · [逐张地图实际首发](roster-audit-evidence.json.gz)

| Major | 真实阶段 | 核实首轮队次 | 实打地图 | 与原模型的 VRS 快照五人不同的队次 |
| --- | --- | ---: | ---: | ---: |
| 哥本哈根 2024 | S1、S2 | 32/32 | 16 | 0 |
| 上海 2024 | S1、S2 | 32/32 | 16 | 1 |
| 奥斯汀 2025 | S1、S2、S3 | 48/48 | 24 | 3 |
| 布达佩斯 2025 | S1、S2、S3 | 48/48 | 24 | 6 |
| 科隆 2026 | S1、S2、S3 | 48/48 | 36 | 5 |

先按赛事、首轮、队名与对手找到比赛，核对已知首轮八组配对，再按每张已打地图检查双方记分板。前四届 80 场来自固定 HLTvy 档，科隆 24 场来自同期赛后帖的逐图球员表，每一席均有 HLTV 选手 ID；科隆的 36 张图名和回合比分另与 BLAST 赛事页逐张核对。组间按当届俱乐部身份消歧，单张地图的两侧人员分别核实。四个队次需要同人别名归一，分别为哥本哈根 S1 SAW 的 rmn／roman、上海 S1 和 S2 paiN 的 Snowzin／snow、上海 S1 Rare Atom 的 AhaNg／L1haNg。没有余下差异需要归入可预知变阵、临场替补或未明原因。[HLTvy 固定版](https://github.com/zugzugs/hltvy/tree/1a00ba2893a63646f0d940e626b6da95d342a187) · [科隆逐场资料](https://blast.tv/cs/tournaments/iem-cologne-major-2026?view=results)

该核对能确认送入模型的人与首轮上场的人一致。历史比赛大多为回溯整理，每个阵容在当时锁盘前是否已有同期公开公告，还需查看具体资料日期。2024 年首阶段使用赛前既有比赛的五人见证，后续阶段另有直接参赛队名单、此前阶段实际人选和办赛方公布的种子；即使最终人员完全相符，仍应保留这些来源之间的区别。[2024 年历史资料](../history24/build_fixtures.py) · [后续阶段输入说明](../multi_stage/INPUTS.md) · [既有赛前名单及变更来源](../datajob/stage_roster_sources.json)

## 15 个队次的实力快照只保留四名实际首发

用同一份地图 ML 输入中的 `pointsAsOf` 和 `vrsRoster` 对比实际五人，193 个队次五人相符，15 个队次仅四人相符。一个月榜可以供同一届多个阶段继承，因而会数到同一俱乐部的同一项变更。以下是各次对照使用的实际快照日期；这批数据不检验邀请榜或每场开赛前最新一期排名。[模型实际输入](../f1bre_models/major-fields.json)

| Major / 队伍 | 快照日 | 出现阶段 | 快照名单中独有 | 首轮上场者 | 首轮记录 |
| --- | --- | --- | --- | --- | --- |
| 上海 Vitality | 2024-11-06 | S2 | JACKZ | mezii | [S2](https://www.hltv.org/matches/2377698/vitality-vs-gamerlegion-perfect-world-shanghai-major-2024) |
| 奥斯汀 Complexity | 2025-06-02 | S1 | hallzerk | junior | [S1](https://www.hltv.org/matches/2382296/complexity-vs-og-blasttv-austin-major-2025-stage-1) |
| 奥斯汀 FaZe | 2025-06-02 | S2、S3 | skullz | rain | [S2](https://www.hltv.org/matches/2382428/faze-vs-heroic-blasttv-austin-major-2025-stage-2) · [S3](https://www.hltv.org/matches/2382437/aurora-vs-faze-blasttv-austin-major-2025) |
| 布达佩斯 FaZe | 2025-11-03 | S1、S2、S3 | rain | jcobbb | [S1](https://www.hltv.org/matches/2387853/faze-vs-lynn-vision-starladder-budapest-major-2025-stage-1) · [S2](https://www.hltv.org/matches/2388060/passion-ua-vs-faze-starladder-budapest-major-2025-stage-2) · [S3](https://www.hltv.org/matches/2388095/vitality-vs-faze-starladder-budapest-major-2025) |
| 布达佩斯 NRG | 2025-11-03 | S1 | nitr0 | daps | [S1](https://www.hltv.org/matches/2387856/ninjas-in-pyjamas-vs-nrg-starladder-budapest-major-2025-stage-1) |
| 布达佩斯 The MongolZ | 2025-11-03 | S3 | Senzu | controlez | [S3](https://www.hltv.org/matches/2388092/imperial-vs-the-mongolz-starladder-budapest-major-2025) |
| 布达佩斯 Spirit | 2025-11-03 | S3 | zont1x | tN1R | [S3](https://www.hltv.org/matches/2388093/spirit-vs-liquid-starladder-budapest-major-2025) |
| 科隆 BetBoom | 2026-06-01 | S1、S2、S3 | S1ren | d1Ledez | [S1](https://www.hltv.org/matches/2394775/betboom-vs-gaimin-gladiators-iem-cologne-major-2026-stage-1) · [S2](https://www.hltv.org/matches/2394865/spirit-vs-betboom-iem-cologne-major-2026-stage-2) · [S3](https://www.hltv.org/matches/2394904/the-mongolz-vs-betboom-iem-cologne-major-2026) |
| 科隆 Gaimin Gladiators | 2026-06-01 | S1 | felps | fer | [S1](https://www.hltv.org/matches/2394775/betboom-vs-gaimin-gladiators-iem-cologne-major-2026-stage-1) |
| 科隆 MOUZ | 2026-06-01 | S3 | jL | Brollan | [S3](https://www.hltv.org/matches/2394905/mouz-vs-legacy-iem-cologne-major-2026) |

对下一届，可以在每阶段交卡前，把参赛名单、比赛日先发和采用的积分榜五人分别保存，给实际变更附上发布日期、来源和截止时间。先查代打是否仅限上一场赛事，再核对榜单重合未达 5/5 的队伍。新加坡首轮打完后，沿用本脚本逐图比较事前封存版本；已有 208 队次提供了相同口径的历史基准。这项检查针对预测输入，整卡达五格仍用当届实际成绩计数。

## 复算

第一条使用包内逐图证据独立核验全部模型首发、榜单人员及首轮配对。第二条从固定 HLTvy 归档、三个同期赛后帖 JSON、BLAST 赛事页重新提取。原始归档、各个科隆帖子集及 BLAST 页的 SHA-256 均在证据文件内。每份帖子还保留与原场详细统计相连的 URL。

```sh
python elite_opponents/roster-audit.py
python elite_opponents/roster-audit.py --archive /data/results.json.gz --cologne /data/feed1.json /data/feed2.json /data/feed3.json --blast /data/blast.html
```
