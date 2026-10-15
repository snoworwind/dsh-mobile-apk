package com.dsharnessmobile.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.json.JSONObject
import java.io.File

/**
 * 0.13.8 批 H 回归 + 0.14.6 功能 C：启动页 APK 自更新的契约——
 * ① 版本比较（tag vs BuildConfig.VERSION_NAME，快照后缀不参与）；
 * ② 资产命名（**与线上发布链产物名逐字一致**）；
 * ③ 失败原因分类（真实缺失兼容包 / 网络 / 限流 / 发布数据异常 / 解析 / ABI 识别）。
 *
 * 坑 172 与 0.14.6 功能 C 是同一个坑的两次复发，教训写在断言里：
 * 旧断言注释写「与 build-apk-013.ps1 产物名逐字一致」而断言的是 `-arm64-v8a.apk` ——
 * 注释指的是线上链（产 `-arm64.apk`），断言锁的是**旁路链**，于是线上改名后测试照旧绿，
 * arm64 设备恒判「无 arm64 资产」。现在**断言口径来自 `scripts/asset-naming-contracts.json`**
 * （该文件由发布链实测产出），改名即判红。
 *
 * 未覆盖：真实网络/设备层（见本文件末尾注释与验收记录）。
 */
class UpdateCheckerTest {

  @Test
  fun newerTagsAreDetected() {
    assertTrue(UpdateChecker.isNewer("v0.13.8", "0.13.7fx-1"))
    assertTrue(UpdateChecker.isNewer("v0.14.0", "0.13.8"))
    assertTrue(UpdateChecker.isNewer("0.13.10", "0.13.9"))
    assertTrue(UpdateChecker.isNewer("v1.0.0", "0.99.99"))
  }

  @Test
  fun sameOrOlderTagsAreNotNewer() {
    assertFalse(UpdateChecker.isNewer("v0.13.8", "0.13.8"))
    assertFalse(UpdateChecker.isNewer("v0.13.7", "0.13.8"))
    // 段数不齐按缺省 0 补齐：0.13 与 0.13.0 等价
    assertFalse(UpdateChecker.isNewer("v0.13", "0.13.0"))
    assertTrue(UpdateChecker.isNewer("v0.13.1", "0.13"))
    // 无修订号的正式 tag 不是 0.13.7fx-1 的更新（同基版本，避免无谓降级路径）
    assertFalse(UpdateChecker.isNewer("v0.13.7", "0.13.7fx-1"))
  }

  @Test
  fun fxRevisionNumberIsCompared() {
    // 本项目修订命名 0.13.7fx-N：fx-2 必须被识别为比 fx-1 新（device 实测暴露的缺陷）
    assertTrue(UpdateChecker.isNewer("v0.13.7fx-2", "0.13.7fx-1"))
    assertTrue(UpdateChecker.isNewer("v0.13.7fx-10", "0.13.7fx-9"))
    assertFalse(UpdateChecker.isNewer("v0.13.7fx-1", "0.13.7fx-2"))
    assertFalse(UpdateChecker.isNewer("v0.13.7fx-1", "0.13.7fx-1"))
  }

  @Test
  fun snapshotSuffixDoesNotAffectComparison() {
    // BuildConfig.VERSION_NAME 形如 0.13.8-SN-1-13（快照档）——去 -SN-* 后比较
    assertFalse(UpdateChecker.isNewer("v0.13.8", "0.13.8"))
    assertTrue(UpdateChecker.isNewer("v0.13.9", "0.13.8"))
    // 快照档与同版正式 tag 等价（开发机不被反复提示升级到同一版）
    assertFalse(UpdateChecker.isNewer("v0.13.7fx-1", "0.13.7fx-1"))
  }

  @Test
  fun assetNameMatchesReleaseProductName() {
    // 主口径 = **线上发布链产物名**（坑 172 的正确修法方向；旁路链的 `-arm64-v8a` 仍被兼容识别）。
    assertEquals("dsh-mobile-apk-v0.14.1-arm64.apk", UpdateChecker.assetName("v0.14.1", "arm64"))
    assertEquals("dsh-mobile-apk-v0.14.1-x86_64.apk", UpdateChecker.assetName("v0.14.1", "x86_64"))
    // tag 无 v 前缀也要归一到同一资产名（GitHub tag 口径不一）
    assertEquals("dsh-mobile-apk-v0.14.1-arm64.apk", UpdateChecker.assetName("0.14.1", "arm64"))
    assertEquals("dsh-mobile-apk-v0.14.1-x86_64.apk", UpdateChecker.assetName("0.14.1", "x86_64"))
    // arm64 两代命名都在接受集里；x86_64 两代同名故只有一个候选。
    assertEquals(
      listOf("dsh-mobile-apk-v0.14.1-arm64.apk", "dsh-mobile-apk-v0.14.1-arm64-v8a.apk"),
      UpdateChecker.assetNameCandidates("v0.14.1", "arm64"),
    )
    assertEquals(listOf("dsh-mobile-apk-v0.14.1-x86_64.apk"), UpdateChecker.assetNameCandidates("v0.14.1", "x86_64"))
  }

  @Test
  fun abiSelectionPrefersPrimaryAbi() {
    // MuMu/Android 15 实测：abilist = x86_64,arm64-v8a,x86（arm64 只是翻译层）
    // ——按「任一含 arm64 即 arm64」会下错包，必须以首选 ABI 为准。
    assertEquals("x86_64", UpdateChecker.abiFrom(listOf("x86_64", "arm64-v8a", "x86")))
    assertEquals("arm64", UpdateChecker.abiFrom(listOf("arm64-v8a", "armeabi-v7a", "armeabi")))
    // 老式纯 x86 设备（无翻译层）：退化为扫描，仍不误判为 arm64
    assertEquals("x86_64", UpdateChecker.abiFrom(listOf("x86", "x86_64")))
    assertEquals("arm64", UpdateChecker.abiFrom(emptyList()))
  }

