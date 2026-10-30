# dsh-session-porter

DeepSeek Harness 插件：**一键把对话导出到你指定的目录，换台电脑再一键导回来**。

侧边栏左下角（余额上面）一排两个按钮 —— **导出** / **导入**，点开就能挑会话、挑目录、选要不要覆盖；
真正动手之前还有一道确认弹窗，防止手滑。默认导出目录指向 OneDrive 这类同步盘，于是「不同电脑用同一批对话」这件事只需要点两下。

<details>
<summary><b>English overview</b></summary>

A DeepSeek Harness (DSH) plugin that moves conversations between machines in two clicks. Two buttons
sit in the sidebar foot, above the balance chip: **Export** writes the sessions you pick to a folder
you choose (OneDrive, a network share, a USB stick — anything the host can write), and **Import** reads
that folder back on the other machine. Sessions are selected per-bundle, contentless sessions are
skipped, overwriting is a switch, and both actions go through a confirm dialog first.

Everything is local: the client half talks to the host half over one loopback route
(`/dsh-session-porter/*`), gated by a same-origin check plus a custom header. No network calls, no
telemetry, no third-party service.

`npm test` runs `test/smoke-client.cjs`, a dependency-free offline check that loads the client bundle
in a fake browser environment, calls its `apply()`, and renders the component once — the exact class
of failure that would otherwise take the whole Web UI down.

The rest of this document is in Chinese.

</details>

---

## 它做什么

### 导出

- 点左下角的 **导出**，弹窗里选会话（默认全选有内容的那些）、确认目录，再点一次确认。
- 每份会话在 `<导出目录>/sessions/session-<id>/` 下成为一个独立目录，里面是：

  | 文件 | 说明 |
  | --- | --- |
  | `session.v4.jsonl.zstd` | 原始会话日志（第几版就是 `v` 后面那个数字，未压缩时没有 `.zstd`） |
  | `meta.json` | 标题、工作目录、创建时间、preset、字节数、导出时间 |
  | `attachments/` | 这份会话引用到的附件（有才写） |

- 导出结束后会**清掉目录里已经变成空壳的旧会话目录**，所以同步盘里不会越积越多。
- 会话目录之外还会写两份清单：`dsh-session-porter.json`（标记这是 DSH 同步目录）和 `plugins.json`（见下）。

### 导入

- 点 **导入**，默认读同一个目录（也可以在设置里单独指定导入目录），列出对端有哪些会话、哪些这台机器已经有了。
- **覆盖**是开关：关着的时候同名会话会被跳过，开着才替换。
- 正在运行的会话会被**拒绝导入**（写了也会被这个进程覆盖，没有意义）。
- 空会话（从头到尾没有一句 `user`/`assistant` 消息的壳子）不扫描、不导出、不导入。

### 插件清单

设置里有一项 **导出插件列表**（默认勾选）。勾上时会在导出目录写一份 `plugins.json`，逐条记录：

`name` / `title` / `version` / `description` / `author` / `license` / `homepage` / `repository` / `keywords` /
`kind` / `installPath` / `installSource` / `profile` / `enabled`

它是给人看的，也是给新机器照着装的对照表 —— **只导出，不导入**。

## 安装

在插件市场（dshmarket）里搜 **dsh-session-porter** 直接安装，然后重启 DSH。

也可以把它当作本地 bundle 装进某个 profile（`dsh.bundle.patch` 指向仓库根的 `cordis.patch.yml`）。

要求：DSH 自带 Web UI，Node ≥ 22（宿主侧要用 `zlib.zstdDecompressSync` 解会话日志）。

## 配置

插件自己的配置在 `<dsh home>/session-porter.json`（跟 `sessions/` 同级），也可以在设置面板里改：

```json
{
  "schema": "dsh-session-porter/v1",
  "exportDir": "C:\\Users\\<you>\\OneDrive\\DSH-Sessions",
  "importCwd": "",
  "includePlugins": true,
  "lastExportedAt": 1793383216210,
  "lastImportedAt": null
}
```

`importCwd` 留空就跟着 `exportDir` 走。从更早的版本（`session-sync.json`）升级上来的，旧配置会被只读地沿用。

## 界面

- 入口在 `sidebar.footer.action` 槽位，`order: -10`，排在余额插件那一行**上面**。
- 按钮没有底色，只有 1px 描边；配色直接跟随宿主深色主题（和余额插件同一套 `--dsw-alias-*` 取值）。
- 面板、弹窗、提示都锚在这个入口上，不会撑高侧边栏。

## 隐私

- 只读本机会话日志与插件元数据，只往你选定的目录写文件。
- 没有任何外部请求：不联网、不上报、不碰账号凭据。
- `plugins.json` 里只有元数据，不包含任何密钥或 token。

## 已知边界

- 导入会重建会话日志，**不会**改动工作区里的文件；工作区路径对不上时，会话里的历史记录仍然完整，只是新消息会落在当前工作区。
- 同名会话 id 冲突时以「覆盖」开关为准，关着就跳过。
- 插件清单只导出不导入。

## 开发

```sh
npm test        # 加载 client bundle、调用 apply()、渲染一遍组件
```

仓库结构：

```
lib/host.js     # 很薄：注册 /dsh-session-porter 路由，按 mtime 热加载 impl.js
lib/impl.js     # 全部逻辑：扫描会话、导出、导入、插件清单
lib/client.js   # 侧边栏按钮、设置面板、确认弹窗
cordis.patch.yml
test/smoke-client.cjs
```

## License

MIT © LZ-jun