/**
 * dsh-session-porter — Client half
 *
 * 界面：
 *   · 侧栏底部、设置行**上面**单独一条（固定定位，不跟余额挤同一行）：
 *     [⇄ 会话同步][导出][导入][⚙]
 *   · 齿轮浮层：目录、导入位置、挑哪些会话导出 / 导入、是否覆盖、是否连带导出插件清单
 *
 * 颜色全部沿用宿主主题变量（--dsw-alias-*），不自己造色板。
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-porter',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement

    const ENDPOINT = 'dsh-session-porter'
    const STYLE_ID = 'dsh-session-porter'
    const TRUST_HEADER = 'x-dsh-session-porter'

    const CSS = `
.dss-slot{display:none}
.dss-row-inline{display:block;width:100%;min-width:0}
.dss-bar{position:fixed;z-index:900;box-sizing:border-box;padding:0 6px;background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-layer-1,#1f1f22))}
.dss-row{box-sizing:border-box;display:flex;align-items:center;gap:6px;width:100%;min-width:0;height:32px;padding:0 2px;color:var(--dsw-alias-label-secondary,inherit);font:inherit;font-size:12px;white-space:nowrap}
.dss-row--rail{width:40px;height:40px;margin:0 auto;padding:0;justify-content:center;flex-direction:column;gap:2px}
.dss-label{flex:1 1 auto;display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis}
.dss-label svg{flex:none}
.dss-btn{box-sizing:border-box;flex:none;display:inline-flex;align-items:center;justify-content:center;gap:3px;height:24px;padding:0 8px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.28));background:transparent;color:var(--dsw-alias-label-primary,inherit);font:inherit;font-size:12px;line-height:1;cursor:pointer;transition:background .14s ease-out}
.dss-btn:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary,currentColor) 9%,transparent)}
.dss-btn:disabled{opacity:.55;cursor:default}
.dss-btn--icon{width:24px;padding:0;color:var(--dsw-alias-label-secondary,inherit)}
.dss-btn--primary{color:var(--dsw-alias-brand-primary,#4d6bfe);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 45%,transparent)}
.dss-btn--primary:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 13%,transparent)}
.dss-btn--rail{width:40px;height:40px;padding:0;border:0;border-radius:10px;color:var(--dsw-alias-label-secondary,inherit)}
.dss-btn--tiny{height:22px;padding:0 6px;font-size:11px;border:0;color:var(--dsw-alias-label-secondary,inherit)}
.dss-btn--tiny:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary,currentColor) 9%,transparent);color:var(--dsw-alias-label-primary,inherit)}

.dss-panel{box-sizing:border-box;position:fixed;z-index:9999;display:flex;flex-direction:column;gap:9px;width:400px;max-width:calc(100vw - 16px);max-height:min(80vh,760px);overflow:auto;overscroll-behavior:contain;padding:12px;border-radius:14px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.28));background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1,#1f1f22));color:var(--dsw-alias-label-primary,inherit);box-shadow:0 14px 44px rgba(0,0,0,.34);font-size:12px;line-height:1.5;animation:dss-in .14s ease-out}
@keyframes dss-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
.dss-panel__head{display:flex;align-items:baseline;gap:8px}
.dss-panel__title{flex:1 1 auto;font-size:14px;font-weight:600}
.dss-panel__hint{font-size:11px;color:var(--dsw-alias-label-secondary,inherit);opacity:.85}
.dss-field{display:flex;align-items:center;gap:6px}
.dss-field__label{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary,inherit)}
.dss-input{box-sizing:border-box;flex:1 1 auto;min-width:0;height:28px;padding:0 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.3));background:transparent;color:var(--dsw-alias-label-primary,inherit);font:inherit;font-size:12px}
.dss-input:focus{outline:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 60%,transparent);outline-offset:-1px}
select.dss-input{appearance:none;padding-right:6px;cursor:pointer}
.dss-sec{display:flex;flex-direction:column;gap:5px}
.dss-sec__head{display:flex;align-items:center;gap:5px}
.dss-sec__title{font-weight:600;font-size:12px}
.dss-sec__count{font-size:11px;color:var(--dsw-alias-label-secondary,inherit);opacity:.85;font-variant-numeric:tabular-nums}
.dss-sec__spacer{flex:1 1 auto}
.dss-list{max-height:170px;overflow:auto;overscroll-behavior:contain;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.22));border-radius:9px;padding:2px}
.dss-item{display:flex;align-items:flex-start;gap:7px;padding:4px 6px;border-radius:6px;cursor:pointer}
.dss-item:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary,currentColor) 7%,transparent)}
.dss-item input{flex:none;margin:3px 0 0;width:13px;height:13px;accent-color:var(--dsw-alias-brand-primary,#4d6bfe)}
.dss-item__main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px}
.dss-item__title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dss-item__title--none{opacity:.6;font-style:italic}
.dss-item__meta{font-size:10.5px;color:var(--dsw-alias-label-secondary,inherit);opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}
.dss-item--off .dss-item__main{opacity:.5}
.dss-empty{padding:10px;text-align:center;color:var(--dsw-alias-label-secondary,inherit);opacity:.75;font-size:11px}
.dss-note{padding:6px 8px;border-radius:8px;font-size:11px;background:color-mix(in srgb,var(--dsw-alias-label-primary,currentColor) 6%,transparent);color:var(--dsw-alias-label-primary,inherit);word-break:break-word}
.dss-note--warn{color:var(--dsw-alias-state-warn-primary,#d97706);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d97706) 14%,transparent)}
.dss-note--ok{color:var(--dsw-alias-state-success-primary,#0f9d58);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#0f9d58) 14%,transparent)}
.dss-note--err{color:var(--dsw-alias-state-error-primary,#d93025);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d93025) 14%,transparent)}
.dss-rowbtns{display:flex;gap:6px;flex-wrap:wrap}
.dss-rowbtns .dss-btn{height:28px;padding:0 10px}
.dss-check{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--dsw-alias-label-secondary,inherit);cursor:pointer;user-select:none}
.dss-check input{width:13px;height:13px;margin:0;accent-color:var(--dsw-alias-brand-primary,#4d6bfe)}
.dss-toast{position:fixed;z-index:10000;box-sizing:border-box;max-width:340px;padding:7px 10px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.28));background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1,#1f1f22));color:var(--dsw-alias-label-primary,inherit);box-shadow:0 14px 44px rgba(0,0,0,.34);font-size:12px;line-height:1.5;pointer-events:none;animation:dss-in .14s ease-out}
.dss-toast--err{color:var(--dsw-alias-state-error-primary,#d93025)}

/* ── 深色 token：和余额插件 .dbu-theme--dark 完全一致（照抄它的取值） ── */
.dss-ui{--dsw-alias-bg-overlay:#1b1b1e;--dsw-alias-bg-layer-1:#1b1b1e;--dsw-alias-bg-layer-2:#232327;--dsw-alias-bg-base:#131315;--dsw-specific-menu:#1b1b1e;--dsw-specific-sidebar-fill:#1b1b1e;--dsw-alias-label-primary:#ededf0;--dsw-alias-label-secondary:#a5a5ae;--dsw-alias-label-tertiary:#85858f;--dsw-alias-border-l1:rgba(255,255,255,.11);--dsw-alias-border-l2:rgba(255,255,255,.17);--dsw-alias-interactive-bg-hover:rgba(255,255,255,.11);--dsw-alias-brand-primary:#7f95ff;--dsw-alias-state-success-primary:#3ddc97;--dsw-alias-state-warn-primary:#fbbf24;--dsw-alias-state-error-primary:#f87171;--dsw-alias-state-idle-primary:#8b8b95;--dsw-elevation-prominent:0 14px 44px rgba(0,0,0,.5);--dsw-elevation-stroke-color:rgba(255,255,255,.12);--dsw-menu-backdrop-filter:none}

/* ── 底部条：不加底色，只保留按钮自己的框 ── */
.dss-bar.dss-ui{background:transparent;border:0;box-shadow:none;backdrop-filter:none}
.dss-bar .dss-row{color:var(--dsw-alias-label-secondary)}
.dss-bar .dss-btn{height:26px;padding:0 9px;font-size:13px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary)}
.dss-bar .dss-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dss-bar .dss-btn--icon{width:26px;padding:0;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);background:transparent}
.dss-bar .dss-btn--icon:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}

