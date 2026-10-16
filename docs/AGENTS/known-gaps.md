# known-gaps.md — 当前缺口与验收入口

> 本分支宗旨及当前验证边界见 [SECURITY-HARDENING.md](SECURITY-HARDENING.md)。源码有改动不等于新包已验收。
> 先前加固批次仅编译和静态检查；本次按用户新要求执行 WSL 来源 APK 构建及必要测试、产物门禁。设备验收仍未执行。本分支独立维护与远程交付方式见宗旨文档；发版须另行获得用户授权。

## 当前入口

- 旧快照的归一化证据需重算：旧算法会吞二进制及 JSON 有序映射差异，不能继续作为语义等价证明；新算法报告带 `normalizationVersion: 2`，见 [gotchas.md](gotchas.md) 坑 337。未重建 APK、未做设备验证，旧包不包含此次修复。

- 本分支从 [安全加固宗旨](SECURITY-HARDENING.md) 与下方安全加固缺口进入；协调仓 `docs/REFACTOR-2026-10-05.md` 保留为历史计划与事实账入口。仓库地图见 [AGENTS.md](../../AGENTS.md)。
- 恢复与用户数据：[PERSISTENT-DATA.md](PERSISTENT-DATA.md)；协调仓 `docs/RECOVERY-ARCH-0.14.5.md`。当前实现以源码和冻结后的证据为准。
- 三层验收：[emulator-test-protocol.md](emulator-test-protocol.md)。旧包、热推或仅静态审计不能代替最终双 ABI 包的代码/CDP/ADB 用户层验收。

## 安全加固分支（2026-10-15）

| 项 | 当前事实 | 结论 / 后续 |
|---|---|---|
| 本批修复验收范围 | 用户要求仅编译和静态检查；输入广播、raw shell 范围门与认证 HTTP 加固见坑 312–316；应用内更新已按用户要求整体移除，见坑 317；启动诊断 token 出口脱敏见坑 319、320 | WSL 完整 Kotlin 主源码编译通过；未新增或运行测试，未做 CDP/ADB 验收；不记功能验收通过，不具备发布结论；分支维护方式见宗旨文档 |
| Android 工程编译环境 | WSL 已安装独立 Linux Android SDK，Java 17 下 `:app:compileDebugKotlin` 成功；Windows Java 24 的 Gradle 配置失败仍是该环境的限制，未改工程版本规避 | SDK 路径、重复命令及证据入口见 [build-and-env.md](build-and-env.md) 的 WSL 编译小节；编译器仍有弃用 API 与可空接收者等警告，编译成功不等于运行时验收 |
| WSL 来源 APK 构建 | 已从已提交源码（`bc6637f`）在隔离检出内产出 arm64 APK，并通过 14 项独立复核（三签含 v1、证书指纹、内嵌快照哈希与语义归一化摘要、引擎 0.2.0-rc.2、LFS 独立性、四份许可全文、无构建机残留）；重建过程中暴露的前提与修正：无 index 的上游检出需显式初始化固定 commit、pnpm 包物化必须先于按物理路径读取的归档门禁、MiMo verifier 分派缺口已修，见坑 323 | 复核面与命令见 [build-and-env.md](build-and-env.md) 来源审计小节；字节级可复现不成立，判据是语义归一化摘要；测试预期修正及全量结果见坑 322，**该产物未做设备验收、未发布**，不构成发布结论 |
| 外部文件导入来源 | 私有 file URI 与同 UID Provider 的权限代用路径已在源码关闭；外部 content URI 要求系统已授读权限，file URI 限共享存储并检查实际 FD；畸形分享参数被安全拒绝，见坑 321 | WSL 主源码编译及静态检查通过；未做设备验证。正常带授权的系统分享、私有 URI 拒绝、链接替换与 FD 关闭均待设备回归；不提供 URI 读授权的旧文件管理器需改用系统分享/打开入口，系统不能解析的 Provider 或 FD 路径失败关闭 |
| raw shell 策略边界 | 范围门检查提交文本中的静态命令与显示选择器，不具备完整 shell 沙箱的能力 | 不应将文本扫描视作任意可执行程序行为的安全证明；本批只收紧已定位的绕过路径，运行时效果仍待验收 |
| 组件来源证明的信任边界 | 可写输入报告篡改及额外编译源码的漏检已修，见坑 336；输出检查从固定 Git 提交独立重建身份 | 校验器、Git 对象库及执行环境仍须可信；没有隔离任意同 UID 构建代码，也不证明检查间临时改写后恢复的输入。仅构建证明脚本改动，未重建 APK、未做设备验证 |
| **发布链与「APK 只能从源码构建」冲突（已按用户决定收口）** | 按铁律 9，本分支任何 APK 必须由来源链产出。原 `release.yml` 走「`base/*.tar.xz` LFS 底座 + runner 内 `scripts/build-apk-013.ps1`」，属非来源链路径，**已于 2026-10-15 按用户决定整体删除**（本分支不出 Release）。残留的本地/协调仓链脚本（`build-apk-013.ps1` / `build-release.ps1` / `build-snapshot-013.mjs`）仍在双仓镜像面内、单边不可删，但已被铁律 9 禁用——它们是死字节，不构成对 kelai141 的依赖 | 若要恢复发布能力，只能在来源链上重建（双 ABI + 资产集 + provenance + 只读构建/独立写权限提升）；**不得复活 `release.yml` 那条链** |
| **仓库坐标写死上游（已修）** | 实测：`record-project-components.mjs` 把 provenance 的 `sourceRepository` 写死 `github.com/kelai141/dsh-mobile-apk`（而来源链会调用它两次）；`upload-release.mjs` / `sync-release-notes.mjs` 写死 `OWNER/REPO` 并需对方 PAT；`webpages/` 的 canonical/og/发布 API/下载链接全指向上游 | 已改为运行时解析（`DSH_*` 环境变量 > CI 变量 > `git origin`，取不到即判红）与构建期占位符注入，默认指向本 fork；站点测试同步改为按解析值断言。**两个手工发布脚本已按用户指示删除**（零调用者、非来源链路径）。证据与根因见坑 327 |
| **跨树镜像纪律退役（永久分叉，已记账）** | 按用户决定移除跨树镜像层：`check-patch-mirror.mjs` 只保留 registry↔IMPLS 自洽（`--peer` / `--require-peer` / `DSH_MIRROR_PEER` 显式拒绝，exit 2），`check-release-gates.mjs` 的「两树同版」断言删除，AGENTS §4.6 改为「树内副本即权威」。受影响文件：`scripts/check-patch-mirror.mjs`、`scripts/check-release-gates.mjs`、`scripts/build-apk.mjs`（注释） | 这些文件自此与协调仓永久分叉，将来若引入上游改动必冲突；**代价不是依赖而是合并成本**。原跨树防线（防「云端快照静默缺引擎补丁」）在本分支不再适用：不存在第二棵树，交付只由本仓自洽面 + 补丁回归 + fixtures 代对齐保障 |
| **本分支不出 Release（发布面刻意不建）** | 按用户决定：`.github/workflows/release.yml` 与两个手工发布脚本均已删除，本分支不产出 GitHub Release。分发（若确需）只能用来源链产物（APK + provenance 证据包 + 哈希）直接交付 | 这是政策而非缺口：恢复发布必须先改政策（`AGENTS.md` §4 铁律 9 与 [SECURITY-HARDENING.md](SECURITY-HARDENING.md)），再按来源链重建发布面并跑三层验收 |