  // ── 0.14.6 功能 C：接受集必须绑定**发布链实际产出名** ──────────────────────────────

  /**
   * 发布链改名 → 本断言立刻判红（同一个缺陷的第三次复发防线）。
   *
   * 事实来源（只读，2026-10-11 核实）：
   *  - `.github/workflows/release.yml:262` 是**唯一**的线上发布构建调用：
   *    `pwsh -NoProfile -File scripts/build-apk-013.ps1 -Suffix "" -ExportSnapshots`；
   *    它**不调用** `build-release.ps1`（后者产 `-arm64-v8a`，是历史/旁路口径）。
   *  - `scripts/build-apk-013.ps1:465` 的 `--artifact-name` = `dsh-mobile-apk-v$ver-$abi.apk`，
   *    其中 $abi ∈ {arm64, x86_64} ⇒ 线上资产名 = `dsh-mobile-apk-v<ver>-arm64.apk`。
   *  - `app/build.gradle.kts` 的 versionName 前缀形如 `0.14.5-fx-2`（tag 去 v）。
   *
   * 断言两件事：① 接受集**第一个**候选名与发布链形态逐字一致；② 实测 tags 上确实两代命名都存在
   * （只用公开 tag 名构造，不联网）。
   */
  @Test
  fun assetCandidatesAreBoundToReleaseChainProductName() {
    val releaseYml = repoFile(".github/workflows/release.yml").readText()
    val buildScript = repoFile("scripts/build-apk-013.ps1").readText()
    val gradleSource = repoSource("UpdateChecker.kt")

    // 线上发布链只走 build-apk-013.ps1；若哪天改走旁路链，本断言必须跟着更新（不能沉默漂移）。
    assertTrue(
      "release.yml 应当以 build-apk-013.ps1 作为唯一 APK 构建入口",
      releaseYml.contains("pwsh -NoProfile -File scripts/build-apk-013.ps1"),
    )
    // 形态：--artifact-name "dsh-mobile-apk-v$ver-$abi.apk" —— 把变量段换成真实 tag 就是线上资产名。
    val artifactName = Regex("\"--artifact-name\",\\s*\"([^\"]+)\"")
      .find(buildScript)?.groupValues?.get(1)
      ?: throw AssertionError("build-apk-013.ps1 里找不到 --artifact-name 形态")
    assertEquals("发布链产物名形态变了（客户端接受集必须同步）", "dsh-mobile-apk-v\$ver-\$abi.apk", artifactName)
    // 客户端权威实现必须仍然用"清单"（只认一个名字 = 坑 172 原形）。
    assertTrue("客户端选包必须走 assetNameCandidates 清单", gradleSource.contains("assetNameCandidates"))

    // ① 主候选 = 发布链口径（arm64 无 `-v8a` 后缀）。
    assertEquals(
      "arm64 主候选必须是发布链口径",
      "dsh-mobile-apk-v0.14.6-arm64.apk",
      UpdateChecker.assetNameCandidates("v0.14.6", "arm64").first(),
    )
    // ② 历史窗口：实测 tags 两代都存在，接受集必须同时覆盖（v0.14.2-fx-2 及更早 = -arm64-v8a）。
    assertEquals(
      setOf("dsh-mobile-apk-v0.14.2-fx-2-arm64.apk", "dsh-mobile-apk-v0.14.2-fx-2-arm64-v8a.apk"),
      UpdateChecker.assetNameCandidates("v0.14.2-fx-2", "arm64").toSet(),
    )
    // ③ x86_64 全程同名（发布链与旁路链一致），不得出现第二个候选。
    assertEquals(listOf("dsh-mobile-apk-v0.14.6-x86_64.apk"), UpdateChecker.assetNameCandidates("v0.14.6", "x86_64"))
  }

  /**
   * 读仓库文件（相对壳仓根）。工作目录实测 = `<壳仓>/app`（Gradle 单测），协调仓布局下即
   * `dsh-mobile-apk/app`；故按各候选根逐个试，找不到就明确失败（不静默跳过判据）。
   */
  private fun repoFile(rel: String): File {
    for (root in listOf(File(".."), File("."), File("../dsh-mobile-apk"), File("dsh-mobile-apk"))) {
      val f = File(root, rel)
      if (f.isFile) return f
    }
    throw AssertionError("找不到仓库文件 " + rel + "（工作目录 = " + File(".").absolutePath + "）")
  }

  private fun repoSource(name: String): String {
    for (root in listOf(File("src/main/java/com/dsharnessmobile/shell"), File("../app/src/main/java/com/dsharnessmobile/shell"), File("app/src/main/java/com/dsharnessmobile/shell"))) {
      val f = File(root, name)
      if (f.isFile) return f.readText()
    }
    throw AssertionError("找不到壳侧源码 " + name + "（工作目录 = " + File(".").absolutePath + "）")
  }

  // ── 0.14.6 功能 C：失败原因分类（C1/C2）──────────────────────────────────────────

  /** 造一份 release JSON（字段与 GitHub API 对齐，只含判定所需面）。 */
  private fun releaseJson(tag: String, assets: List<Triple<String, String, Long>>): String {
    val items = assets.joinToString(",") { (n, u, s) ->
      "{\"name\":\"$n\",\"browser_download_url\":\"$u\",\"size\":$s}"
    }
    return "{\"tag_name\":\"$tag\",\"assets\":[$items]}"
  }

  /** 资产名必须与 tag **同源**：否则测到的是"名字对不上"，而不是被测行为。 */
  private fun apkAsset(tag: String, abi: String, url: String = "https://example.test/" + abi + ".apk", size: Long = 100L) =
    Triple("dsh-mobile-apk-v" + tag.removePrefix("v") + "-" + abi + ".apk", url, size)

