# 卡托维兹 EPL S24 的独立场地复核

固定比较正式推荐与已有的全 BO3 地图 ML 候选，使用相同的 ESL 配对规则和主种子 33719。年份为 2026。十月三日至七日有一轮 16 队全 BO3 瑞士轮；入场为十二个积分邀请与四个 ECL 席位。该场地可检验全 BO3 胜率及整卡迁移。八直邀、八晋级的入场先验在此不适用。本次搜索赛前来源时，搜索摘要已显示少量实赛结果；该场地作为未用于调参的历史外部复核。真实未来验证保留给新加坡。[ESL 赛前赛制公告](https://pro.eslgaming.com/csgo/proleague/2026/09/esl-pro-league-returns-to-the-big-stage-as-competition-kicks-off-in-katowice/) · [参赛资格](https://pro.eslgaming.com/tour/2026/08/epl-katowice-2026-invited-teams/)

已录入赛前种子与 1 对 16 的八组首轮。九月七日 Valve 榜的五人为积分依据。九月二十七日 Legacy 宣布以 bobz 替换 arT，输入表单列了公告五人。其他队的榜单五人尚待开赛前最后出场或报名证据核实。运行 `python field.py /path/to/standings_global_2026_09_07.md --check` 可核对完整源文件指纹、16 队与所有首轮。[赛前种子](https://www.hltv.org/news/45575/esl-pro-league-24-seeding-revealed) · [Legacy 换人](https://www.hltv.org/news/45582/art-out-of-esl-pro-league-s24-with-meningitis)

下一步按十月三日开赛截止核对其余十五支队的五人、ESL 各队初始配对 Elo 和连胜后的更新规则，然后重建此前比赛的地图训练输入。先锁两套胜率，首先用三组各 2,000 条路径筛查，另报原预算主预测，最后用实打的 33 场及每轮配对核分。不根据本场名次选择参数。保留每组 0–3、真实过关、BO3 Brier 和对数损失。