## 吸收上游 `main`（2026-10-16，上游尖端 `5fca94f`）

| 项 | 当前事实 | 结论 / 后续 |
|---|---|---|
| 吸收范围与冲突口径 | 上游 `main` 的 7 个提交（剪贴板回退镜像 0.1.14 / WebView 算法改色 / 手机端宽表格 / 终端卡片 / 刷新窗口启动请求 P1 / 文档与赞助码）已并入本分支。冲突按本分支口径解决：坑位续编 329–333（上游 309/311/312/313/310）、执行地图锚点按合并后行号重取、Kotlin 单测基线 1232、上游 `UpdateManager` 行不复活 | 逐项安全审查与结论见 [SECURITY-HARDENING.md](SECURITY-HARDENING.md) 的 2026-10-16 复核轮次；**未做设备验证** |
| 代码层证据（本机） | Kotlin `:app:testDebugUnitTest` 编译通过、1232 例中 1231 通过；`dsh-host-web-compat` 三份 `node:test` + `smoke-injections` 18 项通过；`dsh-client-ui-responsive` 全量 vitest 48 文件 709 通过 / 1 跳过（0 失败），且运行副本的 `src`/`tests` 与合并树逐字节相同 | 编译与单测证据**不覆盖运行时行为**；唯一红例是本机文件系统 birthtime 不可得造成的环境误红，见坑 334（不改用例、不放宽 `EngineAuth` 判据） |
| **设备验收（缺）** | 本轮吸收含 **L2 面**（快照事务窗口内的启动/等待、boot-fail 新 stage）与 **L3 面**（主题算法改色、宽表格、终端卡片）：CDP 层与 ADB 用户层**一层都没做**。本分支禁止本地链出 APK（铁律 9），本机没有可安装的来源链产物 | 按铁律 2 的「不可省的两条」，这些改动的设备结论为空，**进入发版候选前必须补验**；补验条件 = 来源链出包 + 模拟器竖横两向 + arm64 真机补充 |
| 本机跑套件的环境坑 | `process.execPath` 在本机是 `/apex/com.android.runtime/bin/linker64`（node 是经 linker 启动的 ELF 共享对象），凡是用它派生子 node 进程的东西必失败：`node --test` 报 `expected absolute path: "--test-concurrency=0"`、vitest 默认 `forks` 池报 `EPIPE`、`check-release-gates.mjs` 的「171 个脚本全部可解析」整项判红（手工 `node --check <单文件>` 却 exit 0）；另 `pnpm install` 在 sdcard（FUSE）上因 symlink/rename 失败（`ERR_PNPM_ENOSYS` / `ERR_PNPM_ENOENT`） | 绕行：逐文件直跑、`--pool=threads`、装到 `$HOME` 或 `--node-linker=hoisted --package-import-method=copy`。属环境限制而非仓库缺陷，**不得据此判仓库红**；根因、实测矩阵与判据见坑 335，pnpm 见 [SECURITY-HARDENING.md](SECURITY-HARDENING.md) 该轮证据段 |
| 上游锚点漂移（已知缺口的现实样本） | 上游写进执行地图的 `EngineStartFlow.kt:700`、`EngineManager.kt:207`、`EngineManager.kt:813、1344-1369` 在本分支合并后全部指错位置，而 `check-code-map.mjs` 仍 `exit 0`（它只验「行号 ∈ [1, 文件行数]」） | 本轮按实际行号手工重取；再次印证下方「锚点只验行号存在性、不验语义」那条缺口——门禁绿不等于锚点对，改代码后必须自查锚点语义 |

