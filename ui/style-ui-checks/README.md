# 新加坡赛前界面实测

## 参考界面

- BLAST.tv 将全胜、普通晋级和全败分为可直接点选的队伍格。实验室将三类整卡结果在宽屏并排展示，手机按填卡顺序分组排列。[BLAST.tv 的新加坡竞猜页面](https://blast.tv/major/pickems/)
- HLTV 的赛事页把阶段、日期和瑞士轮记录放在一起；队伍统计表同时显示地图样本量和表现。实验室依此把首场开赛时间放进标题区，模型对局概率配两队颜色，历史已完赛事的分数放在独立侧栏。[HLTV 赛事页](https://www.hltv.org/events/8302/pgl-major-singapore-2026) · [HLTV 队伍统计](https://www.hltv.org/stats/teams)
- 新加坡第一阶段为 11 月 24 日至 27 日。首场为 2026 年 11 月 24 日北京时间 12:00。首页在该时刻前显示「尚未开赛」，之后显示「赛前预测存档」。指定胜者会显示「条件推演」。点击标题区的时间可打开主办方赛程。[PGL 官方赛事页](https://www.pglesports.com/cs2/pgl-major-singapore-2026/) · [HLTV 首轮时间表](https://www.hltv.org/news/45969/pgl-confirm-singapore-major-stage-1-schedule)

标题背景取自 Sven Scheuermeier 的新加坡滨海湾夜景，使用本地 WebP 副本。Wikimedia Commons 将原图标注为 CC0，拍摄日期为 2017 年 1 月 30 日。[照片与许可](https://commons.wikimedia.org/wiki/File:Singapore_Skyline_(Unsplash).jpg)

## 竞猜卡与推演

| 视口 | 改版前 | 改版后 | 推荐卡高度 |
| --- | --- | --- | --- |
| 桌面 1440 × 960 | [首页](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) | [首页](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) | 421 → 372 像素 |
| 手机 390 × 844 | [首页](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) | [首页](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) | 499 → 497 像素 |

桌面 Chrome 在桌面与触摸模拟视口分别加载完整页面，HTTP 请求由 Playwright 使用 dist 中对应的静态文件逐个响应。390 像素宽度另做 file 协议离线测试。首页均显示完整十格，两种在线视口均观察到回测 worker 执行。

三次测试均依次完成了单格概率开关、换队与恢复、查看整卡依据、跳转历史命中、切换两种预测模型、调整决策树特征及逐轮指定胜者。切回旧填法五届合计 23/50，恢复推荐填法 27/50。调整决策树后侧栏 20/50。推演依然从左至右显示五轮，选中首场胜者后双方进入下一轮的 1–0 和 0–1 组。清除胜者后恢复原推荐。手机验证采用浏览器模拟视口。

## 打法与对局

| 视口 | 改版前的打法设置 | 改版后的双方对位与档案 |
| --- | --- | --- |
| 桌面 1440 × 960 | [桌面旧版](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) | [9z 与 Lynn Vision](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) |
| 手机 390 × 844 | [手机旧版](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) | [9z 与 Lynn Vision](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) |

桌面并排比较双方，手机按队排列。实测切换四组对阵，核对选单和档案中的队名、更换后显示的原始资料链接、BO3 常选图与对手禁用场次、投闪总数和每回合投闪。在对位提示下展开目录可查看 16 队，展开留出期检验可查看各组的实胜和预期胜场。使用键盘把首项克制幅度调至 +1，再复位到 0。桌面、手机与离线三次测试均通过。另检查了 320 至 1440 像素间的九种视口，四个工作区均未出现整页横向溢出。

手动情景另做了方向测试。初始自动填入 10 队，Ninjas in Pyjamas 为节奏类，M80 未分类。手动将 M80 设为主动接战，并将该类对节奏类的幅度调至 +15 后，NIP 的 BO1 胜率由 59.8% 改为 44.5%。交换左右双方后，M80 显示 55.5%。恢复设置后 M80 回到未分类，幅度归零，M80 显示 40.2%。桌面、手机与离线三次结果一致。
