# 第三方资料与署名

本公开发行版的 `logos/*.png` 和 `dist/logos/*.png` 为自行绘制的队名缩写，采用项目的 MIT 许可。素材清单另保留 Sites 版队标的出处。历史截图可从对应的 Sites 项目包查看。

Blanchon 数据的聚合和 Ektarr 数据的清理、聚合、特征提取由本项目完成。使用 Ektarr 衍生表与特征时保留原作者、版本及本项目加工说明，并采用相同许可。[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) · [数据出处](style_stats/README.md)

README 的预测、对阵推演与对局截图均取自 Sites 版。图中的战队标志归各自权利人所有，赛事队标的来源见[逐图清单](logos/credits.json)。

第二阶段新增的 FUT、G2、THE ONE、NAVI、Astralis 和 The MongolZ 队标取自 PGL 新加坡 Major 官网，截图保留赛事页面使用的标志。离线网页沿用本项目绘制的队名缩写。[PGL 赛事页面](https://www.pglesports.com/cs2/pgl-major-singapore-2026/) · [逐图出处](logos/credits.json)

仓库根目录的 MIT 许可适用于 Fango's Lab 原创程序和原创技术文档。复用下列材料时，须分别遵循其原始条款。

对前八的 BO3 实验使用 Valve 历次首次公布的排名事实、HLTvy 归档的阵容及比赛记录、PGL 公布的赛程与比分、HLTV 的赛前报道和赛事名单。科隆三个阶段的首轮阵容另用 CS2_PostMatchThreads 的逐图记分板、HLTV 统计页链接及 BLAST 赛果核对。包内保留逐场来源、固定版本和派生事实。[名单与排名](elite_opponents/SOURCES.md) · [地图 ML](elite_opponents/ML.md) · [比赛原件交叉核对](elite_opponents/RESULT-SOURCES.md) · [逐图阵容依据](elite_opponents/ROSTER-AUDIT.md)

新加坡同五人 BO3 补查将 Griffin 2026-11-20 版的赛事、地图、首发和选手 ID 与 Ektarr 固定版的事实表核对。包内的比赛记录含来源链接及跨源重复或疑点标记。[来源指纹、署名及逐场检查](elite_opponents/SG-COVERAGE.md)

BO5 历史使用 HLTvy 和 Ektarr 固定版本的赛果、地图与选手箱分，并与当日以前发布的 Valve 积分名单配对。新增的 PGL Masters Bucharest 2025 瑞士轮保留官方赛程核验、赛前换人公告及比分勘误的定位。[逐来源与衍生数据范围](bo5_history/ML.md) · [PGL 与 HLTV 资料核对](bo5_history/masters-SOURCES.md)

地图禁选对照保留三图集合、比分、逐步选禁和来源定位。科隆的 BLAST.tv 赛事页与 CS2_PostMatchThreads 讨论表分别核对，阿斯塔纳以 PGL 官方成绩独立核验。新加坡的晚期禁选和双方实际五人来自固定版本的 Griffin 公开 CSV。下载包含本站的复核和派生记录。[实验资料与复算入口](veto_ml/RESULTS.md) · [阿斯塔纳资料](veto_ml/astana-SOURCES.md) · [Griffin 数据版本与用途](map_veto_data/README.md)

| 材料 | 来源与适用范围 |
| --- | --- |
| 录像衍生统计 | Blanchon 的 OpenCS2 demo metadata 按 CC BY 4.0 发布。本项目筛选有效地图，重新按队伍和阵容聚合。[版本、变更与署名](style_stats/README.md) |
| 比赛和选手技术统计 | Ektarr 的 Counter-Strike Pro Matches v11 及本项目从中摘取和汇总的资料按 CC BY-SA 4.0 使用。[数据范围、原始版本与许可](style_stats/README.md) |
| 新加坡天际线 | Sven Scheuermeier 拍摄，Wikimedia Commons 标记为 CC0，站点使用转换后的 WebP。[照片来源](ui/style-ui-checks/README.md) |
| 队标、赛事贴纸和商标 | 归各权利人。各个图标的原始页面、图源和转制说明见[素材清单](logos/credits.json)和[队标说明](logos/SOURCE.md)。 |
| 排名、赛程、采访、外部预测 | 各实验目录保留时间、出处和原始链接；赛事报道、引语与外部发布者的作品适用各自条款。参见[参赛阵容与赛果](multi_stage/INPUTS.md)、[球探资料](style_scout/README.md)和[外部预测](external_forecasts/README.md)。 |
| 科隆第二阶段禁选、比分与首发 | 逐场事实摘自 r/GlobalOffensive 赛后记录和 BLAST.tv 比赛页，每条保留原链接。Arctic Shift 保存记录当时的抓取时间。CS2 Meta History 的赛事计数用于核对。[禁选记录的出处与截止时间](cologne_veto/REFERENCES.md) |
| 上阶段逐图回合比分 | 三届 Major 与两届 ESL 的事实记录分别保存比赛页、固定归档和赛前名单出处。ESL 投票种子与积分更新规则来自主办方。FaZe 的行政判负单独记录。[Major 比分](round_form/MAJOR-SOURCES.md) · [ESL S23](round_form/EPL-SOURCES.md) · [ESL S22](round_form/EPL22-METHOD.md) |
| BO3 校准训练资料、ESL S21 | 用比赛归档及 Ektarr 数据整理逐场胜负和首发，用 Valve 当时已发布的全球积分榜匹配核心。S21 的初始种子、16 队投票和实时评分规则来自 ESL。保留逐条来源、版本、覆盖和重建方式。[训练数据](tail_calibration/TRAINING.md) · [ESL S21](tail_calibration/EPL21.md) |
| Elo、地图 ML 与 Cluj 检验 | F1bre 的两个公开仓库提供方法说明。本站用独立实现重放、校准及检验。Ektarr 衍生的逐图事实及特征遵循 CC BY-SA 4.0。Valve 榜、当期发布的选手数据、PGL 正式名单及签表分别保存来源及可用日期。[Elo 重放](f1bre_models/ELO-PROTOCOL.md) · [地图特征与来源](f1bre_models/ML.md) · [Cluj 赛前与赛后依据](f1bre_models/CLUJ.md) |

F1bre 公开预测的队名、分栏、概率和发布时间按图表转录，并附原帖与图号。原图通过作者发布的平台查看。[新加坡原帖](https://www.xiaoheihe.cn/app/bbs/link/197229714) · [来源和转录](f1bre_models/upstream-singapore.json)

Elisa 2024 两届 Main Swiss 的队名、公开首轮、赛程和正式判胜取自主办方赛前指南及逐场记录，阵容与赛前排名另附逐队来源。所分发的是比赛事实、核对脚本和统计结果。[取证及规则边界](ml_allocation/HOLDOUT.md) · [地图 ML 的训练来源](ml_allocation/TRAINING.md)

连续 BO3 的赛程索引复用固定版 HLTvy、Ektarr v11 与 Valve 发布的榜单。Ektarr 衍生事实与模型输入遵循该数据集的 CC BY-SA 4.0 许可。布加勒斯特阵容调整和 PGL 公布的对阵附有逐项出处。[赛程索引来源与字段](latent_form/ADJACENCY.md) · [布加勒斯特的赛前资料](latent_form/BUCHAREST.md)

公开源码发布时，单独核对每个第三方文件的分发条件。缺少公开再分发许可的图像、原始报道与外部代码，可保留出处和重建步骤。仓库许可不授予使用他人商标的权利。
