# 知道对手如何禁图，能多过一届吗？

2026-11-21。用同一套赛前地图 ML，对每个潜在对手保留七张单图胜率，只改变哪三张图进入 BO3 的预测。13 个真正的 Major 阶段与 4 个外部瑞士阶段共有 321 场实打 BO3，每场都找到两张选图和决胜图。所有旧 Major 均已参与项目研究。[赛前登记的候选和分母](../latent_form/NEXT-VETO.md) · [逐场选图概率](sets.json) · [逐种子卡面、胜负误差与实绩](cards.json)

| 阶段 | 首页推荐／外部 VRS | 地图 ML 原抽图 | 地图 ML 按双方禁选 | 30 组种子中过关届数增加／持平／减少 |
| --- | --- | --- | --- | --- |
| Stage 1 | 3/5，27 格 | 2/5，19 格 | 2/5，20 格 | 4 / 24 / 2 |
| Stage 2 | 4/5，25 格 | 3/5，27 格 | 3/5，27 格 | 0 / 30 / 0 |
| Stage 3 | 1/3，9 格 | 1/3，12 格 | 1/3，12 格 | 1 / 26 / 3 |
| 阿斯塔纳 2025，首次留出 | 5/10 | 5/10 | 5/10 | 0 / 30 / 0 |

每个阶段每组种子用 12,000 条路径选卡，另用 12,000 条独立路径审计。两种 ML 使用相同填卡方法、赛制、种子和随机数。按主种子，双方禁选在上海 Stage 1 将 3 格提高至 4 格，科隆 Stage 1 两种均为 2 格。三届 Stage 3 的原 ML 和禁选 ML 卡面逐格相同，奥斯汀中 4 格，布达佩斯 3 格，科隆 5 格。两个 ML 的 0–3 命中也相同，Stage 1 为 5/10、Stage 2 为 4/10、Stage 3 为 2/6。外部迁移中 EPL S23 从 5 格增至 6 格，克卢日同为 6 格，布加勒斯特同为 4 格。首页继续按已有推荐交卡。

## 选图预测与单场胜率

集合损失为赛前赋予实际三图组合概率的负自然对数。数值越低越准。以两种方法的三图集合概率分别加权同一组单图 ML 胜率，得到两种赛前 BO3 胜率。另只在赛后诊断中代入实际三图，观察剩余的胜负误差。2–0 仍保留真实未打决胜图。网页可切换全部 17 个已完赛场地和 321 场真实对阵。[赛后条件概率诊断登记](DIAGNOSTIC.md) · [网页逐场查看](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/#verify/veto)

| 地点 | 实打 BO3 | 三图集合损失，原 → 禁选 | 胜负 Brier，原 → 禁选 → 已知实际三图 |
| --- | ---: | --- | --- |
| 奥斯汀 Stage 3 | 13 | 3.0998 → 3.0095 | .1609 → .1597 → .1547 |
| 布达佩斯 Stage 3 | 13 | 2.9923 → 2.7508 | .2313 → .2319 → .2308 |
| 科隆 Stage 3 | 33 | 3.0146 → 3.1327 | .2102 → .2099 → .2057 |
| 阿斯塔纳 | 33 | 2.8675 → 2.7317 | .2610 → .2604 → .2593 |

合并三届 Stage 3 的 59 场 BO3，加入禁选后 Brier 从 .20401 至 .20372。科隆的三阶段均出现选图损失上升，第一阶段由 3.1073 升至 3.2011，第二阶段由 2.9957 升至 3.2996。首次留出的阿斯塔纳选图提升更大，但 NiP 最终 3–2 晋级，两种地图 ML 仍都将其填入 0–3。[阿斯塔纳赛前名单、临时教练、种子与 33 场配对](astana-SOURCES.md)

奥斯汀、布达佩斯 Stage 3 的 120 种潜在对阵中，双方各有至少 5 场赛前完整禁选记录。科隆 Stage 3 的 120 对也都有双方记录，但只有 3 对满足各至少 5 场。五届 Stage 1 和五届 Stage 2 都有真实可用、能改变胜率的对阵。各 65 场实打 BO3 上，Stage 1 集合损失从 3.0413 降至 2.9191，胜负 Brier 从 .21441 降至 .21395。Stage 2 分别由 2.9962 降至 2.9267、.21454 降至 .21427。全部 240 场 BO1 的赛前胜率逐场相同。[逐场误差、分组覆盖与 30 组种子](cards.json)

阿斯塔纳的 NiP 是一个可定位的 0–3 误判。原地图 ML 给它 12.73% 晋级和 35.72% 全败，加入双方禁选后是 13.04% 和 35.42%。它最终击败 Virtus.pro、HOTU 和 G2，新方法给这三场的赛前胜率分别为 21.35%、40.05% 和 19.38%，相对原方法均提高不足 0.6 个百分点。这次误判主要保留在队伍对手胜率上。两张卡都选了 NiP 和 HOTU 全败，实际 0–3 的是 GamerLegion 和 M80。[阿斯塔纳正式比分](astana-results.json) · [双方赛前概率与晋级分布](cards.json)

## 复算与接续

模型设置右侧的 Stage 1、2、3 历史面板现在都能直接打开相应阶段的 BO3 禁选研究。桌面和手机均可切换赛事、查看首选及未打决胜图，另可从首页封存区直达新加坡的 120 个潜在对手组合。已分别在 1440×960 桌面和 390×844 手机视口复核；研究页的前两列保留赛前预测，实际选图在下方单列。[桌面侧栏改前](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) · [改后](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) · [桌面研究页](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) · [手机侧栏改前](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) · [改后](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) · [手机研究页](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip)

下载源码包，准备 Node.js 及项目回测使用的 Python 科学计算依赖后，可运行下列命令。科隆核验可用 `cologne_outcomes.py`、原始公开帖子归档和 BLAST 赛事总表离线复算，两份派生文件均存原链接和逐表摘要。BLAST 将未打的决胜图记为 0–0。[模型、版本、训练与输入截止](MODELS.md) · [科隆第一阶段](cologne1-outcomes.json) · [科隆第三阶段](cologne-outcomes.json)

```sh
python veto_ml/score_sets.py --check
node veto_ml/verify.cjs
node veto_ml/cards.cjs --check
node veto_ml/singapore.cjs --check
```

新加坡 Stage 1 的研究卡于北京时间 2026 年 11 月 21 日 20:20:45 封存。采用 146 场既有 BO3 禁选记录，最后一场在 11 月 2 日，120 对潜在对手都有双边资料。原地图 ML 与双方禁选选出的十格相同。3–0 为 HEROIC、Eternal Fire，普通晋级为 NiP、PARIVISION、Liquid、100 Thieves、M80、DENDELE，0–3 为 Chinggis Warriors、Lynn Vision。主种子的独立 12,000 次审计中分别有 2,254 次和 2,253 次过关。游戏实际锁盘时刻尚无可核实公告，研究另设北京时间 11 月 22 日 08:00 的截止，早于公布的首场时间 11 月 24 日 12:00。只有正式结果和全部 33 场配对通过校验才评分。Stage 2 和 Stage 3 等晋级队确定后再建场地。[新加坡研究原件](singapore-forecast.json) · [早先封存的地图 ML 原卡](../f1bre_models/singapore-forecast.json) · [下一项赛前强弱研究](NEXT-STRENGTH.md)
