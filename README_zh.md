# dsh-todo-ledger

[English](README.md) | [中文](README_zh.md)

仓库：https://github.com/haruri03/dsh-todo-ledger

把 **todo 账本工作流**做成 DSH 宿主级插件：
**常驻提示段** + **原生工具** + **待办目录里的上下文留存**。

它解决的是「靠 skill / AGENTS.md 提醒，模型容易忘、要在每轮重写清单」的问题：

| 旧做法 | 这个插件 |
|---|---|
| 规则写在 AGENTS.md / skill 里，模型不读就失效 | 宿主级 `systemPrompt.section`，每个会话每步都在，不依赖模型记得加载 |
| 用系统 `todo_write` 每轮覆盖式重写，进度丢失 | 权威状态落在仓库 `_todo/` 文件里，跨会话、跨压缩都在 |
| 上下文只存在于对话历史，压缩后丢失 | `todo_checkpoint` / `todo_note` 把结论和下一步写进 `_todo/context/`，每次组装自动注入快照 |
| 模型要自己拼 shell 命令 | 11 个原生工具，schema 校验、错误可读 |

文件格式与外部 todo CLI **完全一致**，同一个仓库插件和原版 CLI 都能写、都能 `doctor`。

## 安装（手动）

任选其一：

**人类**：把本目录复制到 `$HOME/.dsh/profiles/<profile>/node_modules/dsh-todo-ledger`，再在 profile 的 `cordis.patch.yml` 追加：

```yaml
- insert:
    - id: todo-ledger
      name: './lib/index.js'
```

**Agent**：让 agent 运行 `plugin_manager install_bundle --target "<path-to-plugin>"`。

### 从 Git 自动安装

仓库根就是包（含 `package.json` 与 `dsh.bundle`）时，可以直接用 Git 地址安装：

```powershell
plugin_manager install_bundle --target "git+https://github.com/haruri03/dsh-todo-ledger.git"
```

等价的人类操作：Web 插件页「添加插件」粘贴同一地址，或命令行：

```powershell
dsh plugin --profile <profile> add "git+https://github.com/haruri03/dsh-todo-ledger.git"
```

也支持 npm 包名与 tarball URL。更新时先卸载再安装，或等待上游发版。

装好后新会话的系统提示里会出现「【todo-ledger · 跨会话任务与上下文】」段；工具列表里多出
`todo_list / todo_add / todo_show / todo_status / todo_complete / todo_archive / todo_note / todo_checkpoint / todo_snapshot / todo_doctor / todo_init`。
无需重启。

## 目录与文件格式

在仓库根（含 `_todo/` 的目录）下；已经用 `todo/` 的旧仓库继续可用，两个名字只认其一：

```
_todo/
├── todo.md              队列：`- [status] slug`
├── tasks.md             目录：`- [status] **slug** — 标题 → [详情](tasks/slug.md)`
├── tasks/<slug>.md      详情：目标 / 子项 / 验收 / 进度 / 阻塞 / 相关文件
├── archived/<slug>.md   结案 + ## 交付记录（含签收原话）
├── AGENTS.md            todo_init 生成的目录说明
└── context/             ← 本插件新增
    ├── now.md           当前目标 / 下一步 / 关键文件（todo_checkpoint 覆盖写）
    └── log.md           追加式流水（工具操作自动留痕 + todo_note）
```

状态只有 `todo` / `doing` / `blocked` / `review`；没有 `done`。`review` = 做完等负责人签收。
结案必须带 `evidence` 与 `signoff`（负责人原话），缺一不可——这是 todo 账本工作流的硬规则。

## 工具