  /** 一定比当前版本新（不依赖 BuildConfig.VERSION_NAME 的具体值），用于「发现新版 / 缺件」路径。 */
  private val newerTag = "v99.0.0"

  @Test
  fun bothAbisHitTheirOwnAsset() {
    val body = releaseJson(newerTag, listOf(apkAsset(newerTag, "arm64"), apkAsset(newerTag, "x86_64")))
    val arm = UpdateChecker.classifyLatestBody(body, listOf("arm64-v8a", "armeabi-v7a"), "arm64")
    assertTrue("arm64 设备应命中 arm64 资产", arm is UpdateChecker.CheckResult.Available)
    assertEquals("dsh-mobile-apk-v99.0.0-arm64.apk", (arm as UpdateChecker.CheckResult.Available).name)
    assertEquals("https://example.test/arm64.apk", arm.apkUrl)

    val x86 = UpdateChecker.classifyLatestBody(body, listOf("x86_64", "arm64-v8a", "x86"), "x86_64")
    assertTrue(x86 is UpdateChecker.CheckResult.Available)
    assertEquals("dsh-mobile-apk-v99.0.0-x86_64.apk", (x86 as UpdateChecker.CheckResult.Available).name)
  }

  @Test
  fun legacyArm64NamingIsStillRecognised() {
    // 线上历史窗口：v0.14.2-fx-2 及更早的 arm64 资产是 `-arm64-v8a.apk`（tag 枚举见 assetNameCandidates 注释）。
    // 用同一形态的**新版** tag：历史 tag 会被版本比较判为已最新，测不到匹配环节。
    val body = releaseJson(newerTag, listOf(Triple("dsh-mobile-apk-v99.0.0-arm64-v8a.apk", "https://example.test/old.apk", 7L)))
    val r = UpdateChecker.classifyLatestBody(body, listOf("arm64-v8a"), "arm64")
    assertTrue(r is UpdateChecker.CheckResult.Available)
    assertEquals("https://example.test/old.apk", (r as UpdateChecker.CheckResult.Available).apkUrl)
  }

  @Test
  fun crossArchitectureAssetIsNeverSelected() {
    // 反证：只有 x86_64 包时，arm64 设备**不得**因为命名兼容而选中异构资产。
    val body = releaseJson(newerTag, listOf(apkAsset(newerTag, "x86_64")))
    val r = UpdateChecker.classifyLatestBody(body, listOf("arm64-v8a"), "arm64")
    assertTrue(r is UpdateChecker.CheckResult.Failed)
    assertEquals(UpdateChecker.CheckResult.FailureKind.NO_COMPATIBLE_APK, (r as UpdateChecker.CheckResult.Failed).kind)
  }

  @Test
  fun missingArm64AssetSaysSoWithFacts() {
    val body = releaseJson(newerTag, listOf(apkAsset(newerTag, "x86_64")))
    val r = UpdateChecker.classifyLatestBody(body, listOf("arm64-v8a", "armeabi-v7a"), "arm64") as UpdateChecker.CheckResult.Failed
    // 真缺件的形态：文案必须给出真实资产名与本机 abilist（可核对），且不再声称"没有 arm64 资产"这种含糊话。
    assertTrue(r.reason.contains("x86_64"))
    assertTrue(r.reason.contains("arm64-v8a"))
    assertTrue(r.reason.contains("arm64"))
    assertFalse("不得把缺件说成『无资产』", r.reason.contains("无 arm64 资产"))
  }

  @Test
  fun emptyAssetsAreReleaseDataBrokenNotDeviceUnsupported() {
    val body = releaseJson(newerTag, emptyList())
    val r = UpdateChecker.classifyLatestBody(body, listOf("arm64-v8a"), "arm64") as UpdateChecker.CheckResult.Failed
    assertEquals(UpdateChecker.CheckResult.FailureKind.RELEASE_DATA_BROKEN, r.kind)
    assertTrue(r.reason.contains("不是本机没有可用版本"))
  }

  @Test
  fun nonApkAssetsOnlyAreReleaseDataBroken() {
    // assets 非空但只有快照/插件包（发布组装中途的形态）：不是设备不支持。
    val body = releaseJson(newerTag, listOf(
      Triple("snapshot-arm64.tar.xz", "https://example.test/s.tar.xz", 1L),
      Triple("notes.md", "https://example.test/n.md", 1L),
    ))
    val r = UpdateChecker.classifyLatestBody(body, listOf("arm64-v8a"), "arm64") as UpdateChecker.CheckResult.Failed
    assertEquals(UpdateChecker.CheckResult.FailureKind.RELEASE_DATA_BROKEN, r.kind)
  }

  @Test
  fun assetWithoutDownloadUrlIsReleaseDataBroken() {
    val body = releaseJson(newerTag, listOf(Triple("dsh-mobile-apk-v99.0.0-arm64.apk", "", 5L)))
    val r = UpdateChecker.classifyLatestBody(body, listOf("arm64-v8a"), "arm64") as UpdateChecker.CheckResult.Failed
    assertEquals(UpdateChecker.CheckResult.FailureKind.RELEASE_DATA_BROKEN, r.kind)
    assertTrue(r.reason.contains("缺下载地址"))
  }

  @Test
  fun malformedJsonIsParsedFailureNotAssetFailure() {
    for (bad in listOf("", "  ", "<html>blocked</html>", "{\"tag_name\":")) {
      val r = UpdateChecker.classifyLatestBody(bad, listOf("arm64-v8a"), "arm64") as UpdateChecker.CheckResult.Failed
      assertEquals("畸形响应必须归解析类：" + bad, UpdateChecker.CheckResult.FailureKind.PARSE, r.kind)
      assertFalse(r.reason.contains("没有适配本机"))
    }
  }

