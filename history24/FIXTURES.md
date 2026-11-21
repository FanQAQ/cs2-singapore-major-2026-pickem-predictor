# 2024 揭幕阶段赛程复现

| 赛事 | 阵容截止日期 | 开赛日期 | 首轮情况 | 瑞士制逐场重放 |
| --- | --- | --- | --- | --- |
| 哥本哈根 | 2024-03-16 | 2024-03-17 | 9 Pandas 退赛，GamerLegion 接替第六种子迎战 AMKAL | 33/33 |
| 上海 | 2024-11-29 | 2024-11-30 | FURIA 对 GamerLegion，Virtus.pro 对 MIBR 等八场 | 33/33 |

种子序来自赛前公布的排名和首轮对阵。哥本哈根采用最后一次赛前换队后的名单。每队五人取该队在截止日前有记录的最后一场系列赛。按稳定选手编号比对，这 32 份五人名单与两届揭幕阶段的每一场实际出场阵容一致。哥本哈根 KOI 的赛前导出记录保留了第五人的编号 943，2 月 16 日 RMR 的比赛名单写作 stadodo。[哥本哈根种子及首轮](https://www.hltv.org/news/38424/pgl-major-copenhagen-attendees-finalized) · [哥本哈根换队](https://www.hltv.org/news/38493/official-gamerlegion-replace-9-pandas-at-copenhagen-major) · [上海种子及首轮](https://www.hltv.org/news/40396/perfect-world-confirms-opening-major-matches) · [KOI 的 RMR 名单](https://www.hltv.org/matches/2369744/fnatic-vs-koi-pgl-cs2-major-copenhagen-2024-europe-rmr-a)

每届五轮场数为 8、8、8、6、3，总计 20 场 BO1、13 场 BO3。派生文件 `fixtures.json` 的 `seeds` 按初始种子排序，`rosterEvidence` 记录确认阵容所用的最后一场赛前系列赛。`rounds` 按轮存储每场的胜者和败者，`formats` 为同一位置的赛制。两份独立导出的逐场胜负完全一致。重放用已完成轮次的胜负生成下一轮对手，与存档逐轮核对。[哥本哈根揭幕阶段](https://www.hltv.org/events/7258/pgl-cs2-major-copenhagen-2024-opening-stage) · [上海揭幕阶段](https://www.hltv.org/events/7861/perfect-world-shanghai-major-2024-opening-stage)

## 数据来源与复现

- Pushbuild 的 Open data v1 提供 Liquipedia 系列赛分阶段记录、完成时间、赛制与比分。[固定版本](https://www.kaggle.com/datasets/pushbuild/open-data/versions/1) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Ektarr 的 Counter-Strike Pro Matches v11 提供系列赛汇总、队伍、实际出场选手编号和比分。这里对原始数据做了筛选、名称对齐和双来源核对。派生赛程文件沿用 CC BY-SA 4.0。[固定版本](https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

将两个归档中的 CSV 放入同一目录，分别命名为 `cs2_all_tiers_games.csv` 和 `esports%2Fcs2_liquipedia_series.csv`。生成脚本会核对两个文件的 SHA-256。以下命令从项目根目录运行。

```sh
python history24/build_fixtures.py /path/to/archives history24/fixtures.json
```
