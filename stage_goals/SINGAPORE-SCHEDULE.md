# 新加坡 Major 的竞猜开放、锁盘与首场赛程

**11 月 27 日更新。** Stage 1 已结束，100 Thieves 在最后一场以 2–1 战胜 M80。PGL 原始赛果于北京时间 23:06 采集，正式赛果文件中的 `endAt` 取首次核实全场完赛的时间。Stage 2 的 16 队已确定，十格预测于北京时间 23:07 封存。下表保留 11 月 21 日的赛前状态。[PGL 赛果快照](../forecast_archive/prospective/results/pgl-stage1-2026-11-27.json) · [Stage 2 赛前封存](../singapore_stage2/forecast.json)

截至 2026 年 11 月 21 日，**游戏内第一阶段竞猜已经开放**。Valve 的 Steam 更新发表于 11 月 17 日 23:40:07 UTC，即北京时间 11 月 18 日 07:40:07，正文确认新加坡 Major Hub 已可填写 Pick’Em。这个时间是公告时间。精确到分钟的三个阶段游戏锁盘时刻仍欠 Valve 一手佐证。[Valve 更新](https://store.steampowered.com/news/app/730/view/1849827110421976) · [含原文和时间戳的 Steam 官方接口](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=730&count=3&maxlength=0&feeds=steam_community_announcements&enddate=1794959999)

| 阶段 | PGL 首场计划时间，北京／新加坡 | 对应 UTC | 游戏内开放状态，截至核对日 | Valve 精确锁盘时刻 | 已确定的参赛队 |
| --- | --- | --- | --- | --- | --- |
| Stage 1 | 11 月 24 日 12:00 | 11 月 24 日 04:00 | 已开放 | 待核实 | 16/16 |
| Stage 2 | 11 月 28 日 12:00 | 11 月 28 日 04:00 | 开放时刻待核实 | 待核实 | 8/16 |
| Stage 3 | 12 月 2 日 12:00 | 12 月 2 日 04:00 | 开放时刻待核实 | 待核实 | 8/16 |

PGL 赛程的每阶段第一轮前两场都列为当地 12:00，两场同时开始。第一、二阶段首轮为 BO1，第三阶段首轮为 BO3。复核方法是打开赛事页，选择对应阶段后查看 Schedule 的 Round 1。文件内记录了本次读取的赛程资源及其 SHA-256。[PGL 官方赛事赛程](https://www.pglesports.com/cs2/pgl-major-singapore-2026/) · [本次赛事页使用的赛程数据](https://www.pglesports.com/_next/static/chunks/app/cs2/pgl-major-singapore-2026/page-c70d0c7e1778ea80.js) · [机器可读记录](singapore-schedule.json)

游戏锁盘以 CS2 内该阶段的竞猜倒计时为准。Valve 公开更新只确认功能已上线。BLAST 的页面虽能关联玩家的 Valve 竞猜，但页面把该阶段第一场比赛的排定时间用作倒计时终点。赛程时间因此只写入 `firstMatchScheduledUtc`。尚待核实的 `valvePickemLockUtc` 均为 `null`。[Valve 更新](https://store.steampowered.com/news/app/730/view/1849827110421976) · [BLAST 竞猜页面](https://blast.tv/major/pickems) · [BLAST 页面倒计时计算](https://blast.tv/ssr-assets/2024-10-15/route-BJHKQnYB.js)

## 第二、三阶段的已知阵容

PGL 于 11 月 9 日公布报名表，并在文末单列将实际启用的替换。以下按公布的预计出场五人记录，队伍按英文名排列。每个阶段另有八席取决于上一阶段的比赛结果。[PGL 参赛分组](https://news.pglesports.com/news/1794212657579) · [PGL 名单和出场更正](https://news.pglesports.com/news/1794219566606-pgl-major-singapore-2026-team-rosters) · [PGL 名单原始数据](https://news.pglesports.com/api/articles/1794219566606)

| 阶段 | 直邀队伍 |
| --- | --- |
| Stage 2 | Astralis、FUT ESPORTS、G2 Esports、MIBR、Natus Vincere、Nemiga Gaming、The MongolZ、The One |
| Stage 3 | Aurora Gaming、BB TEAM、FURIA、Legacy、MOUZ、Team Falcons、Team Spirit、Team Vitality |

Stage 2 的 Astralis 启用 Anlelele 顶替 jabbi，FUT 启用 SunPayus 顶替 cmtry。Stage 3 的 Legacy 启用 ksloks 顶替 n1ssim，Vitality 启用 apEX 顶替 jL。Stage 1 的现有封存已记录 9z 的 history 顶替 meyern。后两阶段的十六支直邀队各自的五人名单、公告变更与时间，均可在随附 JSON 查询。[名单与来源](singapore-schedule.json) · [已封存的第一阶段参赛名单](../forecast_archive/singapore-stage1-seed-conditional-2026-11-21.json)

两个后续阶段需分别等待 PGL 公布完整十六队及种子顺序，并复查临场更换和游戏锁盘时刻，再按相应阶段的时间执行赛前封存。[赛前封存与赛后评分](PROSPECTIVE.md)
