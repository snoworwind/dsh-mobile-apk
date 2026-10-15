# 安全加固分支宗旨

## 目标与范围

`security/hardening` 的宗旨是：**最大程度提高软件的安全性和可验证性**。

审查范围包括当前全部代码和历史遗留实现，包括安卓壳、原生桥、插件、自包含副本、快照与恢复、构建和发布链、下载页面及相关配置。持续发现漏洞、修复根因、减少攻击面，并为每项安全结论提供可复核的证据。以用户数据完整、授权边界清晰和必要功能可用为约束。

这是持续加固目标。完成一批修复后，仍需记录剩余风险、检查覆盖和证据缺口；文档中的目标不构成“没有漏洞”或“已经全面验收”的结论。

## 铁律：APK 只能从源码构建

本分支上**任何 APK 都必须由来源链产出**，禁止用 `build-apk-013.ps1`、`build-release.ps1` 或其他本地/协调仓链产出、归集或发布 APK。理由：只有来源链的输入面可从源码复核——它只构建**已提交 HEAD**、在**隔离检出**内执行、**不读 `base/*.tar.xz` LFS 底座**（Termux 基座由官方验签仓库包组装）、不使用协调仓，并把 `project-component-provenance` / `component-source-provenance` 写进产物。

| 项 | 允许（来源链） | 禁止（本分支） |
|---|---|---|
| 云端入口 | `.github/workflows/build-apk-source.yml`（`build-apk.yml` 复用的就是它） | 任何 Release 发布链：`release.yml` 已按用户决定删除，**不得复活** |
| 本地入口 | `node scripts/source-build/run-local-source-chain.mjs` | `pwsh -File scripts/build-apk-013.ps1 ...`、`scripts/build-release.ps1` |
| 底座输入 | Termux 官方签名仓库 + 固定 bootstrap（逐 deb 哈希） | `base/*.tar.xz` LFS 归档 |
| 产物要求 | 携带来源链 provenance，且 `sourceRepository` 必须等于**本次构建实际所在仓库** | 无 provenance、或 provenance 指向其他仓库的产物 |

**发布面：按用户决定不建**（2026-10-15）。`release.yml` 与两个手工发布脚本已删除，本分支**不产出 GitHub Release**；需要分发时只能用来源链产物（APK + provenance 证据包 + 哈希）直接交付。恢复发布能力必须先改本条政策，并在来源链上重建发布面（双 ABI + 资产集 + 只读构建/独立写权限提升），见 [known-gaps.md](known-gaps.md)。

**「独立」的含义（避免歧义）**：本分支的构建、验证都不需要 kelai141 名下任何仓库——来源链只取 `deepseek-ai/deepseek-harness`、Termux 官方签名仓、npm registry 与 Android SDK；**跨树镜像纪律已整体退役**（2026-10-15）：`check-patch-mirror.mjs` 只保留 registry↔IMPLS 自洽面，`check-release-gates.mjs` 的「两树同版」断言删除，`scripts/patches/**` 与各子仓副本在本分支内即权威，不再有「先合本仓镜像 PR、再合协调仓权威源 PR」这条要求。手工发布脚本（`upload-release.mjs` / `sync-release-notes.mjs`）与 `.github/workflows/release.yml` 均已删除，本分支不出 Release；残留的本地/协调仓链脚本（`build-apk-013.ps1` / `build-release.ps1` / `build-snapshot-013.mjs`）已被铁律 9 禁用，属死字节、不构成依赖。仍然保留、且**不构成依赖**的只有归属与出处类内容：`LICENSE` 的版权声明、`CODEOWNERS`、各 `package.json` 的 `repository` 字段、README 的生态链接，以及 `gotchas.md` / `changelog-archive.md` 的历史条目——这些记录的是事实来源，**不得改写成「我们的」**。

## 分支维护方式

本分支作为本 fork 的长期独立安全加固分支维护，**不合并到本 fork 的 `main`，也不以合并到上游 `main` 为交付目标**。

| 项 | 当前值 |
|---|---|
| 分支 | `security/hardening`，远程同名 `origin/security/hardening` |
| 前身 | `codex/fix-main-review-findings`（2026-10-15 更名并保留旧分支，历史提交未改写，见 [changelog-archive.md](changelog-archive.md) 顶部） |
| 合并策略 | 不合并本 fork `main`，也不以上游 `main` 为交付目标 |
| 配套详档 | 缺口与验证边界 [known-gaps.md](known-gaps.md)；缺陷与修法 [gotchas.md](gotchas.md) |