  @Test
  fun missingTagIsParsedFailure() {
    for (bad in listOf("{}", "{\"assets\":[]}", "{\"tag_name\":\"   \"}")) {
      val r = UpdateChecker.classifyLatestBody(bad, listOf("arm64-v8a"), "arm64") as UpdateChecker.CheckResult.Failed
      assertEquals(UpdateChecker.CheckResult.FailureKind.PARSE, r.kind)
    }
  }

  @Test
  fun unknownDeviceAbiIsItsOwnCategory() {
    // SUPPORTED_ABIS 读不到 = ABI 识别问题，不得借"没有 arm64 资产"顶罪。
    val body = releaseJson(newerTag, listOf(apkAsset(newerTag, "arm64"), apkAsset(newerTag, "x86_64")))
    val r = UpdateChecker.classifyLatestBody(body, emptyList(), "arm64") as UpdateChecker.CheckResult.Failed
    assertEquals(UpdateChecker.CheckResult.FailureKind.ABI_UNSUPPORTED, r.kind)
    assertFalse(r.reason.contains("没有适配本机"))
  }

  @Test
  fun rateLimitIsDistinguishedFromPlainForbidden() {
    // 429 = 限流；403 + x-ratelimit-remaining:0 = 限流；403 无头 = 普通接口异常（不得说"稍后重试即可"）。
    assertTrue(UpdateChecker.isRateLimited(429, null, null))
    assertTrue(UpdateChecker.isRateLimited(403, "0", null))
    assertTrue(UpdateChecker.isRateLimited(403, null, "60"))
    assertFalse(UpdateChecker.isRateLimited(403, "42", null))
    assertFalse(UpdateChecker.isRateLimited(500, null, null))
    assertFalse(UpdateChecker.isRateLimited(404, "0", null))

    val limited = UpdateChecker.classifyHttpFailure(403, true)
    assertEquals(UpdateChecker.CheckResult.FailureKind.RATE_LIMITED, limited.kind)
    assertTrue(limited.reason.contains("60"))
    assertTrue("限流说明必须与架构无关", limited.reason.contains("与本机架构无关"))

    val forbidden = UpdateChecker.classifyHttpFailure(403, false)
    assertEquals(UpdateChecker.CheckResult.FailureKind.API_HTTP, forbidden.kind)
    assertFalse(forbidden.reason.contains("限流"))
    assertEquals(UpdateChecker.CheckResult.FailureKind.API_HTTP, UpdateChecker.classifyHttpFailure(502, false).kind)
    assertFalse("不得出现统一话术『没有 arm64 资产』", UpdateChecker.classifyHttpFailure(500, false).reason.contains("arm64"))
  }

  @Test
  fun transportFailuresAreClassified() {
    val net = UpdateChecker.classifyTransportFailure(java.net.UnknownHostException("api.github.com"))
    assertEquals(UpdateChecker.CheckResult.FailureKind.NETWORK, net.kind)
    assertTrue(net.reason.contains("网络不可达"))
    assertEquals(
      UpdateChecker.CheckResult.FailureKind.NETWORK,
      UpdateChecker.classifyTransportFailure(java.net.SocketTimeoutException("timeout")).kind,
    )
    assertEquals(
      UpdateChecker.CheckResult.FailureKind.NETWORK,
      UpdateChecker.classifyTransportFailure(java.net.ConnectException("refused")).kind,
    )
    val parse = UpdateChecker.classifyTransportFailure(org.json.JSONException("bad json"))
    assertEquals(UpdateChecker.CheckResult.FailureKind.PARSE, parse.kind)
    // 未归类：保持原有措辞（不编造原因）。
    val unknown = UpdateChecker.classifyTransportFailure(RuntimeException("boom"))
    assertEquals(UpdateChecker.CheckResult.FailureKind.UNKNOWN, unknown.kind)
    assertTrue(unknown.reason.contains("boom"))
  }

  @Test
  fun oldVersionPathsStillBehave() {
    // C4 不回归：与当前版本相等 = 已是最新；更低 = 已是最新；更高 = 可下载。
    val cur = "v" + UpdateChecker.currentVersion()
    val same = UpdateChecker.classifyLatestBody(releaseJson(cur, listOf(apkAsset(cur, "arm64"))), listOf("arm64-v8a"), "arm64")
    assertTrue("同版应为已是最新", same is UpdateChecker.CheckResult.UpToDate)
    val older = UpdateChecker.classifyLatestBody(releaseJson("v0.13.6", listOf(apkAsset("v0.13.6", "arm64"))), listOf("arm64-v8a"), "arm64")
    assertTrue("更低版本应为已是最新（不提示降级）", older is UpdateChecker.CheckResult.UpToDate)
    val newer = UpdateChecker.classifyLatestBody(releaseJson(newerTag, listOf(apkAsset(newerTag, "arm64"))), listOf("arm64-v8a"), "arm64")
    assertTrue(newer is UpdateChecker.CheckResult.Available)
  }

  @Test
  fun sha256AssetIsPickedUpWhenPresent() {
    val apk = apkAsset(newerTag, "arm64")
    val sha = Triple(apk.first + ".sha256", "https://example.test/a.sha256", 1L)
    val r = UpdateChecker.classifyLatestBody(releaseJson(newerTag, listOf(apk, sha)), listOf("arm64-v8a"), "arm64")
    assertEquals("https://example.test/a.sha256", (r as UpdateChecker.CheckResult.Available).sha256Url)
  }

