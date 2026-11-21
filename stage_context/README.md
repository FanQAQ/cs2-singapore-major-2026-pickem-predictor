# 新加坡首阶段与哪届最相似

截至 2026-11-21，新加坡首阶段仍待赛。按五项赛前指标，科隆最接近新加坡，布达佩斯第二。新加坡的头尾实力差比五届历史样本都小，因此只能作部分参照。五届的真实命中与达标数继续逐届计入。

| 首阶段 | 入场方式 | 欧／美／亚 | 积分前四对后四的强方胜率 | 积分第 6 对第 11 | 首轮热门平均胜率 | 距新加坡 | 实际命中 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 新加坡 2026 | 32 队，VRS 直邀 | 6／6／4 | 82.7% | 63.2% | 71.5% | 0 | 待赛 |
| 科隆 2026 | 32 队，VRS 直邀 | 6／6／4 | 90.4% | 59.4% | 76.2% | 0.325 | 4 |
| 布达佩斯 2025 | 32 队，VRS 直邀 | 6／6／4 | 91.6% | 68.3% | 77.5% | 0.399 | 6 |
| 奥斯汀 2025 | 32 队，区域资格赛 | 6／6／4 | 89.5% | 68.9% | 75.8% | 0.537 | 8 |
| 上海 2024 | 24 队，RMR | 6／7／3 | 91.2% | 74.9% | 79.1% | 0.807 | 4 |
| 哥本哈根 2024 | 24 队，RMR | 10／4／2 | 92.2% | 84.4% | 81.3% | 1.209 | 5 |

