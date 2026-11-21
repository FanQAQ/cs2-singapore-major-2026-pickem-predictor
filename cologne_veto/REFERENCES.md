# 科隆 Major 第二阶段禁选记录

第二阶段五轮共 33 场，20 场 BO1、13 场 BO3。每场七张地图各有一条记录，共 231 条。其中 172 次是禁图，26 次是选图，33 次是最后剩图。BO3 的决胜图即使没有打，也保留其最后剩图的身份。[逐场记录](ledger.json) · [逐帖证据及公开时间](reference.json)

## 当时可知的时间边界

数据取自 r/GlobalOffensive 的 CS2_PostMatchThreads 账号。该账号赛后发帖，表格列出双方、动作、地图和顺序，并附上该系列 HLTV 比赛链接。每条都是在第二阶段比赛结束后形成的证据，可用于重建第三阶段开始前的地图习惯。取数只检索 2026 年 6 月 6 至 9 日的第二阶段标题，34 个结果中有 33 篇逐场帖和 1 篇其他讨论。每篇均与项目中的该轮双方和 BO 长度对齐，匹配 33 个不同 HLTV 赛事对阵 ID。[Arctic Shift 公开检索](https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=GlobalOffensive&after=2026-06-06&before=2026-06-10&title=IEM%20Cologne%20Major%202026%20Stage%202&limit=100&sort=asc) · [在档案服务文档中核查字段](https://github.com/ArthurHeitmann/arctic_shift/blob/master/api/README.md)

首帖发布于 6 月 6 日 11:17:14 UTC，末帖发布于 6 月 9 日 19:46:19 UTC。最后一份首次抓取在 6 月 9 日 19:46:35 UTC。六帖的档案带有更新标记，均保留两次抓取时间，全体第二次抓取最晚为 6 月 11 日 07:46:42 UTC。第三阶段首场原定 6 月 11 日 11:00 CEST，即 09:00 UTC。证据记录含各帖原始禁选表、表格摘要、发布时间和两次抓取时刻，取数时未使用第三阶段的实际对阵地图或赛果。[首场第二阶段帖子](https://www.reddit.com/r/GlobalOffensive/comments/1tyej4n/astralis_vs_gamerlegion_iem_cologne_major_2026/) · [最后一场帖子](https://www.reddit.com/r/GlobalOffensive/comments/1u1fnsz/big_vs_b8_iem_cologne_major_2026_stage_2_swiss/) · [第三阶段赛前公布的首场时间](https://blast.tv/cs/news/everything-you-need-to-know-about-iem-cologne-major-stage-3-and-playoffs)

若训练资料以 6 月 10 日自然日为界，六个带更新标记的帖子的第二次抓取最晚也在 6 月 8 日 03:00:38 UTC。6 月 11 日二次抓取的三帖都已于 6 月 9 日首次入档，且没有更新标记。[各帖时间字段](reference.json)

## 动作归属与校验

逐场按原表左右栏读取 X 和勾号。X 归该侧为禁图，勾号归该侧为选图，两侧都空是剩余图。BO1 的两队顺序是 A 禁两图、B 禁三图、A 再禁一图。BO3 的先手顺序为 A 禁、B 禁、A 选、B 选、B 禁、A 禁。每场均逐步检查七图互异、池内七图出现完整以及动作顺序符合当时 Major 规则。记录内的 `a`、`b` 是原表左右队名，第一步的实际行动方决定谁先禁。例如末场先手为右侧 B8；BIG 禁 Inferno，B8 禁 Nuke，Dust2 剩余。[末场禁选表](https://www.reddit.com/r/GlobalOffensive/comments/1u1fnsz/big_vs_b8_iem_cologne_major_2026_stage_2_swiss/) · [Valve 当届规则](https://github.com/ValveSoftware/counter-strike_rules_and_regs/blob/a22f91da503d3afc00045fdad339bc6a3cd19c98/major-supplemental-rulebook.md#map-pick-ban)

全部逐场动作解析完毕后，与 CS2 Meta History 公布的七图五项赛事汇总交叉核查，35 个数值全部相同。该站注明其数据来自 HLTV，而社区帖也链接 HLTV，因此这是同一上游的独立提取校验。仅凭赛事汇总不能验证左右行动方，队名取自逐帖表格。[赛事地图汇总](https://cs2metahistory.com/tournaments/iem-cologne-major-2026-stage-2/)

| 地图 | 被选 | 被禁 | 剩余 | 第一禁 | 第一选 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ancient | 1 | 27 | 5 | 8 | 1 |
| Anubis | 2 | 31 | 0 | 10 | 1 |
| Dust2 | 2 | 24 | 7 | 8 | 1 |
| Inferno | 5 | 27 | 1 | 3 | 2 |
| Mirage | 6 | 17 | 10 | 0 | 3 |
| Nuke | 6 | 20 | 7 | 1 | 4 |
| Overpass | 4 | 26 | 3 | 3 | 1 |

仓库根目录运行 `python cologne_veto/reference_extract.py --check` 可从随包保存的表格离线复核。加 `--fetch --check` 会重新请求公开归档；也可以使用 `--source <下载的归档查询JSON> --check`。每场的公开链接和当时证据均可单独复查。[复现脚本](reference_extract.py)
