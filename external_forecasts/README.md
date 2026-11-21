# 新加坡 2026 首阶段 · 赛前外部预测对照

截至北京时间 2026 年 11 月 21 日 14:01，首场计划在 11 月 24 日 12:00 开始。本目录封存两家发布者当时已经公开的预测，供完赛后独立评分。八场 BO1 对照取自 DAKEbits；十格卡对照取自 CSGOTradeUp。两者均使用 11 月 2 日的 VRS。首轮赛程同时核对 HLTV 11 月 11 日报道。[赛程](https://www.hltv.org/news/45969/pgl-confirm-singapore-major-stage-1-schedule) · [Valve 积分](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/main/invitation/2026/standings_global_2026_11_02.md)

## 八场首轮 BO1

以下概率均为左队获胜，按绝对分歧由大至小排列。公开网页仅刊登整数百分比；分差的精度受此限制。复算采用本地原始浮点概率和外部公布值，表中四舍五入至一位小数。[DAKEbits 原始页面](https://dakebits.com/cs2-pickem-simulator/)

| 对阵 | 本站封存推荐模型 | DAKEbits | 本站减外部（百分点） |
| --- | ---: | ---: | ---: |
| 9z 对 Lynn Vision | 54.1% | 78% | −23.9 |
| Liquid 对 GOSH | 57.7% | 74% | −16.3 |
| 100 Thieves 对 Chinggis Warriors | 66.4% | 79% | −12.6 |
| FaZe 对 Wildcard | 59.5% | 70% | −10.5 |
| HEROIC 对 Imperial | 60.1% | 69% | −8.9 |
| Eternal Fire 对 FlyQuest | 67.2% | 75% | −7.8 |
| PARIVISION 对 DENDELE | 58.0% | 63% | −5.0 |
| Ninjas in Pyjamas 对 M80 | 59.8% | 60% | −0.2 |

两套模型在八场中看好的队伍相同。最大分歧落在 9z 对 Lynn Vision，两者对同一热门的把握相差约 24 个百分点。观察重点是热门概率的幅度与实际赛果的关系，八场样本不足以单独判定长期校准表现。

## 十格卡

CSGOTradeUp 公布的卡使用 11 月 18 日的 20,000 次模拟，页面在 11 月 20 日更新。按赛事队名统一后，双方恰好同栏的选择有六格。[CSGOTradeUp 原始页面](https://csgotradeup.gg/singapore-major-pickem/)

| 栏位 | 本站封存推荐卡 | CSGOTradeUp |
| --- | --- | --- |
| 3–0 | PARIVISION、Eternal Fire | Ninjas in Pyjamas、PARIVISION |
| 3–1 或 3–2 | Ninjas in Pyjamas、HEROIC、FaZe、Liquid、100 Thieves、Imperial | HEROIC、FaZe、Liquid、Eternal Fire、100 Thieves、M80 |
| 0–3 | FlyQuest、Chinggis Warriors | Lynn Vision、Chinggis Warriors |

本地对照为本轮改换默认填法前的 [methods 封存](../method_archive/singapore-stage1-methods-2026-11-21.json) 的 recommended，及其通过 SHA-256 引用的 [region-vrs 胜率矩阵](../forecast_archive/singapore-stage1-region-vrs-2026-11-21.json)。这张旧卡以「过关率优先」分配十格。本表和评分命令始终对应这一份有明确时间与哈希的封存。两份文件的摘要、16 队种子、完整首发与队名映射在运行时核对。官方使用 PVISION 和 GOSH，部分来源写作 PARIVISION 和 BC.Game；此处沿用本站封存名 PARIVISION、GOSH。[赛事更名说明](https://www.hltv.org/news/45947/pgl-announces-name-changes-for-four-teams-at-singapore-major)

## 复算与赛后评分

另核对了一套有 Git 版本记录的外部预测。科隆 Stage 3 的提交于 6 月 10 日 22:43 UTC 经 GitHub 验签，预测实际中 5/10。五格为 Spirit 全胜，Falcons、Aurora、G2 普通晋级，以及 B8 全败。本站当届正式预测中 2 格。运行 `node external_forecasts/git-model.cjs` 可核分。该外部项目后来更换了比赛引擎。[科隆赛前版本](https://github.com/Leclowndu93150/pickem-prediction-model/blob/e6ad6fe4f6e13201e11e65242a9cc86cb87f0fef/README.md) · [外部项目的方法记录](https://github.com/Leclowndu93150/pickem-prediction-model)

该项目的新加坡 Stage 1 预测于 11 月 20 日提交。本站在开赛前核对了全部 80 个首发位置、八场首轮配对与十格归属。对方选 FaZe 和 100 Thieves 全胜，本站正式推荐选 NiP 和 EF。赛后统一计分，另比较八场 BO1、16 支队伍的四档战绩概率。四档 Brier 按每队的四个平方误差求和，再对 16 队取平均，范围为 0 至 2。每队包含全胜、普通晋级、全败及其他出局四类。[新加坡赛前版本](https://github.com/Leclowndu93150/pickem-prediction-model/blob/0aea354ae205ed8585917999b8e350dd97cbddbe/predictions/pgl-major-singapore-2026-stage-1.json) · [两届快照与 Git 对象编号](git-model-2026-11-22.json)

Pley 的新加坡 Stage 1 十格预测于北京时间 11 月 22 日 02:09 封存。本站把 Imperial 放在普通晋级，Pley 把它放在 0–3。完赛后，下方同一条评分命令会给出各份预测的逐项成绩。[Pley 原文](https://pley.gg/cs2/major-pickem-stage-1/) · [赛前快照](pley-singapore-stage1-2026-11-22.json)

另用 `node external_forecasts/pley-history.cjs` 核对三届已结束的 Stage 3。Pley 当前文章在布达佩斯和科隆各中 5 格，奥斯汀只明确给齐九格，可确定最终在 2–3 格之间。这三篇文章都有赛后修改记录，未取得可核验的赛前版本，仅供复盘。[逐届来源与缺格处理](pley-historical-stage3.json)

在项目根目录运行：

```sh
node external_forecasts/score.cjs
node external_forecasts/check.cjs
node external_forecasts/score.cjs path/to/verified-results.json
```

第一条离线打印全部分歧。第二条用已有历史比赛的种子路径测试计分器，测试数据只在内存中使用。第三条接受经人工核对的该届真实赛果 JSON。验证来源可使用 [HLTV 阶段页](https://www.hltv.org/events/9303/pgl-major-singapore-2026-stage-1) 或赛事方的最终赛果页。

结果文件包含三个字段。将 `stage` 设为 `pgl-singapore-2026-stage-1`，`source` 填核实结果所用的 HTTPS 地址，`rounds` 为五个数组，各自包含 8、8、8、6、3 个二元组，每组填 `["胜方队名","负方队名"]`。轮内比赛顺序任意，队名采用封存种子表或上述赛事别名。录入时核对胜负方向；程序只检查结果结构与配对，并不访问链接。

完整路径需通过引擎 33 场瑞士轮重放。评分输出分别列出八场 BO1 的 Brier 与对数损失、两张卡的命中、过关与各栏命中队。外部逐场源只公布此处封存的八个 BO1，因此该项分母为 8。卡片使用 3–0、3–1/3–2、0–3 精确栏位积分，满 5 格过关。程序只向标准输出写结果。