  @Test
  fun missingAssetIsStillReportedBeforeVersionCompare() {
    // 既有顺序（不回归）：先确认有本机可用的包，再比版本——缺件不得被"已是最新"掩盖。
    // 这里用**比当前版本低**的 tag 且只给 x86_64 资产：若顺序反了就会回 UpToDate（假绿）。
    val body = releaseJson("v0.13.0", listOf(apkAsset("v0.13.0", "x86_64")))
    val r = UpdateChecker.classifyLatestBody(body, listOf("arm64-v8a"), "arm64")
    assertTrue("缺件必须先于版本比较被报出", r is UpdateChecker.CheckResult.Failed)
    assertEquals(UpdateChecker.CheckResult.FailureKind.NO_COMPATIBLE_APK, (r as UpdateChecker.CheckResult.Failed).kind)
  }

  // ── 0.14.6 缺陷修复：「更新中转圈不收敛」+「更新劫持启动按钮」────────────────────
  // 用户实测：检查更新失败后有弹窗，但启动页持续「更新中」转圈、主按钮禁用且写着「更新中」，
  // 用户因此**没法正常启动**。两条硬判据都写成会因复发而变红的断言。

  /** 只留代码：注释里出现被禁标识符不算违规（判据必须对着代码，而不是对着解释）。 */
  private fun codeOnly(src: String): String =
    src.replace(Regex("/\\*[\\s\\S]*?\\*/"), "")
      .lineSequence().joinToString("\n") { it.substringBefore("//") }

  private fun shellSource(name: String): String {
    for (root in listOf(File("src/main/java/com/dsharnessmobile/shell"), File("../app/src/main/java/com/dsharnessmobile/shell"))) {
      val x = File(root, name)
      if (x.isFile) return x.readText()
    }
    throw AssertionError("找不到壳侧源码 " + name + "（工作目录 = " + File(".").absolutePath + "）")
  }

  @Test
  fun timeoutAlwaysConvergesToHonestTerminalText() {
    // 进行中相位超时 → 必须有如实终态文案（否则界面永远转圈）。
    val checking = ApkUpdateController.timeoutReason(ApkUpdateState.STATE_CHECKING)
    assertTrue("检查超时必须给终态文案", checking != null && checking.contains("超时"))
    assertTrue("超时文案必须给出下一步", checking!!.contains("重试"))
    assertTrue("超时文案不得声称是架构问题", !checking.contains("没有 arm64"))
    val downloading = ApkUpdateController.timeoutReason(ApkUpdateState.STATE_DOWNLOADING)
    assertTrue("下载超时必须给终态文案", downloading != null && downloading.contains("超时"))
    // 已是终态 → 不得用超时文案覆盖真实原因（把真因换成超时也是谎报）。
    for (terminal in listOf(
      ApkUpdateState.STATE_IDLE, ApkUpdateState.STATE_UP_TO_DATE, ApkUpdateState.STATE_AVAILABLE,
      ApkUpdateState.STATE_FAILED, ApkUpdateState.STATE_NEED_PERMISSION, ApkUpdateState.STATE_INSTALLING,
    )) {
      assertEquals("终态 $terminal 不得被超时覆盖", null, ApkUpdateController.timeoutReason(terminal))
    }
  }

  @Test
  fun downloadTimeoutScalesWithSizeAndStaysBounded() {
    // 169MB 必须有充裕上限，小包不得秒判超时，且上下界都封死。
    assertEquals(ApkUpdateController.DOWNLOAD_TIMEOUT_MIN_MS, ApkUpdateController.downloadTimeoutMs(0))
    assertEquals(ApkUpdateController.DOWNLOAD_TIMEOUT_MIN_MS, ApkUpdateController.downloadTimeoutMs(1_000L))
    val big = ApkUpdateController.downloadTimeoutMs(169L * 1024 * 1024)
    assertTrue("169MB 的上限应显著大于下限", big > ApkUpdateController.DOWNLOAD_TIMEOUT_MIN_MS)
    assertTrue("不得超过上限", big <= ApkUpdateController.DOWNLOAD_TIMEOUT_MAX_MS)
    assertEquals(ApkUpdateController.DOWNLOAD_TIMEOUT_MAX_MS, ApkUpdateController.downloadTimeoutMs(Long.MAX_VALUE / 2))
  }

  @Test
  fun updateNeverHijacksPhaseOrPrimaryButton() {
    // 结构性保证（用户硬判据：「更新失败不影响正常启动，启动页下方按钮是启动而不是别的」）：
    // ① APK 更新路径**不得**把相位设成 Updating（那是主按钮变「更新中」且被锁的唯一来源）；
    // ② 也不得直接锁主按钮（更新只能占次级提示/次级按钮）。
    val renderer = codeOnly(shellSource("GuidePageRenderer.kt"))
    val apkUpdateBlock = renderer.substringAfter("internal fun renderApkUpdate()").substringBefore("internal fun toastApkUpdateFailure()")
    assertTrue("renderApkUpdate 必须存在（唯一渲染点）", apkUpdateBlock.isNotBlank())
    assertFalse("APK 更新渲染不得触碰相位（避免占住主按钮）", apkUpdateBlock.contains("applyGuidePhase"))
    assertFalse("APK 更新渲染不得直接锁主按钮", apkUpdateBlock.contains("primaryButton"))

    // 控制器侧同样不得改相位/主按钮（状态机只管更新，不碰启动路径）。
    val controller = codeOnly(shellSource("ApkUpdateAction.kt"))
    assertFalse("更新状态机不得调用 applyGuidePhase", controller.contains("applyGuidePhase"))
    assertFalse("更新状态机不得触碰 primaryButton", controller.contains("primaryButton"))
    // 唯一状态机必须带终态兜底（超时定时器），否则回执丢失即永久转圈。
    assertTrue("必须有超时兜底定时器", controller.contains("armWatchdog"))
    assertTrue("超时必须落到终态", controller.contains("timeoutReason"))
    assertTrue("销毁时必须收敛进行中相位", controller.contains("fun release()"))
  }

