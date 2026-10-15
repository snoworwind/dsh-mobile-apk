# 安全加固分支宗旨

## 目标与范围

`codex/fix-main-review-findings` 的宗旨是：**最大程度提高软件的安全性和可验证性**。

审查范围包括当前全部代码和历史遗留实现，包括安卓壳、原生桥、插件、自包含副本、快照与恢复、构建和发布链、下载页面及相关配置。持续发现漏洞、修复根因、减少攻击面，并为每项安全结论提供可复核的证据。以用户数据完整、授权边界清晰和必要功能可用为约束。

这是持续加固目标。完成一批修复后，仍需记录剩余风险、检查覆盖和证据缺口；文档中的目标不构成“没有漏洞”或“已经全面验收”的结论。

## 分支维护方式

本分支作为本 fork 的长期独立安全加固分支维护，**不合并到本 fork 的 `main`，也不以合并到上游 `main` 为交付目标**。

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

## 本次复核（2026-10-15）

应用源码基线为 `3036e2d`。本次补充分支文档，并修正维护文档静态门禁的换行比较；当前结果如下：

- UI、bridge、manage 插件重新编译通过，日志为 `.deploy-tmp/branch-purpose-build-{0,1,2}.log`。
- 更新入口、桥方法、安装权限及专用 URI 映射在原生源码、前端源码和 UI 生成产物中未发现残留；保留历史事务恢复。
- 桥对称、Kotlin 注释、control op、op registry、工具名承诺、Manifest 加固及执行地图静态门禁通过；日志为 `.deploy-tmp/branch-purpose-check-*.log`。门禁输出中的已有豁免仍按原范围保留。
- 维护文档门禁修正 CRLF 行尾误报后通过；生成内容校验要求不变，根因与检查范围见 [gotchas.md](gotchas.md) 坑 318。
- Kotlin 语法解析、XML 解析、JavaScript 语法检查及基线退役账目核对通过；本次本地日志使用 `.deploy-tmp/branch-purpose-` 前缀。
- 完整 Android 编译仍在 Gradle 配置阶段报 `Type T not present`（`.deploy-tmp/branch-purpose-android-compile.log`），详见 [known-gaps.md](known-gaps.md) 的编译环境条目；本次未产出 APK，未运行测试或设备验收。

可重复执行的编译与静态检查入口（命令不包含测试）：

```powershell
npm.cmd --prefix dsh-client-ui-responsive run build
npm.cmd --prefix plugins/dsh-android-bridge run build
npm.cmd --prefix plugins/dsh-android-manage run build
node scripts/check-bridge-symmetry.mjs
node scripts/check-kotlin-comments.mjs
node scripts/check-control-ops.mjs
node scripts/check-op-registry-parity.mjs
node scripts/check-tool-name-promises.mjs
node scripts/check-manifest-hardening.mjs
node scripts/check-code-map.mjs
node scripts/check-maintenance-docs.mjs
```

### 追加安全修复（2026-10-15）

修复启动诊断文件及 logcat 中的 launch-token 暴露路径：`writeBootDiag` 在写入前对完整诊断行调用 `EngineAuth.redact`；boot-fail 与显式健康标记经共享有界追加器再次脱敏；`writeBootFail` 的 logcat 记录保留失败阶段、detail 和异常类型，但不再把原始 Throwable 交给 Android 打印未脱敏栈。完整栈仍写入应用私有 `boot-fail.log`，并在落盘边界脱敏。根因、调用链与检查边界见 [gotchas.md 坑 319](gotchas.md)。

首次源码及静态门禁检查通过。Windows Java 24.0.1 下尝试 `:app:compileDebugKotlin --no-daemon`，在创建 `:app:outgoingVariants` 任务时于 Gradle 配置阶段报 `Type T not present`，Kotlin 编译任务未执行。首次 WSL Java 17 重试因缺 Android SDK 而停止；其后已按用户授权安装 Linux SDK 并完成主源码编译，见 [build-and-env.md](build-and-env.md) 的 WSL 编译小节。未新增或运行测试、未做设备验收、未构建 APK。`EngineAuth.redact` 当前针对 URL query 中的 `token=` 值；这不是对任意格式秘密的通用扫描器，诊断调用方仍应避免传入其他凭据。

继续沿生产调用方复核时，发现 `EngineStartFlow.onClientPluginTreeFailed` 在调用 `writeBootFail` 后又直接把页面契约原文写入 logcat，绕过集中出口的脱敏。现将该函数的文件 detail 与 logcat 摘录统一改用先脱敏、后截断的诊断副本；恢复逻辑仍使用内存中的原文。根因、编译输入和检查证据见 [gotchas.md](gotchas.md) 坑 320。编译器警告中的可空父目录与恒定条件已静态查看，当前调用处有固定应用目录前提，未据警告本身宣称存在安全漏洞。

外部文件导入继续复核（2026-10-15）：`MainActivity` 的 exported VIEW/SEND 入口曾允许整个应用私有目录的 file URI，且 content URI 没有 Provider 归属或读授权检查，可能借壳权限把受保护文件搬进可分享的来件工作区。已收紧来源权限，在 `copyIn` 与实际打开前重检，并通过实际持有的普通文件 FD 核对共享存储归属后直接读取；目标叶文件排他创建，分享参数采用 Uri 类型化解析并处理运行时解析异常。没有将「自动搬入草稿」描述成「已经向外发送」；根因与证据见 [gotchas.md](gotchas.md) 坑 321。WSL Kotlin 主源码编译与静态检查通过；未新增或运行测试、未做设备验证、未构建 APK。设备来源/授权/FD 兼容性仍未验收。

## 维护入口

WSL 来源 APK 构建任务中首次执行 Kotlin 全量测试得到 1218 例、3 例失败；失败来自旧测试放行未认证长选项、旧拒绝原因夹具等预期。修正测试后 1218 例全通过、零跳过；引擎侧屏幕范围 47 例通过。生产屏幕授权逻辑未放宽，详见坑 322。来源链另发现已登记 MiMo verifier 未接入副本校验分派；补接既有精确 planner，并以完整补丁通过、部分补丁拒绝和未知 verifier 拒绝证明判据，见坑 323。最终 APK 仍须以实际产物门禁及交付报告为准。

- [known-gaps.md](known-gaps.md)：当前风险、环境限制和待取得的证据。
- [gotchas.md](gotchas.md)：具体缺陷的现象、根因、修法与检查记录。
- [EXECUTION-MAP.md](EXECUTION-MAP.md)：生产调用链、执行顺序和覆盖地图。
- [changelog-archive.md](changelog-archive.md)：阶段改动与验收状态。

本文件维护分支宗旨、实施原则和已接受边界；具体缺陷与证据留在对应详档，持续随源码更新。
