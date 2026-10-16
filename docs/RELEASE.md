# 交付政策与历史发布约定

> 当前 `security/hardening` 只允许来源链构建，不创建 GitHub Release；现行政策见 §5，构建入口见 [构建详档](AGENTS/build-and-env.md)。§1、§3、§4 为旧协调仓流程存档，禁止作为本分支操作指南。

---

## 1. 历史仓库职责划分（已退役）

| 仓库 | 维护内容 | 产物 |
|---|---|---|
| dsh-shell-termux/ | 源码 + package.json + 基线 | lib/（tsc 输出）、*.tgz |
| dsh-client-ui-responsive/ | 源码 + 构建配置 | lib/、*.tgz |
| dsh-host-web-compat/ | 源码（lib/index.js 即源码） | lib/、*.tgz |
| dsh-mobile-apk/ | Gradle/Kotlin 源码 + 资源 | build/、snapshot/（快照输入，按 ABI 命名） |
| 主仓库（总控） | docs/ + scripts/ + release/（发布产物唯一出口） | release/v<版本>/... |

## 2. 版本号管理（单一事实源）

| 项 | 规则 |
|---|---|
| 主版本 | 以 app/build.gradle.kts 的 versionName / versionCode 为准 |
| release tag | 历史约定；本分支不创建 Release |
| 插件版本 | 以各 package.json 为准，独立演进（tgz 文件名带插件版本） |
| 归档 | 已发布版本移入 release/archive/ |

## 3. 历史 release/ 目录规范（已退役）

    release/
    ├── v<版本>/apk/dsh-mobile-apk-v<版本>-<abi>.apk   # abi = arm64 | x86_64（双 ABI 必须同时产出；见 §6 改名窗口）
    ├── v<版本>/snapshot/snapshot-<abi>.tar.xz         # 双快照（在线更新/重打包用）
    ├── v<版本>/plugins/*.tgz                          # 3 插件
    ├── v<版本>/MANIFEST.txt                           # sha256 清单
    ├── v<版本>/notes.md                               # 发布说明 + 各 ABI 验证记录
    └── archive/                                       # 历史版本

## 4. 历史一键构建（本分支禁止）

    powershell -File scripts/build-release.ps1 -Version 0.10.2

门禁：双快照 ELF 架构断言 + npm 层断言 + 快照内插件 hash 与发布 tgz 一致性 + check-snapshot-secrets（凭据/会话/sourcemap）+ MANIFEST 生成。

快照输入：dsh-mobile-apk/snapshot/snapshot-<abi>.tar.xz（设备侧 make-snapshot.sh 产出后按 ABI 命名放入；打快照前必须先部署最新插件，否则一致性门禁中止）。

## 5. 发布：本分支不出 Release（2026-10-15 按用户决定）

本分支只允许从源码构建，见 `AGENTS.md` §4 铁律 9 与 `docs/AGENTS/SECURITY-HARDENING.md`：**任何 APK 都必须由来源链产出**（`.github/workflows/build-apk-source.yml`，本地为 `node scripts/source-build/run-local-source-chain.mjs`），禁止用 `scripts/build-apk-013.ps1`、`scripts/build-release.ps1` 或任何手工上传路径归集、发布。

- **不产出 GitHub Release**：`.github/workflows/release.yml` 已删除，`scripts/upload-release.mjs` / `scripts/sync-release-notes.mjs` 已删除。删除是有意为之；恢复发布必须先改政策，并在**来源链**上重建发布面（双 ABI + 资产集 + provenance + 只读构建/独立写权限提升），**不得复活原发布链**。见 `docs/AGENTS/known-gaps.md`。
- **需要分发时**：用来源链产物直接交付——APK 加同一次运行的 provenance 证据包（`project-component-provenance.json`、`component-source-provenance.json`、`project-source-commit.txt`、各项 sha256 清单），并附来源提交与构建命令。不要用「另一次构建的哈希」或另一 commit 的产物拼装。
- 交付前闭环（沿用旧清单）：下载/复制产物 → sha256 对照清单 → 对应平台安装冒烟（x86_64 → MuMu；arm64 → 真机）→ 记录进 `release/v<版本>/notes.md`。
- 插件仓库不打 release（避免 tag 与包版本错位混乱）；需单独分发时用 plugins/ tgz。
- 历史双 ABI、在线更新快照和协调仓目录约定不代表当前来源链能力；当前范围见构建详档。

## 6. 来源链产物命名

APK 由 `scripts/build-apk.mjs` 按 `dsh-mobile-apk-v<versionName><suffix>-<abi>.apk` 命名。当前来源工作流固定 `--abi arm64 --suffix -source`；下载入口与证据清单见 [构建详档](AGENTS/build-and-env.md)。旧在线更新器及其资产候选测试已删除，不再承担命名兼容检查。

## 7. 第三方许可合规声明（2026-08-23 起，GPL 义务）

快照运行时预装 Termux 软件包（dpkg 清单见快照 `usr/var/lib/dpkg/status`，标准文本副本与清单见仓库根 `LICENSES/` 与 `THIRD_PARTY_NOTICES.md`，并随 APK 打包在 `assets/licenses/`）。

- **许可证全文随包分发**：每个包 `usr/share/doc/<pkg>/copyright`（或 COPYING*），标准文本统一位于 `usr/share/LICENSES/*.txt`（Termux `licenses` 包，构建链已显式锁定——实测 x86_64 缺省闭包曾漏带，`build-snapshot-013.mjs` TARGETS 已固化 `licenses`）；
- **源码要约（GPL §3）**：各 copyleft 组件对应源码与构建脚本见 [termux/termux-packages](https://github.com/termux/termux-packages)（版本标签对应，详见 THIRD_PARTY_NOTICES.md 的组件/版本/许可表）；要约自本发行发布起三年内有效；
- **对二进制的再加工**（A4，全部随本仓库开源）：前缀/编译期路径重写 `scripts/fix-shebang.py`、`scripts/inject-snapshot.py`、`termux-elf-cleaner` 调用与 `scripts/build-snapshot-013.mjs`（shebang/RUNPATH/elf 处理）、快照注入与打包 `scripts/inject-all.py`、`scripts/build-apk.mjs` 及 `scripts/patches/`；
- **门禁**：`scripts/check-third-party.mjs`（矩阵覆盖 + copyleft 全文在场）由来源链的 APK 打包门禁执行，缺失即拒绝打包；
- **无额外限制**：上述二进制保持其上游许可，未施加任何附加条款；本工程 dsh 引擎/壳/插件（MIT 系）与 GPL 二进制为进程级聚合，非链接派生，不受传染（详 THIRD_PARTY_NOTICES.md 说明）。
