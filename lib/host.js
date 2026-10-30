/**
 * dsh-session-porter — 插件入口（很薄的一层）
 *
 * 真正的逻辑在 `lib/impl.js`。这里只做一件事：注册 `/dsh-session-porter` 路由，
 * 并在每个请求到来时按 impl.js 的 mtime 热加载它 —— 于是修改逻辑不用重启应用。
 * （插件模块本身会被 Node 的 ESM 缓存固定住，所以把易变的代码放在被再次
 * import 的文件里。）
 */
import { stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-session-porter'

const HERE = new URL('./', import.meta.url)
const ROUTE_PREFIX = '/dsh-session-porter'

let cached = { mtime: 0, module: null }

async function loadImpl() {
  const url = new URL('impl.js', HERE)
  let mtime = 0
  try {
    mtime = (await stat(fileURLToPath(url))).mtimeMs
  } catch {
    mtime = 0
  }
  if (cached.module === null || cached.mtime !== mtime) {
    const loaded = await import(`${url.href}?v=${Math.round(mtime)}`)
    cached = { mtime, module: loaded }
  }
  return cached.module
}

export function apply(ctx, rawConfig = {}) {
  const seed = {
    exportDir: typeof rawConfig.exportDir === 'string' ? rawConfig.exportDir : '',
  }

  ctx.inject(['webServer'], (httpCtx) => {
    // 重新安装 / 热重载时，上一条同路径的路由可能还挂在服务器里。先摘掉它，
    // 否则新注册会被旧处理器挡住（旧代码继续应答，看起来像“没生效”）。
    releaseRoute(httpCtx.webServer, ROUTE_PREFIX)

    const dispose = httpCtx.webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler: async (request, response) => {
        try {
          const impl = await loadImpl()
          await impl.handleRequest(ctx, seed, request, response)
        } catch (error) {
          try {
            response.writeHead(500, {
              'content-type': 'application/json; charset=utf-8',
              'cache-control': 'no-store',
            })
            response.end(
              JSON.stringify({
                ok: false,
                error: error && error.message ? error.message : String(error),
              }),
            )
          } catch {
            /* 响应可能已经写出去 */
          }
        }
      },
    })
    if (typeof ctx.on === 'function') {
      ctx.on('dispose', () => {
        try {
          dispose()
        } catch {
          /* 忽略重复释放 */
        }
      })
    }
  })
}

/**
 * 从 web server 的路由表里摘掉同路径的旧注册。不同版本的 DSH 里表名可能是
 * `exact` / `prefixes`，也可能是 `exactRoutes` / `prefixRoutes`，所以都试一遍；
 * 摘不掉也不影响新注册（最坏情况是旧路由继续应答）。
 */
function releaseRoute(server, path) {
  if (server === null || typeof server !== 'object') return
  let target = server
  try {
    const raw = Reflect.get(server, Symbol.for('cordis.original'))
    if (raw !== null && typeof raw === 'object') target = raw
  } catch {
    /* 没有这个符号就用原对象 */
  }
  for (const key of ['exact', 'prefixes', 'exactRoutes', 'prefixRoutes', 'routes']) {
    let table
    try {
      table = Reflect.get(target, key)
    } catch {
      continue
    }
    if (!(table instanceof Map) || !table.has(path)) continue
    try {
      const owned = table.get(path)
      table.delete(path)
      const release = typeof owned === 'function' ? owned : owned && owned.dispose
      if (typeof release === 'function') release.call(owned)
    } catch {
      /* 摘除失败时保持原样 */
    }
  }
}