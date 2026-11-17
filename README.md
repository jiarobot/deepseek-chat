# DeepSeek Nexus

> 一个本地化、科技感十足的 DeepSeek 网页端替代工作台。把导出的历史会话完整迁移到本地数据库，在网页端限流时依旧可以稳定对话、检索与归档。

- 前端：React 18 + Vite + TypeScript（自定义深空霓虹视觉体系）
- 后端：Node.js + Express + TypeScript + SQLite（Node 内置 `node:sqlite`，无原生编译依赖）
- 通信：SSE 流式输出（思考过程 / 正文 / 引用结果分通道推送）
- 数据：9,537 个历史会话、约 1.4 GB 原始 JSON 全量归档，SQLite 压缩存储约 415 MB

配套文档：[API 文档](./API.md) · [用户手册](./用户手册.md)

---

## 1. 为什么做这个项目

DeepSeek 网页免费版近期频繁限流，日常使用体验受到明显影响。Nexus 将「历史记录 + 对话能力」搬回本地：

- 导出包中的全部会话、消息、思考过程、检索记录、代码与公式都能离线浏览；
- 通过自有 API Key 直连 DeepSeek 接口，不受网页端排队影响；
- 统一的科技感控制台：会话检索、置顶、重命名、导出、数据统计一屏完成。

## 2. 功能特性

### 对话

- 流式回答，逐字输出，可随时停止
- 深度思考模式（`deepseek-reasoner`），思考链可折叠、显示耗时
- 联网搜索：实时抓取网页资料注入上下文，回答带 `[编号]` 引用来源
- 重新生成、编辑用户消息并重新生成、复制回答
- 附件上传：文本/代码/JSON/CSV 等自动解析并加入上下文，图片可预览
- 自定义系统指令、温度、默认模式

### 历史与数据

- 自动导入 `chat_sessions/` 与 `chat_session_index.json`，增量对比文件修改时间
- 会话标题搜索、按时间分组、置顶、重命名、删除、分页加载
- 完整渲染历史内容：Markdown、GFM 表格、代码高亮、KaTeX 公式（兼容旧版 `\(...\)` / `\[...\]` 写法）、思考过程、联网检索卡片、附件
- 会话导出为 Markdown / JSON
- 数据中心：会话/消息/Token 汇总、月度活跃柱状图、18 周热力图、Token Top 8

### 工程与安全

- 账号体系：JWT + bcrypt，首次启动自动创建本地账号并绑定历史数据
- 多账号注册可开关，本地账号数据相互隔离
- **API Key 不写入任何配置文件**：只读取环境变量，或写入进程内存（重启失效）
- JWT 密钥首次启动随机生成并保存在本地数据库，不落到代码或配置中
- SQLite WAL + 负载 gzip 压缩，读写快、磁盘占用低

## 3. 快速开始

### 3.1 环境要求

- Node.js **>= 22.5**（依赖内置 `node:sqlite`；实测 Node 24.15.0）
- npm 9+
- Windows / macOS / Linux 均可

### 3.2 安装与构建

```powershell
npm install
npm run build
```

### 3.3 配置 API Key（任选其一，不会写入文件）

方式 A：环境变量（推荐，仅当前终端生效）

```powershell
$env:DEEPSEEK_API_KEY="sk-你的密钥"
npm start
```

方式 B：启动后在界面右上角「设置 → 模型与密钥」临时填入，密钥只保存在服务进程内存中，重启后清空。

> 本项目不会把 Key 写入 `.env`、源码、数据库或日志；`.gitignore` 已忽略所有 `.env*` 文件。服务日志只输出「已配置 / 未配置」与掩码。

### 3.4 启动

```powershell
npm start
```

打开 http://127.0.0.1:8787

默认账号（首次启动自动创建）：

| 账号 | 密码 |
| --- | --- |
| `owner` | `owner123` |

首次登录后请在「设置 → 账户」修改密码。可通过环境变量覆盖默认账号：

```powershell
$env:NEXUS_OWNER_USERNAME="owner"
$env:NEXUS_OWNER_PASSWORD="你的密码"
```

### 3.5 开发模式

```powershell
npm run dev
```

- 前端：http://127.0.0.1:5173（Vite HMR，`/api` 代理到 8787）
- 后端：http://127.0.0.1:8787（tsx watch）

## 4. 历史数据导入

启动时自动执行增量导入，来源为项目根目录：

```
chat_session_index.json   # 会话索引（9,537 条）
chat_sessions/*.json      # 单会话完整数据
chat_sessions/*_files/    # 会话附件
```

- 首次导入：约 20 秒（9,537 个会话，0 失败），数据库约 415 MB
- 后续启动：按文件 `mtime` 跳过未变化会话，仅数秒
- 手动触发：
  - 界面「设置 → 数据」：增量导入 / 全量重建
  - 命令行：`npm run import`（增量）或 `npm run import -- --force`（全量）
- 导入后的会话与新建会话统一存储在 `server/data/nexus.db`；原始导出 JSON 不会被修改

## 5. 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 空 | DeepSeek API Key（推荐方式，不落盘） |
| `PORT` | `8787` | 服务端口 |
| `HOST` | `127.0.0.1` | 监听地址 |
| `HOST` | `127.0.0.1` | 监听地址 |
| `DEEPSEEK_API_BASE` | `https://api.deepseek.com` | 接口地址（可指向代理） |
| `NEXUS_DATA_DIR` | `server/data` | 数据库与上传文件目录 |
| `NEXUS_EXPORT_DIR` | 项目根目录 | 历史导出数据目录 |
| `NEXUS_OWNER_USERNAME` | `owner` | 首次创建的账号名 |
| `NEXUS_OWNER_PASSWORD` | `owner123` | 首次创建的密码 |
| `NEXUS_OWNER_NAME` | `Nexus 主人` | 首次创建的显示名（会优先读取导出 `user.json` 的资料） |
| `NEXUS_ALLOW_REGISTER` | `1` | 设为 `0` 关闭注册 |
| `NEXUS_MOCK_LLM` | `0` | 设为 `1` 使用本地模拟模型（无 Key 时联调用） |

