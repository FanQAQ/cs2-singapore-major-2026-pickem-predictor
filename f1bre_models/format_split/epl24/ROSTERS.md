# 卡托维兹的首发、图池与配对评分

截至 2026-10-02 的输入包含全部 16 队首发。13 队与 9 月 7 日的 Valve 五人完全相同，另三队各保留四人。先用赛前积分榜定位队伍，再取固定公开比赛库中该队在七月一日至十月二日最后一场能识别五名不同选手的完整系列赛记录。有后续公告的队伍按公告更新。资料库为事后整理，历史比赛按开赛前已结束的日期筛选。每名选手保留原始拼写和资料库 ID。[积分榜与种子](seeding.json) · [截至开赛的证据与输入](field.json) · [比赛数据版本](https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11)

| 队伍 | Valve 五人 | 本场采用的赛前依据 |
| --- | --- | --- |
| Vitality | 含 jL | 9 月 20 日对 Aurora 的首发已含 mezii；系列赛 ID 7308357。[俱乐部赛后公告，早于 EPL](https://vitality.gg/en-uk/blogs/presse/team-vitality-gets-its-revenge-in-barcelona-and-wins-the-starladder-starseries-fall-2026) |
| PARIVISION | 含 HObbit、slaxejezzz，缺 FL1T | 9 月 10 日场上为 Jame、xiELO、zweih、FL1T、slaxejezzz；9 月 17 日正式宣布 HObbit 接替 slaxejezzz。[9 月 17 日公告报道](https://www.hltv.org/news/45534/parivision-replace-slaxejezzz-with-hobbit) |
| Legacy | 含 arT | 9 月 13 日的五人仍含 arT；9 月 27 日宣布 bobz 代打本届。[9 月 27 日公告报道](https://www.hltv.org/news/45582/art-out-of-esl-pro-league-s24-with-meningitis) |

ShindeN 的 Ektarr 记录使用 FraGuTy 与 ivanzinho。通过 9 月 11 日对 paiN 的同场五人核对，分别对应 guty 与 ivz；保留原 ID 27335 和 4500。该行对手的两人缺名，ShindeN 一侧五人及 ID 均完整。[赛前同场名单](https://www.hltv.org/matches/2397763/shinden-vs-pain-pgl-masters-bucharest-2026-south-america-closed-qualifier)

ESL 在 9 月 25 日公布 16 个初始 live ratings，Spirit 为 1.00、Vitality 为 2.33、ShindeN 为 15.00。首轮按 1 对 16 配对；后续按实时评分处理同战绩队伍并避免重赛。原更新公式按比分计算，2–0 为全额变动，2–1 为半额。用于判断胜率的赛前积分、用于配对的 ESL 评分分别存储。地图池沿用 7 月生效的七图：Ancient、Anubis、Cache、Dust2、Inferno、Mirage、Nuke。[赛前完整评分与种子](https://pro.eslgaming.com/tour/2026/09/esl-pro-league-season-24-team-seeding-and-live-ratings/) · [ESL 公式](https://pro.eslgaming.com/tour/2025/03/esl-live-ratings/) · [比分影响](https://pro.eslgaming.com/tour/2025/09/epl-s22-team-seeding-and-live-ratings/) · [ESL 2026 图池更新](https://pro.eslgaming.com/tour/2026/07/esl-pro-tour-counter-strike-rulebook-2026-update-2-changelog/)

赛后另行核对 10 月 3 日八场首轮。16 队 80 名实际首发与赛前输入全部一致。七场由 Ektarr 的选手行核实；G2 对 NAVI 的 Ektarr 记录缺十名选手，改由对应 HLTV 系列赛两侧个人统计核实。独立审计文件只含名单与对阵，不包含预测得分。[G2 对 NAVI 的十名选手](https://www.hltv.org/stats/matches/131551/g2-vs-natus-vincere) · [首轮核验明细](opening-audit.json)

在该目录复算，先运行 `python field.py /data/standings_global_2026_09_07.md --check`，再运行 `python rosters.py /data/cs2_all_tiers_games.csv --check` 和 `python check_opening.py /data/cs2_all_tiers_games.csv --check`。后续可以据此拟合两个模型的 BO3 胜率，再封存完整预测；本文件只验证阵容与配对输入。
