# 2024 两届 Opening Stage 回测

这里的 Opening Stage 对应后续 Major 的 Stage 1。两届均以赛前 16 支队伍的种子顺序进入模拟。逐轮赛果只在模拟选卡完成后用于计分。

| 赛事 | 赛前实力榜 | 可选临赛积分 | 近期比赛样本来源 |
| --- | --- | --- | --- |
| 哥本哈根（3 月 17 日开赛） | 3 月 4 日 Valve 欧洲、美洲、亚洲三张表的积分 | 这是开赛前最后一份 Valve 榜单 | 赛前 85 天训练；90 天近期状态 |
| 上海（11 月 30 日开赛） | 11 月 6 日 Valve 全球邀请榜 | 11 月 25 日 Valve 全球实时榜 | 同上 |

哥本哈根的区域榜带有可用于跨区域比较的原始积分。区域名次只在该赛区内部有效。原始榜单中仍列出旧队名时，用实际五人匹配最高重合阵容，最少三人；出现并列匹配时放弃。上海直接使用全球积分。上海临赛积分采用相同的五人核对规则。

比赛来自公开版本化的 Ektarr 系列赛记录，提取每个系列的比分、实际出场选手与赛制。以选手 ID 辅助解析缺少昵称的记录，避免同一系列的地图重复计数。基础模型使用最近 85 天，训练场次为哥本哈根 323 场、上海 621 场。每场的两支队均须在严格早于比赛日期的 Valve 榜单中匹配到至少三名共同选手。每个训练样本的近期表现仅使用它之前日期的比赛，同一天的比赛互不引用。

近期状态为实际赛果相对赛前 VRS 预期的差值，使用五场平滑先验。近 90 天的状态和对强队／弱队表现分别拟合，统计范围受公开系列赛覆盖和双边阵容匹配限制。零样本回退到中性的表现修正。哥本哈根的 HEROIC 无可核验近期残差样本，仍有正式赛前积分。KOI 战绩中 ID 943 的空白昵称由四名已知队友及 2024 年 2 月 16 日欧洲 RMR 的公开出场名单核为 stadodo，纳入十场近期对局。[赛前身份核对所用成绩单](https://www.hltv.org/matches/2369744/fnatic-vs-koi-pgl-cs2-major-copenhagen-2024-europe-rmr-a)赛制、近期阵容走势与历史交手沿用主程序相同的模型函数和样本收缩方式，拟合时仅使用对应届开赛前资料。

复现时从 Ektarr 版本 11 提取 `cs2_all_tiers_games.csv`，再运行：

```sh
python history24/build.py --series /path/to/cs2_all_tiers_games.csv
```

脚本校验输入 CSV 的 SHA-256，自动按固定 Git 修订下载各日期的 Valve 榜。重建产物为 `models.json` 和逻辑回归/候选提升树共用的逐场 `fit_examples.csv`。原始评级缓存和验算用的逐队资料位于 `history24/cache/`。`fixtures.json` 收录种子、开赛名单、实际赛果、逐场赛制及其来源。

- Valve 2024-03-04 区域榜历史版本：[欧洲](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/99a0ba5fff938345d10d500f8b29cd297076573e/standings_europe.md)、[美洲](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/99a0ba5fff938345d10d500f8b29cd297076573e/standings_americas.md)、[亚洲](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/99a0ba5fff938345d10d500f8b29cd297076573e/standings_asia.md)。
- Valve 2024 年 11 月两期：[邀请榜](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/f8c55f250fdef796d708aa32814587932154fa04/invitation/2024/standings_global_2024_11_06.md)、[实时榜](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/f8c55f250fdef796d708aa32814587932154fa04/live/2024/standings_global_2024_11_25.md)。
- [Ektarr 系列赛资料，版本 11](https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11)，CC BY-SA 4.0。此处归属和核验基于两份资料的匹配。
