# 新加坡 Stage 2 赛前预测

预测分两步。先用同一套赛前实力估计，为 16 支队伍计算两两相遇时的胜率。再依据新加坡第一阶段的胜负，更新八支晋级队的估计。两种估计都按相同的第二阶段种子与首轮对阵模拟，以便比较。

## 比赛和阵容

赛前基础取自 11 月 2 日的 Valve 全球与赛区 VRS，历史表现按 PGL 参赛五人取得。沿用第一阶段 948 场赛前训练样本和已封存的模型系数，额外为八支直邀队提取近 90 天同核心胜负、对手强弱和净胜回合表现。FUT 以 SunPayus 替换 cmtry，Astralis 以 Anlelele 替换 jabbi，两队均保留排名阵容中的四人。The One 对应 Valve 排名中的 1win，The MongolZ 的 Techno4K 与 Valve 的 Techno 按同一选手处理。[PGL 阵容](https://news.pglesports.com/news/1794219566606-pgl-major-singapore-2026-team-rosters) · [Valve 固定版本](https://github.com/ValveSoftware/counter-strike_regional_standings/tree/f8c55f250fdef796d708aa32814587932154fa04/invitation/2026) · [赛前特征与阵容匹配](inputs.json)

八支直邀队以邀请时的全球 VRS 定序。八支晋级队按第一阶段胜负、最终对手难度分和原种子排序。第二阶段首轮由 1–8 号种子依次迎战 9–16 号。11 月 27 日晚逐场核对，BO3.gg 赛程所列八对与封存使用的对阵全部吻合。[八场对阵与北京时间](openers.json)此后按瑞士轮配对，不重复交手。晋级或淘汰对局打 BO3，其他对局打 BO1。新加坡赛前留出检验将赛制差异权重收缩到零，本次两种赛制共用单场胜率。实际采用的首发为已公布阵容。[赛程](https://www.pglesports.com/cs2/pgl-major-singapore-2026/) · [阶段赛制](https://www.hltv.org/events/9304/pgl-major-singapore-2026-stage-2) · [赛制权重](../model_v3/format_weight.json)

## 如何利用第一阶段

每打一场系列赛，胜者记 1，败者记 0，减去第一阶段开赛前模型给出的该队胜率。击败强敌的增量大于击败弱队，输给弱队也会产生更大的扣分。计算沿用本项目预先写下的收缩公式，分子为加权残差之和，分母为 5 加上各场加权概率方差之和。延续至少三名首发才继承该场，权重取首发重合比例。两队对数胜算的修正取各自增量之差。只使用系列赛胜负，八支直邀队这一项的修正为零。[阵容迁移协议](../stage_transfer/PROTOCOL.md) · [第一阶段输入](../forecast_archive/prospective/results/singapore-2026-stage1.json) · [第一阶段原胜率矩阵](../forecast_archive/singapore-stage1-region-vrs-2026-11-21.json)

## 本次结果

预测全胜为 **FUT、Nemiga**，普通晋级为 **The One、NAVI、Astralis、NiP、Eternal Fire、PARIVISION**，全败为 **Lynn Vision、100 Thieves**。主种子独立验证的过关率为 **20.65%**，预计命中 **3.41 格**。100 Thieves 出现在全败位源于项目既有的末位种子规则；单看全败概率，Lynn Vision 为 26.7%、FlyQuest 为 21.1%、100 Thieves 为 13.5%。

FlyQuest 三战全胜，赛前只预期赢 1.10 场，因此第二阶段首战对 FUT 的胜率从 26.6% 上调到 33.6%。100 Thieves 五场赢三场，预期为 2.89 胜，首战胜 MIBR 的概率只由 53.2% 上调至 53.6%。十格里仅普通晋级的一格变化，PARIVISION 取代 G2。把两份固定预测放在同一更新矩阵上比较，三个种子的过关率差依次为 +0.22、−0.01、+0.47 个百分点，换格收益尚未显示一致方向。

## 五届 Stage 2 历史检验

旧版的 4/5 届过关、25/50 格来自赛后按各届赛前资料重放。原策略按种子分配十格，上一阶段的成绩只用于确定晋级名单及种子。为检验本次加入的同届状态修正，封存新加坡预测后，在相同输入上单独重放五届 Stage 2。每届只加入已结束的本届 Stage 1，对每场实打阵容匹配三人核心。八支新加坡晋级队的第一阶段首场实打五人均与本次采用的名单一致。[旧版回放口径](../multi_stage/INPUTS.md) · [旧版五届结果](../final_card/README.md)

| 真实 Stage 2 十格命中 · 主种子 | 哥本哈根 | 上海 | 奥斯汀 | 布达佩斯 | 科隆 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 原策略 | 7 | 6 | 2 | 5 | 5 |
| 加入同届 Stage 1 表现 | 7 | 6 | 2 | 5 | 5 |

三组种子中，两套策略的总成绩均为 4/5 届过关、25/50 格。100 场 BO1 的 Brier 从 0.24519 降至 0.24463，65 场 BO3 从 0.21154 升至 0.21385，数值越低越好。这里的五届都曾用于开发；当前证据支持对照保留，两组的真实过关数持平。[逐届逐种子结果](historical.json)

## 如何阅读结果

[赛前预测](forecast.json) 中 `card` 是加入第一阶段的十格，`baseCard` 是不加本届第一阶段成绩的对照。队伍按种子 1–16 排列，位置编码依次为 0 全胜、1 普通晋级、2 全败、3 留空。每队的 `stage1Update` 给出胜场、赛前预期胜场和最终修正。每条概率的普通晋级项只计 3–1 和 3–2。通过率均为模型模拟估计，实际得分要等第二阶段结束。

主种子沿用网页的 33719，另用 35783、39079 复核。每个种子用一万二千条路径选十格、另用一万二千条验证。同一种子下，加入与不加入第一阶段的两套矩阵使用相同随机数。为区分新胜率与选队策略，审计另列两份固定预测在各矩阵下的验证成绩。三组模拟的收益不能代替新加坡第二阶段的真实得分。

```sh
python singapore_stage2/prepare.py --check
node singapore_stage2/forecast.cjs --check
node singapore_stage2/check-history.cjs --check
```

Python 需要 NumPy、SciPy。四份 `valve-*.md` 均为上述 Valve 固定提交的原表。首次生成预测时省略 `--check`；若已有封存件，脚本会拒绝覆盖。时间界线采用 PGL 排定的首场时间，游戏内竞猜锁盘时刻另行核实。