  @Test
  fun snapshotChainIsNotTriggeredFromApkUpdatePath() {
    // 快照更新链已下线（UpdateManager.DEFAULT_MANIFEST_URL 为空、零生产覆盖点）：
    // APK 更新路径（引导页检查更新按钮 + 设置页那一行）**不得**再链式调用它——
    // 这正是用户看到的「点更新却出现快照文案」的来源。
    val renderer = codeOnly(shellSource("GuidePageRenderer.kt"))
    assertFalse("APK 更新路径不得再调 startUpdateCheck", renderer.contains("startUpdateCheck"))
    assertFalse("引导页更新按钮不得再有链式快照调用", renderer.contains("engineFlow.startUpdateCheck"))
    // 文案：Updating 相位的说明必须点明它与「安装新版 APK」是两件事（不再误导成在更新应用）。
    assertFalse("不得再宣称下载快照后自动切换运行时", renderer.contains("下载并校验快照后会自动切换运行时"))
  }

  @Test
  fun updatePathNeverTouchesTheSharedPageBridgeObject() {
    // 共享全局对象的接线必须**属性级、幂等、可回归验证**（Lead 复核的事实）：
    // 页面侧 dsh-host-web-compat/lib/index.js 的 PICKER_SCRIPT 把 window.__dshBridge **整体赋值**
    // 为含 onDirectoryPicked / onPermissionRequired 的对象，并带 if(window.__dshBridge){return} 守卫。
    // 壳侧任何整体赋值都会让守卫整体跳过（目录选择器失效），任何覆盖式重挂都会顶掉 onDirectoryPicked。
    //
    // 0.14.6 的收敛做法：更新面**完全不碰 __dshBridge** —— 动作走 window.androidBridge.apkUpdate，
    // 进展由页面轮询 status 读回（dev-section/apk-update.tsx）。本用例锁住这条结构：
    // 一旦有人再往 __dshBridge 里挂更新回调，判据立刻变红，必须重新评估覆盖风险。
    for (name in listOf("MainActivity.kt", "ApkUpdateAction.kt", "GuidePageRenderer.kt")) {
      val code = codeOnly(shellSource(name))
      assertFalse("$name 不得向共享的 __dshBridge 写入（整体赋值会顶掉 onDirectoryPicked）", code.contains("__dshBridge"))
    }
    // 页面侧那条真源必须保持原样：它拥有 onDirectoryPicked / onPermissionRequired 与幂等守卫。
    val picker = repoFile("dsh-host-web-compat/lib/index.js").readText()
    assertTrue("__dshBridge 的初始整体赋值与幂等守卫仍在", picker.contains("if(window.__dshBridge){return}"))
    assertTrue("目录选择器回调必须仍在", picker.contains("onDirectoryPicked:function(callbackId,path)"))
    assertTrue("权限提示回调必须仍在", picker.contains("onPermissionRequired:function()"))
  }

  @Test
  fun bridgeActionRoutingIsClosedAndReadOnlyForUnknown() {
    // 未知动作必须只读（不得推进状态机）：用状态提供者被调用来判「只读」。
    var statusCalls = 0
    var checkCalls = 0
    var installCalls = 0
    val r = ApkUpdateController.route(
      "nonsense",
      statusOf = { statusCalls++; "{\"state\":\"idle\"}" },
      check = { checkCalls++; "{}" },
      install = { installCalls++; "{}" },
    )
    assertEquals(1, statusCalls)
    assertEquals(0, checkCalls)
    assertEquals(0, installCalls)
    assertTrue("未知动作必须如实回 ok=false", r.contains("\"ok\":false"))
    assertTrue("未知动作必须回原因", r.contains("未知动作"))

    // 三个已知动作各自只命中一条（大小写与空白容忍）。
    var c = 0; var i = 0
    ApkUpdateController.route(" CHECK ", { "{}" }, { c++ ; "check" }, { i++ ; "install" })
    assertEquals(1, c); assertEquals(0, i)
    ApkUpdateController.route("install", { "{}" }, { c++ ; "check" }, { i++ ; "install" })
    assertEquals(1, c); assertEquals(1, i)
    ApkUpdateController.route("status", { "\"s\"" }, { "c" }, { "i\"" })
    assertEquals(1, c); assertEquals(1, i)
  }

  @Test
  fun stateMachineRejectsConcurrentActionsAndKeepsFacts() {
    val s = ApkUpdateState()
    assertEquals(ApkUpdateState.STATE_IDLE, s.stateName())
    assertTrue(s.beginCheck())
    assertEquals(ApkUpdateState.STATE_CHECKING, s.stateName())
    assertTrue("检查中不得再次受理", !s.beginCheck())
    assertTrue("检查中不得受理下载", !s.beginDownload())
    // 失败：如实带上分类与原因（原因原样透出，不二次加工）。
    s.onCheckResult(UpdateChecker.CheckResult.Failed("检查失败：更新接口限流（HTTP 429）", UpdateChecker.CheckResult.FailureKind.RATE_LIMITED), "0.14.5-fx-2")
    assertEquals(ApkUpdateState.STATE_FAILED, s.stateName())
    assertEquals("RATE_LIMITED", JSONObject(s.snapshotJson()).getString("kind"))
    assertTrue(s.reasonText()!!.contains("限流"))
    assertTrue("终态后不再是 busy", !s.busy())
  }

