# 布加勒斯特两套主预测均命中 3/10

2026 年 PGL Masters Bucharest 瑞士轮五轮共 33 场。现行推荐和地图 ML 给出的主预测十格完全相同，均只命中 MOUZ、FURIA、Aurora 三支普通晋级队。两套模型分别换 30 组模拟种子，也都没有得到过关的预测。地图 ML 略微改善了单场误差，这次没有带来整卡收益。[逐种子核分](report.json) · [完整赛前概率](matrices.json)

| 固定模型和填法 | 现行推荐 | 地图 ML |
| --- | ---: | ---: |
| 三组快速筛查，每组 2,000 条选卡路径 | 3、3、3 | 3、2、3 |
| 固定发布种子，12,000 条选卡路径 | 3/10 | 3/10 |
| 同一场地达到五格的随机种子 | 0/30 | 0/30 |
| 全胜、普通晋级、全败命中 | 0、3、0 | 0、3、0 |
| 33 场 BO3 的 Brier / 对数损失，越低越好 | 0.26051 / 0.72003 | 0.25437 / 0.70383 |

按已登记的大预算复算，地图 ML 的主预测仍中 3 格。三场历史外部赛事采用同一主种子，阿斯塔纳两种方法均中 6 格，卡托维兹从 3 格升至 5 格，布加勒斯特均中 3 格。每场各算一次真实赛事。[阿斯塔纳](../astana/RESULTS.md) · [卡托维兹](../epl24/RESULTS.md)

## 只换 0–3 能不能过关？

两套方法都预选了 TYLOO 和 The MongolZ，实际全败队为 G2、9z。G2 已被选作普通晋级。因此在固定主预测的八个晋级位置后，枚举全部 28 种全败组合，事后最多只能中 4 格。再按赛前模拟的整卡通过率选这两个位置，ML 会换成 DENDELE、TYLOO，实分仍是 3 格。独立模拟中正式推荐给 G2 全败的概率仅 1.73%，地图 ML 为 3.33%。[逐组枚举与各队赛前全败概率](positions.json)

单独换全胜位置的事后上限为 5 格。将已有的 FUT 调到全胜、Vitality 调到普通晋级就能多中两格；用固定赛前模型在 28 个候选组合中选择，仍选 Spirit、Vitality。这项事后计算说明错在哪个位置，不计入推荐成绩。[赛果与真实阵容](actual.json)

The MongolZ 在十月五日积分榜到开赛间换了两名选手，新五人于十月十九至二十二日打出 5 胜 1 负，其中五个对手场次的对手积分高于本队。六场都来自同一赛事。布加勒斯特他们实际取得 2–3。这条赛前信号引出了单独的三个 Major 对照。[34 场可核实的同核心比赛](late-form.json) · [榜后战绩试验](../../late_tail/RESULTS.md)

## 核对阵容、配对和时间

- PGL 十月十九日公布了 16 队报名五人及教练。赛前已知 Vitality 由 jL 顶替 apEX，FUT 由 SunPayus 上场，The MongolZ 使用 nin9 和 cobrazera。对应五人与十月五日 Valve 榜分别重合 4、4、3 人，其余 13 队重合 5 人。八组公开首轮均与该榜参赛队第 1 对第 9、第 2 对第 10 的顺序相符。[PGL 名单](https://news.pglesports.com/news/1792407992422-pgl-masters-bucharest-2026-all-16-team-rosters-revealed) · [赛前变更](https://www.hltv.org/news/45774/pgl-masters-bucharest-teams-format-schedule-prizes-talent-fantasy) · [开场对阵](https://www.hltv.org/news/45731/opening-matchups-set-for-pgl-masters-bucharest)
- 正式模型使用十月五日已发布的 100 份 Valve 队伍详情和 1,407 场可双向核实的系列赛。地图 ML 使用 7,900 张训练图和 607 张校准图，训练特征与逐图赛前重建值逐项一致。最晚的地图观察日期为十月二十日，保守可用日最晚为十月二十四日；开赛当天的比赛均被排除。七图采用 Ancient、Anubis、Cache、Dust2、Inferno、Mirage、Nuke。[Valve 历史快照](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/eec4853d7bcf0f1f7efe7f0d901234bef7e98b75/invitation/2026/standings_global_2026_10_05.md) · [训练与校准](ml.json)
- 胜率与预测先落盘，再用比分核分。五轮分别复现 8、8、8、6、3 场配对，首轮 80 人全部匹配。全程 66 次队伍出场中有 64 次与赛前五人相同。TYLOO 第三、四轮由教练 zhokiNg 顶替 Jee，公告发布于十月二十六日。保留这两场计算实际过关数。仅取双方使用原首发的 31 场，正式推荐与 ML 的 Brier 分别为 0.26245 和 0.25171。曾检索的资料摘要展示了少量赛果，此役按未用于选择原模型的历史复核归档。[赛中公告](https://www.hltv.org/news/45808/jee-ruled-out-for-rest-of-pgl-masters-bucharest-with-chickenpox) · [赛事记录](https://www.hltv.org/events/8050/pgl-masters-bucharest-2026)

从仓库根目录执行 `node f1bre_models/format_split/bucharest26/grade.cjs` 即可复算成绩；`positions.cjs` 检查只换一组位置时的变化，`lock.cjs` 会按原随机流重新生成预测并核对。原始输入重建脚本为同目录的 `field.py`、`baseline.py`、`forecast.py`、`actual.py`，均可运行 `--help` 查看参数。[官方名单数据接口](https://news.pglesports.com/api/articles/1792407992422) · [赛前名单与各输入校验值](field.json)
