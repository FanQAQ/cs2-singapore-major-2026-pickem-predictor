# Stage 3 地图 ML 的前瞻封存

上一阶段全部打完、官方种子和 16 队五人确定后，先按[原卡流程](../stage_goals/PROSPECTIVE.md)封存 Stage 3。取得游戏实际停止收卡的 UTC 时间及原始证据，再运行以下命令。封存需要 Node、Python 和 NumPy。评分只需要 Node。

```sh
node ml_allocation/prospective.cjs freeze original-stage3.json ml-manifest.json forecast_archive/prospective
node ml_allocation/prospective.cjs score forecast_archive/prospective/<edition>-stage3-ml-allocation.json original-stage3.json stage3-official-results.json
node ml_allocation/prospective.cjs web forecast_archive/prospective
node ml_allocation/test-prospective.cjs
```

### 赛前材料

清单的本地文件路径相对清单所在目录。时间用带秒及 `Z` 的 UTC。所有 SHA-256 为 64 位小写十六进制。原卡指纹取原卡顶层的 `sha256`；其余资料的文件指纹按原始字节计算。赛程时间、证据网页以及输入的真实性由维护者核对，程序校验日期、内容哈希和相互一致性。

| 清单字段 | 提供的材料 |
| --- | --- |
| `originalSha256` | 这届 Stage 3 已封推荐原卡的指纹。种子、五人、VRS 和至少三人继承关系均沿用原卡。 |
| `previous` | `file,sha256,startAt,format`。文件是原卡流程的官方 Stage 2 五轮结果，使用上一阶段的种子顺序和开赛时间。程序重放 33 场、核对完赛时间及八支晋级队。若晋级队赛前更名，加 `rosterArchive:{file,sha256}` 提供 Stage 2 的原始封存，通过其五人名单核对至少三名共同首发。 |
| `lockEvidence` | `url,publishedAt,file,sha256,lockAt`。提供主办方或 Valve 的实际收卡时间证据，`lockAt` 须和 Stage 3 原卡相同。 |
| `ml` | `file,sha256,generatedAt,inputFiles,sources`。模型为本阶段赛前产生的原版地图 XGBoost 输出 JSON 或 gzip JSON。四份本地输入文件及公开来源见下文。 |
| `selectedPolicy` | 新加坡的研究主卡已预登记为 `within`（固定八队重排 3–0）。其他赛事可预先指定 `standard`、`within` 或 `grouped`；省略时并排观察三张。 |

地图包沿用 [ml_train.py](ml_train.py) 的输出格式。目标键名是 `<edition>-stage3`。必须在 Stage 2 完赛后、锁盘前取得实际场地的训练与查询输入并产生该矩阵。`ml.inputFiles` 将 `ml-training.json`、`ml-training.npz`、`ml-queries.json`、`ml-queries.npz` 映射为文件路径。面向未来的查询生成端必须在目标的查询元数据里同时保存实际用于生成向量的 `rosters`（16 组五人）和 `points`（16 组 VRS 积分），以便和原卡逐队核对。训练档中的目标阶段地图数必须为零。把原始查询、训练文件与模型输出一同留档，便于独立复算。

`ml.sources` 每项含 `kind,url,publishedAt,file,sha256`，至少覆盖赛前训练来源 `training` 及特征来源 `features`。程序核四份输入与模型产物中记录的指纹，再从查询 NPZ 中读取 `w_<edition>-stage3`，对每个对阵的七图概率独立复算 BO1 和 BO3。模型数据截止日、各证据公开时间、生成时间和封存时间须符合先后关系。

### 三张卡如何计分

三张卡使用主种子 33719、相同的 12,000 条选卡路径、同一套地图 ML 概率。已有研究函数分别产生现行填法、固定八队重排 3–0、按入场途径完全分组的预测。原件包括模拟路径摘要、规则与引擎指纹、历史分组资料、概率、各格与预先选定的填法。程序在落盘时再次检查当前时间早于游戏锁盘和首场开始时间，同一届只准写入一个原件。

