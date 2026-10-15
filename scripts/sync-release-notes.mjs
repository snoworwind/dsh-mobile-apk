// sync-release-notes.mjs — sync local release/v*/notes.md into the GitHub release body (idempotent)
// Usage: $env:GH_TOKEN=<pat> node scripts/sync-release-notes.mjs [versions...] (default: all release/v*)
// Background: v0.10.2~v0.10.8 release bodies were written as placeholder templates by
// upload-release.mjs, with the real notes uploaded only as a notes.md asset. This script
// backfills the release body with the full notes.md so the GitHub page matches the attachment.
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
if (!token) { console.error('需要 GH_TOKEN（PAT）'); process.exit(1) }

/**
 * 发布目标仓库坐标（owner/repo）解析。
 *
 * 为什么不再写死：本仓是安全加固分支的 fork，写死上游坐标会去改别人仓库的 release body。
 * 优先级：DSH_REPO_SLUG > GITHUB_REPOSITORY > git origin；全取不到即判红，不猜。
 */
function resolveRepo(root, env = process.env) {
  let slug = env.DSH_REPO_SLUG || env.GITHUB_REPOSITORY || ''
  if (!slug) {
    try {
      const remote = execFileSync('git', ['-C', root, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim()
      const match = /github\.com[/:]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(remote)
      if (match) slug = match[1]
    } catch { /* 下面统一判红 */ }
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(slug)) throw new Error('无法确定发布目标仓库：设 DSH_REPO_SLUG=<owner>/<repo>，或在带 origin 远端的 git 检出内运行')
  return slug.split('/')
}
const [OWNER, REPO] = resolveRepo(root)

let tags = process.argv.slice(2)
if (tags.length === 0) tags = readdirSync(join(root, 'release')).filter(d => /^v[0-9]/.test(d)).sort()

async function api(path, opts = {}) {
  const r = await fetch('https://api.github.com' + path, {
    ...opts,
    headers: { authorization: 'Bearer ' + token, 'user-agent': 'dsh-release-sync', ...(opts.headers || {}) },
  })
  const text = await r.text()
  return { status: r.status, json: text ? JSON.parse(text) : null }
}

let changed = 0, skipped = 0, failed = 0
for (const tag of tags) {
  const notesPath = join(root, 'release', tag, 'notes.md')
  if (!existsSync(notesPath)) { console.log(tag + ': 无本地 notes.md，跳过'); skipped++; continue }
  const body = readFileSync(notesPath, 'utf8').trim()
  const rel = await api('/repos/' + OWNER + '/' + REPO + '/releases/tags/' + tag)
  if (rel.status !== 200) { console.error(tag + ': release 不存在（HTTP ' + rel.status + '）'); failed++; continue }
  const wantName = 'dsh-mobile ' + tag
  if (rel.json.body === body && rel.json.name === wantName) {
    console.log(tag + ': body/name 已一致，跳过'); skipped++; continue
  }
  const patched = await api('/repos/' + OWNER + '/' + REPO + '/releases/' + rel.json.id, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: wantName, body }),
  })
  if (patched.status === 200) {
    console.log(tag + ': body 已更新（' + body.length + ' 字符，' + body.split('\n').length + ' 行）')
    changed++
  } else {
    console.error(tag + ': PATCH 失败 HTTP ' + patched.status + ' ' + JSON.stringify(patched.json))
    failed++
  }
}
console.log('== 完成: 更新 ' + changed + '，跳过 ' + skipped + '，失败 ' + failed)
process.exit(failed > 0 ? 1 : 0)
