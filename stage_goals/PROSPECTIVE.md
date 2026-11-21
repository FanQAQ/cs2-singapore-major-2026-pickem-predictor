# 未来三个阶段的赛前封存与赛后评分

新加坡 Stage 3 的地图 ML 分栏研究以「只调 3–0」作为赛前指定的主要候选。16 队与上一阶段正式赛果齐备后，与另外两种填法一同封存。原卡与研究卡使用相同的截止约束，研究卡在首页单独列示，正式窗口按推荐原卡计分。[地图 ML 的输入、封存与评分](../ml_allocation/PROSPECTIVE.md)

三个阶段分别以十格实际命中至少五格计一次过关。参赛队和种子齐备后，维护者可封存该阶段的模型卡。从本版起，Stage 3 将按参赛途径及实力排名分组的十格作为正式推荐，并封存原填法供对照，使用更早已完赛届的后续瑞士阶段计算历史频数。两张卡共用生产瑞士轮引擎、同一对局矩阵、种子 33719 和 24,000 条模拟路径。

```sh
node stage_goals/prospective.cjs freeze confirmed-input.json forecast_archive/prospective
node stage_goals/prospective.cjs score forecast_archive/prospective/<edition>-stage3.json official-results.json
node stage_goals/test-prospective.cjs
```

### 封存输入

提交 JSON 前须逐项核对赛前发布的种子和首发，并保存能佐证名单、实力和赛制的原始资料。输入赔率采用生产「推荐模型」按本届特征得到的矩阵，可由 `PickLab.seriesMatrices(event, PickMethods.defaults('recommended', event))` 生成。程序检查下面的约束，并把提供的模型输入、矩阵、各文件的 SHA-256 及算法版本摘要写入封存件。资料的真伪和赛前来源由维护者核对。

| 字段 | 内容 |
| --- | --- |
| `edition`、`stage` | 同一 Major 共享一个稳定的小写字母数字 ID，可以用连字符连接。阶段取 1、2 或 3。 |
| `editionStartAt`、`startAt`、`lockAt` | 整届开始、阶段首场、游戏停止收卡的 UTC 时间。统一采用带秒和 `Z` 的 ISO 时间。第一阶段的两个开始时间相同。 |
| `qualificationCompleteAt` | 仅 Stage 2、3 需要。上个阶段产生全部晋级队的时间须在收卡前；最终名单的发布时间应在此时间之后或相同。 |
| `format` | 正式赛制。`mixed` 表示晋级、淘汰战 BO3，其余 BO1；`all-bo3` 表示全部 BO3。 |
| `teams` | 依官方 1–16 号种子排列的 16 个对象。每队提供 `seed,name,roster,points,ratingRoster`，两份五人名单分别为阶段实际首发和该积分所对应的五人。至少三名同员。选手用一致、能区分身份的标识。 |
| `probabilities` | `model` 固定为 `recommended`；`asOf` 为胜率输入截止时间，`teamOrder` 逐项复写官方队名顺序。另给 `bo1`、`bo3` 两个 16×16 矩阵，第 i 行第 j 列为 i 队胜率，双方互补，对角线为 0.5。若模型启用共同状态，保留 `state.scales`。 |
| `sources` | 数组须覆盖 `field`、`rosters`、`ratings`、`rules`。每项提供 `kind,url,publishedAt,file`。URL 为公共 HTTPS 原文，时间为资料实际发布时间。文件为相对于输入 JSON 的原始资料路径。资料可以共用一份文件。 |

封存文件按「届 ID＋阶段」独占创建。程序在模拟和落盘前分别检查本机 UTC 时间，截止后拒绝写入。同目录中已有对应届次和阶段时，重新执行会报文件已存在。摘要可发现内容被修改。前瞻证据应连同封存件的 SHA-256 在赛前推送到有时间记录的项目版本。本机时间与本地文件本身不足以证明封存发生在赛前。当前阶段赛果不进入封存输入。

### 正式赛果和已封存卡

赛果 JSON 提供同一 `edition`、`stage`、`teamOrder`，另附 `endAt` 和 `source`。来源采用 `kind:"results"`、`url`、`publishedAt`、`file`，保存阶段打完后发布或更新的完整赛果及实际更新时间。`rounds` 为五轮列表，依次含 8、8、8、6、3 场。每场给出 `winner`、`loser` 的正式队名及整数 `bestOf`。已核实实打的对局可省略 `played`，行政判胜写 `"played": false`。其官方胜负计入十格，单场概率误差按实打场次计。评分先核对 33 场配对、阶段赛制、模型矩阵与封存摘要，再输出每张卡的总分、过关状态、各槽命中队名，以及按赛制分开的单场误差。重复评分输出同一结果，原封存件保留。

此工具供有真实参赛资料的未来阶段使用。历史版本中新加坡 Stage 1 的既有封存继续使用项目原本的计分工具。下一次更新加入已经结束的新 Major 时，一并更新 `multi_stage/inputs.json` 及 `major_form/all_stages.json`，新资料须通过各自的赛前阵容和赛果检查后才能参与以后届次的 Stage 3 分组训练。

### 发布到首页

新加坡后两阶段统一使用 `edition: "singapore-2026"`。将真实的前瞻封存放在 `forecast_archive/prospective/singapore-2026-stage2.json` 或 `singapore-2026-stage3.json`，随后运行标准组装命令。首页「本届已封存的竞猜卡」会列出该阶段各模型的两支全胜、六支普通晋级、两支全败，并提供原件下载。已封存的第一阶段使用现存的推荐卡和跨阶段候选。首发尚未确定的阶段可在赛程面板查询直邀队。

完赛后，将含五轮、赛制和已核实来源的标准结果 JSON 放入 `forecast_archive/prospective/results/`，文件名与对应的前瞻记录相同。来源证据路径按结果 JSON 所在目录解析。组装时逐场验证全部 33 个对阵，成功后在已封存卡下显示实际得分及来源。允许单独重复执行 `node stage_goals/public-records.cjs` 查看供网页使用的清单；重复组装和评分均保留赛前原件。从[网页入口](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/#picks/forecasts)可直接打开此面板。

新加坡公开清单核对 PGL 三阶段的赛前排期和赛制、前一阶段最后比赛日、八支直邀队、封存时间及证据摘要。赛果引用 PGL 或 Valve 的官方页面（包括 Valve 的 CS2 Steam 公告）；维护者在本地保存并逐场核对官方原件。若主办方正式改期、换队或更换赛果发布平台，先依据新的官方材料修订并留存受影响的日程或来源记录。

## 正式计分记录如何更新

`node stage_goals/rolling.cjs` 按各阶段首日倒序取已完赛记录。Stage 1、2 各取五届，Stage 3 取三届。早于新加坡的开发赛事用固定种子按格重算，再核对历史报告总分。自新加坡起，按官方赛果验证赛前封存的推荐原卡。已封存待完赛的阶段单列，研究卡单独给分。未来 Major 在 `tracked-majors.json` 登记赛事 ID、起始日期、中文名及主办方或 Valve 成绩域名，再按本页封存与评分流程更新。合并同一届同阶段后运行 `node stage_goals/test-rolling.cjs` 和 `node stage_goals/test-prospective.cjs` 验证。
