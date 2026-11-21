# F1bre 新加坡 Stage 1 原帖与配图

在未登录的小黑盒网页搜索“用代码做Major作业”，可找到 F1bre 的原帖《用代码做Major作业之2026新加坡篇-Stage1（ELO暴搜+ML特征学习）》。公开索引返回作者 ID 8114810、文章 ID 197229714 及五张配图。原帖创建于 2026-11-18 11:38:23 UTC，五图的 CDN 路径均标示 11 月 19 日，索引所列最后修改为 11 月 21 日 07:37:15 UTC。本项目最晚在 11 月 21 日 11:03:59 UTC 核对到这五图，早于 11 月 24 日首场。CDN 日期不能单独证明每张图在 19 日的具体公开时刻。正文详情在这次匿名会话中触发验证码；依据公开搜索结果和图中实际内容核对。[作者原帖](https://www.xiaoheihe.cn/app/bbs/link/197229714) · [作者主页](https://www.xiaoheihe.cn/app/user/profile/8114810)

两人分别逐格对照原图，确认六张卡的 60 个位置。第 1 图的 Elo 前三分别给出 17.00%、16.80%、16.72%，第 4 图的 ML 前三分别给出 20.66%、20.51%、20.40%。图上的原始列名为“模拟验证通过率”，表示作者独立模拟中命中至少五格的比例。ML 图注明仅在已保存的三套候选中按验证率排序。六张卡的 0–3 都是 GOSH / BC.Game 和 Chinggis Warriors。两张首选卡的 3–0 分别是 Liquid、100 Thieves 和 Ninjas in Pyjamas、100 Thieves。[六卡逐格转录及原图链接](upstream-singapore.json)

第 2、5 图分别列出 Elo 与 ML 的 16 支队伍在 3–0、总晋级、0–3、普通晋级四列的边际概率，精度均为四位小数，单位为百分数。每队的总晋级减去全胜和普通晋级，其绝对值最大为 0.0001 个百分点。两种方法的总晋级之和分别为 800.0000% 和 799.9998%，0–3 概率之和为 199.9998% 和 199.9999%，符合八队晋级、两队全败及四舍五入。第 3 图中 DENDELE 初始 Elo 为 762.4、最终 936.6。原帖索引摘要另称加入 Sharks 的历史后初始分升至约 1187；公开证据未提供修正后与此列一一对应的完整 Elo 表。[两张概率表与公开来源](upstream-marginals.json)

公开的阶段边际和六张卡足以核对作者给出的输出。要独立复算其概率，还缺新加坡每对队伍的 BO1/BO3 胜率、当次模型输入、训练权重与模拟样本。两仓截至核查时都仅有 `main` 分支，上次推送分别为 2026-05-29、05-30。Elo 的两个 2025 年 12 月版本都无额外发布附件，Issue 列表只含一份优化旧程序的拉取请求。ML 的 Issue 和 Release 均为空，作者账号无公开 Gist。本项目用独立数据算出的 Elo、ML 与混合矩阵可用于交叉检验。六个作者验证率均保留原始出处。[Elo 仓](https://github.com/holygodly/CS2-Major-ELO-PickEm-Predictor/tree/919476c8a97227a407f5950cff82c1d76152be7f) · [Elo 发行](https://github.com/holygodly/CS2-Major-ELO-PickEm-Predictor/releases) · [旧优化请求](https://github.com/holygodly/CS2-Major-ELO-PickEm-Predictor/pull/1) · [ML 仓](https://github.com/holygodly/CS2-Major-ML-PickEm-Predictor/tree/bb5d4e5f1cf33f3b7dfbbe720954d861a52ecafb)

五张索引图的公开 CDN 响应以原分辨率读取。下列摘要对应响应字节，方便核实将来是否换图。[图 1 和图 4 的原址](upstream-singapore.json) · [图 2 和图 5 的原址](upstream-marginals.json)

| 图 | 用途 | 尺寸 | SHA-256 |
| --- | --- | --- | --- |
| 1 | Elo 前三张卡 | 1280 × 882 | `d5435c69dd214bf516b3f7d3d4b0b854f63737ac8be67e12a9f894d2c8d22627` |
| 2 | Elo 边际 | 1371 × 556 | `9346bfbffd6d8839ecf3f97fbee89e7e7f94a1474e0ffba8e8a1ad086ebb5d80` |
| 3 | Elo 强度 | 1046 × 555 | `eb1a39d63c413d2bd25fa772e3822116170751ba1aa5af5e9334068d7758230e` |
| 4 | ML 前三张卡 | 1280 × 882 | `322daa4a8d2c90043694902bb9ebf18d88d161e461c6253407a90be01eae5042` |
| 5 | ML 边际 | 1371 × 551 | `d21bd6ee686746d93359b90ab3c86c8262958b005f74f829a02dfd44a23e9fff` |

同一作者公开列表另有科隆三阶段原帖，可按赛前公布时刻另行核验。科隆第二阶段也有 6 月 6 日的全文转载，含该阶段的七组配图和所用数据的百度网盘链接。[科隆 Stage 1](https://www.xiaoheihe.cn/app/bbs/link/182421774) · [科隆 Stage 2](https://www.xiaoheihe.cn/app/bbs/link/182820875) · [科隆 Stage 3](https://www.xiaoheihe.cn/app/bbs/link/183113941) · [科隆 Stage 2 转载](https://www.vgover.com/news/218958)
