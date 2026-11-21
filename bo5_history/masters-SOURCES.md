# PGL Masters Bucharest 2025 瑞士轮

本档是 2025 年 10 月 26–30 日的外部留出。16 队均经 VRS 受邀，瑞士轮全为 BO3，三胜晋级、三负淘汰。它检验增加赛前 BO5 历史对强弱估计和填卡的影响。该场地独立列账，Major 各阶段的届数维持原口径。[PGL 9 月 29 日受邀名单](https://x.com/pglesports/status/1972613198953230465) · [10 月 23 日赛前赛程与赛制](https://www.hltv.org/news/43009/pgl-masters-bucharest-teams-format-schedule-talent-prizes-fantasy)

## 赛前名单与种子

`masters-field.json` 以 2025-10-26 00:00 UTC 为排他截止。这是回顾研究所设的统一截点。队员依据 9 月 1 日至截止之前逐队最近一场、有共同五人出场记录的 BO1、BO3 或 BO5，再应用带日期且与赛事范围相符的换人公告。每队的 `rosterWitness` 保留其原比赛、五人和日期，16 个证据日期为 9 月 21 日至 10 月 19 日。[固定版本的 HLTvy 原档](https://raw.githubusercontent.com/zugzugs/hltvy/1a00ba2893a63646f0d940e626b6da95d342a187/results.json.gz)

| 队伍 | 截止前已知事实 | 本届首发处理 |
| --- | --- | --- |
| B8 | 10 月 12 日，俱乐部指明 kRaSnaL 替 kensizor 的范围是上海 CAC。 | 布加勒斯特恢复 kensizor。[B8 公告](https://x.com/B8esportsGG/status/1977344488881213667) |
| HEROIC | 10 月 9 日，俱乐部确认 hades 代打 CAC，并表示 Alkaren 预计在布加勒斯特归队。 | 使用 Alkaren。[当日公告报道](https://www.hltv.org/news/42898/heroic-add-hades-as-sub-for-cac-2025) |
| Ninjas in Pyjamas | 9 月 30 日原计划由 susp 代打，10 月 22 日俱乐部宣布 Snappi 可以参赛；10 月 24 日另确认教练 Xizt 缺席。 | 使用 Snappi，教练单列。[原计划](https://www.hltv.org/news/42749/susp-to-stand-in-for-snappi-at-pgl-masters-bucharest) · [10 月 22 日更新](https://www.hltv.org/news/43003/snappi-to-play-for-nip-at-pgl-masters-bucharest) · [教练公告](https://www.hltv.org/news/43013/xizt-to-miss-pgl-masters-bucharest) |
| MIBR | 10 月 22 日，MIBR 向 Dust2 Brasil 确认由青训选手 brn$ 替代 kl1m。 | 使用 brn$，他和同队的 brnz4n 是两位不同的选手。[Dust2 Brasil 原始采访](https://www.dust2.com.br/noticias/66899/mibr-tera-desfalque-na-pgl-masters-bucharest) |

初始种子取 9 月 1 日邀请榜，公开时间为 16:58:36 UTC。每队按至少三名相同选手唯一匹配榜内阵容，取 16 个获邀阵容在该期的相对次序。1 对 9 至 8 对 16 与主办方 10 月 20 日公布的八场首轮完全相符。比赛日 PGL 官方介绍列出的 16 队顺序也逐队相符，只用于复核。模型的实力输入则取截止前最新的 10 月 6 日公开榜，发布时间为 16:35:02 UTC。16 队皆有分数，其中 13 队与积分榜五人相同，3 队四人相同。[9 月 1 日 Valve 原榜](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/ec65cbf461daa5977d57f80561437961326cfc51/invitation/2025/standings_global_2025_09_01.md) · [10 月 6 日 Valve 原榜](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/9fd3c0e8b86dbceed3a211cd2a2a34185b99a990/invitation/2025/standings_global_2025_10_06.md) · [PGL 首轮公告](https://x.com/pglesports/status/1980198805703385416) · [八场赛前文字版](https://www.hltv.org/news/42988/pgl-masters-bucharest-opening-matches-set) · [PGL 比赛日介绍](https://www.youtube.com/watch?v=jlRZ9Poylsg)

现役地图池共七张，为 Ancient、Dust2、Inferno、Mirage、Nuke、Overpass、Train。每场赛后七步禁选均能与该池核对，未打的决胜图保留在 `planned`。[2025 年 7 月七图清单](https://pro.eslgaming.com/tour/2025/07/overpass-replaces-anubis-in-the-official-map-pool/)

## 赛后独立核对

`masters-results.json` 隔离在评分端。主办方的 Groups 原始表与 HLTvy 独立归档逐场核对 33 个对阵的轮次、日期、双方、系列比分、胜负及全部 99 个计划地图位置。实打 79 图，20 个决胜图未打。两份来源有 77 图的回合比分完全相符，另两图按逐回合原始比赛页校正，原值列在 `mapScoreConflicts`。[PGL 赛事主页](https://www.pglesports.com/cs2/pgl-masters-bucharest-2025/) · [PGL Groups 原始数据](https://www.pglesports.com/_next/static/chunks/app/cs2/pgl-masters-bucharest-2025/page-cf5c007eec90e220.js)

| 场次 | PGL Groups | 核实的回合比分 |
| --- | --- | --- |
| GamerLegion 对 FlyQuest，第 1 轮 Overpass | 13–12 | 13–11。[比赛原始记录](https://www.hltv.org/matches/2387100/gamerlegion-vs-flyquest-pgl-masters-bucharest-2025) |
| Aurora 对 SAW，第 4 轮 Train | 10–13 | 9–13，半场 8–4、1–9。[比赛原始记录](https://www.hltv.org/matches/2387336/aurora-vs-saw-pgl-masters-bucharest-2025) |

初始 80 人逐一匹配实打首轮。33 场均有实打地图和双方实际五人，每场逐图阵容一致，未发现弃权。66 次出场阵容中有 65 次与赛前五人完全相同。10 月 30 日第 5 轮 Astralis 的 device 突发医疗情况，教练 ruggah 临时入场，该场仍保留四人核心。此项只记在赛果。以赛前种子输入现有 `CS.replay`，五轮分别重现 8、8、8、6、3 场对阵。另由胜负记录独立核验每轮同战绩对赛、无重复对手及十格归类。[Astralis 临场换人公告](https://www.hltv.org/news/43062/device-misses-astralis-elimination-match-in-bucharest-due-to-medical-emergency-ruggah-to-stand-in)

## 重建

在仓库根目录，以 Python 3 和 Node.js 执行。下载上文固定版本的 HLTvy 压缩包、Valve 两期原始 Markdown 和 PGL Groups JS，保存为命令中的文件名。脚本核验四个输入的 SHA-256，直接解析 Groups 的数据字面量。默认逐字节对照仓内 JSON；加 `--write` 可重新生成。

```sh
python bo5_history/masters.py results.json.gz standings_global_2025_10_06.md standings_global_2025_09_01.md --field-only
python bo5_history/masters.py results.json.gz standings_global_2025_10_06.md standings_global_2025_09_01.md --official-groups page-cf5c007eec90e220.js
```

赛前场地的 SHA-256 为 `d43132cb8702c5d1203e21c331bba1a2acca6eb328fa245a3d242f16ecb973c1`，赛果为 `eea93bba6ada8757645a3b2987a6c9bf0e03e53cb348c9868e0b1ac7a5ee2e74`。四个原始输入的哈希分别见场地的 `archiveSha256`、`rankSnapshot`、`seedSnapshot` 及赛果的 `officialScheduleSha256`。
