# PGL Astana 2025 瑞士轮的赛前输入与独立赛后核验

本届是 16 队同场的全 BO3 外部留出，2025 年 5 月 10 日至 14 日共五轮。球队阵容、种子、积分和图池的截止时间为 5 月 10 日 00:00 UTC。预测端读取 `astana-field.json`。赛后核验使用的 `astana-results.json` 另存五轮真实对阵、完整七步禁选、各图比分及实际五人。这一届不计入 Major 过关分母。[PGL 官方赛事页](https://www.pglesports.com/cs2/pgl-astana-2025/) · [开赛前赛制与赛程](https://www.hltv.org/news/41628/pgl-astana-teams-format-schedule-prizes-talent-fantasy)

## 80 位开幕首发的证据

PGL 于 4 月 28 日 11:26:29 UTC 发布 16 队报名名单，现存官方副本的更新时间为 6 月 10 日。重建程序同时从 5 月 10 日以前的比赛独立验证每队最近可核实的五人，剔除已离队者，并按赛前报道处理新人。G2 的 hades、Astralis 的 HooXi、FURIA 的 molodoy 和 YEKINDAR 均已确认加盟。ODDIK 公告中的「Woody」由球队此前比赛的 WOOD7 与 5 月 2 日参赛名单核对，paiN 的 dav1deu$ 与 dav1deuS 使用同一身份。每支队的最近比赛和官网登记名保存在 `rosterWitness` 和 `announcedRoster`。[PGL 原公告](https://press.pglesports.com/399866-pgl-astana-2025-official-team-rosters-revealed) · [官方现存正文](https://news.pglesports.com/api/articles/1749531500230) · [5 月 2 日首轮及新阵容报道](https://www.hltv.org/news/41597/pgl-astana-opening-matchups-revealed)

两支队在截止前一天公告签证问题。G2 由教练 TaZ 代替 huNter-，队方当时未承诺归期。paiN 由教练 rikz 代替 dgt 打头两天，dgt 的签证从 5 月 12 日允许入境。开赛前固定的 120 对矩阵以两队的开幕五人为准，两种禁选策略共用该矩阵。报名五人、开幕五人和已知替补安排分别保存。首轮实际 80 人与冻结开幕名单全部相符。31/33 场双方实际五人完全一致，另两场分别是 5 月 12 日 paiN–ODDIK、5 月 13 日 MIBR–paiN，paiN 的 dgt 已复归，仍有四位开幕首发。固定矩阵没有逐轮切换其阵容。[G2 公告](https://x.com/G2CSGO/status/1920782752246309324) · [paiN 公告](https://x.com/paiNGamingBR/status/1920856435350437976) · [G2 同期报道](https://www.hltv.org/news/41642/taz-to-stand-in-for-hunter-at-pgl-astana) · [paiN 同期报道](https://www.hltv.org/news/41643/rikz-to-stand-in-for-dgt-during-pgl-astana-opening-weekend)

## 种子、积分与图池

PGL 公布邀请日使用 3 月 3 日 VRS。用登记名单与当期排名中的五人唯一匹配至少三人，按该榜排序重建种子，首轮 1 对 9 至 8 对 16 与 5 月 2 日公开的全部八对一致。后续用项目中的瑞士轮引擎重放，对上 8、8、8、6、3 场。赛前强弱特征另取 5 月 5 日 16:56:18 UTC 公布的全球榜，按开幕五人匹配，16 队均取得唯一的至少三人核心。G2、FURIA 为 3/5，Astralis、paiN 为 4/5，另外 12 队为 5/5。[PGL 邀请日期](https://press.pglesports.com/365501-pgl-cs2-2025-2026-update-key-invite-dates-innovative-playoffs-format-pgl-prize-pool-payment-date-and-locations-update) · [3 月 Valve 全球榜](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/293e01e588b5e751ee0b306dc2958765dc63dce0/invitation/2025/standings_global_2025_03_03.md) · [5 月 Valve 全球榜](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/5426fc070e21ff44d85cf83a73abcddef601aae6/invitation/2025/standings_global_2025_05_05.md)

同一七图池包含 Ancient、Anubis、Dust2、Inferno、Mirage、Nuke、Train。将开场先禁的一方叫作 A，BO3 采用 A 禁、B 禁、A 选、B 选、B 禁、A 禁。适用依据是赛前已知的同主办方布加勒斯特 40/40 场和本届已归档资格赛 230/232 场都采用这个顺序。两次例外都是北美闭门预选，资料中各有链接。未取得这届主赛单独列明动作顺序的主办方规则文件，故将上述证据标为实际赛场惯例。赛后 33/33 场主赛均与此顺序吻合。[PGL 资格赛公告](https://news.pglesports.com/api/articles/1749531513803) · [Valve 更换图池记录](../stage3_maps/POOLS.md) · [赛前禁选证据和例外](astana-field.json)

## 实际赛果和地图

每条系列从固定 HLTvy 公开快照取双方五人、七步禁选、实际地图和回合数，保留原场链接。另从 **PGL 官网「Groups」按钮使用的数据** 提取全部 33 场的对手、系列比分、三张计划地图和逐图比分，按双方队名及日期关联。一手数据与归档的 33 个赢家、99 个按序排列的地图名、80 张实打地图的双边回合数全部吻合。19 场以 2–0 结束，PGL 将未开打的决胜图具名记录为 0–0，33 个决胜图均可直接核验。PGL 将一张 Mirage 拼为 `de_miirage`，程序明确纠正拼写。此项验证只读取公开脚本中的比赛数组，没有执行其中的 JavaScript。[PGL 官方成绩数据](https://www.pglesports.com/_next/static/chunks/app/cs2/pgl-astana-2025/page-fb7e1b5997285411.js) · [固定对局归档](https://github.com/zugzugs/hltvy/tree/1a00ba2893a63646f0d940e626b6da95d342a187) · [33 场事实与原场链接](astana-results.json)

## 离线复算

下载上述官方文章 JSON、两份全球榜 Markdown、PGL 官方成绩 JavaScript，以及固定提交的 `results.json.gz`。在项目根目录以 Python 3 和 Node.js 执行。程序校验归档、官方正文、两份 Valve 排名和官方成绩数据的 SHA-256，默认逐字节与仓内结果比较。`--field-only` 可单独检验赛前资料，此模式无需官方成绩文件。`--write` 用于重新生成。

```text
python veto_ml/astana.py results.json.gz pgl-rosters.json standings_global_2025_05_05.md standings_global_2025_03_03.md --official-groups pgl-groups.js
```
