# 赛前可用的最新 Valve 积分

逐届查询 Valve 官方仓库在开赛前一天 UTC 23:59:59 已公开的最后一次提交，核对提交时间与原始榜单文件的 Git 对象 ID。以此限定当时可获得的积分。基础积分、临赛积分与赛事初始种子各自保留原有用途。

| 赛事 | 当时最后一版 Valve 公开榜单（UTC 提交时间） | 首日 | 与基础积分关系 | 首发五人全匹配 |
| --- | --- | --- | --- | --- |
| 哥本哈根 2024 | [3 月 4 日 23:55，三地区](https://github.com/ValveSoftware/counter-strike_regional_standings/tree/99a0ba5fff938345d10d500f8b29cd297076573e) | 3 月 17 日 | 与基础同榜。赛区内用区域名次，跨区使用原始积分 | 16/16 |
| 上海 2024 | [11 月 25 日 16:10，全球](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/8a8657be12dc322d1141fe6263cf8270c718b605/live/2024/standings_global_2024_11_25.md) | 11 月 30 日 | 晚于 11 月 6 日基础榜 | 16/16 |
| 奥斯汀 2025 | [6 月 2 日 17:58，全球](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/1ce8398c0be1970319488c23cfd0d4077eaec04a/invitation/2025/standings_global_2025_06_02.md) | 6 月 3 日 | 与基础同榜 | 15/16 |
| 科隆 2026 | [6 月 1 日 17:15，全球](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/510968f54723dcb698ad3b04d396140fc263c239/invitation/2026/standings_global_2026_06_01.md) | 6 月 2 日 | 与基础同榜 | 14/16 |

哥本哈根 2024 早于 HLTV 在 [8 月 30 日推出实时 VRS 的公告](https://www.hltv.org/news/39751/valve-ranking-and-formula-implemented-on-hltv)。现在可以打开的更早日期的 HLTV 回算页面，不能证明相同估值在 3 月比赛开打前已公开。

奥斯汀的 Complexity、科隆的 BetBoom 和 Gaimin Gladiators 在榜单与首发之间各有一人更换，保留四名选手，仍达到模型的三人核心门槛。匹配时比较整张原始榜单的所有五人阵容，采用唯一且重合度最高的记录；昵称变化沿用项目 2024 阵容核验结果。

种子决定首轮对手。奥斯汀主办方采用 [5 月榜](https://www.hltv.org/news/41623/austin-major-stage-1-opening-matchups-set-after-vrs-update)排种。科隆在 [5 月 21 日](https://www.hltv.org/news/44679/iem-cologne-major-stage-1-opening-matchups-announced)公布首轮对阵，16 个种子席次与 [5 月 4 日全球榜](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/aac2074bc10fd62a8bf0b2146d7edfb67d224bcf/invitation/2026/standings_global_2026_05_04.md)中各参赛阵容的相对顺序一致。两届 6 月榜分别在首日前一天公布，只用于估计胜负。上海的 [11 月 25 日榜](https://www.hltv.org/news/40396/perfect-world-confirms-opening-major-matches)用于排种，并与当届区域席位规则结合。哥本哈根在 3 月 4 日地区榜及资格赛结果后确定席位，3 月 16 日公布的 [GamerLegion 替补入场](https://www.hltv.org/news/38493/official-gamerlegion-replace-9-pandas-at-copenhagen-major)已包含在模型首发中。

`sources/` 保存六个历史榜单原件。执行 `python vrs_repair/build.py --check` 可离线重算：它校验六个 Git blob 的哈希、发布日期、阵容和各队排名积分，再与 `ratings.json` 比对。加上 `--verify-online` 会向 GitHub 查询每届截止日前的最后一次公开提交。每届对象的 `historySource`、`sources` 字段给出查询和固定版本文件链接。
