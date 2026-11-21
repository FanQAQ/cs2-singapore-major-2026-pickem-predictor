# ESL Pro League Season 23 第一阶段场地

2026 年 3 月 1 日至 5 日，16 队参加同一线上首阶段，八队晋级。使用 2 月 28 日 23:59:59 UTC 已公开的材料建立实力输入。此阶段没有上一阶段晋级组；八场首轮由 1–16、2–15 等镜像种子配对，随后按相同胜负记录配对并回避重赛。使用 ESL 投票评分及动态 Elo 重放全部 33 场，全部与实际对阵相符。33 场均为 BO3，得分只用于外部迁移检验。此前实验使用过同一届的第二阶段，第一阶段的卡片此前未参与这项跨阶段残差特征的选择。[ESL S23 赛事及赛制](https://pro.eslgaming.com/csgo/proleague/season23/) · [2 月 25 日首阶段初始种子和投票评分](https://pro.eslgaming.com/tour/2026/02/epl-s23-team-seeding-and-live-ratings/) · [动态配对公式](https://pro.eslgaming.com/tour/2025/03/esl-live-ratings/) · [2–0 和 2–1 的更新幅度](https://pro.eslgaming.com/tour/2025/09/epl-s22-team-seeding-and-live-ratings/) · [ESL 官方比赛规则](https://drive.google.com/file/d/1ZMxPYAv__yDwI7rNTvCcB8ah_aPWV_gR/view)

## 赛前实力与五人

同一份 ESL 种子公告的波兰站入口也保留了原始英文表格，逐行列出 1.36 到 15.00 的 16 个起始评分。[ESL 原始种子与评分表](https://pro.eslgaming.com/tour/pl/2026/02/epl-s23-team-seeding-and-live-ratings/)

截止日时 Valve 官方仓库的最新提交是 2026-02-02 18:03:49 UTC 的 `73c71008fb393980255103b93d6b868fb616f5ce`。官网全球榜的 Git blob 为 `824980586860fd7a45701f8993c36b9268e7e235`。离线脚本读取项目已保存的同一榜单，以 blob 指纹验证历史版本，采用全榜五人阵容中至少三人、最多重合且唯一的记录。16 队全部匹配；10 队五人、5 队四人、Passion UA 三人。Gaimin Gladiators、HEROIC 和 Passion UA 都有多个同名条目，脚本按人识别。[截止日 Git 提交查询](https://api.github.com/repos/ValveSoftware/counter-strike_regional_standings/commits?until=2026-02-28T23:59:59Z&per_page=1) · [官方榜单](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/73c71008fb393980255103b93d6b868fb616f5ce/invitation/2026/standings_global_2026_02_02.md)

逐队赛前证据保存于 `field.json` 的 `rosterEvidence`。旧账本中的系列赛行只提供比赛日期、ID 和比赛时的五名选手，用来核对阵容。未对当前阶段的胜负或出线情况取特征。3DMAX 在 2 月 24 日以 misutaaa 换下 bodyy，NRG 在 2 月 28 日才宣布 Grim。Legacy 的 arT、Passion UA 的 Senzu 和 try 也都在开赛前公布。另用开幕轮的八张正式比赛统计页核对 16 支队的实际首发，均相符。[3DMAX 变更](https://www.hltv.org/news/43953/official-3dmax-add-wasink-and-nbk-to-coaching-staff-replace-bodyy-with-misutaaa) · [NRG 变更](https://www.hltv.org/news/43971/nrg-sign-grim) · [Legacy 变更](https://www.hltv.org/news/43812/official-legacy-sign-art) · [Passion UA 签入两人](https://www.hltv.org/news/43865/passion-ua-sign-try-and-senzu) · [赛前教练说明人员替换](https://www.hltv.org/news/43932/tc-talks-trys-signing-moving-on-from-grim-and-hallzerk-and-senzus-little-bit-rough-english)

## 复算

`inputs-epl23.json` 只含赛前输入；`inputs.py` 生成 `field.json`。赛后比分在单独的 `field-results.json` 中，按轮记录胜队、负队和负队地图数，队伍下标由 0 起；相同位置的 `matchIds` 指向 HLTV 原始赛卡。轮次按瑞士轮阶段确认：Ninjas in Pyjamas 对 NRG 是第三轮，来源网站按访问时区可能把结束时间列到 3 月 4 日。五轮场数依次为 8、8、8、6、3。运行评估脚本前可用以下两条命令核对赛前数据或重建场地。[完整比分和比赛详情链接](https://www.hltv.org/results?event=8241) · [当届资料页](https://www.hltv.org/events/8241/esl-pro-league-season-23-stage-1) · [NIP 对 NRG 赛卡](https://www.hltv.org/matches/2391034/ninjas-in-pyjamas-vs-nrg-esl-pro-league-season-23-stage-1)

```sh
python stage1_holdout/inputs.py
python stage1_holdout/inputs.py --write
```
