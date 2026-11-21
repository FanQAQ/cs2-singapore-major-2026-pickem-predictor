# GitHub 打法资料核查

网页中的克制幅度来自「对局分析」的手动滑条。幅度设为零时，该假设对单场预测的贡献就是零。将一支队伍归为某种打法，还不足以确定它遇到另一种打法会多赢多少。

## 2024 职业选手打法数据

Jamie Packer 发布了 306 名职业选手的 2024 年汇总记录，每个 Steam ID 一行。数据包含 T／CT 分侧的首杀尝试占比、补枪占比、存活时间和队内相对站位，以及选手角色。该表没有逐场日期、对手、场次胜负或各类打法相遇的胜率。同一行汇总了全年数据，在 2024 年两届 Major 的赛前回测中使用会带入后续信息。[固定版本的原始 CSV](https://github.com/Jamie-Packer/cs2-playstyle-dataset-2024/blob/b8a794e2294d664fd1a7e1b9966dc2f72be200fc/data/cs2_playstyle_roles_2024.csv) · [作者的数据说明与 CC BY 4.0 许可](https://github.com/Jamie-Packer/cs2-playstyle-dataset-2024)

GitHub 中该 CSV 的首个版本发布于 2025 年 10 月 4 日，晚于奥斯汀。使用这个版本核查后续三届首发，以项目中的五个首发昵称，对照同一 `team_clan_name` 下的选手。昵称做 Unicode NFKC、去首尾空格及大小写归一，只保留在表中唯一的昵称。若五人中至少三人能匹配同一俱乐部，计为一支有历史人员交集的队。即使有交集，也无法从全年汇总确认这几位一起打过哪一场，或该队保留了原有打法。[CSV 首次提交](https://github.com/Jamie-Packer/cs2-playstyle-dataset-2024/commit/b8a794e2294d664fd1a7e1b9966dc2f72be200fc)

| 届次 | 达到三人交集的队伍 | 支数 |
| --- | --- | ---: |
| 2025 布达佩斯 | FaZe、B8、Lynn Vision、M80 | 4/16 |
| 2026 科隆 | B8、M80、Lynn Vision、THUNDER dOWNUNDER | 4/16 |
| 2026 新加坡 | 9z、M80、Imperial、Lynn Vision | 4/16 |

## 逐场对局来源

`jankasen/cs2` 提供解析职业比赛录像的代码，能提取每回合首次击杀、补枪和道具事件。其仓库源码未附各届所需的逐场遥测数据库，需另备对应的比赛数据。要估计「枪法对抗遇到体系执行」的修正，需要先用当时的打法数据和首发区分两队，再检验控制基础实力后的胜率差。目前这两份 GitHub 资料无法直接给出该数值。[录像解析项目与字段说明](https://github.com/jankasen/cs2/tree/c185215a626eab3d843e23a08af410eca99e1d7a)
