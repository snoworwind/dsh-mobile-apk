# 第二轮安全发现修复记录

基线 `0571fd2`，分支 `security/hardening`。用户本轮要求修复坑 376–392；[原审计](SECURITY-AUDIT-2026-10-17-R2.md) 保留发现时事实。源码实现、宿主测试与设备验收分别记账，不能据代码修改宣布验收关闭。

## 实现与兼容变化

| 坑位 | 修复与判据 | 边界 |
|---|---|---|
| 376 | ScreenScopePrefs、RootGrant、RootAccess 不再从磁盘恢复授权，使用壳进程内存；冷启动回到 virtual-only、root 无同意、su 未检测 | 重启需重新授权。不是同 uid 任意代码执行的技术沙箱；直接 su、进程注入等仍取决于平台与 Root 管理器隔离 |
| 377 | 敏感桥开启须原生确认及 Android 系统锁屏凭据认证；未接线、取消、超时、非前台、未设凭据均拒绝 | 撤销直接生效。网页不能提供系统认证结果；完整设备流程待验 |
| 378 | 中继占用 32 个流槽位前验证进程随机 relay cookie/header；单 selector 限 128 个未认证连接、16 KiB 头、绝对 2 秒截止，到顶淘汰最老未认证连接 | 原生 HTTP、mux、WebView 接凭据；通用本机网络洪泛不在可用性保证内。40 个未认证连接的 instrumentation 负控已加入，未执行 |
| 379 | 通知动作只持不可变 getActivity；原生确认并认证系统凭据后签发内存一次性许可，receiver 消费许可，旧广播 PendingIntent 不能直接应答 | 回复在原生界面输入；无凭据请打开应用作答。通知监听应用只能请求确认界面，不能直接批复 |
| 380 | market-install-approval-R2 补丁要求每次模型安装都 ask；身份缺失、目录缺项、网络/钩子错误 deny，不回落 allow | riskFlags 仅展示。执行器与 vendor 同步，沿用引擎审批通道 |
| 381 | bootstrap 发现、安装、重装都强制批准清单验证；宿主固定清单摘要作为批准策略 | **功能阻塞**：原 latest API 只读查询返回 404，没有可批准真实清单，源码 pin 列表为空，安装失败关闭。不能声称 Linux 功能恢复；取得可审查资产后须源码评审加入摘要 |
| 382 | 四处 response.text 改为有界流读取；使用固定上限缓冲，不保留逐块对象列表；目录默认 8 MiB、主动探测 1 MiB；models.dev 30 秒 deadline、禁止 redirect | 解码字节超限取消 reader，旧缓存可沿用。text-only 注入离线适配器仅供宿主夹具，生产 fetch 使用流 |
| 383 | public privilege/status 只读缓存，移除 shizukuChannelProbed，不占控制队列 | 初次无事实保持 unknown，刷新由受鉴权控制路径负责 |
| 384 | nonce 限 1–64 位十六进制再拼入单引号参数 | 对应 BigInteger(256) 非定长输出；引号、换行、命令替换不能进入命令 |
| 385 | 原始源码包载荷摘要固定于 Git，逐层验证 commit/tree/blob 对象哈希后读取；缓存与清单同时篡改也不能改 pin。全量 package.json 保留条件导出顺序；重放补丁后比对快照 JS/JSON/WASM/native 及 pnpm 实体副本 | 客户端 CSS 编译路径先规范化，避免绝对构建路径进入 JS 与类名；319 包在两个独立来源目录重建后摘要一致。校验器和宿主仍须可信，不能抵抗能重写检查器的任意构建代码。新来源全链待跑 |
| 386 | workflow 初始输入及快照配置准备时从 GITHUB_SHA 重建 preinstall，再生成受控有效配置 | 续跑目录中的 preinstall 不再是权威 |
| 387 | pnpm/Canvas 用源码固定 SHA-512，npm 仅用官方 registry | 固定值从官方端点核对；缺 pin、下载失败、摘要不符拒绝 |
| 388 | deb 缓存复用同时验签名索引 SHA-256 与 size；坏缓存先移除，下载失败阻断；pnpm/Canvas 每次解包前复验 pin | 存在性与同体积不再作为内容证据 |
| 389 | Gradle 8.11.1 固定官方 distributionSha256Sum | 旧本机 Gradle 缓存仍属受信构建环境 |
| 390 | native 文件点击仅识别显式 data-dsh-file-path，不从 title 推断路径 | 工具行会话路径分支保留；旧未标记标题按钮交给上游处理 |
| 391 | 不再以 HTML 的 x-dsh-pick-token 子串决定整层注入；static fallback 纳入语法校验 | 真实 tapIndex 变换反证子串不能抑制脚本；原可利用性 HYPOTHESIS 不追认成设备利用复现 |
| 392 | 路径要求有效 session，realpath 后限所属 cwd；拒绝跨会话猜解、绝对路径及链接外逃 | 缺 session 旧调用显式失败，不再提供全盘存在性查询 |

## 验证账本

本机日志前缀 `.deploy-tmp/security-r2-`。沙箱本机联网和临时目录 rename 失败的用例在正常本地环境原样重跑，未改测试放过失败。

日志为本机证据，不是远端已可取得的 CI 资产。源码/命令可由本分支复跑；本轮没有新的云端来源构建 run，也没有发布结论。