表中胜率按当届已知的积分差换算。给定的数值描述赛事内对位。所有 96 个席位均有与阵容匹配的积分。新加坡和布达佩斯用赛前 HLTV 的 VRS 日估算，上海、奥斯汀、科隆用 Valve 官方全球积分；哥本哈根当时仅有 Valve 地区榜，相跨赛区的分差可比性较弱。[新加坡赛前榜](https://www.hltv.org/valve-ranking/teams/2026/november/20) · [科隆赛前官方榜](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/510968f54723dcb698ad3b04d396140fc263c239/invitation/2026/standings_global_2026_06_01.md) · [新加坡邀请席位](https://www.hltv.org/major/invites)

## 科隆的四分

HEROIC 以 3 号种子入场，开赛前在本届 16 队中积分排第 6，分别输给 Sharks、Lynn Vision 和 Liquid，以 1–3 出局。默认推荐卡把 HEROIC 留在卡外。按赛前 VRS 积分排前四的 GamerLegion、B8、BetBoom、MIBR 全部晋级。[赛前阵容与热门](https://www.hltv.org/news/44735/iem-cologne-major-stage-1-teams-format-schedule-talent-fantasy) · [全阶段赛果](https://www.hltv.org/events/9028/iem-cologne-major-2026-stage-1)

| 类别 | 命中 | 失分原因 |
| --- | --- | --- |
| 3–0 | BetBoom，1/2 | GamerLegion 输给 BetBoom 后以 3–1 晋级。 |
| 3–1 或 3–2 | BIG、M80、MIBR，3/6 | B8 以 3–0 晋级，SINNERS 以 0–3 出局，Lynn Vision 以 2–3 出局。 |
| 0–3 | 0/2 | 15 号 THUNDER dOWNUNDER 首轮击败 MIBR，最终 1–3。16 号 FlyQuest 最终 3–2，击败 Liquid 晋级。 |

科隆共 33 场，推荐模型的下风方赢了 14 场，其中 BO1 为 6/20、BO3 为 8/13。胜方在模型中的赛前胜率不超过 30% 的共两场，分别是 FlyQuest 对 SINNERS（26.4%）和 NRG 对 SINNERS（28.2%）。上海同样有 14/33 场下风方获胜，胜方不超过 30% 的场次为零。两届推荐卡都只得 4 格，上海的三栏分别为 1/2、2/6、1/2，科隆分别为 1/2、3/6、0/2。[上海比赛原始记录](https://www.hltv.org/events/7861/perfect-world-shanghai-major-2024-opening-stage)

## 相似度能否决定权重

七组预先指定的敏感性检查都将科隆排第一，包括逐一移除五项指标及更换两种积分换算尺度。额外把六届都换成本项目的基础积分快照后，科隆也居首，奥斯汀与布达佩斯对换次序。仅比较相同准入制度的赛事，新加坡的历史参照只有科隆和布达佩斯。

| 验证方式 | 目标届数 | 等权平均误差 | 温和加权平均误差 | 只取最相似一届的平均误差 |
| --- | ---: | ---: | ---: | ---: |
| 五届分别留一，其余四届作参照 | 5 | 1.60 格 | 1.61 格 | 1.80 格 |
| 仅用此前赛事，至少两届可供选择 | 3 | 1.86 格 | 1.88 格 | 2.67 格 |

逐届向前验证的达标 Brier 误差依次为 0.308、0.341、0.667。温和加权取 `1/(1+距离)` 后归一化，对新加坡会给科隆 24.1%、布达佩斯 22.9%、奥斯汀 20.8%、上海 17.7%、哥本哈根 14.5%。该比例仅为一次敏感性测算。三届的前向样本以及留一重放共用这些历史赛事，无法由此建立可靠的新加坡过关率。默认评估保留五届全样本的 27/50 与 3/5 届过关。

## 哪些旧样本能用在新加坡

| 首阶段 | 相同地图 / 7 | 至少三名相同首发的队伍 / 16 | 完全相同五人的队伍 / 16 |
| --- | ---: | ---: | ---: |
| 科隆 | 6 | 6 | 3 |
| 布达佩斯 | 5 | 5 | 1 |
| 奥斯汀 | 6 | 3 | 1 |
| 上海 | 6 | 2 | 0 |
| 哥本哈根 | 5 | 2 | 0 |

每届的 16 套首发与新加坡 16 套首发两两比较，允许队伍更名。统一选手名大小写、Unicode 写法和已核实名称别名，检查同名歧义，每个核心只能对应一支当届战队。所有数据取各自赛前已确定首发。科隆与新加坡共有的六图是 Ancient、Anubis、Dust2、Inferno、Mirage、Nuke。Valve 在 2026 年 7 月的新赛季用 Cache 换出 Overpass。科隆的 Overpass 成绩仅描述该队当时的比赛，科隆首阶段没有可传给新加坡的 Cache 样本。地图、阵容交集是逐队取用比赛录像和分图记录的条件，未加入相似度排名。[Valve 七月更新](https://steamcommunity.com/games/CSGO/announcements/detail/701021228894259246) · [地图调整和完整名单](https://www.hltv.org/news/44984/cache-replaces-overpass-in-active-duty-pool)

科隆的 M80、Lynn Vision、Sharks 的五名选手全部保留，Sharks 五人在新加坡以 DENDELE 参赛。FlyQuest 有四人相同，aliStair 接替 story。HEROIC 只有 Chr1zN、nilo、susp 三人保留，Brollan 与 MartinezSa 取代 xfl0ud、yxngstxr。Liquid 保留 EliGE、malbsMd、NAF，引进 JT、Jorko 接替 siuhy、ultimate。单人击杀或制胜回合可以按人核对，涉及指挥、主狙与配合的判断要结合这批新队员的近期资料。100 Thieves 的当届五人与科隆 16 强均未达到三人互认门槛。[Sharks 更名报道](https://www.hltv.org/news/45166/sharks-to-play-as-dendele-following-partnership) · [科隆赛前名单](https://www.hltv.org/news/44735/iem-cologne-major-stage-1-teams-format-schedule-talent-fantasy)

## 复算

在源码根目录运行 `node stage_context/build.cjs --check`。脚本以完整网站数据中的赛前积分、首发、赛事种子、赛区和准入制度计算距离，然后与 `method_eval/diagnostics.json` 的逐局胜率及 `research_cards/conditionalSeed.json` 中种子 33719 的已发布卡匹配，并核对矩阵指纹、逐场胜负、各队战绩和三栏得分。每届的队名、16 队积分、10 格填卡、全部 33 场和来源见 [report.json](report.json)。[分析口径与补充校验](PROTOCOL.md)