| 工具 | 作用 |
|---|---|
| `todo_list` | 列出任务与状态（可按状态筛），开工先调 |
| `todo_show` | 看某任务详情 |
| `todo_add` | 新建任务（slug kebab-case，唯一） |
| `todo_status` | 改状态，同步详情 frontmatter / 索引 / 队列 |
| `todo_complete` | 结案归档，必须 `evidence` + `signoff` |
| `todo_archive` | 放弃归档，另需 `reason` |
| `todo_note` | 往 `context/log.md` 追加流水；带 `slug` 时**插入该任务「## 进度」节末尾**（首次写入清掉模板占位句）；带 `state` 时**顺手推进状态机**（治“只 note 不改状态”） |
| `todo_checkpoint` | 覆盖写 `context/now.md`：当前目标 / 下一步 / 关键文件 |
| `todo_snapshot` | 只读：返回当前会注入提示词的那份快照（用来确认账本是不是又旧了） |
| `todo_doctor` | 双向一致性校验，返回 errors / warns |
| `todo_init` | 建 `_todo/` 骨架（只在用户要求时） |

所有工具都接受可选 `root`，方便对工作区之外的仓库操作，例如：
`todo_doctor { root: "<repo-root>" }`。

## 上下文是怎么留下来的

1. 每次组装系统提示时，插件读会话工作目录，向上找 `_todo/`，注入：
   - **账本最后写入：X 前**（`context/log.md` / `tasks.md` / `now.md` 的最大 mtime）；
   - **本会话记账陈旧度**：最近一次 `todo_*` 写入之后又发生多少次工具调用、其中多少是写入类；
     写入类 ≥3 时打 ⚠ 要求先补账；
   - **任务总计**（四态计数）+ **待签收 review**（带 `(Nd)` 挂了几天）+ **阻塞 blocked** 的 slug；
   - **doing 任务的进度**：取该任务「## 进度」节**最后一条**真实内容（≤80 字），
     没有进度就整行省略（不打印「（无进度）」这类空标记）；状态 ≥2 天没变会标「状态 Nd 未变」；
     模板占位句一律过滤。
   - `context/now.md` 正文与最近 6 条流水。
2. 每轮结束（`agent/turn-stopping`）按 **turn 边界**统计本轮写入类操作：≥3 次就自动往
   `context/log.md` 补一条事实流水（工具次数 / 写入类次数 / 状态推进次数），不编语义。
   本轮只有 note 没有状态推进时，会明确写「状态机没推进」。**刻意不以「最后一次 todo 写入」
   为起点**——否则收尾一条 `todo_note` 会把计数清零，掩盖「本轮猛改一堆文件、只留一句 note」。
3. `todo_checkpoint` 写结论（不是大段原文）；`todo_note` 记零碎发现；写操作自动追加流水。
4. 会话被压缩、换新会话、重启 DSH 之后，下一个回合的提示里仍然带着这份快照 → 接着干。
5. 没有 `_todo/` 时只注入规则并提示可以用 `todo_init`，不会擅自建目录。

> 还没解决的那一半：语义摘要仍要模型自己写。插件能做的是把「账本旧了」变成提示里的
> 事实和 ⚠，而不是替模型编造结论。

## 配置

`cordis.patch.yml` 里这一行可以改：

```yaml
- id: todo-ledger
  name: './lib/index.js'
  config:
    root: "<repo-root>"                # 可选：固定仓库根
    sectionOrder: 180                  # 提示段排序，默认 180
    maxSnapshotChars: 4000             # 快照上限，默认 4000
```

不填 `root` 时按「会话工作目录向上找 `_todo/tasks.md`」；再没有就用 `TODO_ROOT` 环境变量。

## 验证

```powershell
node test/smoke.mjs
```

覆盖：提示段注册与快照渲染、11 个工具 schema、init→add→status→note→checkpoint→doctor→complete/archive
全流程、缺 `signoff` 拒绝结案。设置 `TODO_CLI` 时额外验证与外部 `todo.js` 的 `list`/`doctor` 互通。

## 卸载

```powershell
plugin_manager remove_bundle --target dsh-todo-ledger
```

插件只删自己的注册；`_todo/` 目录（含 context/）不会被删。