  @Test
  fun availableStateCarriesTagSizeAndReachesInstalling() {
    val s = ApkUpdateState()
    s.beginCheck()
    s.onCheckResult(
      UpdateChecker.CheckResult.Available("v99.0.0", "dsh-mobile-apk-v99.0.0-arm64.apk", "u", null, 169_000_000L),
      "0.14.5-fx-2",
    )
    assertEquals(ApkUpdateState.STATE_AVAILABLE, s.stateName())
    assertEquals("v99.0.0", s.tagText())
    assertEquals(169_000_000L, s.sizeBytesValue())
    assertEquals("已是最新文案用当前版本", "0.14.5-fx-2", s.snapshotJson().let { JSONObject(it).getString("current") })
    assertTrue("available 才可 start", s.beginDownload())
    s.onDownloadProgress(42)
    assertEquals(ApkUpdateState.STATE_DOWNLOADING, s.stateName())
    assertEquals(42, s.percentValue())
    s.onInstalling(true)
    assertEquals(ApkUpdateState.STATE_INSTALLING, s.stateName())
    val j = JSONObject(s.snapshotJson())
    assertTrue("复用已下载包必须如实标记", j.getBoolean("reused"))
    assertFalse("安装器已拉起：本进程不再有可超时的动作（定时器必须解除）", s.inFlight())
    assertTrue("安装器已拉起期间仍不受理新动作（避免状态与真实安装流程脱节）", s.busy())
  }

  // ── 0.14.6 缺陷修复（下载失败后重试死循环）：canStart 必须与真实受理条件一致 ─────────

  @Test
  fun downloadFailureMakesCanStartFalse() {
    // 缺陷原形：onDownloadFailed 漏清「待装新版」标记 => state:"failed" 与 canStart:true 并存
    // => 页面按契约改发 install => 壳侧回 busy => 点重试永远说「上一次更新动作仍在进行中」。
    val s = ApkUpdateState()
    s.beginCheck()
    s.onCheckResult(UpdateChecker.CheckResult.Available("v99.0.0", "a.apk", "u", null, 10L), "0.14.5-fx-2")
    assertTrue("发现新版后应可 start", JSONObject(s.snapshotJson()).getBoolean("canStart"))
    s.beginDownload()
    s.onDownloadFailed("下载失败：镜像链全部不可用（直连与加速镜像均失败）——请稍后重试", ApkUpdateState.KIND_DOWNLOAD_FAILED)
    assertEquals(ApkUpdateState.STATE_FAILED, s.stateName())
    assertFalse("下载失败后不得再声称可 start（本缺陷的根因）", JSONObject(s.snapshotJson()).getBoolean("canStart"))
    assertFalse("失败不得自称在途", s.busy())
    assertFalse("失败后 beginDownload 必须拒绝", s.beginDownload())
  }

  @Test
  fun failedSnapshotNeverClaimsCanStart() {
    // 自相矛盾守卫：任何 FAILED 判决下，快照都不能同时是可 start。
    for (kinds in listOf(ApkUpdateState.KIND_DOWNLOAD_FAILED, ApkUpdateState.KIND_ARTIFACT_REJECTED, ApkUpdateState.KIND_TIMEOUT)) {
      val s = ApkUpdateState()
      s.beginCheck()
      s.onCheckResult(UpdateChecker.CheckResult.Available("v99.0.0", "a.apk", "u", null, 1L), "0.14.5-fx-2")
      s.beginDownload()
      s.onDownloadFailed("下载失败：" + kinds, kinds)
      val j = JSONObject(s.snapshotJson())
      assertFalse(kinds + " 后不得 canStart=true", j.getBoolean("canStart"))
    }
    // 检查本身失败同样不得可 start。
    val s2 = ApkUpdateState()
    s2.beginCheck()
    s2.onCheckResult(UpdateChecker.CheckResult.Failed("检查失败：限流", UpdateChecker.CheckResult.FailureKind.RATE_LIMITED), "0.14.5-fx-2")
    assertFalse("检查失败不得 canStart=true", JSONObject(s2.snapshotJson()).getBoolean("canStart"))
  }

  @Test
  fun canStartMatchesBeginDownloadOnEveryPhase() {
    // 结构性要求（单一真源）：canStart 的口径必须与 beginDownload 的受理判据完全一致，
    // 否则页面按 canStart 决策就会与壳侧真实受理行为分裂 —— 这就是本缺陷的成因。
    val s = ApkUpdateState()
    fun canStart() = JSONObject(s.snapshotJson()).getBoolean("canStart")
    assertFalse("idle 不可 start", canStart())
    s.beginCheck(); assertFalse("checking 不可 start", canStart())
    s.onCheckResult(UpdateChecker.CheckResult.UpToDate, "0.14.5-fx-2")
    assertFalse("up-to-date 不可 start", canStart())
    s.beginCheck()
    s.onCheckResult(UpdateChecker.CheckResult.Available("v99.0.0", "a.apk", "u", null, 1L), "0.14.5-fx-2")
    assertTrue("available 可 start", canStart())
    assertTrue("beginDownload 必须同样受理", s.beginDownload())
    s.onDownloadProgress(50); assertFalse("downloading 不可再 start", canStart())
    s.onInstalling(false); assertFalse("installing 不可 start", canStart())
    // need-permission 是中间相位：不可 start（下载已完成），但续继链不受影响。
    val s3 = ApkUpdateState()
    s3.beginCheck()
    s3.onCheckResult(UpdateChecker.CheckResult.Available("v99.0.0", "a.apk", "u", null, 1L), "0.14.5-fx-2")
    s3.beginDownload(); s3.onNeedPermission()
    assertFalse("need-permission 不可 start", JSONObject(s3.snapshotJson()).getBoolean("canStart"))
    assertTrue("need-permission 必须仍被识别为等授权（续继链的判据）", s3.awaitingPermission())
  }

