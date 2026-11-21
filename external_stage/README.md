# 后续阶段的赛前世界榜与外部竞猜

2026 年 11 月 21 日。用各阶段开赛前最近的 HLTV 世界周榜，检验能否改善正式 Stage 3 的胜率和过关表现。再单独比较同一家媒体在赛前公开的竞猜。[周榜与晋级组的预设口径](PROTOCOL.md) · [编辑槽位试验口径](CATEGORY_PROTOCOL.md)

## 同一填卡方式下更新实力输入

每阶段用同一组 24,000 条瑞士轮路径，先用一半选卡，另一半评价。下表列网站固定种子 33719 的逐届格数。周榜和编辑晋级组分别与原实力等权合并。2024 年的两个第二阶段仍归 Stage 2。

| 正式 Stage 3 | 网站基线 | 更新周榜 | 加入编辑八队晋级预测 | 媒体原卡 |
| --- | ---: | ---: | ---: | ---: |
| 奥斯汀 2025 | 5 | 5 | 5 | 已写明 9 格中 2 格，补满上限为 3 格 |
| 布达佩斯 2025 | 2 | 2 | 3 | 5 |
| 科隆 2026 | 2 | 3 | 2 | 5 |
| 达到 5 格的届数 | 1/3 | 1/3 | 1/3 | 2/3 |

三届 99 场中，更新周榜使 BO1 的 Brier 从 0.21846 降至 0.21605，BO3 从 0.23971 降至 0.23526。按 30 组随机种子计，过关数 1 组增加、29 组持平。迁移到五届 Stage 2 后，固定种子的过关数从 4/5 降到 3/5。编辑八队晋级预测使 Stage 3 的 BO1、BO3 Brier 分别降至 0.21392、0.23523；30 组过关数 1 组增加、28 组持平、1 组下降。两个候选均未达到本次的升默认门槛。

媒体原卡记录 Pley.gg 本社当时给出的明确槽位。布达佩斯的 Spirit 全胜、Vitality 和 FaZe 普通晋级，给 Pley 带来网站原卡漏掉的三格。科隆的 Spirit 全胜、Falcons、G2 和 BetBoom 普通晋级及 PARIVISION 全败，都被 Pley 判中。奥斯汀文末只选了一支全败队，按未填槽的两种可能得分列出区间。[奥斯汀 6 月 10 日原文](https://pley.gg/cs2/stage-3-pickem-guide-for-the-blast-tv-austin-major-2025/) · [布达佩斯 12 月 2 日原文](https://pley.gg/cs2/budapest-major-2025-pickem-guide-stage-3-predictions/) · [科隆 6 月 9 日原文](https://pley.gg/cs2/pickem-guide-for-stage-3-at-iem-cologne-major-2026/)

## 用编辑意见校正整卡的槽位

第二轮保留编辑原来指定的战绩类型，先用更早届最后一轮瑞士阶段中媒体已写明的槽位训练单一权重。哥本哈根、上海两个赛前稿共提供 20 格，随后依次加入奥斯汀 9 格和布达佩斯 10 格。两届 2024 年资料只为该试验提供训练，Stage 3 的统计仍是三届。[哥本哈根 3 月 20 日原文](https://pley.gg/cs2/pgl-copenhagen-major-elimination-stage-pickem/) · [上海 12 月 4 日原文](https://pley.gg/news/shanghai-major-elimination-stage-pickem-predictions/)

| Stage 3 | 训练得出的编辑权重 | 网站原卡 | 只按模型最大化期望格数 | 加上编辑槽位后最大化期望格数 |
| --- | ---: | ---: | ---: | ---: |
| 奥斯汀 | 27.5% | 5 | 4 | 2 |
| 布达佩斯 | 10.4% | 2 | 3 | 4 |
| 科隆 | 11.6% | 2 | 2 | 4 |

加入编辑意见后，布达佩斯与科隆分别多中一格、两格，奥斯汀少中两格。两个最大期望方案在全部 30 个种子下均为 0/3 届过关。单场胜率、模拟路径完全相同。这种组合没有改善过关目标。Pley 是单家媒体，三届由两位作者署名，跨作者和再次发稿的稳定性仍需未来预先封存的卡验证。

## 来源与复算

`weeks.json` 记录八个 Stage 2／3 的日期、世界排名、实际榜单首发、原榜链接及归档的 Git 提交与 blob 校验。三届正式 Stage 3 的 48 个参赛席位均匹配到至少三名相同首发，镜像提交时间均早于阶段开始。哥本哈根 2024 的周榜前三十名覆盖 15 队，取 March 18 原榜；镜像为 11 月回填，日期证据弱于其余七个有赛前镜像的阶段。三届发布文章按站内署名和刊发日核对，现存页面可能经过编辑，完整网页没有在当年由本项目自行封存。[HLTV 哥本哈根前榜单](https://www.hltv.org/ranking/teams/2024/march/18) · [HLTV 布达佩斯前榜单](https://www.hltv.org/ranking/teams/2025/december/1) · [定期榜单归档](https://github.com/julienc91/hltv-ranking/tree/rankings)

包内运行 `node external_stage/evaluate.cjs --check` 和 `node external_stage/category.cjs --check`，分别复算两轮研究。联网时可运行 `node external_stage/extract.cjs --check`，按固定 Git 提交比较快照。前瞻评分须在下一届阶段首场前保存正式源文、槽位、模型概率和时间，赛事结束后独立计分。
