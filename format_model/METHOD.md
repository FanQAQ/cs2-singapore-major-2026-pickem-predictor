# BO1 与 BO3 胜率

输入为基础模型给出的**混合赛制系列赛胜率**。模型在每种赛制下校准基础胜率对数几率的斜率，并加入两队对该赛制的相对适应程度。直接把基础胜率当作单图胜率再转为 BO3，会重复计算它所含的 BO3 结果。

1. 对每届历史阶段，取该届 Valve 快照日期之前、已存入 `fitting/fit_examples.csv` 的单场训练样本。将公开数据带明确 `best_of` 或 `bestOf` 的系列赛与 Valve 的比赛日期、双方队名、实际胜者核对，去除无法唯一匹配及来源冲突的样本。保留完赛比分，排除 BO5、赛制未知与弃赛字样。同一天内名称不清的战队与二队不会自动合并。外部文件的发布日期可晚于目标赛事，历史重建只用赛前已结束比赛的赛制标签；结果和阵容来自当届冻结的 Valve 文件。
2. 分赛制拟合两条 VRS 积分差到胜率的逻辑曲线，再将斜率按观察到的 BO1/BO3 比例归一化。小样本使用收缩估计。预设 BO3/BO1 斜率比为 1.3，参考了 BO3 会削弱单图随机性的假设。这个数是建模先验；数据可以降低、提高或反转这个差异。输出作用在已有的系列赛胜率上，交换双方后概率互补。每届单独训练，不读该赛事的赛果。
3. 球队单独的偏好来自 Valve 当届快照下的近 90 天阵容有效比赛，直接比对历史当场五人与本届五人，至少三名选手重合才使用。历史俱乐部名称仅用于关联当时赛制，旧俱乐部换队不会让新五人得到旧队成绩。双方当场名单均须完整，对同一场比赛按编号去重。用该场开打之前的月榜积分估计实力差，扣除对手强度及全局赛制效应后，对每队拟合公共表现项和 BO3 相对 BO1 的偏差。两个参数分别使用标准差 1.5、0.6 的零均值正态先验。只打过其中一种赛制时，个体偏差固定为零。两种都有记录时，少量样本仍会显著收缩。数据里的 `tiltSE` 是球队偏差在拟合点的近似后验标准差，单位为对数几率。榜单中 BO1、BO3 的胜负是可识别的样本，不能代表其全部赛事。
4. 比赛模拟将阶段内的实际系列赛制传给 `PickFormat.probability`。令 p 为基础胜率、s 为全局校准斜率、z 为 BO3 指示值减去样本 BO3 比例、d 为球队赛制偏差，返回 `sigmoid(s × logit(p) + z × (d_A − d_B))`。个体效应允许甲队 BO1 较强、乙队 BO3 较强。队伍面对不同对手时输入胜率也会变化。该版没有估计逐图 BP 或地图胜率。
5. `validationGlobalOnly` 是独立的按日期切分校验，仅检验全局赛制斜率。最末 20 天起的样本与之前的训练集分离；其中 BO1 场数很少。球队偏差及完整预测的表现需结合整届赛前回测判断。

## 文件与来源

运行 `python3 format_model/build.py` 使用随项目提供的 `labels.csv` 离线重建 `model.json`。加 `--refresh-labels` 会重读两份固定版本的源文件，按 SHA-256 验证；`--cache <路径>` 指定原始数据缓存目录。`labels.csv` 的比赛编号为当期 Valve 快照内的编号，需与 event 一同使用。相同的过去赛事可能出现在多个阶段的回看窗口里。

- Pushbuild 的《Open data》v1，文件 `esports/cs2_liquipedia_series.csv`，提供 Liquipedia 系列赛格式及赛果。来源 [pushbuild/open-data](https://www.kaggle.com/datasets/pushbuild/open-data/versions/1)，许可 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。
- ektarr 的《Counter-Strike Pro Matches》v11，文件 `cs2_all_tiers_games.csv`，使用标记为系列赛汇总的行。来源 [ektarr/counter-strike-pro-matches](https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11)，许可 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)。
- 汇总后与 Valve 赛前比赛明细对齐，仅保留匹配且信息一致的标签。此处的字段筛选、名称对齐、去重与按期快照整理是本项目做的修改。随包提供的派生标签文件 `labels.csv` 及其汇总 `model.json` 以 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 提供。
