# 换人后，旧阵容的地图战绩应该打多少折？

2026 年 11 月 21 日。新加坡的推荐模型按实际首发继承近期比赛。用另一套地图 ML 给三人、四人旧阵容进一步降权，在首次留出的 FISSURE Playground 2 改善了单场预测，但没有多中一格。科隆 Stage 3 反而丢了一格普通晋级。首页继续使用原推荐。新加坡所有封卡按原件评分。[本届首发依据](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/#picks/rosters) · [赛前登记的检验条件](../elite_opponents/NEXT-LINEUP.md)

## EF 的 3–0 从哪里来

本届首发为 MisteM、regali、soulfly、Kvem、jottAAA，教练是 Fabre。与 2024 上海 RMR 的 EF 重合零人。与 2025 年 4 月整队转入 Aurora 的 EF 只重合 jottAAA。Fabre 回归的时间是 2026 年 9 月，教练不计入五人核心。11 月 2 日用于本次封卡的 Valve 月榜五人全部匹配，积分 1513，全球第 22。[PGL 报名名单](https://news.pglesports.com/news/1794219566606-pgl-major-singapore-2026-team-rosters) · [上海 RMR 实打名单](https://www.hltv.org/matches/2377031/eternal-fire-vs-3dmax-perfect-world-shanghai-major-2024-europe-rmr-b) · [转队名单](https://www.hltv.org/news/41357/aurora-sign-eternal-fire-roster-in-shock-move) · [soulfly 加入与 jottAAA 转正](https://www.hltv.org/news/45375/eternal-fire-sign-soulfly-make-jottaaas-loan-permanent) · [Fabre 回归](https://www.hltv.org/news/45503/fabre-returns-to-eternal-fire)

重放默认模型 90 天的原始采样。三人核心 0 场，四人核心 1 场负，原五人 36 场、24 胜 12 负。能与完整回合比分关联的系列是 0 场，EF 的本队回合残差取零。另一次截止 11 月 21 日的 180 天 BO3 调查，证实至少 25 场完整五人 BO3。这份调查采用不同赛制、日期和来源，不能加到默认模型的 37 场上。[16 队的逐档胜负](singapore.json) · [逐场重算](singapore.py) · [BO3 补证](../elite_opponents/SG-COVERAGE.md)

首页封卡的 3–0 是 NIP 与 EF。EF 的全胜、普通晋级、全败概率分别为 22.66%、48.58%、4.42%。这三项是单队战绩，整卡评分另计。F1bre 原帖排名第一的 Elo 卡把 EF 填在普通晋级，排名第一的 ML 卡没选 EF。原帖的逐格记录与本站重建的 Elo、ML 分开保存。[推荐卡原件](../forecast_archive/singapore-stage1-seed-conditional-2026-11-21.json) · [作者原帖](https://www.xiaoheihe.cn/app/bbs/link/197229714) · [逐格核对](../f1bre_models/UPSTREAM.md)

以这张原卡为起点，依次让六支普通晋级队与 EF 互换，其余八格固定。在每套已封存的对阵胜率下，七张卡共享 30 组各 12,000 条路径。按默认胜率，六次互换中最接近的是 100 Thieves，整卡过关率从 25.31% 到 25.15%，差 −0.15 个百分点。用本站重建的 180 天 Elo，同一次互换从 20.47% 到 21.78%，增加 1.31 个百分点。用地图 ML 则从 13.30% 到 13.10%。这些数值是开赛前的模型估计。6 次互换都报告，未用实际新加坡成绩筛选。[三套胜率与全部换位](ef-swaps.json) · [配对模拟程序](ef-swaps.cjs)

## 地图 ML 的单项改动

保留原来的 16 个特征、365 天窗口、30 天历史权重半衰期、XGBoost 3.0.2 与日期隔离的校准。所有原训练行与赛前查询先逐项重建。候选只修改队伍层面地图及全图的胜负、回合占比、样本量和历史对手积分。旧五人与本场五人保留三、四、五名可辨识选手时，仍在队内的两人搭档分别有 3/10、6/10、10/10。对每条旧图将原权重乘以对应比例。选手特征、当前 VRS、七图抽取分布和先验固定。每个历史训练标签用比赛当日自己的五人重新取证。原模型和候选分别重新训练、重新做时间校准。[实现与逐行一致性检查](model.py) · [F1bre 思路与本地数据重建的区别](../f1bre_models/ML.md)

### 首次留出 FISSURE Playground 2

2025 年 7 月 7 日 Valve 榜确定种子，9 月 1 日榜估实力，9 月 12 日开赛。16 队、80 人根据赛前已打名单、公告及指南交叉核对。Astralis 的 Magisk 顶替 stavn，Virtus.pro 启用 tO0RO，HEROIC 派 xfl0ud。赛前一份汇总把 FaZe 第五人列为 skullz。8 月 27 日的首秀名单和 9 月 5 日全部实打地图均列 rain。所有 16 队后来每张实打图的五人均与赛前重建吻合。邀请榜、实力榜与逐队赛前来源在同一份输入中。[赛前 16 队与证据](field.json) · [首轮公告](https://www.hltv.org/news/42624/opening-matchups-revealed-for-fissure-playground-2) · [Magisk](https://www.hltv.org/news/42577/astralis-confirm-magisk-return) · [tO0RO](https://www.hltv.org/news/42582/virtuspro-promote-to0ro-from-vpprodigy) · [xfl0ud](https://www.hltv.org/news/42425/xfl0ud-returns-to-heroic-starting-roster) · [FaZe 赛前实打](https://www.hltv.org/matches/2384853/faze-vs-g2-blast-open-london-2025-finals)

只解码截至 9 月 10 日的比赛来构造留出预测。13,642 张合格地图中，11,007 张用于训练、2,425 张用于校准，210 张因跨越校准边界或赛事隔离而剔除。训练末日 7 月 17 日，校准首日 7 月 19 日。从双方潜在的 120 种对阵锁定两套概率后才提取赛事结果。五轮的 8、8、8、6、3 场对阵全部用生产引擎复原。16 队共继承 2,458 个历史队侧地图样本，其中三人 809（32.9%）、四人 601（24.5%）、五人 1,048（42.6%）。15 队有三或四人的样本，33 场都至少一侧触发。触发子集与全体是同一批比赛。[封存的 120 对胜率](holdout-matrices.json) · [赛事记录](https://fissure.pro/events/fpg2-cs) · [逐场比分与来源](holdout-results.json)

| 比赛 | BO1 Brier 原 → 新 | BO3 Brier 原 → 新 | BO3 log loss 原 → 新 | 主种子十格 原 → 新 | 两个 0–3 槽命中 原 → 新 |
| --- | --- | --- | --- | --- | --- |
| FISSURE 独立留出 | 无 BO1 | 0.22250 → 0.22017（33） | 0.63076 → 0.62372 | 4 → 4 | 0 → 0 |
| 奥斯汀 Stage 3 | 0.24404 → 0.23119（20） | 0.16086 → 0.15850（13） | 0.48801 → 0.48088 | 4 → 4 | 1 → 1 |
| 布达佩斯 Stage 3 | 0.18942 → 0.18539（20） | 0.23133 → 0.23441（13） | 0.65655 → 0.66258 | 3 → 3 | 0 → 0 |
| 科隆 Stage 3 | 无 BO1 | 0.21025 → 0.21379（33） | 0.59798 → 0.60438 | 5 → 4 | 1 → 1 |

外部门槛通过，因此执行预登记的整卡对照。30 个种子各用 12,000 条路径选卡、另用 12,000 条路径核分。两臂使用相同的随机数与既有推荐填法。留出赛事的实际赢家有 21/33 场获得更高胜率，主种子的全胜概率 Brier 从 0.08323 到 0.08110，全败概率 Brier 从 0.10855 到 0.11234。30 组的实际命中均持平。三届 Major Stage 3 主种子从 1/3、12/30 降到 0/3、11/30。科隆原 ML 正确选入普通晋级的 BetBoom，被新卡移出。新卡把 Legacy 提到普通晋级，该队实际未晋级。按过关数比较，30 组中 2 组改善、19 组持平、9 组退步。上海在 2024 年只举办两个瑞士阶段。已封存的新加坡 3–0 不会随这项回溯实验变动。[真实逐场误差与触发子集](scores.json) · [逐种子卡、命中、0–3 与全胜误差](cards.json) · [三届赛前矩阵](development-matrices.json)

## 复算

从项目根目录运行。使用项目已有的 Python、NumPy、SciPy、XGBoost 3.0.2、Node.js。固定版逐图档、Ektarr v11 与 Valve 发布缓存沿用原地图模型的可核对来源。所有模拟和已锁概率的评分可离线运行。[HLTvy 固定版本](https://github.com/zugzugs/hltvy/tree/1a00ba2893a63646f0d940e626b6da95d342a187) · [Ektarr v11](https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11) · [Valve 发布缓存](../tail_calibration/TRAINING.md)

```sh
python lineup_pairs/singapore.py --check
node lineup_pairs/ef-swaps.cjs --check
python lineup_pairs/field.py --hltvy /data/results.json.gz --ranks /data/valve --check
python lineup_pairs/model.py holdout --hltvy /data/results.json.gz --ranks /data/valve --check
python lineup_pairs/model.py development --hltvy /data/results.json.gz --ranks /data/valve --ektarr /data/cs2_all_tiers_games.csv --check
python lineup_pairs/score.py --check
node lineup_pairs/cards.cjs --check
```

给评分命令另加 `--hltvy /data/results.json.gz` 会重提 33 场逐图名单和比分。下一轮优先检验单图赛制。先登记未作为本轮调参场地的上海 2024 欧洲 RMR B，核实首发和全部 20 场 BO1 的可用量。固定候选、旧模型及同一赔率口径，比较全部 BO1 的 Brier 与 log loss。只有两项均下降才试验将新权重限定于 BO1。附加的晋级决胜局单列。两届开发样本里的 BO1 改善是开展这项检验的理由。

首页首发面板以桌面 1440×960、手机 390×844 实测。按历史版本的十格原卡核对默认全胜位。在新页面切换 EF 与 9z、比较六种换位、打开换人权重回测，再返回封卡。截图保留了旧推荐卡及新面板的首屏部分。[桌面改前](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) · [桌面改后](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) · [手机改前](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) · [手机改后](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip)
