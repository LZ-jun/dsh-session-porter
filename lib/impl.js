/**
 * dsh-session-porter — Host half
 *
 * 把本机所有对话导出到一个「你指定的目录」（OneDrive / 坚果云 / U 盘都行），
 * 另一台电脑上再从同一个目录一键导入，于是对话可以跟着人走。
 *
 * 设计要点：
 *   · 会话仓库布局与官方 `session-persistence-jsonl` 完全一致：
 *       <root>/--<编码后的 cwd>--/session-<id>/session.v<版本>.jsonl[.zstd]
 *     目录名编码规则与官方一致（非 [A-Za-z0-9._-] 一律 `~XXXX`），所以导入的
 *     会话对官方读取器来说就是「本来就在那儿」的普通会话。
 *   · 导出目录是纯文本 JSONL + meta.json，方便直接翻看、用 Git 或网盘做版本。
 *   · 导入时若本机存在同一个工作区路径，就放回原工作区；否则改写到当前工作区，
 *     保证侧栏里点得开。
 *   · 不依赖任何第三方包：zstd 用 Node 内置的 zlib（Node ≥ 22.15），
 *     缺失时自动退回未压缩的 `.jsonl`（官方读取器同样接受）。
 *
 * 安全：所有写操作只接受本机回环地址 + 同源请求；导出的文件只落在用户
 * 明确设定的目录里，不向外发送任何内容。
 */
import { readdirSync, statSync } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import zlib from 'node:zlib'

export const name = 'dsh-session-porter'

/** 客户端拉取状态 / 触发动作的路由前缀。 */
const ROUTE_PREFIX = '/dsh-session-porter'
/** 导出目录里每份会话的容器目录名。 */
const BUNDLE_DIR = 'sessions'
/** 插件自己的配置文件（与 sessions 目录同级）。 */
const CONFIG_FILE = 'session-porter.json'
/** 改名前的配置文件，读到就继续用（不迁移、不改写）。 */
const LEGACY_CONFIG_FILE = 'session-sync.json'
/** 导出目录里写一份清单，方便人肉确认「这个目录是 DSH 同步目录」。 */
const MANIFEST_FILE = 'dsh-session-porter.json'
/** 插件清单（作者、安装地址等），跟会话一起导出，方便换机时照着装。 */
const PLUGINS_FILE = 'plugins.json'
const SCHEMA = 'dsh-session-porter/v1'
/** 客户端最近一次上报的布局（进程内，重启即失效）。 */
let lastLayout = null
/** 自定义请求头，配合同源校验挡住跨站表单提交。 */
const TRUST_HEADER = 'x-dsh-session-porter'
const DEFAULT_FOLDER_NAME = 'DSH-Sessions'
/** 官方会话日志文件名。 */
const LOG_NAME = /^session(?:\.v([1-9][0-9]*))?\.jsonl(?:\.zstd)?$/
/** 附件 id 是 64 位十六进制。 */
const ATTACHMENT_ID = /"attachmentId"\s*:\s*"([0-9a-f]{64})"/g

const HAS_ZSTD =
  typeof zlib.zstdCompressSync === 'function' && typeof zlib.zstdDecompressSync === 'function'

// ───────────────────────────── 路径与编码 ─────────────────────────────

/**
 * 与官方一致的目录名编码：只保留 [A-Za-z0-9._-]，其余按 UTF-16 码元写成 `~XXXX`。
 */