- 日常交付采用可追溯的提交、同名远程分支推送与检查记录，持续在本分支修复和加固。
- 不自动创建面向 `main` 的合并 PR；CI 通过后继续保留本分支。
- 引入上游改动时，须重新审查其对本分支安全约束和证据的影响。
- 此约定覆盖仓库默认流程中“合并到 main、删除工作分支”的收尾步骤；其他代码质量、授权和验证要求继续适用。维护方向以用户后续明确指示为准。

## 实施原则

1. **审查全部可达路径**：同时检查 UI、原生桥、后台服务、调试入口、生命周期续继及跨进程调用；追踪输入、权限、执行目标、结果回传和持久化状态。
2. **最小权限与最小暴露面**：移除不需要的能力、权限、网络入口与共享目录；明确 Intent 接收组件、文件归属、受信来源和目标设备屏幕。
3. **授权在执行边界落实**：调用方声明不能代替执行端校验；跨层传递的路径、URL、命令、身份、状态与权限事实都须核对。授权不足、解析失败、扫描超限或目标无法确认时拒绝敏感操作，并提供明确原因。
4. **保护凭据与用户数据**：约束凭据的发送目标和重定向；日志按出口脱敏；文件读写限定归属与路径。事务中断、升级、回滚和清理均须保留可靠恢复来源，处理符号链接、并发与校验后被替换的风险。
5. **修复根因并保持可审计性**：代码、桥声明、生成产物、镜像副本和文档同步；成功、失败、取消、超时与部分完成分别如实报告，保留不含秘密的诊断证据。
6. **安全结论可证伪**：为结论说明触发条件、生产调用链、检查方法和预期失败行为。获准执行测试后，用真实生产路径的正例、反例及必要的设备事实检查修复是否成立；静态字面量匹配只证明其覆盖的结构条件。
7. **基线与豁免有依据**：保留其他功能的检查强度。完整功能退役时，只定点删除对应实现、用例和基线，记录用户要求、范围与数量变化；每项已接受风险注明原因和剩余影响。

## 当前明确决策

| 决策 | 原因与边界 |
|---|---|
| 移除应用内更新 | 用户要求删除此功能；已移除 APK 检查、下载、安装及旧在线快照更新入口。内嵌快照部署和历史中断事务恢复保留，详见 [gotchas.md](gotchas.md) 坑 317。 |
| 保留历史 debug 签名 key | 用户明确要求兼容已经使用该 key 的历史版本。公开 key 无法提供独占签名身份保证；此项是已接受的剩余风险，不能计为已修复。 |
| 验证范围随当前任务记录 | 先前加固批次按用户要求仅编译和静态检查；用户随后要求在 WSL 从源码构建可验证 APK，本次执行来源链规定的测试与产物门禁。设备验收尚未执行，旧批次未测记录不改写成当时已通过。 |

## 证据与结论要求

每项发现与修复须能追溯到：**源码提交、触发条件、根因、受影响入口、修复位置、检查命令、实际结果、证据位置和未覆盖范围**。检查失败、跳过、无法判定和未执行分别记录；环境阻塞也要保留原始错误及其发生阶段。

| 证据 | 可支持的结论与边界 |
|---|---|
| 人工审查、符号扫描、协议与权限静态门禁 | 支持已检查的源码关系和结构约束；不能证明运行时行为或所有攻击路径安全。 |
| Kotlin PSI 语法解析 | 支持语法成立；不包含 Android 依赖解析、完整类型检查或 APK 构建。 |
| TypeScript/插件编译 | 支持被编译源码的类型与产物生成；不证明 APK 内嵌产物、设备运行结果或安全策略有效。 |
| 完整 Android 构建 | 支持对应源码可生成产物；运行时安全与交互仍需各自证据。 |
| 自动化测试与设备验收 | 只在获准且实际执行后登记结果，绑定同一源码和产物；接受标准按 [emulator-test-protocol.md](emulator-test-protocol.md) 及仓库风险分档执行。 |

本地 `.deploy-tmp` 日志用于本机复核。需要提交评审或形成发布结论时，应提供可取得的证据、产物身份与重现方法，明确本地日志的可用范围。发布须满足对应风险档位的证据要求及用户授权。

## 复核轮次：2026-10-15（该轮基线 `3036e2d`）

该轮应用源码基线为 `3036e2d`（**历史轮次记录**，此后提交见 [changelog-archive.md](changelog-archive.md)）。本轮补充分支文档，并修正维护文档静态门禁的换行比较；该轮结果如下：

