# CS2 新加坡 Major 2026 预测 · Singapore Major Pick’Em

## Stage 1 怎么填？

**交一张卡，建议选 A。** 两张卡均于 11 月 21 日赛前封存。11 月 24 日开赛，五轮结束后按实际战绩计分。把同一列的十支队伍填进游戏，命中至少五格即可过关。[打开 Fango’s Lab 推荐卡](https://fanqaq.github.io/cs2-singapore-major-2026-pickem-predictor/#picks)

| 游戏中的位置 | A · 正式推荐 | B · 考虑同阵容往届 Major 表现 |
| --- | --- | --- |
| **3–0** · 两支全胜 | **Ninjas in Pyjamas、Eternal Fire** | **FaZe、Eternal Fire** |
| **普通晋级** · 六支 3–1 或 3–2 | PARIVISION、HEROIC、FaZe、Liquid、100 Thieves、Imperial | Ninjas in Pyjamas、PARIVISION、HEROIC、100 Thieves、M80、Imperial |
| **0–3** · 两支全败 | **Chinggis Warriors、Lynn Vision** | **Chinggis Warriors、Lynn Vision** |

**拿不准选哪张？** 分歧集中在 FaZe 和 NiP 谁能全胜，以及最后一个普通晋级位给 Liquid 还是 M80。B 把同核心在往届 Major 各阶段的表现纳入判断。它在五届旧首阶段回放中多过了一届，收益集中在上海。额外检验的 EPL S23 第一阶段两种方案都只中 3 格，因此本站继续以 A 作为正式提交建议。[A 卡原件](forecast_archive/singapore-stage1-seed-conditional-2026-11-21.json) · [B 卡原件](forecast_archive/singapore-stage1-earlier-stages-2026-11-21.json) · [跨阶段实验](stage_transfer/README.md) · [EPL 留出检验](stage1_holdout/README.md)

**访问入口**　[GitHub Pages 网页](https://fanqaq.github.io/cs2-singapore-major-2026-pickem-predictor/) · [下载离线网页版 ZIP](https://fanqaq.github.io/cs2-singapore-major-2026-pickem-predictor/downloads/fangos-lab-offline.zip) · [ChatGPT Sites 原站](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/)

离线包解压后双击根目录的 `index.html`，无需登录或联网即可查看卡面、切换模型、手动推演。

## 过去实际过了几届？

| 已完赛的瑞士阶段 | A 卡方法过关届数 | A 卡方法命中格数 |
| --- | ---: | ---: |
| Stage 1 · 最近五届 | 3/5 | 27/50 |
| Stage 2 · 最近五届 | 4/5 | 25/50 |
| Stage 3 · 奥斯汀、布达佩斯、科隆 | 1/3 | 9/30 |

B 卡方法在相同五届 Stage 1 中过关 **4/5**，命中 **28/50**。表中计数来自真实赛果，每届按十个位置计分，达到五格记一次过关。随机种子用于检查同一输入换一批模拟会不会改卡。新加坡两张封存卡单独等待评分。[历史逐阶段成绩](https://fanqaq.github.io/cs2-singapore-major-2026-pickem-predictor/#verify) · [评分口径](stage_goals/PROSPECTIVE.md)

## 数据如何变成十个选择？

1. **认准上场的五个人。** A 卡采用 11 月 2 日的 Valve 区域排名与近期比赛快照，首发依据截至 11 月 10 日。只有与目标队直接重合至少三名首发的历史比赛才继承。EF 的 37 场有效历史中，36 场由本届五人打出，1 场保留四人。[EF 与全部 16 队首发依据](lineup_pairs/RESULTS.md)
2. **先估每场，再排整卡。** 正式模型综合双方积分差、近期状态、面对强弱队的表现和地图小分，对 BO1 与 BO3 分别校准。瑞士轮按实际赛制配对，模拟十个位置联合命中至少五格的机会。B 卡进一步使用以往已结束 Major 的同核心表现，来源覆盖 13 个阶段、429 场系列赛。[胜率与填卡方法](method_eval/README.md) · [B 卡来源与截止规则](stage_transfer/PROTOCOL.md)
3. **用 Elo 与地图 ML 交叉检查。** 180 天阵容 Elo 和一年期地图 ML 提供独立的实力估计。研究中分别比较单场误差和整卡实分。五届 Stage 1 固定填法下，Elo 过 1/5、地图 ML 过 2/5，可用来定位模型分歧。[Elo、ML 与整卡实验](f1bre_models/RESULTS.md)

## 网页能做什么？

- **交作业前**打开推荐卡，看每个位置、队伍首发和推荐理由。[推荐卡与阵容](https://fanqaq.github.io/cs2-singapore-major-2026-pickem-predictor/#picks/rosters)
- **想换一支队**就打开从左到右的瑞士轮对阵图，手动选一场胜者，查看后续可能遇到的对手。[手动推演](https://fanqaq.github.io/cs2-singapore-major-2026-pickem-predictor/#bracket)
- **想核对模型**可切换推荐模型或决策树，在右侧查看对应配置的各阶段历史命中，再展开逐届数据和研究结果。[模型验证](https://fanqaq.github.io/cs2-singapore-major-2026-pickem-predictor/#verify)

## 本地运行与研究复算

下载后用浏览器打开 `dist/index.html`，或运行下面的命令并访问 `http://127.0.0.1:8000`。

```sh
python -m http.server 8000 --bind 127.0.0.1 --directory dist
```

日常研究直接读取冻结胜率，默认用三个配对种子，各抽 2,000 条路径选卡、另抽 4,000 条核分。可以指定赛事，也可以省略赛事 ID 一次比较三届 Stage 3。完整历史归档通过 `--check` 复核。[快速模式与实测速率](f1bre_models/SCREEN.md)

```sh
node f1bre_models/evaluate.cjs cologne-2026-3
node f1bre_models/check-screen.cjs
node engine/validate.cjs
```

参考项目包括 F1bre 的 Elo 与机器学习预测器，以及按赛制配置和输出推荐卡的 Major Pick’ems Simulator。各自的训练数据、截止日和评分协议请见对应仓库。[F1bre Elo](https://github.com/holygodly/CS2-Major-ELO-PickEm-Predictor) · [F1bre ML](https://github.com/holygodly/CS2-Major-ML-PickEm-Predictor) · [Major Pick’ems Simulator](https://github.com/ndunnett/major-pickems-sim)

原创代码与技术文档采用 MIT 许可。公开仓库使用原创队名缩写图标，各数据和素材按来源单独署名。网站发布版本、离线下载和研究明细另有记录。[MIT License](LICENSE) · [第三方资料与许可](THIRD_PARTY.md) · [完整项目说明](PROJECT-NOTES.md) · [Sites v34 快照](https://github.com/FanQAQ/cs2-singapore-major-2026-pickem-predictor/tree/sites-v34)
