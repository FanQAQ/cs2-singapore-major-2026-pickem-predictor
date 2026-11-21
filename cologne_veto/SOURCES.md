# 科隆第二阶段的禁选证据

科隆第二阶段于 2026-06-06 至 06-09 举行，第三阶段于 06-11 开赛。ESL 在 5 月 28 日的赛事公告中确认第二阶段晋级、淘汰场打 BO3，其余打 BO1，并列出官方转播频道。赛程共 20 场 BO1、13 场 BO3。主办方公告和公开转播章节可以核对赛制及实际地图。未找到 ESL 或 FACEIT 直接公开、足以逐场核查七步和行动方的文字记录。[ESL FACEIT Group 赛前公告](https://eslfaceitgroup.com/press/the-major-makes-a-grand-return-to-the-cathedral-of-counter-strike-as-iem-cologne-major-2026-begins/) · [ESL 官方最后一日转播与章节](https://www.youtube.com/watch?v=85f-ILFr6wM)

| 资料 | 公开覆盖 | 能核对的内容 |
| --- | --- | --- |
| 当天的 CS2_PostMatchThreads 帖子 | 33 场、231 步 | 每步是谁选或禁哪张图、剩余图；帖子时间早于第三阶段。逐场链接在 `ledger.json` |
| BLAST.tv | 33 场、51 张实打地图、每场双方五人 | 日期、对手、赛制、地图名、实际比分、阵容及每场视频链接 |
| Reloader | 33 场、231 步 | 七个地图名及顺序全部与同期帖一致。另行核对行动方和动作类型，结果如下 |

**六场 BO3 出现了同一种行动方错误。** Reloader 的 20 场 BO1 与同期帖逐步一致；13 场 BO3 中有 7 场也全部一致。其余 6 场均把第五步、第六步行动方对调，涉及 B8–GamerLegion、FlyQuest–paiN、G2–FUT、Spirit–9z、TYLOO–Legacy 与 BIG–B8。G2–FUT 的第六步 Dust2 还被标为“选图”，BLAST 记录的三张实打地图是 Anubis、Overpass 和 Ancient。依当届 Valve 规则，BO3 在双方各禁、各选后，应由后手先禁、先手再禁。同期帖的动作顺序 33 场均符合各自赛制，模型采用逐场同期证据。六个冲突都保留在 `official-crosscheck.json`。[当届 Valve 地图禁选规则](https://github.com/ValveSoftware/counter-strike_rules_and_regs/blob/a22f91da503d3afc00045fdad339bc6a3cd19c98/major-supplemental-rulebook.md#map-pick-ban) · [BIG–B8 当天赛后帖](https://www.reddit.com/r/GlobalOffensive/comments/1u1fnsz/big_vs_b8_iem_cologne_major_2026_stage_2_swiss/) · [同场 Reloader](https://reloader.gg/esports/cs2/match/big-vs-b8-esports-iem-cologne-2026-2026-06-09) · [G2–FUT 的 Reloader 记录](https://reloader.gg/esports/cs2/match/g2-esports-vs-fut-esports-iem-cologne-2026-2026-06-07)

BLAST 是本届赛事的第三方报道者。`official-blast.json` 保存从其赛事结果页抽取的 33 场记录。场上五人来自每张比赛页针对这一场比赛的 FAQ。按唯一对阵、日期和赛制对齐同期帖后，51 张实打地图与帖中选图和剩余图的顺序全部吻合。2–0 时的剩余图只由禁选证据确认。BLAST 未提供七步行动方，该来源的 `steps` 留空。其页面上随时间更新的 VRS、现场投票和赛后评分均未进入实验。[BLAST 赛事结果](https://blast.tv/cs/tournaments/iem-cologne-major-2026/match?view=results) · [BIG–B8 回合比分与阵容](https://blast.tv/cs/tournaments/iem-cologne-major-2026/match/d32787bd/big-b8)

Reloader 的交叉核对基于 32 张直接取得的公开比赛页和 1 张已索引的页面。Spirit–BetBoom 的七项来自同一公开页面的可查内容，产物中标记 `indexed-page`。Reloader 与同期帖的上游数据可能重合，因此这些资料用于检查地图和行动方矛盾。官方赛程、BLAST 的比赛事实和赛前已发布的社区原帖分别保留归属。回溯整理日期为 2026-11-21。[Reloader 赛事索引](https://reloader.gg/esports/cs2/event/iem-cologne-2026) · [Spirit–BetBoom 比赛页](https://reloader.gg/esports/cs2/match/team-spirit-vs-betboom-iem-cologne-2026-2026-06-06)

## 从公开页面复核

模型回测可直接读取包内的 `ledger.json` 和 `official-blast.json`。原始网页含会动态变化的外围内容，以下脚本只核对选定的比赛事实。将 BLAST 赛事结果页存为缓存目录中的 `index.html`，运行 `--urls` 得到第二阶段的 33 个公开链接。每个比赛页以 URL 中的八位比赛编号加 `.html` 命名。将 Reloader 赛事页存成同目录的 `reloader-index.html`，其中第二阶段每场比赛页存成 `r-<URL最后一段>.html`。默认模式核对产物；更新本地整理结果时可以使用 `--write`。

```sh
python cologne_veto/official_blast.py /path/to/cache --urls
python cologne_veto/official_blast.py /path/to/cache
python cologne_veto/official_crosscheck.py /path/to/cache
```