- UI、bridge、manage 插件重新编译通过，日志为 `.deploy-tmp/branch-purpose-build-{0,1,2}.log`。
- 更新入口、桥方法、安装权限及专用 URI 映射在原生源码、前端源码和 UI 生成产物中未发现残留；保留历史事务恢复。
- 桥对称、Kotlin 注释、control op、op registry、工具名承诺、Manifest 加固及执行地图静态门禁通过；日志为 `.deploy-tmp/branch-purpose-check-*.log`。门禁输出中的已有豁免仍按原范围保留。
- 维护文档门禁修正 CRLF 行尾误报后通过；生成内容校验要求不变，根因与检查范围见 [gotchas.md](gotchas.md) 坑 318。
- Kotlin 语法解析、XML 解析、JavaScript 语法检查及基线退役账目核对通过；本次本地日志使用 `.deploy-tmp/branch-purpose-` 前缀。
- 完整 Android 编译仍在 Gradle 配置阶段报 `Type T not present`（`.deploy-tmp/branch-purpose-android-compile.log`），详见 [known-gaps.md](known-gaps.md) 的编译环境条目；本次未产出 APK，未运行测试或设备验收。

可重复执行的编译与静态检查入口（命令不包含测试）：

前置：三条 `run build` 需要各目录先装依赖（各目录 `npm ci`；Windows 侧按 [build-and-env.md](build-and-env.md) 用已配 npmmirror 源的 `npm install`）。八条 `node scripts/check-*.mjs` 不读 `node_modules`，本仓单树即可跑（本机实测 exit 0）；`check-release-gates.mjs` 是跨仓接线断言，需要协调仓树在场（本机两树同版时实测 exit 0），只有单树时会以「树定位失败」退出 1。

```powershell
# Windows（PowerShell）
npm.cmd --prefix dsh-client-ui-responsive run build
npm.cmd --prefix plugins/dsh-android-bridge run build
npm.cmd --prefix plugins/dsh-android-manage run build
```

```bash
# macOS / Linux / WSL 等价写法
npm --prefix dsh-client-ui-responsive run build
npm --prefix plugins/dsh-android-bridge run build
npm --prefix plugins/dsh-android-manage run build
```

```bash
node scripts/check-bridge-symmetry.mjs
node scripts/check-kotlin-comments.mjs
node scripts/check-control-ops.mjs
node scripts/check-op-registry-parity.mjs
node scripts/check-tool-name-promises.mjs
node scripts/check-manifest-hardening.mjs
node scripts/check-code-map.mjs
node scripts/check-maintenance-docs.mjs
node scripts/check-release-gates.mjs         # 聚合入口：静态接线断言（需协调仓树在场）
node scripts/check-release-gates.mjs --list  # 现数门禁集合及「仅构建/发布」标注
```

门禁归属：`--list` 里多数条目是「仅构建/发布」，需要快照或两棵树同时在场的条目在本地单跑给不出有效结论（SKIP 不计通过）；四项已下沉到 apk-ci/本地链；`check-maintenance-docs.mjs` 只作 PR Gate 提示 job，不在聚合 `--run` 段内。发布链跑的是聚合入口的 `--run` 段，手动单跑各脚本与它不等价。

### 该轮追加：启动诊断与外部导入加固（2026-10-15）

修复启动诊断文件及 logcat 中的 launch-token 暴露路径：`writeBootDiag` 在写入前对完整诊断行调用 `EngineAuth.redact`；boot-fail 与显式健康标记经共享有界追加器再次脱敏；`writeBootFail` 的 logcat 记录保留失败阶段、detail 和异常类型，但不再把原始 Throwable 交给 Android 打印未脱敏栈。完整栈仍写入应用私有 `boot-fail.log`，并在落盘边界脱敏。根因、调用链与检查边界见 [gotchas.md 坑 319](gotchas.md)。

首次源码及静态门禁检查通过。Windows Java 24.0.1 下尝试 `:app:compileDebugKotlin --no-daemon`，在创建 `:app:outgoingVariants` 任务时于 Gradle 配置阶段报 `Type T not present`，Kotlin 编译任务未执行。首次 WSL Java 17 重试因缺 Android SDK 而停止；其后已按用户授权安装 Linux SDK 并完成主源码编译，见 [build-and-env.md](build-and-env.md) 的 WSL 编译小节。未新增或运行测试、未做设备验收、未构建 APK。`EngineAuth.redact` 当前针对 URL query 中的 `token=` 值；这不是对任意格式秘密的通用扫描器，诊断调用方仍应避免传入其他凭据。