## 本轮仍需收口

| 项 | 当前事实 | 必须取得的结论 |
|---|---|---|
| Hard / Soft 插件状态 | 可信 factory identity、四态与真实冷启动健康正在实施；live 用户 patch 不能成为 Hard 来源 | 冻结后统一测试；Disabled 官方条目不能阻止健康；隔离不丢源码/config；退出 Safe Mode 恢复用户配置 |
| 历史 ONLINE 事务与健康 | 本分支已删除新在线更新入口，保留旧 journal、usr-only 交换与 probation/commit/rollback 的恢复兼容 | 最终新包验证历史中断恢复不改用户 HOME；仅 HTTP 活着不得提前提交；失败后可恢复 |
| 回撤节流纪元 | `.undo-auto-done` schema 2 仅抑制相同安装指纹 + 回滚前失败 patch digest，成功回滚后原子写入；身份变化重开观察窗，旧数字时间戳在有效期内保守抑制并记诊断；显式用户重启在确认本壳子进程停止后清 marker，自动重试不清。纯逻辑与源码接线测试已补，仍待本批 Gradle fresh 验证 | 同一失败配置防循环，新安装/新配置不继承旧事件；marker 写入只发生在成功整份恢复后 |
| 许可证 | Shizuku api/provider/aidl/shared 13.1.5 官方 POM 均为 MIT；已补固定许可文本、矩阵、notices 生成及版本/文本反例 | 最终 APK assets/licenses 内含 MIT 全文与 SDK notices；当前源码门禁通过不等于实包已确认 |
| MiMo 与配置保留 | 旧基线真实 wire on/off 成功；虚拟屏目标达成但旧任务 13 次工具调用超出事先 10 次限制，整例未通过 | 新正式包自主任务预先约定可行预算并按真实事件计数；保留既有配置/会话/凭据 |
| UI / 范围 / 通知 / 浏览器 | 有旧版和阶段证据；最终当前树尚未完成三层回归 | 两个模拟器横竖屏、透明度、拒绝面、文件选择、后台任务和旧会话均按同一产物复验 |
| 真机 | MuMu x86_64 是开发首验；arm64 真机是发布前补充 | 华为 WebView identity/安装反馈不能以模拟器替代真机证据 |
| CI 面两个已死 workflow 条目 | `Snapshot Build`（本地已 `git rm`，未推送）与 `ADB runtime patch`（其分支 `contrib/adb-runtime-patch` 已不存在）仍出现在 Actions 列表，均已 `gh workflow disable`；REST 无删除 workflow 的接口 | push 后 `Snapshot Build` 自动消失；`ADB runtime patch` 需在默认分支上不存在该文件，当前仅能保持 disabled |
| `check-code-map.mjs` 锚点只验行号存在性、不验语义 | 锚点判定只校验「行号 ∈ [1, 文件行数]」（`scripts/check-code-map.mjs:235-242`），**不校验该行内容是否仍是文档声称的符号**。源码前移后地图会**静默漂移**而门禁仍 `exit 0`。实测（2026-10-11，只读探针）：1633 个锚点中带可提取预期符号者 **667 个（40.8%）**，可判读的 495 个里约 **53%（263 个）已漂移**；手工抽查 4 例 **4/4 真漂移** —— `AndroidBridge.kt` 的 `jsString` 文档写 `:423`（现 `:675`）、`BrowserHost.kt` 的 `onMain` 写 `:187`（现 `:386`）、`UpdateManager.kt:69` 写 `renameTo`（该行现为 `IllegalStateException`）、`SnapshotFs.kt:83` 写 `move`（现 `:74`） | 已裁定**本轮不改门禁**（两条理由：① 它是发布链门禁，改它需自证，而本轮已多次代码改动 + 第三次出包，风险叠加；② **未调参就启用比不加更坏** —— 会训练人忽略门禁）。**建议实现方向**：① 文档侧先给锚点补预期符号（纯文档、零门禁风险），把可校验覆盖率从 40.8% 往上提；② 门禁侧再加「`line ± WINDOW` 内出现预期符号」的校验 + **反例自检**（「符号移走能被发现」与「符号在窗口内不得判红」），WINDOW 按基线调参至误报为 0 再启用。**注意**：朴素窗口校验误报率高（59.2% 的锚点提取不到预期符号；裸文件名锚点如 `MainActivity.kt:815` 按仓内约定相对 `app/src/main/java/com/dsharnessmobile/shell/`），**不要在未调参时直接启用** |