function encodeSegment(text) {
  return String(text).replace(
    /[^A-Za-z0-9._-]/g,
    (ch) => `~${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
  )
}

/** `C:\a\b` → `--C-a-b--`（与官方 project 目录名逐字一致）。 */
function projectSegment(cwd) {
  if (typeof cwd !== 'string' || cwd === '') return '_no-cwd'
  const readable = encodeSegment(cwd.replace(/[\\/:]+/g, '-')).replace(/^-+/, '') || 'root'
  return `--${readable.slice(0, 251)}--`
}

/** 会话仓库根目录（优先向官方服务要，拿不到再按默认布局推断）。 */
function sessionRoot(ctx) {
  const persistence = getService(ctx, 'sessionPersistence')
  const configured =
    persistence && typeof persistence === 'object'
      ? persistence.root ?? persistence.config?.root
      : undefined
  if (typeof configured === 'string' && isAbsolute(configured)) return resolve(configured)
  return resolve(join(homedir(), '.dsh', 'sessions'))
}

function homeDir(ctx) {
  return dirname(sessionRoot(ctx))
}

function configPath(ctx) {
  return join(homeDir(ctx), CONFIG_FILE)
}

function attachmentsRoot(ctx) {
  return join(homeDir(ctx), 'attachments', 'v1', 'objects')
}

function normalizePath(value) {
  if (typeof value !== 'string' || value === '') return ''
  const resolved = resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function getService(ctx, key) {
  if (!ctx || typeof ctx.get !== 'function') return undefined
  try {
    return ctx.get(key)
  } catch {
    return undefined
  }
}

// ───────────────────────────── 配置 ─────────────────────────────

function oneDriveRoot() {
  for (const key of ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial', 'OneDriveDir']) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return null
}

/** 首次使用时的建议目录：有 OneDrive 就放 OneDrive，否则放 DSH 家目录。 */
function defaultExportDir(ctx) {
  const oneDrive = oneDriveRoot()
  if (oneDrive !== null) return join(oneDrive, DEFAULT_FOLDER_NAME)
  return join(homeDir(ctx), DEFAULT_FOLDER_NAME)
}

async function readConfig(ctx, seed = {}) {
  const fallback = {
    exportDir: '',
    importCwd: '',
    includePlugins: true,
    lastExportedAt: null,
    lastImportedAt: null,
  }
  if (typeof seed.exportDir === 'string' && seed.exportDir.trim() !== '') {
    fallback.exportDir = seed.exportDir.trim()
  }
  // 先读新文件名；插件改名前装过的用户，旧文件还在，能直接沿用。
  for (const file of [CONFIG_FILE, LEGACY_CONFIG_FILE]) {
    let raw = ''
    try {
      raw = await readFile(join(homeDir(ctx), file), 'utf8')
    } catch {
      continue
    }
    let parsed = null
    try {
      parsed = JSON.parse(raw)
    } catch {
      continue
    }
    if (!parsed || typeof parsed !== 'object') continue
    return {
      exportDir:
        typeof parsed.exportDir === 'string' && parsed.exportDir.trim() !== ''
          ? parsed.exportDir.trim()
          : fallback.exportDir,
      importCwd: typeof parsed.importCwd === 'string' ? parsed.importCwd.trim() : '',
      includePlugins: typeof parsed.includePlugins === 'boolean' ? parsed.includePlugins : true,
      lastExportedAt: Number.isFinite(parsed.lastExportedAt) ? parsed.lastExportedAt : null,
      lastImportedAt: Number.isFinite(parsed.lastImportedAt) ? parsed.lastImportedAt : null,
    }
  }
  return fallback
}

async function writeConfig(ctx, next) {
  const path = configPath(ctx)
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temp, `${JSON.stringify({ schema: SCHEMA, ...next }, null, 2)}\n`, 'utf8')
  await rename(temp, path)
}

function effectiveExportDir(ctx, cfg) {
  const raw = cfg.exportDir !== '' ? cfg.exportDir : defaultExportDir(ctx)
  // 允许 `~/xxx` 这种写法，Windows 上也接受正斜杠。
  if (raw === '~' || raw.startsWith('~/') || raw.startsWith('~\\')) {
    return resolve(join(homedir(), raw.slice(2)))
  }
  return resolve(raw)
}

// ───────────────────────────── 会话日志读写 ─────────────────────────────

async function findLogFile(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return null
  }
  const names = entries
    .filter((entry) => entry.isFile() && LOG_NAME.test(entry.name))
    .map((entry) => entry.name)
    .sort()
  if (names.length === 0) return null
  // 理论上每个会话目录只有一个日志文件；有多个时优先压缩版本（更新的格式）。
  const preferred = names.find((entry) => entry.endsWith('.zstd')) ?? names[0]
  return { path: join(dir, preferred), compressed: preferred.endsWith('.zstd') }
}

// ─── zstd：官方日志是「一帧一帧追加」的（每帧一个 zstd frame，魔术字 28 B5 2F FD）。
//     Node 内置解码器只解第一帧，所以这里自己按帧走，才能拿到完整对话。 ───

function parseHeader(text) {
  const newline = text.indexOf('\n')
  const line = newline === -1 ? text : text.slice(0, newline)
  const header = JSON.parse(line)
  if (!header || header.type !== 'session' || typeof header.id !== 'string') {
    throw new Error('会话日志缺少有效的文件头')
  }
  return { header, headerLine: line }
}

function replaceHeaderLine(text, header) {
  const newline = text.indexOf('\n')
  const rest = newline === -1 ? '' : text.slice(newline)
  return `${JSON.stringify(header)}${rest}`
}

const ZSTD_MAGIC = 0xfd2fb528
const ZSTD_SKIP_MIN = 0x184d2a50
const ZSTD_SKIP_MAX = 0x184d2a5f

/** 从 start 开始这一帧的总字节数；认不出来返回 -1。 */
function zstdFrameLength(buffer, start) {
  if (start + 4 > buffer.length) return -1
  const magic = buffer.readUInt32LE(start)
  if (magic >= ZSTD_SKIP_MIN && magic <= ZSTD_SKIP_MAX) {
    if (start + 8 > buffer.length) return -1
    return 8 + buffer.readUInt32LE(start + 4)
  }
  if (magic !== ZSTD_MAGIC) return -1
  let at = start + 4
  const descriptor = buffer[at++]
  const contentSizeCode = descriptor >> 6
  const singleSegment = (descriptor >> 5) & 1
  const checksum = (descriptor >> 2) & 1
  const dictionarySize = [0, 1, 2, 4][descriptor & 3]
  const contentSize = singleSegment ? [1, 2, 4, 8][contentSizeCode] : [0, 2, 4, 8][contentSizeCode]
  if (singleSegment === 0) at += 1
  at += dictionarySize + contentSize
  for (;;) {
    if (at + 3 > buffer.length) return -1
    const header = buffer[at] | (buffer[at + 1] << 8) | (buffer[at + 2] << 16)
    const last = header & 1
    const type = (header >> 1) & 3
    const size = header >> 3
    at += 3
    if (type === 0) at += size
    else if (type === 1) at += 1
    else if (type === 2) at += size
    else return -1
    if (last === 1) break
  }
  if (checksum === 1) at += 4
  return at > buffer.length ? -1 : at - start
}

/**
 * 依次解开每一帧。遇到解不开的尾巴（会话正在写入时的半帧）就停在那里，
 * 返回已经解出来的部分，`torn` 标记这份日志当时还没写完。
 */
function decompressAllFrames(buffer) {
  const parts = []
  let offset = 0
  let torn = false
  while (offset < buffer.length) {
    const length = zstdFrameLength(buffer, offset)
    if (length <= 0) {
      // 认不出帧头：把剩下的整段交给解码器试一次，失败就当作尾部撕裂。
      try {
        parts.push(zlib.zstdDecompressSync(buffer.subarray(offset)))
      } catch {
        torn = true
      }
      break
    }
    try {
      parts.push(zlib.zstdDecompressSync(buffer.subarray(offset, offset + length)))
    } catch {
      torn = true
      break
    }
    offset += length
  }
  return { text: Buffer.concat(parts).toString('utf8'), torn }
}

function textOf(buffer, compressed) {
  if (!compressed) return buffer.toString('utf8')
  if (!HAS_ZSTD) throw new Error('当前 Node 运行时不支持 zstd 解压')
  return decompressAllFrames(buffer).text
}

/** 只解第一帧就够拿到文件头（文件头永远是最先写的那一帧）。 */
function headerOfBuffer(buffer, compressed) {
  if (!compressed) return parseHeader(buffer.toString('utf8'))
  if (!HAS_ZSTD) throw new Error('当前 Node 运行时不支持 zstd 解压')
  const length = zstdFrameLength(buffer, 0)
  if (length > 0) {
    try {
      return parseHeader(zlib.zstdDecompressSync(buffer.subarray(0, length)).toString('utf8'))
    } catch {
      /* 文件头跨帧的罕见情况走整体解码 */
    }
  }
  return parseHeader(textOf(buffer, true))
}

/**
 * 改写文件头的 cwd。第一帧通常只装文件头，这时重建第一帧、其余帧原样拼接，
 * 不必解码整份日志；否则整份解码后重压。
 */
function rewriteHeader(buffer, compressed, header) {
  const line = JSON.stringify(header)
  if (!compressed) {
    return { buffer: Buffer.from(replaceHeaderLine(buffer.toString('utf8'), header), 'utf8'), compressed: false }
  }
  if (!HAS_ZSTD) throw new Error('当前 Node 运行时不支持 zstd 压缩')
  const length = zstdFrameLength(buffer, 0)
  if (length > 0) {
    try {
      const first = zlib.zstdDecompressSync(buffer.subarray(0, length)).toString('utf8')
      const newline = first.indexOf('\n')
      if (newline !== -1 && first.slice(newline + 1) === '') {
        const frame = zlib.zstdCompressSync(Buffer.from(`${line}\n`, 'utf8'))
        return { buffer: Buffer.concat([frame, buffer.subarray(length)]), compressed: true }
      }
    } catch {
      /* 走兜底 */
    }
  }
  const text = replaceHeaderLine(textOf(buffer, true), header)
  return { buffer: zlib.zstdCompressSync(Buffer.from(text, 'utf8')), compressed: true }
}

/** 写回官方仓库：文件名与格式版本对齐，压缩与否保持原样。 */
async function writeSessionLog(dir, header, buffer, compressed) {
  await mkdir(dir, { recursive: true })
  const version = Number.isFinite(header.version) ? header.version : 4
  const file = join(dir, `session.v${version}.jsonl${compressed ? '.zstd' : ''}`)
  await writeFile(file, buffer)
  return file
}

function collectAttachmentIds(text) {
  const ids = new Set()
  ATTACHMENT_ID.lastIndex = 0
  let match
  while ((match = ATTACHMENT_ID.exec(text)) !== null) ids.add(match[1])
  return [...ids]
}

/** 逐帧扫附件 id，避免为了找附件把整份日志留在内存里。 */
function collectAttachmentIdsFromBuffer(buffer, compressed) {
  if (!compressed) return collectAttachmentIds(buffer.toString('utf8'))
  if (!HAS_ZSTD) return []
  const ids = new Set()
  let offset = 0
  while (offset < buffer.length) {
    const length = zstdFrameLength(buffer, offset)
    if (length <= 0) break
    let text
    try {
      text = zlib.zstdDecompressSync(buffer.subarray(offset, offset + length)).toString('utf8')
    } catch {
      break
    }
    for (const id of collectAttachmentIds(text)) ids.add(id)
    offset += length
  }
  return [...ids]
}

async function exportAttachments(ctx, ids, bundleDir) {
  if (ids.length === 0) return 0
  const root = attachmentsRoot(ctx)
  let copied = 0
  for (const id of ids) {
    const source = join(root, id.slice(0, 2), id)
    if (!statSyncSafe(source)) continue
    const targetDir = join(bundleDir, 'attachments')
    await mkdir(targetDir, { recursive: true })
    await copyFile(source, join(targetDir, id))
    copied += 1
  }
  return copied
}

async function importAttachments(ctx, bundleDir) {
  const dir = join(bundleDir, 'attachments')
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  const root = attachmentsRoot(ctx)
  let copied = 0
  for (const entry of entries) {
    if (!entry.isFile() || !/^[0-9a-f]{64}$/.test(entry.name)) continue
    const target = join(root, entry.name.slice(0, 2), entry.name)
    if (statSyncSafe(target)) continue
    await mkdir(dirname(target), { recursive: true })
    await copyFile(join(dir, entry.name), target)
    copied += 1
  }
  return copied
}

function statSyncSafe(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

// ───────────────────────────── 会话清单 ─────────────────────────────

/**
 * 列出本机会话（活着的优先由 sessionQuery 提供），按官方顺序：最新在前。
 * 返回 `{ header, live }`。
 */
async function listLocalSessions(ctx) {
  const query = getService(ctx, 'sessionQuery')
  if (query && typeof query.listSessions === 'function') {
    const records = await query.listSessions()
    return records.map((record) => ({ header: record.header, live: record.live === true }))
  }
  const persistence = getService(ctx, 'sessionPersistence')
  if (persistence && typeof persistence.list === 'function') {
    const snapshots = await persistence.list()
    return snapshots.map((snapshot) => ({ header: snapshot.header, live: false }))
  }
  throw new Error('会话服务尚未就绪')
}

function isSyncable(session) {
  const header = session.header
  if (!header || typeof header.id !== 'string') return false
  // 子代理会话是内部派生数据，跟人走没有意义，反而会污染侧栏。
  return header.origin !== 'subagent'
}

/** 当前工作目录：活着的会话 → 最新的会话 → 官方默认目录。 */
async function currentCwd(ctx) {
  try {
    const sessions = await listLocalSessions(ctx)
    const live = sessions.find((session) => session.live && session.header.cwd)
    if (live) return live.header.cwd
    const newest = sessions.find((session) => session.header.cwd)
    if (newest) return newest.header.cwd
  } catch {
    /* 落到下面的兜底 */
  }
  const workingDirectory = getService(ctx, 'workingDirectory')
  if (workingDirectory && typeof workingDirectory.defaultDirectory === 'string') {
    return workingDirectory.defaultDirectory
  }
  return process.cwd()
}

/** 导入目标工作区：手动指定的优先；本机存在同一个工作区就放回去；否则落到当前工作区。 */
async function resolveImportCwd(ctx, cfg, metaCwd) {
  if (cfg && typeof cfg.importCwd === 'string' && cfg.importCwd !== '' && isDirectory(cfg.importCwd)) {
    return cfg.importCwd
  }
  if (typeof metaCwd === 'string' && metaCwd !== '' && isDirectory(metaCwd)) {
    const registry = getService(ctx, 'workspaceRegistry')
    let registered = []
    try {
      const list = registry && typeof registry.list === 'function' ? registry.list() : []
      registered = list
        .map((workspace) => workspace.path ?? workspace.directory ?? workspace.root ?? '')
        .filter((path) => typeof path === 'string' && path !== '')
    } catch {
      registered = []
    }
    const wanted = normalizePath(metaCwd)
    const hit = registered.find((path) => normalizePath(path) === wanted)
    if (hit) return metaCwd
  }
  return currentCwd(ctx)
}

/** 让侧栏的对应工作区立刻认领这些新会话（索引重建前也能看见）。 */
async function attachToWorkspace(ctx, cwd, ids) {
  if (ids.length === 0 || typeof cwd !== 'string' || cwd === '') return
  const registry = getService(ctx, 'workspaceRegistry')
  if (!registry) return
  let workspace = null
  try {
    if (typeof registry.resolveByPath === 'function') workspace = await registry.resolveByPath(cwd)
  } catch {
    workspace = null
  }
  if (!workspace) {
    try {
      const list = registry.list()
      const wanted = normalizePath(cwd)
      workspace = list.find((entry) => normalizePath(entry.path) === wanted) ?? null
    } catch {
      workspace = null
    }
  }
  if (!workspace || typeof workspace.attachSession !== 'function') return
  for (const id of ids) {
    try {
      await workspace.attachSession(id)
    } catch {
      /* 已经挂在某个工作区时忽略 */
    }
  }
}

// ───────────────────────── 插件清单（只导出，不导入） ─────────────────────────

function localizeText(value) {
  if (typeof value === 'string') return value.trim()
  if (value !== null && typeof value === 'object') {
    for (const key of ['zh', 'zh-CN', 'zh-cn', 'en']) {
      const text = value[key]
      if (typeof text === 'string' && text.trim() !== '') return text.trim()
    }
    for (const text of Object.values(value)) {
      if (typeof text === 'string' && text.trim() !== '') return text.trim()
    }
  }
  return ''
}

function authorText(author) {
  if (typeof author === 'string') return author.trim()
  if (author !== null && typeof author === 'object') {
    const name = typeof author.name === 'string' ? author.name.trim() : ''
    const extra = [author.email, author.url]
      .filter((value) => typeof value === 'string' && value.trim() !== '')
      .map((value) => value.trim())
      .join(' ')
    if (name !== '' && extra !== '') return name + ' <' + extra + '>'
    return name !== '' ? name : extra
  }
  return ''
}

function repositoryText(repository) {
  if (typeof repository === 'string') return repository
  if (repository !== null && typeof repository === 'object' && typeof repository.url === 'string') {
    return repository.url
  }
  return ''
}

function listPackageNames(nodeModules) {
  const names = []
  let entries
  try {
    entries = readdirSync(nodeModules, { withFileTypes: true })
  } catch {
    return names
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.name.startsWith('@')) {
      let scoped = []
      try {
        scoped = readdirSync(join(nodeModules, entry.name), { withFileTypes: true })
      } catch {
        scoped = []
      }
      for (const child of scoped) {
        if (!child.name.startsWith('.')) names.push(entry.name + '/' + child.name)
      }
      continue
    }
    names.push(entry.name)
  }
  return names
}

async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

function profileDirs() {
  const base = join(homedir(), '.dsh', 'profiles')
  try {
    return readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(base, entry.name))
  } catch {
    return []
  }
}

/** 当前 profile 里装着的插件：名字、版本、作者、安装位置与安装来源。 */
async function collectPlugins(ctx) {
  const rows = new Map()
  const manager = getService(ctx, 'pluginManager')
  if (manager && typeof manager.listPlugins === 'function') {
    try {
      for (const row of await manager.listPlugins()) {
        const key = typeof row.moduleName === 'string' ? row.moduleName : ''
        if (key !== '') rows.set(key, row)
      }
    } catch {
      /* 管理器不可用就只按文件系统列 */
    }
  }

  const found = new Map()
  for (const profile of profileDirs()) {
    const profileName = profile.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''
    const profileManifest = await readJsonFile(join(profile, 'package.json'))
    const dependencies =
      profileManifest !== null && typeof profileManifest.dependencies === 'object'
        ? profileManifest.dependencies
        : {}
    const nodeModules = join(profile, 'node_modules')
    for (const name of listPackageNames(nodeModules)) {
      const dir = join(nodeModules, name)
      const pkg = await readJsonFile(join(dir, 'package.json'))
      if (pkg === null) continue
      // 只收真正声明了 dsh 能力（bundle / client）的包，普通依赖不算插件。
      if (pkg.dsh === undefined || pkg.dsh === null) continue
      if (found.has(name)) continue
      const row = rows.get(name)
      found.set(name, {
        name,
        title: localizeText(pkg.displayName) || localizeText(pkg.dsh?.title),
        version: typeof pkg.version === 'string' ? pkg.version : '',
        description: typeof pkg.description === 'string' ? pkg.description : '',
        author: authorText(pkg.author),
        license: typeof pkg.license === 'string' ? pkg.license : '',
        homepage: typeof pkg.homepage === 'string' ? pkg.homepage : '',
        repository: repositoryText(pkg.repository),
        keywords: Array.isArray(pkg.keywords)
          ? pkg.keywords.filter((keyword) => typeof keyword === 'string')
          : [],
        kind: [
          pkg.dsh?.bundle === undefined ? '' : 'bundle',
          pkg.dsh?.client === undefined ? '' : 'client',
        ]
          .filter((part) => part !== '')
          .join('+'),
        installPath: dir,
        installSource: typeof dependencies[name] === 'string' ? dependencies[name] : '',
        profile: profileName,
        enabled: row === undefined ? null : row.enabled === true,
      })
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name))
}

async function writePluginSnapshot(ctx, target) {
  const plugins = await collectPlugins(ctx)
  const payload = {
    schema: SCHEMA + '/plugins',
    exportedAt: Date.now(),
    exportedBy: name,
    count: plugins.length,
    note: '本文件由 dsh-session-porter 生成，只记录插件信息，不会被导入。',
    plugins,
  }
  await writeFile(join(target, PLUGINS_FILE), JSON.stringify(payload, null, 2) + NEWLINE, 'utf8')
  return plugins.length
}

// ───────────────────────── 会话描述（清单） ─────────────────────────

const NEWLINE = String.fromCharCode(10)
const EMPTY_LOG_HARD_LIMIT = 256 * 1024
/** 真正「聊过」的标志：用户或助手发过消息。只有权限/模型/命令事件的空壳不算。 */
const CONVERSATION_EVENT = /"type"\s*:\s*"(?:user|assistant)\/message"/
/** 「这份日志有没有聊过天」的结论缓存（按路径 + 体积）。 */
const EMPTY_CACHE = new Map()

function textLineCount(text) {
  let count = 0
  let index = 0
  while (index < text.length) {
    const newline = text.indexOf(NEWLINE, index)
    const end = newline === -1 ? text.length : newline
    if (end > index) count += 1
    if (newline !== -1) index = newline + 1
    else break
  }
  return count
}

/**
 * 空会话 = 从头到尾没有一句 user/assistant 消息。
 * 典型的就是点了个命令、切了下模型就关掉的会话，或者被删剩下的空壳。
 */
async function logIsEmpty(file, bytes) {
  // 256 KB 以上的会话不可能「一句话都没有」，直接放过，省掉解码。
  if (bytes > EMPTY_LOG_HARD_LIMIT) return false
  // 同一份文件按 路径+体积 记住结论：面板反复打开不用重复解压。
  const key = file.path + '|' + bytes
  const cached = EMPTY_CACHE.get(key)
  if (cached !== undefined) return cached
  const remember = (value) => {
    if (EMPTY_CACHE.size > 512) EMPTY_CACHE.clear()
    EMPTY_CACHE.set(key, value)
    return value
  }
  const buffer = await readFile(file.path)
  if (!file.compressed) return remember(!CONVERSATION_EVENT.test(buffer.toString('utf8')))
  if (!HAS_ZSTD) return false
  let offset = 0
  let text = ''
  let frames = 0
  while (offset < buffer.length && frames < 64) {
    const length = zstdFrameLength(buffer, offset)
    if (length <= 0) break
    let chunk
    try {
      chunk = zlib.zstdDecompressSync(buffer.subarray(offset, offset + length)).toString('utf8')
    } catch {
      break
    }
    text += chunk
    // 一帧里可能只有半行，所以拼起来再判断。
    if (CONVERSATION_EVENT.test(text)) return remember(false)
    offset += length
    frames += 1
    if (text.length > EMPTY_LOG_HARD_LIMIT) break
  }
  return remember(!CONVERSATION_EVENT.test(text))
}

/** 本机会话清单：文件头 + 有没有内容 + 体积 + 改动时间。 */
async function describeLocalSessions(ctx) {
  const sessions = (await listLocalSessions(ctx)).filter(isSyncable)
  const titles = await readTitles(
    ctx,
    sessions.map((session) => session.header.id),
  )
  const root = sessionRoot(ctx)
  const out = []
  for (const session of sessions) {
    const header = session.header
    const cwd = typeof header.cwd === 'string' ? header.cwd : ''
    const dir = join(root, projectSegment(cwd), encodeSegment(header.id))
    const file = await findLogFile(dir)
    let bytes = 0
    let updatedAt = Number.isFinite(header.createdAt) ? header.createdAt : 0
    let empty = true
    if (file !== null) {
      try {
        const info = await stat(file.path)
        bytes = info.size
        updatedAt = info.mtimeMs
        empty = await logIsEmpty(file, bytes)
      } catch {
        empty = true
      }
    }
    out.push({
      header,
      live: session.live === true,
      title: titles.get(header.id) ?? '',
      bytes,
      empty,
      updatedAt,
    })
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

/** 文件夹里的会话清单（只读 meta.json，不解日志）。 */
async function describeBundles(target) {
  const out = []
  for (const bundle of await listBundles(target)) {
    const meta = await readBundleMeta(bundle.dir)
    const bytes = Number.isFinite(meta.bytes) ? meta.bytes : 0
    // 老包里的 empty 字段是按旧规则算的，一律就地重算，省得把空壳当正常会话。
    const empty = await bundleIsEmpty(bundle.dir)
    out.push({
      id: bundle.id,
      title: typeof meta.title === 'string' ? meta.title : '',
      cwd: typeof meta.cwd === 'string' ? meta.cwd : '',
      exportedAt: Number.isFinite(meta.exportedAt) ? meta.exportedAt : 0,
      bytes,
      empty,
    })
  }
  return out.sort((a, b) => b.exportedAt - a.exportedAt)
}

async function bundleIsEmpty(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return true
  }
  const log = entries.find((entry) => entry.isFile() && LOG_NAME.test(entry.name))
  if (log === undefined) return true
  const path = join(dir, log.name)
  try {
    const info = await stat(path)
    return await logIsEmpty({ path, compressed: log.name.endsWith('.zstd') }, info.size)
  } catch {
    return true
  }
}

// ───────────────────────────── 导出 ─────────────────────────────

async function exportAll(ctx, cfg, options = {}) {
  const target = effectiveExportDir(ctx, cfg)
  const bundleRoot = join(target, BUNDLE_DIR)
  await mkdir(bundleRoot, { recursive: true })

  const persistence = getService(ctx, 'sessionPersistence')
  if (persistence && typeof persistence.flush === 'function') {
    try {
      await persistence.flush()
    } catch {
      /* flush 失败不影响「读已经落盘的部分」 */
    }
  }

  const onlyId = typeof options.sessionId === 'string' && options.sessionId !== ''
  const wanted = Array.isArray(options.ids) && options.ids.length > 0 ? new Set(options.ids) : null
  const all = await describeLocalSessions(ctx)
  const selected = all.filter((session) => {
    const id = session.header.id
    if (onlyId && id !== options.sessionId) return false
    if (wanted !== null) return wanted.has(id)
    // 一键导出不带走空会话；显式点名时才导出空会话。
    return onlyId ? true : session.empty === false
  })
  if (onlyId && selected.length === 0) throw new Error('找不到要导出的会话')
  const root = sessionRoot(ctx)
  const exported = []
  const failed = []
  let attachments = 0

  for (const session of selected) {
    const header = session.header
    try {
      const dir = join(root, projectSegment(header.cwd), encodeSegment(header.id))
      const file = await findLogFile(dir)
      if (file === null) {
        failed.push({ id: header.id, error: '本机还没有落盘的会话日志' })
        continue
      }
      const raw = await readFile(file.path)
      const parsed = headerOfBuffer(raw, file.compressed)
      if (parsed.header.id !== header.id) throw new Error('会话文件头与清单不一致')
      const bundleDir = join(bundleRoot, encodeSegment(header.id))
      await rm(bundleDir, { recursive: true, force: true })
      await mkdir(bundleDir, { recursive: true })
      const version = Number.isFinite(header.version) ? header.version : 4
      await writeFile(
        join(bundleDir, `session.v${version}.jsonl${file.compressed ? '.zstd' : ''}`),
        raw,
      )
      attachments += await exportAttachments(
        ctx,
        collectAttachmentIdsFromBuffer(raw, file.compressed),
        bundleDir,
      )
      const meta = {
        schema: SCHEMA,
        id: header.id,
        title: session.title === '' ? null : session.title,
        cwd: typeof header.cwd === 'string' ? header.cwd : null,
        createdAt: Number.isFinite(header.createdAt) ? header.createdAt : null,
        agentPreset: typeof header.agentPreset === 'string' ? header.agentPreset : null,
        formatVersion: version,
        compressed: file.compressed,
        empty: session.empty === true,
        live: session.live === true,
        bytes: raw.length,
        exportedAt: Date.now(),
        exportedBy: name,
      }
      await writeFile(join(bundleDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
      exported.push(header.id)
    } catch (error) {
      failed.push({ id: header.id, error: errorMessage(error) })
    }
  }

  const lastExportedAt = Date.now()
  let plugins = 0
  if (cfg.includePlugins !== false) {
    try {
      plugins = await writePluginSnapshot(ctx, target)
    } catch {
      /* 清单写失败不影响会话导出 */
    }
  }
  // 顺手清掉目录里从没聊过天的空壳包（只有权限/模型事件的会话）。
  let pruned = 0
  try {
    for (const bundle of await listBundles(target)) {
      if (await bundleIsEmpty(bundle.dir)) {
        await rm(bundle.dir, { recursive: true, force: true })
        pruned += 1
      }
    }
  } catch {
    /* 清不掉也不影响这次导出 */
  }
  await writeManifest(target, { lastExportedAt })
  await writeConfig(ctx, { ...cfg, lastExportedAt })

  return {
    ok: true,
    plugin: name,
    dir: target,
    total: selected.length,
    exported: exported.length,
    plugins,
    pruned,
    skipped: Math.max(0, selected.length - exported.length - failed.length),
    attachments,
    failed,
    at: lastExportedAt,
  }
}

async function readTitles(ctx, ids) {
  const titles = new Map()
  const query = getService(ctx, 'sessionQuery')
  if (!query || typeof query.readTitleSnapshots !== 'function' || ids.length === 0) return titles
  try {
    const results = await query.readTitleSnapshots(ids)
    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      const title = result.value?.title?.title
      if (typeof title === 'string' && title.trim() !== '') titles.set(result.sessionId, title)
    }
  } catch {
    /* 标题只是锦上添花 */
  }
  return titles
}

async function writeManifest(target, patch) {
  const path = join(target, MANIFEST_FILE)
  let current = {}
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    if (parsed && typeof parsed === 'object') current = parsed
  } catch {
    current = {}
  }
  const next = {
    schema: SCHEMA,
    plugin: name,
    purpose: 'DeepSeek Harness 会话同步目录 / session sync folder',
    ...current,
    ...patch,
    updatedAt: Date.now(),
  }
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
}

// ───────────────────────────── 导入 ─────────────────────────────

async function listBundles(target) {
  const root = join(target, BUNDLE_DIR)
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ id: entry.name, dir: join(root, entry.name) }))
}

async function importAll(ctx, cfg, options = {}) {
  const target = effectiveExportDir(ctx, cfg)
  if (!isDirectory(target)) throw new Error(`导出目录不存在：${target}`)

  const bundles = await listBundles(target)
  if (bundles.length === 0) {
    return {
      ok: true,
      plugin: name,
      dir: target,
      total: 0,
      imported: 0,
      overwritten: 0,
      skipped: 0,
      attachments: 0,
      failed: [],
      at: Date.now(),
    }
  }

  const existing = new Set()
  const localById = new Map()
  for (const session of await listLocalSessions(ctx)) {
    existing.add(session.header.id)
    localById.set(session.header.id, session)
  }

  const root = sessionRoot(ctx)
  const onlyIds =
    Array.isArray(options.ids) && options.ids.length > 0 ? new Set(options.ids) : null
  const overwrite = options.overwrite === true
  const imported = []
  const overwritten = []
  const failed = []
  const byCwd = new Map()
  let skipped = 0
  let attachments = 0

  for (const bundle of bundles) {
    if (onlyIds !== null && !onlyIds.has(bundle.id)) continue
    try {
      // 空壳（一句人话都没有）不导回来，省得又把 1 KB 的垃圾装一堆。
      if (await bundleIsEmpty(bundle.dir)) {
        skipped += 1
        continue
      }
      const meta = await readBundleMeta(bundle.dir)
      const bundleData = await readBundle(bundle.dir)
      const header = bundleData.header
      if (header.id !== bundle.id) {
        throw new Error(`会话 id 与目录名不一致：${header.id}`)
      }
      const isExisting = existing.has(header.id)
      if (isExisting && !overwrite) {
        skipped += 1
        continue
      }
      const local = isExisting ? localById.get(header.id) : null
      if (local !== null && local !== undefined && local.live === true) {
        throw new Error('这个会话正在使用中，先关掉再覆盖')
      }
      const cwd = await resolveImportCwd(ctx, cfg, meta.cwd ?? header.cwd)
      const nextHeader = { ...header }
      if (typeof cwd === 'string' && cwd !== '' && nextHeader.cwd !== cwd) nextHeader.cwd = cwd
      const written =
        nextHeader.cwd === header.cwd
          ? { buffer: bundleData.buffer, compressed: bundleData.compressed }
          : rewriteHeader(bundleData.buffer, bundleData.compressed, nextHeader)
      const dir = join(root, projectSegment(nextHeader.cwd), encodeSegment(nextHeader.id))
      if (isExisting) {
        // 覆盖：先把这个会话在本机的目录整体换掉，避免新旧帧混在一起。
        const localCwd = typeof local?.header?.cwd === 'string' ? local.header.cwd : nextHeader.cwd
        const previous = join(root, projectSegment(localCwd), encodeSegment(header.id))
        await rm(previous, { recursive: true, force: true })
        if (previous !== dir) await rm(dir, { recursive: true, force: true })
      }
      await writeSessionLog(dir, nextHeader, written.buffer, written.compressed)
      attachments += await importAttachments(ctx, bundle.dir)
      existing.add(header.id)
      if (isExisting) overwritten.push(header.id)
      else imported.push(header.id)
      if (typeof nextHeader.cwd === 'string') {
        const bucket = byCwd.get(nextHeader.cwd) ?? []
        bucket.push(header.id)
        byCwd.set(nextHeader.cwd, bucket)
      }
    } catch (error) {
      failed.push({ id: bundle.id, error: errorMessage(error) })
    }
  }

  for (const [cwd, ids] of byCwd) await attachToWorkspace(ctx, cwd, ids)

  const lastImportedAt = Date.now()
  await writeConfig(ctx, { ...cfg, lastImportedAt })

  return {
    ok: true,
    plugin: name,
    dir: target,
    total: bundles.length,
    imported: imported.length,
    overwritten: overwritten.length,
    skipped,
    attachments,
    targets: [...byCwd.keys()],
    failed,
    at: lastImportedAt,
  }
}

async function readBundleMeta(dir) {
  try {
    const parsed = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** 读一份导出好的会话：原始字节 + 文件头（只解第一帧）。 */
async function readBundle(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    throw new Error('导出目录不可读')
  }
  const log = entries.find((entry) => entry.isFile() && LOG_NAME.test(entry.name))
  if (log === undefined) throw new Error('缺少会话日志文件')
  const buffer = await readFile(join(dir, log.name))
  const compressed = log.name.endsWith('.zstd')
  return { buffer, compressed, header: headerOfBuffer(buffer, compressed).header }
}

// ───────────────────────────── 状态 ─────────────────────────────

async function buildState(ctx, cfg) {
  const dir = effectiveExportDir(ctx, cfg)
  const exists = isDirectory(dir)
  let local = []
  let cwd = ''
  try {
    local = await describeLocalSessions(ctx)
    cwd = await currentCwd(ctx)
  } catch {
    /* 会话服务不可用时就只报目录状态 */
  }
  const here = normalizePath(cwd)
  const folder = exists ? await describeBundles(dir) : []
  const localIds = new Set(local.map((item) => item.header.id))
  const filledLocal = local.filter((item) => item.empty === false)
  const filledFolder = folder.filter((item) => item.empty === false)
  const exportedIds = new Set(filledFolder.map((item) => item.id))
  const missing = filledFolder.filter((item) => !localIds.has(item.id))
  const workspaces = []
  const registry = getService(ctx, 'workspaceRegistry')
  if (registry && typeof registry.list === 'function') {
    try {
      for (const workspace of registry.list()) {
        workspaces.push({
          path: workspace.path,
          title: typeof workspace.title === 'string' ? workspace.title : '',
          sessions: Array.isArray(workspace.sessionIds) ? workspace.sessionIds.length : 0,
        })
      }
    } catch {
      /* 工作区表不可用时只是少一个下拉选项 */
    }
  }
  return {
    ok: true,
    plugin: name,
    exportDir: dir,
    defaultExportDir: defaultExportDir(ctx),
    configured: cfg.exportDir !== '',
    exists,
    localTotal: filledLocal.length,
    localEmpty: local.length - filledLocal.length,
    localAll: local.length,
    localCurrent: filledLocal.filter(
      (item) => normalizePath(item.header.cwd ?? '') === here,
    ).length,
    currentCwd: cwd,
    importCwd: cfg.importCwd ?? '',
    includePlugins: cfg.includePlugins !== false,
    layout: lastLayout,
    workspaces,
    folderTotal: filledFolder.length,
    folderEmpty: folder.length - filledFolder.length,
    folderMissing: missing.length,
    lastExportedAt: cfg.lastExportedAt,
    lastImportedAt: cfg.lastImportedAt,
    zstd: HAS_ZSTD,
    sessions: filledLocal.map((item) => ({
      id: item.header.id,
      title: item.title,
      cwd: item.header.cwd ?? '',
      updatedAt: item.updatedAt,
      bytes: item.bytes,
      empty: item.empty,
      live: item.live,
      exported: exportedIds.has(item.header.id),
    })),
    bundles: filledFolder.map((item) => ({
      id: item.id,
      title: item.title,
      cwd: item.cwd,
      exportedAt: item.exportedAt,
      bytes: item.bytes,
      empty: item.empty,
      exists: localIds.has(item.id),
    })),
  }
}

// ───────────────────────────── HTTP ─────────────────────────────

function writeJson(response, status, payload) {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(body)
}

function readJsonBody(request) {
  return new Promise((resolveBody) => {
    const chunks = []
    let bytes = 0
    request.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytes += buffer.length
      if (bytes > 64 * 1024) return
      chunks.push(buffer)
    })
    request.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        resolveBody(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null)
      } catch {
        resolveBody(null)
      }
    })
    request.on('error', () => resolveBody(null))
  })
}

function headerOf(request, key) {
  const value = request.headers ? request.headers[key] : undefined
  return Array.isArray(value) ? value[0] : value
}

function isLoopback(address) {
  if (typeof address !== 'string' || address === '') return false
  const normalized = address.startsWith('::ffff:') ? address.slice(7) : address
  return (
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized.startsWith('127.') ||
    normalized === 'localhost'
  )
}

/** 只接受「本机 + 同源 + 带自定义头」的写请求。 */
function isTrustedWrite(request) {
  if (headerOf(request, TRUST_HEADER) !== '1') return false
  if (!isLoopback(request.socket?.remoteAddress)) return false
  const site = headerOf(request, 'sec-fetch-site')
  if (site !== undefined && site !== '' && site !== 'same-origin' && site !== 'none') return false
  const host = headerOf(request, 'host')
  if (host === undefined || host === '') return false
  const origin = headerOf(request, 'origin')
  if (origin === undefined || origin === '') {
    try {
      return isLoopback(new URL(`http://${host}`).hostname)
    } catch {
      return false
    }
  }
  try {
    const url = new URL(origin)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      isLoopback(url.hostname) &&
      url.host === host
    )
  } catch {
    return false
  }
}