/* ── 设置面板：和余额面板同底色、同描边、同阴影 ── */
.dss-panel.dss-ui{background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);box-shadow:var(--dsw-elevation-prominent)}
.dss-panel.dss-ui .dss-panel__hint,.dss-panel.dss-ui .dss-sec__count,.dss-panel.dss-ui .dss-field__label,.dss-panel.dss-ui .dss-check,.dss-panel.dss-ui .dss-item__meta,.dss-panel.dss-ui .dss-empty{color:var(--dsw-alias-label-secondary)}
.dss-panel.dss-ui .dss-list{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}
.dss-panel.dss-ui .dss-input{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary)}
.dss-panel.dss-ui .dss-input::placeholder{color:var(--dsw-alias-label-tertiary)}
.dss-panel.dss-ui .dss-btn{border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary)}
.dss-panel.dss-ui .dss-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dss-panel.dss-ui .dss-btn--primary{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 45%,transparent);background:transparent}
.dss-panel.dss-ui .dss-btn--primary:hover{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 14%,transparent)}
.dss-panel.dss-ui .dss-btn--tiny{border:0;background:transparent;color:var(--dsw-alias-label-secondary)}
.dss-panel.dss-ui .dss-btn--tiny:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dss-panel.dss-ui .dss-item:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent)}
.dss-panel.dss-ui .dss-note{background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent);color:var(--dsw-alias-label-primary)}
.dss-panel.dss-ui .dss-note--ok{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 14%,transparent);color:var(--dsw-alias-state-success-primary)}
.dss-panel.dss-ui .dss-note--warn{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,transparent);color:var(--dsw-alias-state-warn-primary)}
.dss-panel.dss-ui .dss-note--err{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);color:var(--dsw-alias-state-error-primary)}
.dss-toast.dss-ui{background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-prominent)}