## 0.14.7 已知限制（本轮如实登记，非缺陷隐瞒）

| 项 | 当前事实 | 结论 / 后续 |
|---|---|---|
| R2 长按拖动：拖到列表边缘不自动滚动 | `sidebar-reorder.ts` 在拖动期间 `preventDefault` 拦原生滚动（否则手指下列表滚动会让命中行漂移、插入位置乱跳）。Spec §2.2 有「拖到列表边缘自动滚动」一句，本轮**未实现**。 | 已裁定本轮不做（需滚动容器 + rAF 边缘推进，属独立增量）。**用户可见影响：长列表远端目标需分两次拖动**。建议 0.14.8 独立项。 |
| R2 驱动上游 DnD 依赖合成事件 | 触摸屏无原生 drag 触发路径，故用合成 `dragstart/dragover/drop/dragend` 驱动上游 `Rows.tsx` / `WorkspaceBrowser.tsx` 的既有 handler。合成事件 `isTrusted=false`。 | 已核实上游当前**不校验** `isTrusted`。**若上游将来加该校验，本方案会静默失效** —— 届时需改为上游原生触摸拖放或请求上游提供触摸入口。 |
| #348 键盘遮挡：本机无法给出真机键盘证据 | 成因已修（弹层高度钳制纳入 `visualViewport` 底边，见 `composer-popup-guard.ts`）；本机可复现缺口（合成视口关系下溢出 196/96px 归零）。但本机仅有搜狗输入法、`mInputShown` 恒 false，真实键盘弹出态不可得。 | 记「**成因已修 + 待真机键盘复验**」，**不记 PASS**。票据所述澎湃 OS / Android 17 触发条件本机不可覆盖。 |
| Android 16/17 与澎湃 OS 专有行为 | 本机为 Android 15（MuMu x86_64）。`keyboard-boundary.ts` 注释记录的「Android 16 edge-to-edge 上 adjustResize 不缩布局视口」无法在本机复现验证。 | 本机**不可覆盖**，未计入通过项，需真机补充。 |
| R2 跨 account 重排未覆盖 | 上游 `sessionDragOrder` 按 `activeDrag.accountKey` 分组；本机仅有 1 个工作区行、无两个 account 各自的会话。 | 本机数据不具备，标**未覆盖**（不是通过）。已验证的是「跨组落点不改变顺序」（R2-5b）。 |
| 键盘判据在本机语义不稳定 | `mInputShown` 在 CDP 复验读到 false、ADB 探针读到 true；且新建会话后上游聚焦新 composer 本身会弹键盘，属标准 UX。 | 测试侧**只记录键盘数值、不作 FAIL 依据**（避免把正常 UX 写成缺陷）。#349 的「不弹键盘」半条同样待真机复验。 |
| `visualViewport` 判空曾漏 undefined（本轮已修） | `keyboard-boundary.ts` 原按 `vv === null` 判空，漏掉 `visualViewport` 求值为 `undefined` 的宿主，读 `.height` 抛 TypeError 并打断视口复算链。 | 已修为 `window.visualViewport ?? null` 并补 2 条回归用例（含反证）。记入 gotchas 284。 |

## 历史事项不自动关闭

旧登记的浏览器自动落位、看门狗恢复入口、API<30 截图回落、多 ROM 限制、动效、滚动条、低置信度依赖判据等，保留当时证据。应按当前源码逐项分类为已改、仍存在或仅特定设备待验；不得把旧“未修”直接当当前事实，也不得把归档当完成。

完整原文在 [历史缺口登记](../archive/known-gaps-pre-0.14.5-2026-10-07.md)。当时版本结论、授权和停止点均不覆盖当前本轮要求。
