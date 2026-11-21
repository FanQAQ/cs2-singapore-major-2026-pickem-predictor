# 对世界前八的历史战绩能改善 BO3 胜率吗？

2025 年 2 月的 PGL 克卢日有四支当时的世界前八，既没有 FURIA，也没有 Spirit。按上轮预定的公式，把同一核心过去 180 天打前八和打其他队的表现差异加到原地图 ML。只有全场和适用场次的 Brier、对数损失都下降，才进入整卡比较。所有 120 种潜在配对在计算这项赛事的误差前封存。这是首次用于此项研究的整届历史留出。[预先登记的公式、赛事和判据](../bo5_history/NEXT-ELITE.md) · [网页逐队与逐场查看](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/#verify/elite)

| 样本 | 实打 BO3 | 胜率有变化 | 全部 BO3 Brier，原 → 调整 | 全部 BO3 对数损失，原 → 调整 |
| --- | ---: | ---: | --- | --- |
| 克卢日 2025，首次对外检验 | 33 | 8 | .19688 → .21542 | .57727 → .61616 |
| 奥斯汀 Stage 3，开发 | 13 | 7 | .16086 → .17019 | .48801 → .51866 |
| 布达佩斯 Stage 3，开发 | 13 | 7 | .23133 → .23057 | .65655 → .65897 |
| 科隆 Stage 3，开发 | 33 | 22 | .21025 → .22030 | .59798 → .62337 |

克卢日四项门槛均未通过。八场适用对局里，调整后仅有一场提高了实际赢家的胜率，Brier 从 .18726 升至 .26374，对数损失从 .56102 升至 .72141。其余 25 场的胜率相同。五轮 33 个对阵均能重放。按登记方案，这项特征到此停止，没有为其产生整卡分数、0–3 命中或新的交卡建议。Stage 1、2、3 首页推荐仍分别是 3/5 · 27/50、4/5 · 25/50、1/3 · 9/30。上海与科隆仍计入各自的完整阶段窗口。[逐场胜率、四项检验及配对](scores.json) · [两份赛果来源与实打比分](RESULT-SOURCES.md)

### 为什么给 MOUZ 的加分过高？

赛前 MOUZ 对前八赢了 5/8，VRS 预期为 3.22 胜。对其余队只赢了 8/17，预期却有 14.55 胜。两组的差值因此很大，既来自打强队的表现，也来自打其余对手失分。这 25 场都是四人相同的旧阵容，Spinx 在克卢日首次代表 MOUZ 登场。两队对比后，瑞士轮第三轮 MOUZ 对 FaZe 的胜率由 42.30% 上升到 59.59%，实战 FaZe 以 2–0 获胜。FaZe 与 The MongolZ 最终双双 3–0。这项历史统计不足以直接用来填全胜位。[逐队赛前观测](profiles.json) · [赛前首秀报道](https://www.hltv.org/news/40967/pgl-cluj-napoca-schedule-announced) · [MOUZ 对 FaZe 的实打比分](https://www.hltv.org/matches/2379346/mouz-vs-faze-pgl-cluj-napoca-2025)

### 更正了哪项赛前输入？

最初的克卢日名单沿用了上一站临时代打的 Imperial Valkyries 教练 bubble。开赛前两天公布的名单确认 tory 回归。2026-11-21 13:01 UTC 封存的初版保留为纠错证据，未经模型评分。赛后资料核对人员已开始检查实际阵容时，独立的赛前资料核对发现冲突。按同一赛前赛事指南重新逐人比对全部 16 队，更正这一个席位后于 13:05 UTC 另行封存。全程使用同一公式、超参数和评分条件。更正令 Imperial 的 15 个潜在 BO3 中有 13 个发生变化，最大差异 11.95 个百分点；其余 105 对完全复现。正式评分使用第二份矩阵。随后以实际 79 张图核对，五轮所有 66 个出场队次均与更正后的赛前五人一致。[两次封存和赛前出处](SOURCES.md) · [原始锁](matrices.json) · [评分用的锁](matrices-v2.json) · [独立赛后阵容核查](field-actual.json)

### 五届 Major 的首发名单准确吗？

同样的方法还核对了五届 Major 的 13 个阶段。104 场首轮共 116 张实打地图，模型阵容与首轮每张图的五人全部一致（208/208 队次）。若直接使用模型计算实力时采用的那张 VRS 榜内五人，会有 15 个队次错一人。上海 Stage 2 的 Vitality 与科隆 Stage 3 的 MOUZ 都在其中。网页可逐队对照三份名单、积分榜日期及首轮比赛。这个比较核验的是名单内容；每份历史输入的公布时间仍须看其自身来源。[逐队与逐图口径](ROSTER-AUDIT.md) · [208 个队次](roster-audit.json)

### 新加坡哪些队的同阵容比赛容易漏算？

新加坡 16 队也按赛前的三、四、五人重合分别统计，截止 2026-11-21 UTC 零点。主研究表里 9z 有 27 场四人重合 BO3，Wildcard 有 5 场，Chinggis Warriors 在这个口径下没有样本。另查实际比赛记分板，Wildcard 在 9 月对 NRG、Chinggis Warriors 在 10 月对 5star 都已有新加坡五人同时出场的 BO3。9z 在 11 月 7 日公布由 history 顶替 meyern。三队都不能只靠主档的零场记录判断阵容磨合或 0–3 概率。新加坡按原先封存的卡等待完赛。[逐队样本](lineup_probe.json) · [Wildcard 9 月 26 日对 NRG](https://www.hltv.org/matches/2398291/wildcard-vs-nrg-ibuypower-masters-fml-2026) · [Chinggis Warriors 10 月 8 日对 5star](https://www.hltv.org/matches/2399372/5star-vs-chinggis-warriors-mesa-pro-series-fall-2026) · [9z 的赛前替补公告](https://www.hltv.org/news/45940/9z-bench-meyern-add-history-as-major-stand-in)

Griffin 于 2026-11-20 发布的快照实际覆盖 10 月 15 日至 11 月 19 日。将新加坡 16 队的完整五人和逐图比分与原表对照，在这段补查中，Chinggis Warriors 新找到 8 场 BO3（6 胜 2 负），Wildcard 有 6 场（4 胜 2 负），Imperial 和 FlyQuest 各有 9 场（均为 8 胜 1 负）。每场的对手与实打比分均可查看。这些场次是可补的队史，胜率需要考虑对手强弱；本轮没有用新增样本改写新加坡赛前卡。[按队查询及逐场比分](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/#verify/elite/singapore) · [补查与去重](SG-COVERAGE.md)

### 下一次检验与复算

下一轮已登记 FISSURE Playground 2。按开赛前实际五人与历史比赛中保留的搭档数，分别给三、四、五人核心的球队地图证据 0.3、0.6、1.0 的权重。选手个人历史和模拟填法均固定，先检验样本外的 BO3 胜率，再决定是否检验整卡。[80 个赛前队席与下一次留出方案](NEXT-LINEUP.md)

训练与资料重建分别见[地图 ML](ML.md)和[阵容及种子](SOURCES.md)。历史排名按每场开赛前已公布的 Valve 原件识别。2024 年 8 月 6 日的初版与后来的邀请榜文件有差异，本次使用首次公布的全部 207 行。可用 `profiles.py --check --august-source <原件路径>` 再次核对 SHA-256 及逐行解析，其他月份与原始发布摘要核验。[Valve 首发全球榜](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/48127d4873dec5504dd18f14006e67da888fab80/standings_global.md) · [207 行排名事实](august-global.json)

~~~sh
python elite_opponents/profiles.py --check
node elite_opponents/lock.cjs
node elite_opponents/score.cjs --matrix elite_opponents/matrices-v2.json --sha256 6b6c8e6d562f402ceaa9ef84e434e810250da556487c7d4752d0e6a7f8838fc9 --check
~~~

网页版保留两队互换方向的 BO3 胜率、实际比分和逐场来源。Stage 3 右栏新增研究入口。桌面 1440×960、手机 390×844 和离线模式均检验了换队、切换赛事、原推荐卡、模型、历史和手动对阵。[桌面侧栏改前](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) · [改后](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) · [桌面研究页](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) · [手机侧栏改前](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) · [改后](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) · [手机研究页](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip)

新加坡封存卡下方的同阵容入口可直达 Chinggis Warriors 的实打比分，也可以切换其余 15 队。[桌面截图](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) · [手机截图](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip)
