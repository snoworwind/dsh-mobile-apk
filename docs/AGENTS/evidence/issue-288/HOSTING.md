# issue-288-device-evidence — 图片图床分支（勿并入 main）

**本分支不是用来合并的**。它只承担一个作用：存放 issue #288「快照管理面板被会话代码块盖住」修复的**设备实测截图**，供 issue / PR 正文以绝对 URL 引用。

## 为什么单独放一个分支

维护者要求**不把图片并入 `upstream/main`**。因此图片字节不进入任何将要合入 `main` 的提交；本分支只存在于 fork `snoworwind/dsh-mobile-apk`，作为图床长期保留。

这与本仓原有做法一致：issue #288 正文引用的修复前截图来自另一个同类分支 `evidence/device-screenshots`（`evidence/` 目录，3 张设备截图）。

## 内容

| 文件 | 说明 | 字节 | SHA-256 |
|---|---|---|---|
| `docs/AGENTS/evidence/issue-288/ui-00-BEFORE-panel-covered-by-codeblock.jpg` | 修复前：代码块卡片叠在面板上层，按钮区被长文本盖住 | 158128 | `4c6bee3178e3232efc0b1792b5bd0dff48756c1e29ffa987c5bb71581d0ed4da` |
| `docs/AGENTS/evidence/issue-288/ui-01-snapshot-panel-SGT-AL10-20261003-213933.jpg` | 修复后：面板整块覆盖正文，列表与按钮完整可读 | 105633 | `aa634ff9601735023a780e0cc7a0d90819980efa240e2557673b2c9fcefea097` |
| `docs/AGENTS/evidence/issue-288/README.md` | 设备/时间/尺寸/哈希、结论表、证据边界 | — | — |

修复前那张与 issue #288 正文所引用的 `evidence/device-screenshots:evidence/issue-snapshot-panel-stacking.jpg` 是**同一个 blob**（`56cc0af8afaa5dce040c500ad6a9929b74768a2b`）。

## 引用形式（与 issue #288 一致）

```
https://raw.githubusercontent.com/snoworwind/dsh-mobile-apk/docs/issue-288-device-evidence/docs/AGENTS/evidence/issue-288/<文件名>
```

只用绝对 URL，不用仓库内相对路径：PR 描述里的相对路径解析基准是**目标分支（`main`）**，而图片不在 `main` 上，相对路径会渲染成破图；绝对 URL 在 PR 与 issue 上都立即可见。

## 这两个分支都**不要**合并进 main

- `docs/issue-288-device-evidence`（本分支）—— 对应 PR kelai141/dsh-mobile-apk#323，**已关闭不合并**，仅作图床。
- `evidence/device-screenshots` —— issue #288 时期的同类图床。

## 相关

- 修复 PR：kelai141/dsh-mobile-apk#321（9 个文件全为源码与文档，**无任何二进制**）
- 原始报障：issue #288
- 根因与修法：PR #321 描述 + `docs/AGENTS/gotchas.md` 坑 242