/* ── 确认弹窗 ── */
.dss-veil{position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);animation:dss-fade .12s ease-out}
@keyframes dss-fade{from{opacity:0}to{opacity:1}}
.dss-modal{box-sizing:border-box;width:min(380px,calc(100vw - 32px));padding:16px;border-radius:14px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-prominent);font-size:12.5px;line-height:1.6}
.dss-modal__title{font-size:14px;font-weight:600;margin-bottom:6px}
.dss-modal__body{color:var(--dsw-alias-label-secondary);word-break:break-word}
.dss-modal__path{color:var(--dsw-alias-label-primary);font-size:11.5px;margin-top:2px}
.dss-modal__btns{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.dss-modal__btns .dss-btn{height:30px;padding:0 14px;border-radius:8px;font-size:12.5px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary)}
.dss-modal__btns .dss-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dss-modal__btns .dss-btn--primary{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 45%,transparent)}
.dss-modal__btns .dss-btn--primary:hover{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 14%,transparent)}
`

    function ensureStyles() {
      if (typeof document === 'undefined') return
      let tag = document.querySelector('style[data-dsh-plugin-css="' + STYLE_ID + '"]')
      if (tag === null) {
        tag = document.createElement('style')
        tag.dataset.dshPluginCss = STYLE_ID
        document.head.appendChild(tag)
      }
      tag.textContent = CSS
    }

    // ─────────────────────────── 网络 ───────────────────────────

    function endpointUrl(suffix) {
      const path = ENDPOINT + suffix
      if (typeof document === 'undefined') return '/' + path
      return new URL(path, document.baseURI).pathname
    }

    function sendBeacon(suffix, payload) {
      try {
        const response = fetch(endpointUrl(suffix), {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { [TRUST_HEADER]: '1', 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (response && typeof response.catch === 'function') response.catch(() => undefined)
      } catch {
        /* 诊断信息送不出去无所谓 */
      }
    }

    async function request(suffix, options) {
      const init = {
        method: (options && options.method) || 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { [TRUST_HEADER]: '1' },
      }
      if (options && options.body !== undefined) {
        init.headers['content-type'] = 'application/json'
        init.body = JSON.stringify(options.body)
      }
      const response = await fetch(endpointUrl(suffix), init)
      let body = null
      try {
        body = await response.json()
      } catch {
        body = null
      }
      if (!response.ok || body === null || body.ok === false) {
        const reason = body && typeof body.error === 'string' ? body.error : 'HTTP ' + response.status
        throw new Error(reason)
      }
      return body
    }

    // ─────────────────────────── 图标 ───────────────────────────

    function SyncIcon() {
      return h(
        'svg',
        { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': 'true', fill: 'none' },
        h('path', {
          d: 'M4 6.5 6.2 4.3M4 6.5 6.2 8.7M4 6.5h5.6a2.4 2.4 0 0 1 0 4.8H8',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M12 9.5 9.8 11.7M12 9.5l2.2 2.2M12 9.5H6.4a2.4 2.4 0 0 1 0-4.8H8',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    function GearIcon() {
      return h(
        'svg',
        { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': 'true', fill: 'none' },
        h('circle', { cx: 8, cy: 8, r: 2.1, stroke: 'currentColor', strokeWidth: 1.3 }),
        h('path', {
          d: 'M8 1.9v1.5M8 12.6v1.5M1.9 8h1.5M12.6 8h1.5M3.7 3.7l1 1M11.3 11.3l1 1M12.3 3.7l-1 1M4.7 11.3l-1 1',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
        }),
      )
    }

    // ─────────────────────────── 格式化 ───────────────────────────

    function timeText(ms) {
      if (!Number.isFinite(ms) || ms <= 0) return '从未'
      const date = new Date(ms)
      const now = new Date()
      const pad = (value) => String(value).padStart(2, '0')
      if (now.toDateString() === date.toDateString()) {
        return pad(date.getHours()) + ':' + pad(date.getMinutes())
      }
      return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    function sizeText(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return '空'
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
      return (bytes / 1024 / 1024).toFixed(1) + ' MB'
    }

    function shortDir(path) {
      return typeof path === 'string' && path !== '' ? path : '（未设置）'
    }

    function folderName(path) {
      if (typeof path !== 'string' || path === '') return ''
      const parts = path.split(/[\\/]+/).filter((part) => part !== '')
      return parts.length === 0 ? path : parts[parts.length - 1]
    }

    function sessionTitle(item) {
      const title = typeof item.title === 'string' ? item.title.trim() : ''
      return title === '' ? '（未命名的会话）' : title
    }

    // ─────────────────────────── 组件 ───────────────────────────

    function SyncFooter(props) {
      const wide = props.wide !== false
      const [state, setState] = React.useState(null)
      const [busy, setBusy] = React.useState('')
      const [open, setOpen] = React.useState(false)
      const [toast, setToast] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [draft, setDraft] = React.useState('')
      const [pickedExport, setPickedExport] = React.useState(null)
      const [pickedImport, setPickedImport] = React.useState(null)
      const [overwrite, setOverwrite] = React.useState(false)
      const [frame, setFrame] = React.useState(null)
      const [confirm, setConfirm] = React.useState(null)
      const slotRef = React.useRef(null)
      const barRef = React.useRef(null)
      const panelRef = React.useRef(null)

      const applyState = React.useCallback((next) => {
        setState(next)
        if (typeof next.exportDir === 'string') {
          setDraft((previous) => (previous === '' ? next.exportDir : previous))
        }
      }, [])

      const refresh = React.useCallback(async () => {
        try {
          const next = await request('/state')
          applyState(next)
          setError(null)
        } catch (err) {
          setError(err && err.message ? err.message : String(err))
        }
      }, [applyState])

      React.useEffect(() => {
        refresh()
      }, [refresh])

      // 把这一条钉在「底部动作行」的正上方，不跟余额抢同一行。
      React.useLayoutEffect(() => {
        // slot 的父级常是 display:contents（量出来是 0×0），要往上找到真正排版的那层。
        const stripElement = (node) => {
          let element = node
          for (let step = 0; step < 6 && element !== null; step += 1) {
            element = element.parentElement
            if (element === null || element === undefined) return null
            const style = window.getComputedStyle(element)
            if (style.display === 'contents') continue
            const rect = element.getBoundingClientRect()
            if (rect.width < 8 || rect.height < 8) continue
            if (rect.height > 220) return null
            return element
          }
          return null
        }
        // 悬浮条会盖住紧贴在上面的会话列表底部，给列表留 44px 内边距错开。
        const padded = { el: null, previous: '' }
        const releasePadding = () => {
          if (padded.el !== null) {
            try {
              padded.el.style.paddingBottom = padded.previous
            } catch {
              /* ignore */
            }
            padded.el = null
            padded.previous = ''
          }
        }
        const keepClearance = (strip, stripTop) => {
          const candidates = []
          if (strip.previousElementSibling !== null) candidates.push(strip.previousElementSibling)
          const parent = strip.parentElement
          if (parent !== null) {
            for (const child of parent.children) {
              if (child !== strip) candidates.push(child)
            }
          }
          let found = null
          for (const element of candidates) {
            const style = window.getComputedStyle(element)
            if (style.overflowY !== 'auto' && style.overflowY !== 'scroll') continue
            const rect = element.getBoundingClientRect()
            if (rect.height < 80) continue
            if (Math.abs(rect.bottom - stripTop) > 8) continue
            if (rect.width < 60) continue
            found = element
            break
          }
          if (found === padded.el) return
          releasePadding()
          if (found === null) return
          padded.el = found
          padded.previous = found.style.paddingBottom
          found.style.paddingBottom = '44px'
        }
        const measure = () => {
          const node = slotRef.current
          if (node === null || node === undefined) return
          const strip = stripElement(node)
          if (strip === null) return
          const rect = strip.getBoundingClientRect()
          try {
            keepClearance(strip, rect.top)
          } catch {
            /* 留白失败就只是可能盖住一行 */
          }
          const next = {
            left: Math.round(rect.left),
            width: Math.round(rect.width),
            bottom: Math.round(window.innerHeight - rect.top + 8),
          }
          setFrame((previous) =>
            previous !== null &&
            previous.left === next.left &&
            previous.width === next.width &&
            previous.bottom === next.bottom
              ? previous
              : next,
          )
        }
        measure()
        let observer = null
        try {
          observer = new ResizeObserver(measure)
          const node = slotRef.current
          const host = node === null || node === undefined ? null : node.parentElement
          if (host !== null && host !== undefined) observer.observe(host)
        } catch {
          observer = null
        }
        window.addEventListener('resize', measure)
        const timer = setInterval(measure, 1500)
        return () => {
          try {
            if (observer !== null) observer.disconnect()
          } catch {
            /* ignore */
          }
          window.removeEventListener('resize', measure)
          clearInterval(timer)
          releasePadding()
        }
      }, [wide])

      // 位置定下来后回报一次量到的坐标，方便排查「贴到哪一行」。
      React.useEffect(() => {
        const timer = setTimeout(() => {
          const node = slotRef.current
          let host = node === null || node === undefined ? null : node.parentElement
          for (let step = 0; step < 6 && host !== null && host !== undefined; step += 1) {
            const probe = window.getComputedStyle(host)
            if (probe.display === 'contents') {
              host = host.parentElement
              continue
            }
            const probeRect = host.getBoundingClientRect()
            if (probeRect.width < 8 || probeRect.height < 8) {
              host = host.parentElement
              continue
            }
            break
          }
          const bar = barRef.current
          if (host === null || host === undefined || bar === null || bar === undefined) return
          const hostRect = host.getBoundingClientRect()
          const barRect = bar.getBoundingClientRect()
          const computed = window.getComputedStyle(host)
          const siblings = []
          for (const child of host.children) {
            if (child === node) continue
            const box = child.getBoundingClientRect()
            siblings.push({
              tag: child.tagName,
              cls: typeof child.className === 'string' ? child.className : '',
              left: Math.round(box.left),
              top: Math.round(box.top),
              width: Math.round(box.width),
              height: Math.round(box.height),
            })
          }
          sendBeacon('/diag', {
            wide,
            hostTag: host.tagName,
            hostClass: typeof host.className === 'string' ? host.className : '',
            display: computed.display,
            flexDirection: computed.flexDirection,
            hostRect: {
              left: Math.round(hostRect.left),
              top: Math.round(hostRect.top),
              width: Math.round(hostRect.width),
              height: Math.round(hostRect.height),
            },
            barRect: {
              left: Math.round(barRect.left),
              top: Math.round(barRect.top),
              width: Math.round(barRect.width),
              height: Math.round(barRect.height),
            },
            siblings,
            viewport: { width: window.innerWidth, height: window.innerHeight },
          })
        }, 900)
        return () => clearTimeout(timer)
      }, [frame, wide])

      const flash = React.useCallback((message, tone) => {
        setToast({ message, tone: tone || 'ok', at: Date.now() })
      }, [])

      React.useEffect(() => {
        if (toast === null) return undefined
        const timer = setTimeout(() => setToast(null), 4600)
        return () => clearTimeout(timer)
      }, [toast])

      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          const target = event.target
          if (panelRef.current !== null && panelRef.current.contains(target)) return
          if (barRef.current !== null && barRef.current.contains(target)) return
          setOpen(false)
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown, true)
        return () => {
          document.removeEventListener('mousedown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown, true)
        }
      }, [open])

      const togglePanel = () => {
        const next = !open
        setOpen(next)
        if (next) refresh()
      }

      // ── 选择集：null 表示「用默认值」 ──
      const sessions = state && Array.isArray(state.sessions) ? state.sessions : []
      const bundles = state && Array.isArray(state.bundles) ? state.bundles : []
      const defaultExport = React.useMemo(
        () => sessions.filter((item) => !item.empty).map((item) => item.id),
        [sessions],
      )
      const defaultImport = React.useMemo(
        () => bundles.filter((item) => !item.empty && !item.exists).map((item) => item.id),
        [bundles],
      )
      const exportIds = pickedExport === null ? defaultExport : [...pickedExport]
      const importIds = pickedImport === null ? defaultImport : [...pickedImport]
      const exportSet = new Set(exportIds)
      const importSet = new Set(importIds)

      const toggleExport = (id) => {
        const next = new Set(exportSet)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setPickedExport(next)
      }
      const toggleImport = (id) => {
        const next = new Set(importSet)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setPickedImport(next)
      }

      const runExport = async (ids) => {
        if (busy !== '') return
        setBusy('export')
        try {
          const body = await request('/export', {
            method: 'POST',
            body: Array.isArray(ids) ? { ids } : {},
          })
          if (body.state) applyState(body.state)
          const failed = Array.isArray(body.failed) ? body.failed.length : 0
          const parts = [`已导出 ${body.exported} 个会话`]
          if (body.plugins > 0) parts.push(`插件清单 ${body.plugins} 个`)
          if (Number(body.pruned) > 0) parts.push(`清掉空壳 ${body.pruned} 个`)
          if (failed > 0) parts.push(`失败 ${failed}`)
          flash(parts.join(' · '), failed > 0 ? 'warn' : 'ok')
          await refresh()
        } catch (err) {
          flash(err && err.message ? err.message : String(err), 'err')
        } finally {
          setBusy('')
        }
      }

      const runImport = async (ids, replace) => {
        if (busy !== '') return
        setBusy('import')
        try {
          const body = await request('/import', {
            method: 'POST',
            body: {
              ...(Array.isArray(ids) ? { ids } : {}),
              overwrite: replace === true,
            },
          })
          if (body.state) applyState(body.state)
          const failed = Array.isArray(body.failed) ? body.failed.length : 0
          const skipped = Number(body.skipped) || 0
          const changed = (Number(body.imported) || 0) + (Number(body.overwritten) || 0)
          if (body.total === 0) {
            flash('文件夹里还没有会话，先在另一台电脑点「导出」。', 'warn')
          } else if (changed === 0) {
            flash(
              failed > 0 ? `没有导入成功，失败 ${failed} 个` : `没有要导入的会话（${skipped} 个已存在）`,
              failed > 0 ? 'err' : 'warn',
            )
          } else {
            const parts = [`已导入 ${body.imported} 个`]
            if (body.overwritten > 0) parts.push(`覆盖 ${body.overwritten} 个`)
            if (failed > 0) parts.push(`失败 ${failed}`)
            parts.push('正在刷新…')
            flash(parts.join(' · '), 'ok')
            setPickedExport(null)
            setPickedImport(null)
            setTimeout(() => {
              try {
                window.location.reload()
              } catch {
                /* 刷新失败就手动刷 */
              }
            }, 1100)
          }
          await refresh()
        } catch (err) {
          flash(err && err.message ? err.message : String(err), 'err')
        } finally {
          setBusy('')
        }
      }

      const saveDir = async () => {
        if (busy !== '') return
        setBusy('save')
        try {
          const body = await request('/config', { method: 'POST', body: { exportDir: draft } })
          applyState(body)
          flash('目录已保存', 'ok')
        } catch (err) {
          flash(err && err.message ? err.message : String(err), 'err')
        } finally {
          setBusy('')
        }
      }

      const useSuggested = () => {
        if (state && typeof state.defaultExportDir === 'string') setDraft(state.defaultExportDir)
      }

      const saveImportCwd = async (value) => {
        if (busy !== '') return
        setBusy('save')
        try {
          const body = await request('/config', { method: 'POST', body: { importCwd: value } })
          applyState(body)
          flash(value === '' ? '导入位置：自动' : '导入位置已保存', 'ok')
        } catch (err) {
          flash(err && err.message ? err.message : String(err), 'err')
        } finally {
          setBusy('')
        }
      }

      const togglePlugins = async (value) => {
        if (busy !== '') return
        setBusy('save')
        try {
          const body = await request('/config', {
            method: 'POST',
            body: { includePlugins: value },
          })
          applyState(body)
          flash(value ? '会连带导出插件清单' : '不再导出插件清单', 'ok')
        } catch (err) {
          flash(err && err.message ? err.message : String(err), 'err')
        } finally {
          setBusy('')
        }
      }

      // ── 动手前先确认，防误触 ──
      const askExport = (ids) => {
        const list = Array.isArray(ids) ? ids : defaultExport
        setConfirm({
          kind: 'export',
          ids: Array.isArray(ids) ? ids : null,
          overwrite: false,
          title: '确认导出',
          body: `把这个本机上的 ${list.length} 个会话导出到：`,
          path: state ? shortDir(state.exportDir) : '（还没设置目录）',
          detail:
            state && state.includePlugins !== false
              ? '同时会更新插件清单 plugins.json。'
              : '导出后可以在另一台电脑用「导入」装回去。',
          action: '导出',
        })
      }

      const askImport = (ids, replace) => {
        const list = Array.isArray(ids) ? ids : defaultImport
        const existing = list.filter((id) => bundles.some((item) => item.id === id && item.exists)).length
        setConfirm({
          kind: 'import',
          ids: Array.isArray(ids) ? ids : null,
          overwrite: replace === true,
          title: replace === true ? '确认导入（会覆盖）' : '确认导入',
          body: `从这个目录导入 ${list.length} 个会话：`,
          path: state ? shortDir(state.exportDir) : '（还没设置目录）',
          detail:
            replace === true
              ? `本机已有的 ${existing} 个会被覆盖，覆盖前的版本不会保留。`
              : existing > 0
                ? `本机已有的 ${existing} 个会跳过，只补缺的。`
                : '导入完成后页面会自动刷新。',
          action: replace === true ? '覆盖导入' : '导入',
        })
      }

      // ── 这一条 ──
      const buttons = []
      if (wide) {
        buttons.push(h('span', { className: 'dss-label', key: 'label' }, h(SyncIcon, null), '会话同步'))
        buttons.push(
          h(
            'button',
            {
              key: 'export',
              type: 'button',
              className: 'dss-btn',
              title: state ? '导出到 ' + shortDir(state.exportDir) : '导出全部会话到设定目录',
              disabled: busy === 'export',
              onClick: () => askExport(null),
            },
            busy === 'export' ? '导出中' : '导出',
          ),
        )
        buttons.push(
          h(
            'button',
            {
              key: 'import',
              type: 'button',
              className: 'dss-btn',
              title: state ? '从 ' + shortDir(state.exportDir) + ' 导入' : '从设定目录导入会话',
              disabled: busy === 'import',
              onClick: () => askImport(null, false),
            },
            busy === 'import' ? '导入中' : '导入',
          ),
        )
        buttons.push(
          h(
            'button',
            {
              key: 'gear',
              type: 'button',
              className: 'dss-btn dss-btn--icon',
              title: '会话同步设置：选择导出/导入哪些会话',
              'aria-haspopup': 'dialog',
              'aria-expanded': open ? 'true' : 'false',
              onClick: togglePanel,
            },
            h(GearIcon, null),
          ),
        )
      } else {
        buttons.push(
          h(
            'button',
            {
              key: 'rail',
              type: 'button',
              className: 'dss-btn dss-btn--rail',
              title: '会话同步：导出 / 导入',
              'aria-haspopup': 'dialog',
              'aria-expanded': open ? 'true' : 'false',
              onClick: togglePanel,
            },
            h(SyncIcon, null),
          ),
        )
      }

      const row = h(
        'div',
        { className: 'dss-row' + (wide ? '' : ' dss-row--rail'), ref: barRef },
        buttons,
      )

      // ── 会话列表 ──
      const listOfExport = sessions.map((item) =>
        h(
          'label',
          { className: 'dss-item' + (item.empty ? ' dss-item--off' : ''), key: item.id },
          h('input', {
            type: 'checkbox',
            checked: exportSet.has(item.id),
            onChange: () => toggleExport(item.id),
          }),
          h(
            'span',
            { className: 'dss-item__main' },
            h(
              'span',
              {
                className: 'dss-item__title' + (item.title ? '' : ' dss-item__title--none'),
                title: item.title || item.id,
              },
              sessionTitle(item) + (item.live ? ' · 使用中' : ''),
            ),
            h(
              'span',
              { className: 'dss-item__meta' },
              [sizeText(item.bytes), timeText(item.updatedAt), folderName(item.cwd) || '（未知工作区）']
                .filter((part) => part !== '')
                .join(' · '),
            ),
          ),
        ),
      )

      const listOfImport = bundles.map((item) =>
        h(
          'label',
          { className: 'dss-item' + (item.empty ? ' dss-item--off' : ''), key: item.id },
          h('input', {
            type: 'checkbox',
            checked: importSet.has(item.id),
            onChange: () => toggleImport(item.id),
          }),
          h(
            'span',
            { className: 'dss-item__main' },
            h(
              'span',
              {
                className: 'dss-item__title' + (item.title ? '' : ' dss-item__title--none'),
                title: item.title || item.id,
              },
              sessionTitle(item) + (item.exists ? ' · 本机已有' : ''),
            ),
            h(
              'span',
              { className: 'dss-item__meta' },
              [sizeText(item.bytes), timeText(item.exportedAt), folderName(item.cwd) || '（未知工作区）']
                .filter((part) => part !== '')
                .join(' · '),
            ),
          ),
        ),
      )

      // ── 设置浮层 ──
      let panel = null
      if (open) {
        const style = { bottom: '12px', left: '12px' }
        if (frame !== null) {
          // 让出这一条本身的高度（约 40px），浮层贴在它上面。
          const lift = frame.bottom + 44
          style.bottom = Math.max(8, lift) + 'px'
          style.left = Math.max(8, Math.min(frame.left, window.innerWidth - 416)) + 'px'
          style.maxHeight = Math.min(760, Math.max(220, window.innerHeight - lift - 14)) + 'px'
        }
        panel = h(
          'div',
          {
            className: 'dss-ui dss-panel',
            role: 'dialog',
            'aria-label': '会话同步设置',
            style,
            ref: panelRef,
          },
          h(
            'div',
            { className: 'dss-panel__head' },
            h('span', { className: 'dss-panel__title' }, '会话同步'),
            h(
              'span',
              { className: 'dss-panel__hint' },
              state ? '上次导出 ' + timeText(state.lastExportedAt) : '',
            ),
          ),
          h(
            'div',
            { className: 'dss-field' },
            h('input', {
              className: 'dss-input',
              value: draft,
              spellCheck: false,
              placeholder: '同步目录，例如 OneDrive 里的 DSH-Sessions',
              onChange: (event) => setDraft(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') saveDir()
              },
            }),
            h(
              'button',
              { type: 'button', className: 'dss-btn', disabled: busy === 'save', onClick: saveDir },
              busy === 'save' ? '保存中' : '保存',
            ),
          ),
          h(
            'div',
            { className: 'dss-field' },
            h(
              'button',
              { type: 'button', className: 'dss-btn dss-btn--tiny', onClick: useSuggested },
              '填入 OneDrive 路径',
            ),
            state && state.exists === false
              ? h('span', { className: 'dss-panel__hint' }, '目录还不存在，第一次导出会自动创建')
              : null,
          ),
          h(
            'div',
            { className: 'dss-field' },
            h('span', { className: 'dss-field__label' }, '导入到'),
            h(
              'select',
              {
                className: 'dss-input',
                value: state && typeof state.importCwd === 'string' ? state.importCwd : '',
                disabled: busy !== '',
                onChange: (event) => saveImportCwd(event.target.value),
              },
              h('option', { value: '' }, '自动：原工作区，没有就当前工作区'),
              ...(state && Array.isArray(state.workspaces)
                ? state.workspaces.map((workspace) =>
                    h(
                      'option',
                      { value: workspace.path, key: workspace.path },
                      `${workspace.title || workspace.path}（${workspace.sessions}）`,
                    ),
                  )
                : []),
            ),
          ),
          h(
            'label',
            { className: 'dss-check' },
            h('input', {
              type: 'checkbox',
              checked: !state || state.includePlugins !== false,
              disabled: busy !== '',
              onChange: (event) => togglePlugins(event.target.checked),
            }),
            '导出时连带插件清单（作者、安装地址）',
          ),
          h(
            'div',
            { className: 'dss-sec' },
            h(
              'div',
              { className: 'dss-sec__head' },
              h('span', { className: 'dss-sec__title' }, '本机会话'),
              h('span', { className: 'dss-sec__count' }, state ? String(sessions.length) : '–'),
              h('span', { className: 'dss-sec__spacer' }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dss-btn dss-btn--tiny',
                  onClick: () => setPickedExport(new Set(sessions.map((item) => item.id))),
                },
                '全选',
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dss-btn dss-btn--tiny',
                  onClick: () => setPickedExport(new Set()),
                },
                '清空',
              ),
            ),
            h(
              'div',
              { className: 'dss-list' },
              listOfExport.length > 0
                ? listOfExport
                : h('div', { className: 'dss-empty' }, '本机还没有会话'),
            ),
            state && Number(state.localEmpty) > 0
              ? h(
                  'div',
                  { className: 'dss-panel__hint' },
                  `另有 ${state.localEmpty} 个只有系统事件、没有任何对话的空壳，已隐藏。`,
                )
              : null,
          ),
          h(
            'div',
            { className: 'dss-sec' },
            h(
              'div',
              { className: 'dss-sec__head' },
              h('span', { className: 'dss-sec__title' }, '文件夹里的会话'),
              h('span', { className: 'dss-sec__count' }, state ? String(bundles.length) : '–'),
              h('span', { className: 'dss-sec__spacer' }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dss-btn dss-btn--tiny',
                  onClick: () => setPickedImport(new Set(bundles.map((item) => item.id))),
                },
                '全选',
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dss-btn dss-btn--tiny',
                  onClick: () => setPickedImport(new Set()),
                },
                '清空',
              ),
            ),
            h(
              'div',
              { className: 'dss-list' },
              listOfImport.length > 0
                ? listOfImport
                : h('div', { className: 'dss-empty' }, '文件夹里还没有会话'),
            ),
            state && Number(state.folderEmpty) > 0
              ? h(
                  'div',
                  { className: 'dss-panel__hint' },
                  `目录里另有 ${state.folderEmpty} 个空壳包，已隐藏（导出时会清掉）。`,
                )
              : null,
            h(
              'label',
              { className: 'dss-check' },
              h('input', {
                type: 'checkbox',
                checked: overwrite,
                onChange: (event) => setOverwrite(event.target.checked),
              }),
              '覆盖本机已有的同名会话（谨慎）',
            ),
          ),
          error !== null ? h('div', { className: 'dss-note dss-note--err' }, error) : null,
          toast !== null
            ? h(
                'div',
                {
                  className:
                    'dss-note' +
                    (toast.tone === 'err'
                      ? ' dss-note--err'
                      : toast.tone === 'warn'
                        ? ' dss-note--warn'
                        : ' dss-note--ok'),
                },
                toast.message,
              )
            : null,
          h(
            'div',
            { className: 'dss-rowbtns' },
            h(
              'button',
              {
                type: 'button',
                className: 'dss-btn dss-btn--primary',
                disabled: busy !== '' || exportIds.length === 0,
                onClick: () => askExport(exportIds),
              },
              busy === 'export' ? '导出中…' : `导出所选 ${exportIds.length} 个`,
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dss-btn',
                disabled: busy !== '' || importIds.length === 0,
                onClick: () => askImport(importIds, overwrite),
              },
              busy === 'import' ? '导入中…' : `导入所选 ${importIds.length} 个`,
            ),
          ),
          h(
            'div',
            { className: 'dss-panel__hint' },
            '导出的会话按官方格式整份复制到你设定的目录；导入只补本机没有的会话，勾选「覆盖」才会替换已有记录。导入成功后页面会自动刷新。',
          ),
        )
      }

      let toastNode = null
      if (toast !== null && !open) {
        const style = { bottom: '56px', left: '12px' }
        if (frame !== null) {
          style.bottom = Math.max(8, frame.bottom + 44) + 'px'
          style.left = Math.max(8, Math.min(frame.left, window.innerWidth - 356)) + 'px'
        }
        toastNode = h(
          'div',
          { className: 'dss-ui dss-toast' + (toast.tone === 'err' ? ' dss-toast--err' : ''), style },
          toast.message,
        )
      }

      const bar =
        frame === null
          ? h('span', { className: 'dss-row-inline' }, row)
          : h(
              'div',
              {
                className: 'dss-ui dss-bar',
                style: { left: frame.left, width: frame.width, bottom: frame.bottom },
              },
              row,
            )

      const confirmNode =
        confirm === null
          ? null
          : h(
              'div',
              {
                className: 'dss-ui dss-veil',
                onMouseDown: (event) => {
                  if (event.target === event.currentTarget) setConfirm(null)
                },
              },
              h(
                'div',
                { className: 'dss-modal', role: 'dialog', 'aria-modal': 'true' },
                h('div', { className: 'dss-modal__title' }, confirm.title),
                h(
                  'div',
                  { className: 'dss-modal__body' },
                  confirm.body,
                  h('div', { className: 'dss-modal__path' }, confirm.path),
                  confirm.detail === '' ? null : h('div', null, confirm.detail),
                ),
                h(
                  'div',
                  { className: 'dss-modal__btns' },
                  h(
                    'button',
                    { type: 'button', className: 'dss-btn', onClick: () => setConfirm(null) },
                    '取消',
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dss-btn dss-btn--primary',
                      onClick: () => {
                        const pending = confirm
                        setConfirm(null)
                        if (pending.kind === 'export') runExport(pending.ids)
                        else runImport(pending.ids, pending.overwrite)
                      },
                    },
                    confirm.action,
                  ),
                ),
              ),
            )

      return h(
        React.Fragment,
        null,
        h('span', { className: 'dss-slot', ref: slotRef }),
        bar,
        panel,
        toastNode,
        confirmNode,
      )
    }

    // ─────────────────────────── 插件入口 ───────────────────────────

    const inject = ['slots']

    function apply(ctx) {
      try {
        boot(ctx)
      } catch (error) {
        // 插件自己的异常绝不能把整个界面带崩。
        try {
          console.error('[dsh-session-porter] 初始化失败', error)
        } catch {
          /* ignore */
        }
      }
    }

    function boot(ctx) {
      ensureStyles()
      const slots = ctx.slots
      if (!slots || typeof slots.inject !== 'function') return

      // 占位那一行留在这个 slot 里（用来量位置），真正显示的那条是固定定位在它上方。
      slots.inject('sidebar.footer.action', () =>
        slots.register(
          { name: 'sidebar.footer.action', id: 'session-porter', order: -10 },
          SyncFooter,
        ),
      )
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})