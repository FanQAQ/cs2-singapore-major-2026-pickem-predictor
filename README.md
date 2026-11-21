# Fango's Lab · CS2 Major Pick’Em

给观众通行证填一张十格卡。首页直接给出两支 3–0、六支普通晋级（3–1 或 3–2）和两支 0–3；命中五格就算该阶段过关。可切换推荐模型与决策树，查看每格依据，也可以手动指定一场比赛的赢家，沿瑞士轮对阵图推演后续对手。[打开竞猜实验室](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/)

## 当前发布

当前快照对应 Sites v34，源提交为 `f31ccbe8a1769cfbf45b568dd29c8cad103ba3f7`。首次公开的稳定版保存在 [sites-v33](https://github.com/FanQAQ/fangos-lab-cs2-pickem/tree/sites-v33)。下表按线上默认推荐与每届实际比赛计分。

| 瑞士阶段 | 回放窗口 | 至少命中 5 格 | 总命中 |
| --- | --- | ---: | ---: |
| Stage 1 | 最近五届 | 3/5 | 27/50 |
| Stage 2 | 最近五届 | 4/5 | 25/50 |
| Stage 3 | 奥斯汀、布达佩斯、科隆 | 1/3 | 9/30 |

v34 的 Stage 3 研究主卡在这三届各中 4、5、5 格，合计 2/3 届过关、14/30 格。维持单场胜率，把选卡预算从 1.2 万次提高到 36 万次，布达佩斯和首次留出的上海欧洲 RMR A 主卡都过关；奥斯汀的大预算卡在 30 组种子里均未过关。正式推荐卡和研究卡分别计分。[五个场地的逐项比较](f1bre_models/format_split/HIGH-BUDGET.md)

2026 新加坡 Stage 1 已于开赛前封存，等待完赛后计分。Stage 3 的目标为最近三届至少两届过关。各阶段只使用当时已公布的信息，队伍战绩要求至少三名首发重合。[新加坡封卡](forecast_archive/singapore-stage1-seed-conditional-2026-11-21.json) · [正式评分口径](stage_goals/PROSPECTIVE.md)

## 本地运行

下载或克隆本仓库后，直接用浏览器打开 `dist/index.html` 即可查看推荐卡。要在本机通过 HTTP 使用完整界面，可在仓库根目录运行以下命令，再访问浏览器中的 `http://127.0.0.1:8000`。

```sh
python -m http.server 8000 --bind 127.0.0.1 --directory dist
```

## 复核首版

有 Node.js 即可从仓库根目录执行以下三项检查，分别验证瑞士轮配对、上线数据与推荐引擎的集成，以及三个阶段的历史侧栏。重训个别研究模型另需 Python、对应的数据快照和库版本，各研究目录给出逐项命令。

```sh
node engine/validate.cjs
node assembly/check-integration.cjs
node multi_stage_train/check-site.cjs
```

| 想了解什么 | 从这里开始 |
| --- | --- |
| 旧版基线、赛制和回测口径 | [回测说明](method_eval/README.md) |
| Elo、地图 ML、整卡搜索分别带来多少收益 | [方法对照及复算](f1bre_models/RESULTS.md) |
| 换队后如何继承历史，EF 的 3–0 有多稳 | [首发核验与换位实验](lineup_pairs/RESULTS.md) |
| 模型设置、数据来源和历次实验 | [完整项目说明](PROJECT-NOTES.md) |

## 代码、数据和素材许可

原创程序与原创技术文档使用 [MIT License](LICENSE)。Ektarr 衍生资料按 CC BY-SA 4.0 分发，OpenCS2 衍生统计按 CC BY 4.0 署名。各目录记录了来源和处理步骤。[第三方资料与许可](THIRD_PARTY.md)

公开源码版使用自行绘制的队名缩写图标。Sites 原版的队徽、历史界面截图与完整下载包可在站点查看。v34 下载包的 SHA-256 为 `86d208238ed645426b4110e2b2b0a966202212f28c8962aff15c968a54893565`。站点后续发布时，下载地址会随版本更新。[Sites 下载](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip)
