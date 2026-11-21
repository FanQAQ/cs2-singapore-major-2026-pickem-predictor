# PGL Bucharest 2025 春季附加留出

2026-11-21，读取本届候选卡和协方差成绩前选定 2025-04-06 开赛的 16 队全 BO3 瑞士轮。选择依据是主办方已有赛事档案，赛前首轮已公开，且项目过去评过的是 2026 年秋季同城不同届。原先指定的克卢日已被地图 ML 研究用于其他对照；它继续承担已登记的门槛，同时用这项新赛事检验结论。训练幅度及 VRS 差转胜率的公式完全沿用已登记方法。仅用这届开赛前的训练，另列其来源、缺档和赛前种子证据。若无法确认完整种子或后续配对规则，保留可核证的轮间单场预测诊断，明确标记整卡可比性。[PGL 官方赛事页](https://www.pglesports.com/cs2/pgl-bucharest-2025/) · [主办方公布的首轮](https://www.hltv.org/news/41321/pgl-announce-opening-matchups-for-bucharest)

## 签位与实力积分各用哪一期榜单

PGL 在 2024 年 12 月公布邀请时间。这场赛事适用 2025 年 2 月 3 日的 VRS。按 2 月榜给已确定的实际 16 队排种子，用 1 对 9 到 8 对 16 的首轮规则，八对全部吻合 3 月 31 日的主办方公告。用 3 月 3 日实力榜排种子无法重现这一轮。由此确定以下检验：签位使用 2 月榜，单场 VRS 实力使用开赛前最新的 3 月榜。在此顺序下用原项目配对器核验其余四轮；若不能吻合，将如实标记签位或配对细则仍未确认。[主办方的邀请安排](https://press.pglesports.com/365501-pgl-cs2-2025-2026-update-key-invite-dates-innovative-playoffs-format-pgl-prize-pool-payment-date-and-locations-update) · [PGL 首轮公告](https://x.com/pglesports/status/1906646339301105947)

核验结果为五轮 8、8、8、6、3 场全部重现。两期榜均用至少三名相同选手确定继承关系。每支队先取赛前最近一场可核实的完整五人，再纳入 3 月 14 日已报道的 paiN 试用 deemO、4 月 4 日公布的 Liquid 换上 siuhy，以及 4 月 5 日 Aurora 接手 Eternal Fire 五人。33 场实打比赛的全部 66 个队侧都能逐图核实同一套五人。阵容来源存于逐队记录，赛后比赛用于核对和计分。[赛前阵容及两期榜](bucharest-field.json) · [逐场证明](bucharest-results.json) · [独立地图模型](bucharest-ml/README.md)

复算时使用已注明哈希的原始档与两份 Valve 全球榜。命令为 `python latent_form/bucharest.py results.json.gz standings_global_2025_03_03.md standings_global_2025_02_03.md`。种子使用二月榜的推断建立在赛前公布的对阵之上，后四轮一致性属于独立核验。

全程 33 场 BO3，VRS 的 Brier 为 0.34090，地图 ML 为 0.25574；对应十格卡分别为 3、4 格，两者均未过关。本届此前 132 项赛事给出的相邻残差协方差为 −0.00371，因此状态模型自动采用零幅度，各自的概率与卡分全都持平。该留出检验了完整流程，也暴露出在这届新赛事上单场概率改善仍不足以多过一届。[研究模型的逐格结果](trained-summary.json)
