# F1bre 的整卡穷举与新加坡赛前推荐

截至 2026 年 11 月 21 日，新加坡 Stage 1 尚未开赛。在本站赛前胜率和相同瑞士轮路径下，穷举所有 **10,090,080** 张合法卡，搜索第一与本站内部三起点局部搜索找到的是同一张卡。五届历史首阶段也都如此。本站正式卡在局部搜索之后还会重新分配 3–0 和 0–3，这一步影响了真实命中。

## 新加坡的三张卡

|卡片|3–0|普通晋级|0–3|独立 60,000 次达到五格|
|---|---|---|---|---:|
|已封存推荐|Ninjas in Pyjamas、Eternal Fire|PARIVISION、HEROIC、FaZe、Liquid、100 Thieves、Imperial|Chinggis Warriors、Lynn Vision|15,417（25.695%）|
|穷举搜索第一|PARIVISION、Eternal Fire|Ninjas in Pyjamas、HEROIC、FaZe、Liquid、100 Thieves、Imperial|FlyQuest、Chinggis Warriors|15,124（25.207%）|
|搜索前三经独立重排|Eternal Fire、100 Thieves|Ninjas in Pyjamas、PARIVISION、HEROIC、FaZe、Liquid、Imperial|FlyQuest、Chinggis Warriors|15,129（25.215%）|

重排选中搜索第二。未参与选卡的 60,000 次模拟中，有 7,423 次仅它过关，7,711 次仅原卡过关，配对差为 −0.480 个百分点，模拟随机误差的近似 95% 区间为 −0.882 至 −0.078 个百分点。该区间固定了本站概率模型，不包含队伍实力的估计误差。当前继续使用原推荐；实赛结果待首阶段结束后评分。[本站原封存卡及胜率引用](../forecast_archive/singapore-stage1-seed-conditional-2026-11-21.json)

## 五届真实命中

|网站种子 33719|哥本哈根|上海|奥斯汀|布达佩斯|科隆|过关|合计|
|---|---:|---:|---:|---:|---:|---:|---:|
|正式推荐|5|4|8|6|4|3/5|27/50|
|本站原始局部搜索|5|3|5|6|4|3/5|23/50|
|穷举第一|5|3|5|6|4|3/5|23/50|
|穷举前三重排|5|3|5|6|4|3/5|23/50|
|限池第一|5|3|5|6|4|3/5|23/50|
|限池前三重排|5|3|4|6|4|2/5|22/50|

同一组 30 个种子分别复算五届。正式推荐平均有 3.03 届过关、命中 26.20 格；限池重排平均 2.73 届、22.43 格。逐组比较，限池重排的过关数在 2 组增加、17 组持平、11 组减少，总命中 30 组都较低。完整空间每届只在种子 33719 穷举；限池复算的共同种子不能作为 30 次独立赛事。这五届曾反复参与网站开发。下一次直接检验是用新加坡完整赛果对上面三张已记录的卡统一计分，再将同法应用于下一阶段的赛前矩阵。

## 外部仓库与原文

- F1bre 的 ELO 仓库以比赛评分来生成瑞士轮样本，公开生成器的默认样本数为 100,000，可配置。填卡程序枚举六个普通位、两个全胜位、两个全败位，按样本中过五格的比例保留一张卡。2026 年 5 月 29 日的固定提交附 MIT 许可。[模拟器](https://github.com/holygodly/CS2-Major-ELO-PickEm-Predictor/blob/919476c8a97227a407f5950cff82c1d76152be7f/cs2_gen_preresult.py) · [组合搜索](https://github.com/holygodly/CS2-Major-ELO-PickEm-Predictor/blob/919476c8a97227a407f5950cff82c1d76152be7f/cs2_gen_final.py) · [许可](https://github.com/holygodly/CS2-Major-ELO-PickEm-Predictor/blob/919476c8a97227a407f5950cff82c1d76152be7f/LICENSE)
- ML 仓库的常规瑞士轮入口也先尝试完整空间，遇到异常才用限池版本。完整搜索按三个互斥类别打分，普通晋级不含 3–0。限池法从全胜、全败概率各前五中分别选二，剔除这四队后从晋级概率前十中选六，最多 21,000 张。2026 年 5 月 30 日的固定提交没有列出仓库许可证。本目录独立实现计分和搜索，未纳入两仓源码。ML 的中文说明另记载布达佩斯 Stage 1 模拟约 54%、实赛 2/10，Stage 2 模拟约 42%、实赛 5/10。[完整优化器](https://github.com/holygodly/CS2-Major-ML-PickEm-Predictor/blob/bb5d4e5f1cf33f3b7dfbbe720954d861a52ecafb/pickem_optimizer.py) · [入口与候选池](https://github.com/holygodly/CS2-Major-ML-PickEm-Predictor/blob/bb5d4e5f1cf33f3b7dfbbe720954d861a52ecafb/run_swiss_ml_prediction.py) · [项目说明](https://github.com/holygodly/CS2-Major-ML-PickEm-Predictor/blob/bb5d4e5f1cf33f3b7dfbbe720954d861a52ecafb/README_CN.md)
- 用户提供的作者文章称，新加坡 ML 采用 500 万条搜索路径、另取 60,000 条评估前三张，报告 20.66%。这里区分卡片数量和模拟次数。本站穷举 10,090,080 张卡时，每张用 12,000 个可能的赛事结果计分。原文没有附可核实的原帖 URL 或本次完整胜率文件，两个公开提交已可确认目标函数，但无法复原 20.66% 对应的实际输入与卡面。[外部项目的数据核验](../f1bre_data/README.md)

## 方法与复现

每届固定本站推荐胜率、配对规则和赛前阵容，保持引擎训练随机流完全相同。每种搜索在 12,000 个结果上选前三，另用 12,000 个新结果选出一张，最终用从未参与选择的 12,000 个结果比较。新加坡再用独立 60,000 个结果计算配对差。三份评估流均与训练流使用不同的固定种子。训练分数相同先比总命中，再按队伍顺序打破平局。完整空间大小为 C(16,6) × C(10,2) × C(8,2)。[预先写下的口径](PROTOCOL.md) · [全部卡和分母](report.json) · [配对结果](summary.json)

从项目根目录运行，需要 Node、Python、NumPy 和 Numba。验证时使用 Node 24、NumPy 1.20.2、Numba 0.53.1。搜索器用 64 位整数并行累计真实阈值命中，找到的卡另按逐条路径直接计分。网页引擎的原卡独立评价概率、训练队伍边际次数也由脚本核对。

```sh
python f1bre_card/search.py
python f1bre_card/summarize.py
python f1bre_card/search.py --check
python f1bre_card/summarize.py --check
```

只复算新加坡可运行 `python f1bre_card/search.py --events singapore --out singapore.json --check`。[采样脚本](samples.cjs) · [穷举脚本](search.py) · [汇总脚本](summarize.py)

新加坡 Stage 1 完赛后运行 `node f1bre_card/score.cjs verified-results.json`。评分器先核对封存卡摘要和 33 场配对，再给出三张卡的总命中、过关与各栏命中队伍。[赛果 JSON 格式](../external_forecasts/README.md) · [三卡评分器](score.cjs)
