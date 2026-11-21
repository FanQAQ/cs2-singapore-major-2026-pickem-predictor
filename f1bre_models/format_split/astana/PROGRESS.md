# PGL Astana 2026 全 BO3 留出检验进度

2026-11-22 已完成修正与评分。三套主卡均中 6 格，全部 33 场赛果与 30 组种子已经核验。[最终结果与可重现步骤](RESULTS.md)。以下为原始工作记录。比较规则沿用 [事先记录的检验方案](../NEXT-FULL.md)。线上 v34 的默认推荐与新加坡封存卡均可独立复现。

## 已完成

- 4 月 6 日的 Valve 排名可重现公布的八组首轮对阵。实力取 5 月 4 日已发布的排名，赛事 5 月 9 日开赛。Falcons、MOUZ 和 Fisher College 的换人及赛前报道记在 `field.py`。目前 16 支队伍的首发仍需最后核验。
- `forecast.py` 仅用截止前可用的比赛和特征，12,331 张图拟合、2,068 张图校准，最后一张输入地图为 5 月 1 日。`provisional-ml.json` 的 SHA-256 为 `5de46ef1afeeee7e103eac7c1e59082536f8bc7ff4ae18ca9bd72bcdfc470139`。`lock-ml.cjs` 对同一胜率锁定 1.2 万次和 36 万次两种预算的卡，重复运行逐字节校验原卡。
- `valve_inputs.py` 从 5 月 4 日版 Valve 排名前 100 支队伍的明细中还原 1,442 场双方记录相符的系列赛，每场核对当时的核心。`strength.py` 已复用正式模型的实力拟合方法。85 天训练窗内有 931 场，375 场可唯一关联小分记录。完整对照仍需赛制校准、区域特征和正式推荐配置。

## 11 月 22 日续作

`region.py` 已对齐 Valve 同日三个地区排名前 11，并为 16 队各找到唯一的三人以上核心所属地区。347 场更早跨赛区样本拟合后，独立区域强度修正通过验证；结合另一项 LAN 修正的版本未通过。输入文件指纹和结果见 `region.json`。

通过 Kaggle 官方 DownloadDataset 接口成功取回 Pushbuild v1，SHA-256 与既有模型逐字节一致。`series_format.py` 以 5 月 4 日为截止，用 27 场 BO1、335 场 BO3 拟合赛制差异，按原三折时间顺序检验后，调整权重为 1。数据缓存名为 `pushbuild-response`，模型和三折证据在 `format.json`。

下一次直接核对 16 套首发、接通 `PickLab.seriesMatrices` 锁定正式对照，用 `f1bre_models/screen.cjs` 的三组种子快速比较。保留已锁定的大样本卡作参照。旧方案步骤 1、2 的输入和特征已完成。

## 原检验步骤

1. 匹配 5 月 4 日的美洲、亚洲、欧洲排名与每队五人首发，检查每队在赛前只对应一个至少三人重合的地区记录。三个原始表已从 [Valve 的指定提交](https://github.com/ValveSoftware/counter-strike_regional_standings/tree/aac2074bc10fd62a8bf0b2146d7edfb67d224bcf/invitation/2026) 取回，可在工作区 `astana-valve-source` 中用 `git show <commit>:invitation/2026/standings_<region>_2026_05_04.md` 读取。用 `region_vrs_model.build.build_event` 重建地区特征。
2. 从 [Pushbuild v1](https://www.kaggle.com/datasets/pushbuild/open-data/versions/1) 获取 `esports/cs2_liquipedia_series.csv`，核对 `format_model/build.py` 的固定 SHA-256。当前本地没有该文件，已试过的备用 API 地址返回 404。合并已缓存的 Ektarr v11，按赛前日期筛选，复用 `format_model` 与 `model_v3/fit_format_weight.py` 的校准及时间折。对照胜率须经正式 `PickLab.seriesMatrices` 生成。
3. 在两套胜率、完整对照卡和首发证据封存后，再用各轮实际赛程检验配对、评分主卡与 30 组配对种子，并计算 33 场 BO3 的 Brier 与对数损失。若核验导致阵容或种子变化，保留本次临时封存并注明修订证据。

本机原始 Valve 明细和系列赛缓存保存在 `K:/Major/astana-local-inputs`，Ektarr 缓存在 `K:/Major/veto-evidence`。`series-sources.json` 记录原件指纹，`v4-strength.json` 记录拟合结果。
