# PGL Cluj-Napoca 2026 整阶段外部检验

在查看候选预测分数前选定该届，赛事场地及全 BO3 配对接近正式 Major Stage 3。2 月 14 至 18 日有 16 队参加五轮瑞士赛，八队晋级。克卢日没有观众通行证，过关数按 Major 十格规则事后模拟。这个阶段首次用于本站整卡候选的留出比较。旧通用比赛档本来就有其系列记录，对 2 月 14 日这次预测要求所有拟合资料均早于该日。

2 月 3 日 FUT 替代无法提交有效报名名单的 Legacy。PGL 2 月 4 日 14:53:55 UTC 发布全部 16 支队伍的五名首发，文章 API 的创建与最后更新时刻相同。B8 已列入 s1zzi。赛前字段只读取这个公告的 Active Roster 列，补位、教练和替补单列在 Staff / Sub。统一 huNter 与 huNter-、V$M 与 vsm、Techno4K 与 Techno 的数据库拼写。2 月 2 日 Valve 全球榜在当日 18:03:49 UTC 发布，14 队保留五人，B8、The MongolZ 各保留四人。积分采用该期全球榜。赛事签位采用 PGL 的实际参赛队顺序和首轮对阵，保留了签位与更新后的实力榜顺序的差异。[PGL 报名单](https://news.pglesports.com/news/1770210703731-pgl-cluj-napoca-2026-confirmed-team-rosters) · [公告数据](https://news.pglesports.com/api/articles/1770210703731) · [Valve 2 月 2 日榜](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/73c71008fb393980255103b93d6b868fb616f5ce/invitation/2026/standings_global_2026_02_02.md) · [FUT 递补报道](https://www.hltv.org/news/43808/fut-replace-legacy-at-pgl-cluj-napoca)

2 月 5 日 PGL 公布首轮八场，按第一种子对第九、第二对第十，依序配到第八对第十六。2 月 13 日公布的 PGL 首日转播说明列出完整队序。参赛队 NAVI 的赛事说明列出第 2 至 5 轮使用 Buchholz。按照本站瑞士轮引擎独立生成各轮对阵后，以该轮实际胜负推进下一轮，五轮分别吻合 8/8、8/8、8/8、6/6、3/3。33 场实打、82 张图、无行政判胜；66 份实际出场名单与赛前报名吻合。[PGL 首轮签表](https://x.com/pglesports/status/2019425790954516977) · [PGL 首日转播及队序](https://www.youtube.com/watch?v=1bOnCMYtXNI) · [赛前逐场列表](https://www.hltv.org/news/43824/vitality-vs-g2-mouz-vs-parivision-headline-pgl-cluj-napoca-opening-round) · [NAVI 赛事规则](https://navi.gg/en/tournaments/pgl-clujnapoca-2026/news)

[赛前字段](cluj-field.json) 与[赛后逐场记录](cluj-results.json)独立生成。只重建前者时，程序无需读取比赛原档。下载 PGL 上述公告 JSON 以及[固定提交的比赛档](https://raw.githubusercontent.com/zugzugs/hltvy/1a00ba2893a63646f0d940e626b6da95d342a187/results.json.gz)，运行下列命令。程序核验两个上游文件和仓内榜单的 SHA-256；加上 `--write` 可重新生成 JSON。

```sh
python -B f1bre_models/cluj_inputs.py cluj-official-roster.json
python -B f1bre_models/cluj_inputs.py cluj-official-roster.json results.json.gz
```
