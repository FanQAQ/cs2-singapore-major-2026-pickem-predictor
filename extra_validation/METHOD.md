# 六个后续瑞士轮阶段的迁移检验

奥斯汀 2025、布达佩斯 2025、科隆 2026 的 Stage 2 与 Stage 3 各 33 场，共 198 场。此处检验原模型能否用于阵容构成不同的阶段。每届的基础训练参数、战队近期表现、赛制参数与新人候选参数均冻结在该届 Stage 1 之前，月榜与历史赛果日期见 strengths.json。报名阵容与已公布的替补在阶段开始前确定，布达佩斯的注册名单晚于当月 VRS，作为赛前名单输入。Stage 2/3 的参赛队和初始种子取各阶段开始时已经确定的名单。比赛过程中没有更新战队实力，前一阶段的现场表现只有通过该阶段参赛资格和种子才可能体现。六个阶段来自三届相同赛事，阶段之间存在队伍重叠。

## 指标

- 单场 Brier 分数取各场「1 减实际胜者的赛前胜率」的平方再取平均，越低越好。对数损失和预测热门实际胜出的比例亦保存在 report.json，同为五五开时计半个命中。
- 机械按种子填卡把 1、2 号填入 3–0，3 至 8 号填入普通晋级，15、16 号填入 0–3。其余模型的卡片独立运行同一轮模拟与选卡程序。固定随机种子 33719，分别运行原版本的 6,000 条路径和更新版本的 24,000 条路径。report 中 hits 与 passes 记录 6,000 条路径，hits24k 与 passes24k 记录 24,000 条。卡片命中与过关次数也会受有限模拟次数影响。每阶段 10 格，至少命中 5 格达标。
- 纯 VRS 使用对应历史快照拟合的仅积分斜率。投影种子模型将 16 支队伍真实的 VRS 积分按从高到低排序，依次赋给 1 至 16 号阶段种子。固定折中模型对各队真实积分与此投影积分按 50%／50% 取均值。三者共用纯 VRS 斜率，折中系数在本组 198 场开评前指定。
- guarded 用同届赛前记录确定的权重，对纯 VRS 和 VRS 加赛制两个概率作线性加权。六个阶段的胜负只参与计分。模型设计与本表均属历史回测。
- 原全特征与滚动候选各算合并赛制、区分赛制两个版本。滚动候选冻结后才交由本组评测。评测结果未回填这些模型的系数。新加坡 Stage 1 不包含在本表。科隆 Stage 3 的 33 场全部采用 BO3，另五个阶段各有 20 场 BO1 和 13 场 BO3。

## 复现与来源

`stages.json` 仅保留初始种子、逐轮胜方及对手、赛制与来源。阶段种子来自六个 FragCharts Pick'em 页面，只提取种子序号和队名，页面的第三方预测没有用作特征。赛果来自 Pushbuild 发布的 Liquipedia 系列赛归档，数据集版本及对应 Liquipedia 赛事链接在文件中逐阶段列出。赛制与胜方另与瑞士轮分组、全部逐轮配对复核。

`entrants.json` 保存三届各 16 支第二或第三阶段直接受邀队伍在开赛前公布的首发，已参加第一阶段的队伍复用 datajob/stage_rosters.json 中的五人。

- 奥斯汀采用 [BLAST 公布的名单](https://blast.tv/cs/news/blasttv-austin-major-all-rosters-revealed) 和已宣布顶替原首发的 [s1mple](https://blast.tv/cs/news/s1mple-to-play-for-faze-at-blasttv-autin-major-broky-benched)、[YEKINDAR](https://liquipedia.net/counterstrike/BLAST/Major/2025/Austin)。
- 布达佩斯采用 [StarLadder 报名阵容报道](https://egamersworld.com/counterstrike/news/30615/starladder-has-published-the-full-list-of-register-iNO4QSh3g)，包括 The MongolZ 的 controlez。
- 科隆采用 [ESL 报名阵容报道](https://www.hltv.org/news/44438/esl-reveals-iem-cologne-major-rosters)、[逐队名册](https://en.wikipedia.org/wiki/IEM_Cologne_Major_2026#Rosters) 与 [paiN 更换主狙](https://www.hltv.org/news/44441/saffee-joins-pain) 公告。Falcons、MOUZ、paiN 分别以 karrigan、xelex、saffee 首发。
- 昵称按同一人的 Valve 名称对齐，包括 Techno4K / Techno、dav1deu$ / dav1deuS、v$m / vsm 和 dev1ce / device。教练与未启用的替补不计入五人。

`strengths.json` 保存参赛五人、独立 VRS 五人、重合人数、近 90 天有效比赛的 3/4/5 人分布、分赛制样本量和球队偏差。历史每场必须与参赛五人直接重合至少三人，双方当场阵容也须独立匹配到当时可用的排名。符合条件的跨俱乐部战绩计入新队。VRS 源文件由 datajob 的固定 Git 修订提取，基础训练和赛制模型均复用本网站同届 Stage 1 的冻结参数。扩大参赛队清单后，所有第一阶段队伍的特征、阵容有效性分档和赛制统计都会与原始提取结果逐项核对。

- 下载包根目录运行 `node extra_validation/evaluate.cjs`，将根据冻结文件重建 report.json。需 Node.js。
- 重新获取历史数据并重建输入，运行 `python3 extra_validation/freeze.py`。格式模型使用同一份带 SHA-256 校验的公开文件。各年的 Valve 缓存可通过 `--vrs-cache 目录` 重复传入，Kaggle 原始文件和种子页面可用 `--cache 目录` 指定。重建后重新运行评测脚本。
- 来源与归属见 [Valve 月榜](https://github.com/ValveSoftware/counter-strike_regional_standings)、[Pushbuild 公开数据 v1](https://www.kaggle.com/datasets/pushbuild/open-data/versions/1)、[ektarr 比赛库 v11](https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11) 和各阶段的 FragCharts 页面。Pushbuild 标明 CC BY 4.0，ektarr 标明 CC BY-SA 4.0。相关字段均经过队名对齐与筛选，派生赛制字段按 CC BY-SA 4.0 分发。完整说明见 format_model/METHOD.md。