function errorMessage(error) {
  if (error && typeof error === 'object' && typeof error.message === 'string') return error.message
  return String(error)
}

// ───────────────────────────── 入口 ─────────────────────────────

/**
 * 单个 HTTP 请求的处理入口。由 lib/host.js 每次按 mtime 重新加载，
 * 所以改这里不需要重启应用。
 */
export async function handleRequest(ctx, seed, request, response) {

  const url = new URL(request.url || ROUTE_PREFIX, 'http://127.0.0.1')
  const pathname = url.pathname.replace(/\/+$/, '')
  const method = (request.method || 'GET').toUpperCase()
  try {
    if (method === 'GET' || method === 'HEAD') {
      const cfg = await readConfig(ctx, seed)
      if (pathname === `${ROUTE_PREFIX}/health`) {
        writeJson(response, 200, { ok: true, plugin: name, pid: process.pid, stamp: 'L3', at: Date.now() })
        return
      }
      if (pathname === `${ROUTE_PREFIX}/state`) {
        writeJson(response, 200, await buildState(ctx, cfg))
        return
      }
      writeJson(response, 404, { ok: false, error: '未知接口' })
      return
    }

    if (method !== 'POST') {
      response.writeHead(405, { allow: 'GET, HEAD, POST' })
      response.end()
      return
    }
    if (!isTrustedWrite(request)) {
      writeJson(response, 403, { ok: false, error: '已拒绝非本机同源请求。' })
      return
    }

    const body = await readJsonBody(request)
    const cfg = await readConfig(ctx, seed)

    if (pathname === `${ROUTE_PREFIX}/diag`) {
      // 客户端量到自己的位置后回报一次，用来核对「贴在哪一行」。
      lastLayout = { at: Date.now(), payload: body ?? null }
      writeJson(response, 200, { ok: true })
      return
    }

    if (pathname === `${ROUTE_PREFIX}/config`) {
      const next = { ...cfg }
      if (typeof body?.exportDir === 'string') {
        const exportDir = body.exportDir.trim()
        if (exportDir === '') {
          writeJson(response, 400, { ok: false, error: '目录不能为空' })
          return
        }
        if (!isAbsolute(exportDir) && !exportDir.startsWith('~')) {
          writeJson(response, 400, {
            ok: false,
            error: '请填写绝对路径，例如 D:\\OneDrive\\DSH-Sessions',
          })
          return
        }
        next.exportDir = exportDir
      }
      if (typeof body?.importCwd === 'string') {
        const importCwd = body.importCwd.trim()
        if (importCwd !== '' && !isDirectory(importCwd)) {
          writeJson(response, 400, { ok: false, error: `工作区目录不存在：${importCwd}` })
          return
        }
        next.importCwd = importCwd
      }
      if (typeof body?.includePlugins === 'boolean') next.includePlugins = body.includePlugins
      await writeConfig(ctx, next)
      writeJson(response, 200, await buildState(ctx, next))
      return
    }

    if (pathname === `${ROUTE_PREFIX}/export`) {
      const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
      const exportIds = Array.isArray(body?.ids)
        ? body.ids.filter((id) => typeof id === 'string' && id !== '')
        : []
      const result = await exportAll(ctx, cfg, { sessionId, ids: exportIds })
      const next = await readConfig(ctx, seed)
      writeJson(response, 200, { ...result, state: await buildState(ctx, next) })
      return
    }

    if (pathname === `${ROUTE_PREFIX}/import`) {
      const ids = Array.isArray(body?.ids)
        ? body.ids.filter((id) => typeof id === 'string' && id !== '')
        : []
      const result = await importAll(ctx, cfg, { ids, overwrite: body?.overwrite === true })
      const next = await readConfig(ctx, seed)
      writeJson(response, 200, { ...result, state: await buildState(ctx, next) })
      return
    }

    writeJson(response, 404, { ok: false, error: '未知接口' })
  } catch (error) {
    try {
      writeJson(response, 500, { ok: false, error: errorMessage(error) })
    } catch {
      /* 响应可能已经写出去 */
    }
  }
}