赛后用原卡流程规定的 33 场官方结果逐格评分，输出三张卡的过关与命中、八队晋级命中、错栏数和按 BO1/BO3 拆分的预测误差。弃赛照官方胜负计算最终成绩，单场误差只计实打。重复评分不会改变任何封存。新加坡 Stage 3 尚须等正式名单、数据和收卡期限方可执行。

`web [目录]` 为组装提供已登记 Major 的研究记录。它查找 `<edition>-stage3-ml-allocation.json` 及对应原卡 `<edition>-stage3.json`；有 `results/<edition>-stage3.json` 才核正式五轮并返回得分。无实验封存时输出空数组，未完赛时 `score` 为空。三份研究卡用于前瞻对比，五届正式通过率继续按生产原卡计。

### 从已确认的原卡训练新场地

本次用 Python 3.12、NumPy、SciPy、XGBoost 3.0.2 和 Node 完成训练与封存验收。在配置文件旁备好以下原始资料，运行一次训练。程序读取 Stage 3 正式原卡的 16 支队伍、五人和积分，生成 120 种对阵各自的七图预测。结果写入指定的新目录。

```sh
python ml_allocation/ml_future.py --original forecast_archive/prospective/<edition>-stage3.json --config sources.json --out work/<edition>-stage3-ml
```

`sources.json` 中的 `hltvy`、`ektarr`、`poolEvidence` 分别填写 `file,url,publishedAt,sha256`。前三项资料分别对应固定版 HLTvy 的 `results.json.gz`、指定版本 Ektarr 的逐图 CSV 和主办方或 Valve 当季图池证据。路径相对配置文件，时间为证据实际公开的 UTC；文件指纹按实际留存字节填写。`pool` 是证据中的七个地图名，拼写沿用已支持的地图列表。`ranksDir` 为 `<提交SHA>/<榜单文件名>` 结构的 Valve 公开排名缓存。可用 `rankReleases` 指向在仓库版本末尾追加了新发布日期和文件 SHA 的发布清单。Ektarr 可换为相同字段的新版本，填入该版公开 URL、发布日期和实际 CSV 指纹。若两期在来源里有可区分的赛事名，可再填 `targetLabel`、`precedingLabel`；未知或共用名称时，前阶段可用图数标为缺失。所有训练图仍必须在 Stage 3 开始前已可用。[已支持地图、来源和旧版特征](../f1bre_models/ml-data.json) · [Valve 发布清单](../tail_calibration/training-releases.json) · [历史原始档](TRAINING.md)

默认采用生成当日 UTC 零点作为数据截止，再按模型原有跨夜规则过滤地图。`--cutoff YYYY-MM-DD` 可指定更早的截止日。程序核验原卡、数据截止和来源文件指纹，再调用封存端的 `loadModel`，用七张地图的胜率和权重逐一复算 120 种对阵的 BO1、BO3 胜率。完成后目录包含四份训练或查询文件、`ml.json.gz` 和 `manifest-ml.json`。保留来源快照。在同一目录给清单补入上文的 `previous`、`lockEvidence` 及适用的 `selectedPolicy`，即可运行 `freeze`。`ml.json.gz` 中的 `training.lastObserved` 和 `latestAvailability` 记录实际训练覆盖的最新比赛日期及其数据可用日期。

已用科隆 Stage 3 的真实 16 套阵容与积分，在单独的测试原卡上从命令行走通训练与封存端验收。排他截止取 2026-06-11，实际训练 13,257 图、校准 482 图，核对 71 份来源和 120 对阵的七图及系列概率。来源共用赛事名时，`precedingStageMapsAvailable` 为 `null`；`targetStageMapsAvailable` 为 0 的依据是原卡中的首场日和所有训练记录的可用日期。训练、验证都通过后才原子安装完整目录，同名目标会报错并保留已有内容。
