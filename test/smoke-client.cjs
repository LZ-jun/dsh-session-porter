// 冒烟测试：在 Node 里假装浏览器环境，加载 client.js 并调用 apply()。
// 目的：确认模块本身能求值、apply 不会抛异常（这两步出错会让宿主启动失败）。
const fs = require('node:fs')
const path = require('node:path')

let loaded = null
const styleTags = []

global.window = {
  __ModuleLoader__: {
    load: ({ id, factory }) => {
      loaded = { id, module: factory((name) => (name === 'react' ? fakeReact : undefined)) }
    },
  },
  innerHeight: 900,
  innerWidth: 1400,
  addEventListener() {},
  removeEventListener() {},
  getComputedStyle: () => ({ display: 'flex', flexDirection: 'row' }),
}
global.document = {
  baseURI: 'http://127.0.0.1:1/',
  head: {
    appendChild(node) {
      styleTags.push(node)
    },
  },
  querySelector: () => null,
  createElement: (tag) => ({ tag, dataset: {}, textContent: '' }),
  addEventListener() {},
  removeEventListener() {},
}
global.ResizeObserver = class {
  observe() {}
  disconnect() {}
}
global.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) })

const fakeReact = {
  createElement: (...args) => ({ args }),
  Fragment: 'fragment',
  useState: (value) => [value, () => {}],
  useRef: (value) => ({ current: value }),
  useEffect() {},
  useLayoutEffect() {},
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
}

const file = path.join(__dirname, '..', 'lib', 'client.js')
const source = fs.readFileSync(file, 'utf8')
// 用 Function 执行，模拟浏览器里作为脚本求值。
new Function(source)()

if (loaded === null) throw new Error('模块没有调用 __ModuleLoader__.load')
if (typeof loaded.module.apply !== 'function') throw new Error('没有导出 apply')
if (typeof loaded.module.inject === 'undefined') throw new Error('没有导出 inject')

const registered = []
const ctx = {
  slots: {
    inject: (name, run) => run(),
    register: (spec, component) => {
      registered.push({ spec, component })
    },
  },
}

loaded.module.apply(ctx)
if (registered.length !== 1) throw new Error('apply 没有注册 slot：' + registered.length)
if (styleTags.length !== 1) throw new Error('CSS 没有注入')

// 真正跑一遍组件函数：能把「JSX 里引用了未定义变量」这类错误挡在发布前。
const component = registered[0].component
for (const wide of [true, false]) {
  const tree = component({ wide })
  if (tree === null || tree === undefined) throw new Error('组件没有返回元素')
}

console.log('OK id=' + loaded.id)
console.log('slot=' + JSON.stringify(registered[0].spec))
console.log('component=' + typeof registered[0].component)
console.log('css bytes=' + styleTags[0].textContent.length)