## 6. 项目结构

```
deepseek-chat/
├─ chat_session_index.json      # 导出索引（只读）
├─ chat_sessions/               # 导出会话与附件（只读）
├─ server/
│  ├─ src/
│  │  ├─ index.ts               # Express 入口、静态资源、启动导入
│  │  ├─ config.ts              # 环境变量与常量
│  │  ├─ db.ts                  # SQLite 结构、用户、KV、设置
│  │  ├─ importer.ts            # 历史数据增量导入
│  │  ├─ sessionStore.ts        # 会话负载压缩存取、分页、导出
│  │  ├─ middleware/auth.ts     # JWT 鉴权
│  │  ├─ routes/                # auth / sessions / chat / files / stats / settings / system
│  │  ├─ services/              # DeepSeek 流、提示词、联网搜索、附件解析、对话编排
│  │  └─ scripts/import.ts      # 手动导入脚本
│  ├─ data/                     # 运行时生成（nexus.db、uploads/，已忽略）
│  └─ tsconfig.json
├─ web/
│  ├─ index.html
│  └─ src/
│     ├─ App.tsx                # 路由与全局装配
│     ├─ pages/                 # Login / Chat / Stats
│     ├─ components/            # Sidebar、ChatHeader、MessageList、Composer、Settings…
│     ├─ store/useAppStore.ts   # 全局状态与流式编排
│     ├─ lib/                   # API 客户端、类型、工具、路由
│     └─ styles/                # 视觉系统与 Markdown 排版
├─ README.md
├─ API.md
└─ 用户手册.md
```

## 7. 技术设计要点

- **会话负载存储**：每个会话的完整 JSON 以 gzip 压缩后存入 `payloads` 表，元数据单独存于 `sessions`，兼顾完整性与列表查询性能。
- **流式协议**：服务端将 DeepSeek 的 SSE 转换为统一的 `session / status / search / reasoning / content / usage / done / error` 事件；客户端用 `fetch` + `ReadableStream` 消费，支持中断与断线恢复。
- **上下文构建**：只取 `REQUEST` / `RESPONSE` 片段，跳过思考与工具记录；按 12 万字符预算从尾部截断，自动合并同角色消息。
- **联网搜索**：抓取 Bing 结果页并解析标题/摘要/链接；长提问会先压缩为关键词，检索失败时明确提示模型「无法核实实时信息」。
- **安全边界**：附件访问支持 `?token=`（用于 `<img>`），服务端对所有导入文件路径做目录穿越校验。

## 8. 验证记录

构建：

- `npm run build` 通过（`tsc --noEmit` + Vite 生产构建 + 服务端 `tsc`）

数据导入：

- 9,537 个会话，新增 9,537，失败 0，数据库约 415 MB，耗时约 20 秒
- 再次启动增量导入：跳过 9,537 个，0 失败

接口验收（19 项全部 PASS）：

- 未登录返回 401、登录成功、错误密码拒绝
- 创建会话、上传并解析附件、SSE 流式对话、附件关键词进入上下文
- 消息持久化、附件片段写入、Markdown / JSON 导出
- 重命名与置顶、编辑消息截断、重新生成、标题搜索
- 统计汇总、删除会话与 404、删除附件
- 436 条长会话分页加载正确；历史附件读取 200（image/webp, 70 KB）；目录穿越请求返回 403

界面验收（1440×900 与 390×844）：

- 登录 → 欢迎页 → 侧栏历史列表正常
- 历史会话渲染：8 条消息、104 个 KaTeX 公式、24 个代码块、4 个思考块
- 新建对话 + 真实模型流式回答：用户消息与助手消息同时正确显示
- 数据中心：9,537 会话 / 147,218 条消息 / 207.3 亿 Token
- 设置弹窗、移动端欢迎页无裁切，浏览器控制台无报错

## 9. 已知限制

- 联网搜索依赖 Bing 结果页解析，网络受限或页面结构变化时可能返回空结果；此时回答会明确说明无法核实实时信息。
- DeepSeek 对话接口不支持图片理解：图片附件仅做本地预览，模型只会收到文件名说明。
- 服务为单进程设计，适合本机 / 小范围使用；未实现团队协作与实时共享。
- 历史数据中的部分旧附件若在导出包中缺失，界面会保留文件名但无法预览。
- 网页端限流与账户余额仍由 DeepSeek 官方策略决定（HTTP 429 / 402 会在界面提示）。

## 10. 常见问题

更多排障细节见 [用户手册 · 常见问题](./用户手册.md#7-常见问题)。

- **提示 401**：Key 无效/过期，或未配置。设置环境变量后重启，或在设置中临时填写。
- **提示 429**：仍被官方限流，稍后重试或更换 Key。
- **端口被占用**：设置 `$env:PORT=8790` 后重启。
- **导入很久未完成**：首次导入需读取 1.4 GB 文件，请等待侧栏进度条完成；也可执行 `npm run import` 观察日志。
- **想重置本地数据**：停止服务后删除 `server/data/nexus.db*`，重启会重新创建账号并导入历史。
