# 三个瑞士阶段的历史成绩侧栏

2026 年 11 月 21 日在本机 Chrome 检查桌面 1440 × 960 和手机 390 × 844。改版前只有五届首阶段。改版后同时显示各阶段的过关届数与总命中，点阶段即可查看每届的实得格数。

| 视口 | 改版前 | 改版后，选中 Stage 2 |
| --- | --- | --- |
| 桌面 | [原侧栏](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) | [三阶段侧栏](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) |
| 手机 | [原侧栏](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) | [三阶段侧栏](https://cs2-pickem-matchlab.dustydell9.chatgpt.site/downloads/pickem-lab.zip) |

两种宽度均从新加坡十格推荐卡点击「历史命中」进入。依次检查 Stage 2、Stage 3、科隆的全程 BO3 说明、切换决策树、单独开启跨阶段校准，再调整近期状态和改选种子卡。推荐模型、决策树及其校准配置的 13 阶段汇总与冻结报告逐项核对。手机页面无横向溢出。

使用带有 Playwright 和 Chromium 的 Node 环境，在项目根目录运行 `node ui/multi-stage-checks/check.cjs`。可用 `PICKEM_PREVIEW` 指向运行中的网页、`PICKEM_CHROME` 指定 Chrome 路径。加 `--before` 时，打开提供的原版站点并记录改版前截图。