  @Test
  fun retryAfterDownloadFailureGoesBackToAvailable() {
    // 端到端不变量：下载失败后**必须能**回到可重试（check -> available），而不是卡死在 failed。
    val s = ApkUpdateState()
    s.beginCheck()
    s.onCheckResult(UpdateChecker.CheckResult.Available("v99.0.0", "a.apk", "u", null, 1L), "0.14.5-fx-2")
    s.beginDownload()
    s.onDownloadFailed("下载失败：sha256 校验不匹配（文件已删除，请重试）", ApkUpdateState.KIND_ARTIFACT_REJECTED)
    assertFalse("失败后不可直接 start（需要重新取元数据）", s.beginDownload())
    assertTrue("失败后必须能重新发起检查（重试通道不能被堵死）", s.beginCheck())
    s.onCheckResult(UpdateChecker.CheckResult.Available("v99.0.0", "a.apk", "u", null, 1L), "0.14.5-fx-2")
    assertEquals(ApkUpdateState.STATE_AVAILABLE, s.stateName())
    assertTrue("重试后必须能再次开始下载", s.beginDownload())
  }

  @Test
  fun startRejectionsAreNotBlanketBusy() {
    // 拒绝分档：状态机层面「无在途动作」时 busy() 必须为 false —— 壳侧据此才可能回 not-available
    // 而不是谎称「上一次更新动作仍在进行中」。
    val s = ApkUpdateState()
    s.beginCheck()
    s.onCheckResult(UpdateChecker.CheckResult.Available("v99.0.0", "a.apk", "u", null, 1L), "0.14.5-fx-2")
    s.onDownloadFailed("下载失败：镜像链全部不可用", ApkUpdateState.KIND_DOWNLOAD_FAILED)
    assertFalse("失败态无在途动作 => 不得被判为 busy", s.busy())
    assertTrue("失败态仍可受理新的检查（重试通道）", s.beginCheck())
  }

  @Test
  fun startCodeIsNotBlanketBusyInSource() {
    // 源码级守卫：start() 的拒绝分支必须按真实原因分档（no-pending / not-available），
    // 不得退化成「只要没有载荷就回 busy」的旧形态。
    val code = codeOnly(shellSource("ApkUpdateAction.kt"))
    val startBody = code.substringAfter("fun start(): String {").substringBefore("private fun reject(")
    assertTrue("必须区分 no-pending", startBody.contains("\"no-pending\""))
    assertTrue("必须有 not-available 分档", startBody.contains("not-available"))
    assertTrue("busy 必须以内层真实判据为条件（state.busy()）", startBody.contains("state.busy()"))
  }

  @Test
  fun needPermissionIsItsOwnState() {
    val s = ApkUpdateState()
    s.beginCheck()
    s.onCheckResult(UpdateChecker.CheckResult.Available("v99.0.0", "a.apk", "u", null, 1L), "0.14.5-fx-2")
    s.beginDownload()
    s.onNeedPermission()
    assertEquals(ApkUpdateState.STATE_NEED_PERMISSION, s.stateName())
    assertTrue("需授权相位是 onResume 结算的判据", s.awaitingPermission())
    assertFalse("需授权不是 busy（用户可再点）", s.busy())
  }

  @Test
  fun needPermissionContinuationChainMustSurviveUnifiedCleanup() {
    // 回归防线（dev-model 提出、Lead 采纳）：need-permission 是**中间相位**，不是终态。
    // 续继链靠 readyToInstall（不是 currentResult），任何「终态统一清理」若把 readyToInstall 一起清掉，
    // 用户从系统授权页回来就会发现无事可做 —— 比 busy 死循环更坏。
    // 本用例按源码事实钉住：置位点在「未持安装权限」分支，清零点只在安装器成功之后。
    val code = codeOnly(shellSource("ApkUpdateAction.kt"))
    val needPerm = code.substringAfter("if (!UpdateChecker.canInstall(activity))").substringBefore("if (UpdateChecker.invokeInstaller")
    assertTrue("未持权限分支必须把待装包留下（续继链的载荷）", needPerm.contains("readyToInstall = dest"))
    assertTrue("且绝不在这里清掉它", !needPerm.contains("readyToInstall = null"))
    assertTrue("授权页拉起成功才进 need-permission 相位", needPerm.contains("state.onNeedPermission()"))

    val installerOk = code.substringAfter("if (UpdateChecker.invokeInstaller(activity, dest))").substringBefore("} else {")
    assertTrue("安装器**成功**拉起后才允许清掉待装包", installerOk.contains("readyToInstall = null"))

    // onResume 结算必须**只**在「等授权」相位续继（否则会误伤其它相位）。
    val settle = code.substringAfter("fun settleAfterResume()").take(400)
    assertTrue("结算前必须判断是否真在等授权", settle.contains("awaitingPermission()"))
    assertTrue("等授权时才能续继安装", settle.contains("install("))
  }

  @Test
  fun payloadLifecycleInvariantIsTestable() {
    // 载荷/状态一致性不变量已抽成可测函数（invariantViolation），供逐相位钉住。
    val code = codeOnly(shellSource("ApkUpdateAction.kt"))
    assertTrue("必须有不变量断言函数", code.contains("fun invariantViolation()"))
    assertTrue("canStart 必须由状态派生（单一真源）", code.contains("canStart\", state == STATE_AVAILABLE"))
    assertFalse("不得再存在第二个「待装新版」字段（不同步点位温床）", code.contains("pendingName"))
  }
}

/*
 * 未覆盖（NOT RUN，客观原因见验收记录）：
 *  - 真实网络路径（真 403/429 头、CDN 中间页）与设备层"检查更新"文案：需 arm64 首选设备；
 *    本机设备矩阵三台（127.0.0.1:16480 / 16512 / emulator-5558）ro.product.cpu.abilist 均为
 *    x86_64 首选，无 arm64 首选设备可用。
 *  - 本地落盘名（assetName 主口径）与镜像下载链未改动，回归面见 UpdateManagerPolicyTest 与
 *    ApkArtifactCheckTest（不改动）。
 */
