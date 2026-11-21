# 历史选手评分的赛前可用性

固定的 3,538 篇公开帖子共提供 3,129 场可验证系列、31,290 个个人评分。其中 2,651 场有明确的全系列表，478 场用 BO1 唯一地图的全表。2,232 场的原帖直接列出比赛 ID，另 897 场由双方完整十人和日期唯一确定。比赛日期覆盖 2023 年 10 月 16 日至 2026 年 5 月 23 日，最晚证据时间为 2026 年 5 月 24 日 23:24:15 UTC。最终文件 SHA-256 为 `cb3698dc1e2e08099f1b8c55b1a6dc83e55878b9f5850185b2fc11117d547334`。

本表专供 Elo 回放起点的先验。每个目标先向前 180 天确定起点，再选取起点前 180 天已完成、且在起点前已归档的比赛。15 个场地的最晚起点是 2026 年 5 月 25 日。下列数值是整个数据源的可用数。每队另以实际三人核心筛选。

| 起点（UTC） | 此前 180 天已归档系列 |
| --- | ---: |
| 2023-09-19 | 0 |
| 2024-06-01 | 586 |
| 2024-12-01 | 558 |
| 2025-05-01 | 647 |
| 2025-08-01 | 715 |
| 2025-12-01 | 728 |
| 2026-05-25 | 426 |

社区赛后帖在比赛结束时保存 HLTV 记分板的逐人 Rating。HLTV 在 2024 年 10 月 14 日及 2025 年 8 月 20 日更新过评分公式，还会重算此前比赛。在 2024 年 Dallas 决赛的帖子中，m0NESY 首图评分是 1.63，2026 年 3 月的同场历史数据快照为 1.70。赛前先验只在相应快照可用之后使用其中的数据。不同年代评分的基准仍有差异。[Dallas 当场记分板](https://www.reddit.com/r/GlobalOffensive/comments/1d6op1v/g2_vs_vitality_iem_dallas_2024_grand_final/) · [Rating 2.1](https://www.hltv.org/news/40051/introducing-rating-21) · [Rating 3.0](https://www.hltv.org/news/42485/introducing-rating-30)

按固定时间窗口读取 r/GlobalOffensive 的 CS2_PostMatchThreads、早期 CSGOMatchThreads 和 2024 年哥本哈根赛事的 Undercover-Cactus 帖。逐表读取全系列双边五人、HLTV 选手 ID 和个人评分，计算每队五人等权均值。BO1 只有一张比赛图时允许使用该图的双边全表。全系列和单图表不叠加。[2024 卡托维兹](https://www.reddit.com/r/GlobalOffensive/comments/1aofxpq/) · [2024 哥本哈根](https://www.reddit.com/r/GlobalOffensive/comments/1brvgsm/) · [Arctic Shift 查询与字段文档](https://github.com/ArthurHeitmann/arctic_shift/blob/master/api/README.md)

每场记录分别保存原帖、比赛链接、系列 ID、内容表格摘要、发布时间和归档时间。资格时间 `availableAt` 采用发布时间、首次抓取、已知二次抓取及编辑时间中的最晚者。模型在锚点 UTC 自然日之前才可读取该场。原帖有明显编辑而缺少第二次抓取时剔除。部分早期帖只附有逐图统计的链接；此时按发帖当日与前一 UTC 日期、两支队的完整十人阵容，在固定 HLTvy 档案中唯一匹配系列 ID。匹配使用阵容与日期，选手评分仍来自比赛当时留下的赛后帖。2023 年的两代游戏交替期还要求所有实打图的首半场均为 12 个回合。

2,979 场有独立比赛起始时刻。其余 150 场的原帖直接链接 HLTV 比赛，但缺少同份比赛原档的 UTC 开赛时间，`seriesStartUtc` 保留为空，`day` 采用帖子发表的 UTC 日期。当日日界附近可能与开赛日差一天，训练始终另以归档时间限制可用性。一个系列至多使用一次，冲突的评分表及无法证明全场或十人身份的帖子均剔除。该来源以受到社区关注的赛事为主，参赛较少的队可能没有合格先验。

数据包的 [player-priors.json.gz](player-priors.json.gz) 可直接读取。本地复算时准备[固定比赛档](https://raw.githubusercontent.com/zugzugs/hltvy/1a00ba2893a63646f0d940e626b6da95d342a187/results.json.gz)，第二个命令使用首次查询保存的分页响应。

```sh
python -B f1bre_models/player_priors.py /path/to/post-cache /path/to/results.json.gz --fetch --write
python -B f1bre_models/player_priors.py /path/to/post-cache /path/to/results.json.gz
```