- model-capability 最终全量 175 项通过，含流上限与 32 MiB 堆预算下大量微块正反证：`security-r2-model-final.log`；三份 npm 官方归档实际下载流的 SHA-512 均与源码 pin 相符，记录 `security-r2-official-pins.json`。
- manage 82 项通过：`security-r2-manage-tests.log`。
- bridge 159 项通过：`security-r2-bridge-tests.log`；linux-env POSIX 全量 64 项通过：`security-r2-linux-posix.log`。Windows 最后一轮业务断言通过但清理临时目录出现 ENOTEMPTY，原始失败保留 `security-r2-linux-final.log`，不把该轮写为通过；POSIX 复核未改用例。
- host-web-compat Linux 59 项与真实注入 smoke 通过：`security-r2-host-linux.log`，含真实路径链接外逃负控；Windows 同链接用例明确 skip，不据 Windows 代替 POSIX 证据。
- UI 自包含副本已重建；用户提示翻译回归 17 项通过：`security-r2-ui-build.log`、`security-r2-ui-copy.log`，新原生认证拒绝码不再落入未登记原因兜底。
- 来源链、主帧桥及真实 Unix socket 宿主回归 113 项通过：`security-r2-source-full.log`，含同体积毒化 deb/npm、篡改 JS/入口、空 riskFlags/目录失败、public status 不排队、恶意 nonce 等负控。
- Kotlin 全量 1309 项通过；设备负控源码编译通过，未执行 instrumentation。日志 `security-r2-gradle-final.log`，计数 `security-r2-kotlin-summary.json`。
- 桥对称、API 路由鉴权、Manifest、Kotlin 注释、补丁 id 自洽、vendor 补丁在场、执行地图、维护文档、Linux vendor 摘要检查通过；执行地图及 Linux vendor 的自检/负控通过。各日志按上述本机前缀保存。
- 新字节门禁实际检查旧来源快照：319 个源码包及 pnpm 物理载荷对账通过，随后既有 narb-android-N1 副本门禁拒绝旧产物，完整命令 exit 1。见 `security-r2-existing-snapshot.log`；这不是新候选来源链通过，旧产物不得用于本轮交付。
- 不可变 pin 加固：两个独立来源目录按固定 CSS 路径策略重建，319 包载荷摘要一致；上游 CSS/纯度测试 43 项通过。新增负控覆盖缓存与快照一起篡改、缺 pin、工作树伪造与 Git 对象内容损坏，见 `security-r2-source-pins.log`、`security-r2-upstream-css-tests.log`、`security-r2-immutable-pin-tests.log`。pin 同时绑定编译适配器摘要，不能静默更换路径策略；适配器与 pin 文件本身加 `-text`（`.gitattributes`），行尾转换不得改变信任输入。再生成入口为 `scripts/source-build/generate-engine-source-payload-pins.mjs`（读 Git 中的适配器字节、要求两棵独立构建树逐包一致，否则拒绝写出），用法见 build-and-env.md 的来源包载荷 pin 小节。
- **未做设备验证**：本机 adb 可执行，设备列表为空；16416、16384 两个模拟器连接拒绝。没有 CDP、ADB 自主真实任务、双方向截图或真机证据。L2/L3 验收仍阻塞，不能作为发布候选。
- 未生成本轮 APK；后续仅允许最终已提交源码的来源链。旧 APK、热推与宿主单测不能代替。
- 已实际启动本地完整来源链；先后暴露本地缺 GitHub runner 环境变量、隔离检出无 origin 两个环境前提。补齐值均来自本轮任务目录和原工作树实际仓库坐标，不改校验规则；续跑记录 `security-r2-source-chain.log`。
- 本轮解压参考树在 finally 清理。工作区清理脚本在本仓及已知相邻入口均不存在，未臆造全树删除命令；旧缓存未删除，仅保留本轮日志、编译产物和测试依赖。

主要复跑命令：

```text
npm --prefix plugins/dsh-model-capability test
npm --prefix plugins/dsh-android-bridge test
npm --prefix plugins/dsh-android-manage test
npm --prefix plugins/dsh-android-linux-env test
node --test plugins/dsh-android-linux-env/test/*.test.mjs
npm --prefix dsh-host-web-compat test
node --test scripts/source-build/*.test.mjs scripts/tests/main-frame-bridge.test.mjs scripts/tests/engine-private-transport.test.mjs
node scripts/check-vendored-linux-bootstrap.mjs --self-test
node scripts/check-code-map.mjs --self-test
```

Kotlin 在既有 WSL Java 17 / Android SDK 环境使用 wrapper JAR 执行 `:app:testDebugUnitTest :app:compileDebugAndroidTestKotlin`；设备与源码链入口沿用 build-and-env.md。本轮未新增依赖或版本升级，插件 lib 均按仓库构建脚本重建，gitignored 产物不强行纳入源码提交。

## 必须补齐

设备恢复后从同一最终源码构建 APK，先跑 screen-scope matrix，再逐个跑对应 CDP 套件；由模型按目标自主编排授权拒绝/确认、通知作答、路径及浏览器切页任务，留存双方向 ADB 操作和截图。验证 relay 在首次加载、Cookie 清理、引擎重启、mux 重连的续接；系统凭据取消、超时、后台/锁屏、旋转、进程重启均不得复活旧授权；伪造 prefs、同源 setter、旧通知 PendingIntent 不得直接授权。