继续沿生产调用方复核时，发现 `EngineStartFlow.onClientPluginTreeFailed` 在调用 `writeBootFail` 后又直接把页面契约原文写入 logcat，绕过集中出口的脱敏。现将该函数的文件 detail 与 logcat 摘录统一改用先脱敏、后截断的诊断副本；恢复逻辑仍使用内存中的原文。根因、编译输入和检查证据见 [gotchas.md](gotchas.md) 坑 320。编译器警告中的可空父目录与恒定条件已静态查看，当前调用处有固定应用目录前提，未据警告本身宣称存在安全漏洞。

外部文件导入继续复核（2026-10-15）：`MainActivity` 的 exported VIEW/SEND 入口曾允许整个应用私有目录的 file URI，且 content URI 没有 Provider 归属或读授权检查，可能借壳权限把受保护文件搬进可分享的来件工作区。已收紧来源权限，在 `copyIn` 与实际打开前重检，并通过实际持有的普通文件 FD 核对共享存储归属后直接读取；目标叶文件排他创建，分享参数采用 Uri 类型化解析并处理运行时解析异常。没有将「自动搬入草稿」描述成「已经向外发送」；根因与证据见 [gotchas.md](gotchas.md) 坑 321。WSL Kotlin 主源码编译与静态检查通过；未新增或运行测试、未做设备验证、未构建 APK。设备来源/授权/FD 兼容性仍未验收。

## 当前状态与未覆盖范围

截至 `a649df9`（2026-10-15）：

| 面 | 当前事实 | 能支持什么结论 |
|---|---|---|
| 静态门禁 | 八条本地门禁在 macOS 26.6.2 + Node 20.18.0 下于本尖端实测 exit 0：bridge 对称、Kotlin 注释、control op、op registry 平权、工具名承诺、Manifest 加固、执行地图、维护文档生成块；聚合入口 `check-release-gates.mjs` 同样 exit 0（声明门禁集 35 项）。但它的「两树同版」断言在本机走的是**对端缺席跳过**分支——脚本对跳过也打印 PASS 且 PASS 不打印 detail，**不计为已比对**；`check-patch-mirror.mjs` 的镜像层同理需要协调仓树在场 | 只支持静态关系成立，不证明运行时行为；跨树一致性在本机未取得证据 |
| Kotlin 全量测试 | 来源链执行 1218 例零失败零跳过（旧测试放行未认证长选项等预期已修正，生产屏幕授权逻辑未放宽，见坑 322）；引擎侧屏幕范围 47 例通过；已登记的 MiMo 精确 verifier 补接分派，并以完整补丁通过、部分补丁拒绝、未知 verifier 拒绝证明判据，见坑 323 | 绑定当时源码与产物，不覆盖设备行为 |
| 来源审计 APK | 隔离检出从已提交源码（`bc6637f`）产出 arm64 APK，14 项独立复核通过，判据为语义归一化摘要 | 支持产物与源码的对应关系；**未做设备验收、未发布** |
| Windows 完整编译 | Java 24 下 Gradle 配置阶段仍报 `Type T not present`，未改工程版本规避 | 该环境阻塞未解除，不记通过 |
| 设备验收 | 未执行：竖屏 16416 / 横屏 16384、arm64 真机、覆盖升级均未跑 | 不得据此称功能验收通过或具备发布结论 |

复核面、命令与产物身份见 [build-and-env.md](build-and-env.md) 的来源审计小节；逐条改动状态见 [changelog-archive.md](changelog-archive.md)。

## 维护入口

接手顺序：本文件（宗旨与边界）→ [changelog-archive.md](changelog-archive.md) 最新一行（做到哪了）→ [known-gaps.md](known-gaps.md)（还缺什么）→ 上方检查入口（先干跑一遍）。

- [known-gaps.md](known-gaps.md)：当前风险、环境限制和待取得的证据。
- [gotchas.md](gotchas.md)：具体缺陷的现象、根因、修法与检查记录。
- [EXECUTION-MAP.md](EXECUTION-MAP.md)：生产调用链、执行顺序和覆盖地图。
- [changelog-archive.md](changelog-archive.md)：阶段改动与验收状态。

本文件维护分支宗旨、实施原则和已接受边界；具体缺陷与证据留在对应详档，持续随源码更新。
