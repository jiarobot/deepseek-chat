# DeepSeek Nexus · API 文档

- Base URL：`http://127.0.0.1:8787`
- 所有业务接口前缀：`/api`
- 请求/响应编码：`UTF-8`
- JSON 请求需设置 `Content-Type: application/json`
- 时间字段：ISO 8601（UTC，如 `2026-11-17T13:45:00.000Z`）

---

## 1. 认证

除 `GET /api/health` 与登录/注册外，其余接口都需要携带 JWT：

```
Authorization: Bearer <token>
```

文件类接口（`/api/files/:id/raw`、`/api/imported-file`）额外支持查询参数方式，方便 `<img src>`：

```
/api/files/<id>/raw?token=<token>
```

Token 默认有效期 30 天。密钥在首次启动时随机生成并保存在本地 SQLite 的 `kv` 表中，不写入任何配置文件。

### 1.1 登录

`POST /api/auth/login`

```json
{ "username": "owner", "password": "owner123" }
```

响应 `200`：

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "u_9f2c...",
    "username": "owner",
    "displayName": "佳木逢钺-慕秦",
    "avatarUrl": "https://...",
    "createdAt": "2026-11-17T12:00:00.000Z"
  }
}
```

错误：`400` 缺少参数、`401` 账号或密码错误。

### 1.2 注册

`POST /api/auth/register`

```json
{ "username": "alice", "password": "secret123", "displayName": "Alice" }
```

- 账号规则：2–24 位中文/字母/数字/下划线/中划线
- 密码长度：6–64 位
- 可通过 `NEXUS_ALLOW_REGISTER=0` 关闭注册（返回 `403`）
- 新账号不继承历史会话

响应 `201`，结构同登录。

### 1.3 当前用户

`GET /api/auth/me` → `{ "user": { ... } }`

### 1.4 修改密码

`POST /api/auth/password`

```json
{ "currentPassword": "owner123", "newPassword": "newpass123" }
```

响应：`{ "ok": true }`

---

## 2. 会话

### 2.1 会话列表

`GET /api/sessions?q=<标题关键词>&limit=100&offset=0`

- `q` 可选，按标题模糊搜索（中文友好）
- `limit` 默认 100，最大 500
- 排序：置顶优先，其次更新时间倒序

响应：

```json
{
  "items": [
    {
      "id": "00010e63-6fb3-452d-a58d-ffe33a93b130",
      "title": "条带卷积的学术解析与应用",
      "pinned": true,
      "source": "import",
      "messageCount": 8,
      "tokenTotal": 436,
      "createdAt": "2025-04-12T09:21:00.000Z",
      "updatedAt": "2025-04-12T10:02:00.000Z"
    }
  ],
  "total": 9537,
  "hasMore": true
}
```

### 2.2 会话详情（分页）

`GET /api/sessions/:id?limit=40&before=<messageId>`

- 默认返回最后 40 条消息
- `before` 用于加载更早消息，返回该消息 id 之前的一页

响应：

```json
{
  "session": { "...": "SessionSummary" },
  "messages": [ { "...": "ChatMessage" } ],
  "total": 128,
  "startIndex": 88,
  "hasMore": true
}
```

### 2.3 新建空会话

`POST /api/sessions`

```json
{ "title": "新的对话" }
```

响应 `201`：`{ "session": { ... } }`

> 直接调用 `/api/chat` 且不传 `sessionId` 也会自动创建会话，标题取首条消息前 28 个字符。

### 2.4 重命名 / 置顶

`PATCH /api/sessions/:id`

```json
{ "title": "新的标题", "pinned": true }
```

两个字段均可选。响应：`{ "ok": true, "session": { ... } }`

### 2.5 删除会话

`DELETE /api/sessions/:id` → `{ "ok": true }`

软删除：`sessions.deleted_at` 置为当前时间，列表与统计不再包含；原始导出 JSON 不受影响。

### 2.6 清空全部会话

`DELETE /api/sessions` → `{ "ok": true, "count": 9537 }`

### 2.7 编辑用户消息

`POST /api/sessions/:id/messages/:messageId/edit`

```json
{ "content": "修改后的提问" }
```

行为：替换该条用户消息的 `REQUEST` 片段，并截断其后的全部消息。响应：`{ "ok": true, "message": {...}, "removedAfter": 3 }`。

### 2.8 导出会话

`GET /api/sessions/:id/export?format=md|json`

- 返回文件流，`Content-Disposition` 带 UTF-8 文件名
- `md`：标题 + 每轮对话 + 思考过程 + 检索查询
- `json`：完整会话负载（与导入结构一致）

---

## 3. 对话（SSE 流式）

### 3.1 发送消息

`POST /api/chat`

```json
{
  "sessionId": "可选，缺省则新建会话",
  "content": "用一句话解释量子纠缠",
  "attachments": ["附件 id"],
  "thinking": false,
  "search": false,
  "temperature": 0.7
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `sessionId` | string? | 目标会话 |
| `content` | string | 消息正文，最长 60000 字符 |
| `attachments` | string[] | 通过 `/api/files` 上传得到的 id，最多 8 个 |
| `thinking` | boolean | `true` 时使用 `deepseek-reasoner`，否则 `deepseek-chat` |
| `search` | boolean | 是否先联网检索再回答 |
| `temperature` | number | 0–2，reasoner 模式下忽略 |

响应头：

```
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
```

事件格式为 `data: {JSON}\n\n`，按顺序可能出现：

| type | 载荷 | 说明 |
| --- | --- | --- |
| `session` | `session`, `messageCount`, `userMessage?` | 会话已创建/已定位，用户消息已入库 |
| `status` | `status`, `message` | 阶段提示（检索中/生成中） |
| `search` | `fragment` | 联网检索结果片段（可先渲染） |
| `reasoning` | `delta` | 思考过程增量 |
| `content` | `delta` | 正文增量 |
| `usage` | `usage` | Token 用量（通常最后一并返回） |
| `done` | `message`, `session`, `usage`, `model`, `durationMs` | 生成完成，助手消息已持久化 |
| `error` | `code`, `message` | 生成失败（见错误码） |
| `ping` | `t` | 心跳，客户端应忽略 |

示例：

```
data: {"type":"session","session":{"id":"...","title":"..."},"messageCount":1,"userMessage":{...}}

data: {"type":"reasoning","delta":"我们先分析"}

data: {"type":"content","delta":"量子纠缠是"}

data: {"type":"done","message":{...},"session":{...},"usage":{"completion_tokens":42,"total_tokens":100},"model":"deepseek-chat","durationMs":3210}
```

客户端中断连接时，服务端会中止上游请求，并把已生成的部分保存为 `INCOMPLETE` 消息。

### 3.2 重新生成

`POST /api/sessions/:id/regenerate`

```json
{ "thinking": false, "search": false, "temperature": 0.7 }
```

行为：删除末尾的助手消息，基于最后一条用户消息重新生成。事件流与 `/api/chat` 相同（`session` 事件不含 `userMessage`）。

### 3.3 错误码

| code | 含义 |
| --- | --- |
| `NO_API_KEY` | 未配置 API Key |
| `INVALID_KEY` | Key 无效或过期（HTTP 401） |
| `NO_BALANCE` | 余额不足（HTTP 402） |
| `RATE_LIMIT` | 被官方限流（HTTP 429） |
| `UPSTREAM` | DeepSeek 返回的其他 4xx/5xx |
| `NETWORK` | 网络无法连接 |
| `STREAM` | 响应流中断 |
| `ABORTED` | 客户端中止 |

---

## 4. 文件

### 4.1 上传

`POST /api/files`，`multipart/form-data`，字段名 `file`

- 单文件上限 32 MB，单次请求 1 个文件
- 文本类文件会自动提取内容（最多 200,000 字符）供模型使用

响应 `201`：

```json
{
  "id": "e3d0...",
  "name": "note.md",
  "size": 128,
  "mime": "text/markdown",
  "isImage": false,
  "hasText": true,
  "url": "/api/files/e3d0.../raw"
}
```

### 4.2 读取

`GET /api/files/:id/raw[?token=...]`

返回原始文件流（带 `Content-Type`），用于图片预览与附件下载。

### 4.3 删除

`DELETE /api/files/:id` → `{ "ok": true }`

### 4.4 读取导出包内附件

`GET /api/imported-file?path=chat_sessions/<sessionId>_files/<file>[&token=...]`

- `path` 相对于项目根目录（导出目录）
- 服务端会校验解析后的路径必须位于导出目录内，防止目录穿越

---

## 5. 设置

### 5.1 读取

`GET /api/settings`

```json
{
  "settings": {
    "model": "deepseek-chat",
    "thinking": false,
    "search": false,
    "temperature": 0.7,
    "systemPrompt": "",
    "theme": "dark"
  }
}
```

### 5.2 更新

`PUT /api/settings`（字段均可选）

```json
{ "thinking": true, "model": "deepseek-reasoner", "temperature": 0.5, "theme": "dark" }
```

- `model`：`deepseek-chat` / `deepseek-reasoner`
- `temperature`：0–2
- `systemPrompt`：最长 4000 字符
- `theme`：`dark` / `light`

响应：`{ "settings": { ... } }`

---

## 6. 系统

### 6.1 健康检查

`GET /api/health`（公开）

```json
{ "ok": true, "time": "2026-11-17T13:45:00.000Z", "port": 8787 }
```

### 6.2 运行状态

`GET /api/system/status`

```json
{
  "version": "1.0.0",
  "apiBase": "https://api.deepseek.com",
  "apiKey": { "configured": true, "masked": "sk-****c1e0", "source": "env" },
  "models": [ { "id": "deepseek-chat", "...": "..." } ],
  "import": {
    "status": "done",
    "total": 9537,
    "done": 9537,
    "imported": 9537,
    "skipped": 0,
    "failed": 0,
    "startedAt": "...",
    "finishedAt": "...",
    "message": "导入完成：新增/更新 9537 个，跳过 0 个，失败 0 个"
  },
  "importing": false,
  "dbSize": 435789824,
  "uptime": 120.5,
  "node": "v24.15.0"
}
```

`apiKey.masked` 只返回掩码；任何接口都不会返回完整 Key。

### 6.3 触发导入

`POST /api/system/import`

```json
{ "force": false }
```

- `force=false`：增量（按 mtime 跳过未变化文件）
- `force=true`：全量重写会话内容
- 任务异步执行，通过 `system/status` 轮询进度；重复触发返回 `409`

### 6.4 设置运行期 API Key

`POST /api/system/api-key`

```json
{ "key": "sk-..." }
```

仅写入当前进程内存，不落盘；重启失效。

`DELETE /api/system/api-key` 清除运行期 Key（若环境变量存在，仍会继续使用环境变量）。

### 6.5 模型列表

`GET /api/models`

```json
{
  "models": [
    { "id": "deepseek-chat", "label": "DeepSeek 通用对话", "shortLabel": "deepseek-chat", "description": "响应快速，适合日常问答、写作与代码", "supportsThinking": false },
    { "id": "deepseek-reasoner", "label": "DeepSeek 深度思考", "shortLabel": "deepseek-reasoner", "description": "先思考再回答，适合复杂推理与数学", "supportsThinking": true }
  ]
}
```

---

## 7. 统计

`GET /api/stats`

```json
{
  "totals": { "sessions": 9537, "messages": 147230, "tokens": 20734594040, "pinned": 99, "imported": 9537, "local": 0 },
  "months": [ { "month": "2026-11", "count": 128, "messages": 3200 } ],
  "activity": [ { "date": "2026-11-17", "count": 6 } ],
  "top": [ { "id": "...", "title": "...", "messageCount": 78, "tokenTotal": 12000, "updatedAt": "..." } ],
  "range": { "first": "2025-01-01T00:00:00.000Z", "last": "2026-11-17T00:00:00.000Z" }
}
```

---

## 8. 数据结构

### 8.1 SessionSummary

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 会话 id（历史会话沿用导出 id） |
| `title` | string | 标题 |
| `pinned` | boolean | 是否置顶 |
| `source` | `import` / `local` | 来源 |
| `messageCount` | number | 消息数 |
| `tokenTotal` | number | Token 累计 |
| `createdAt` / `updatedAt` | string | 时间 |

### 8.2 ChatMessage

```json
{
  "id": 11,
  "parent_id": 10,
  "role": "ASSISTANT",
  "status": "FINISHED",
  "thinking_enabled": true,
  "search_enabled": false,
  "accumulated_token_usage": 436,
  "inserted_at": "2026-11-17T13:45:00.000Z",
  "fragments": []
}
```

`status` 可能为 `FINISHED`、`INCOMPLETE`、`TIMEOUT`、`CONTENT_FILTER`。

### 8.3 Fragment

| type | 关键字段 | 说明 |
| --- | --- | --- |
| `REQUEST` | `content` | 用户提问 |
| `RESPONSE` | `content` | 助手正文（Markdown） |
| `TEMPLATE_RESPONSE` | `content` | 模板/系统提示类回答 |
| `THINK` | `content`, `elapsed_secs` | 思考过程 |
| `TOOL_SEARCH` | `queries`, `results[]` | 联网检索查询与结果 |
| `FILE` | `files[]` | 附件信息（含 `export_path` / `url`） |
| `CONTENT_RISK` | `content` | 内容风险/免责声明 |
| `TOOL_OPEN` | `url`, `title` | 打开网页记录 |
| `READ_LINK` / `PARTIAL_FILE_READ` | 结构各异 | 旧版网页工具记录，前端以轻量提示展示 |

`TOOL_SEARCH.results[]`：

```json
{ "title": "DeepSeek 开放平台", "url": "https://platform.deepseek.com", "snippet": "…", "siteName": "platform.deepseek.com" }
```

---

## 9. 调用示例

```powershell
# 登录并保存 token
$login = Invoke-RestMethod -Uri http://127.0.0.1:8787/api/auth/login `
  -Method Post -ContentType 'application/json' `
  -Body (@{ username='owner'; password='owner123' } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.token)" }

# 会话列表
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/sessions?limit=5' -Headers $h

# 流式对话（curl -N 不缓冲）
curl.exe -N -X POST http://127.0.0.1:8787/api/chat `
  -H "Authorization: Bearer $($login.token)" `
  -H "Content-Type: application/json" `
  -d '{\"content\":\"你好，介绍一下你自己\",\"thinking\":false,\"search\":false}'
```

```javascript
// Node 18+ 读取 SSE
const res = await fetch('http://127.0.0.1:8787/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ content: '用一句话介绍 SSE', thinking: false })
});
const reader = res.body.getReader();
const decoder = new TextDecoder();
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  process.stdout.write(decoder.decode(value, { stream: true }));
}
```

---

## 10. HTTP 状态码

| 状态码 | 含义 |
| --- | --- |
| `200` | 成功 |
| `201` | 创建成功 |
| `400` | 参数错误 |
| `401` | 未登录 / 密钥错误 |
| `403` | 注册关闭 / 非法路径 |
| `404` | 资源不存在 |
| `409` | 冲突（如导入任务已在运行） |
| `500` | 服务端异常 |
