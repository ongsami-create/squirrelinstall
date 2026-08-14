# Squirrel Install

下单到安装的全流程追踪系统。业务员通过 Google Calendar 看进度，下单员在系统里录入。

## 项目架构

- **前端**: `index.html` - 单文件 SPA，Vue 3 (CDN)，所有 CSS/JS 内联
- **后端**: GAS `Code.gs` - 独立 GAS 项目，11 个 action
- **存储**: Google Drive 文件夹 `SquirrelInstall_Records/`，每工程 1 个 JSON
- **部署**: GitHub Pages (`ongsami-create/squirrelinstall`) + GAS Web App
- **Calendar**: 公司 Google Workspace 共享日历 (squirreldesigner9068@gmail.com)

## 仓库地址

- 仓库: https://github.com/ongsami-create/squirrelinstall
- 部署: https://ongsami-create.github.io/squirrelinstall/

## 本地路径

- 主源: `C:\Users\sami_\.minimax-agent-cn\projects\31\squirrelinstall\`
- 备份: 每次发布前复制 `index.html` → `index_backup_YYYYMMDD_HHMMSS_<tag>.html`

## GAS URL

部署后填到 `index.html` 的 `GAS_URL` 常量。每次 GAS 改完需要去编辑器"部署 → 管理部署 → 新建版本"。

## 数据模型

```javascript
{
  id: 'uuid',                        // 主键
  projNo: 'PSD01-2401',              // 工程编号
  customerPhone: '012-3456789',
  customerAddress: 'No. 123 Jalan ABC, KL',
  salesperson: 'PEGGY',              // 业务员简称 (PSD/PEGGY/FSD/STELLA/...)
  salespersonPhone: '011-12345678',
  stage: 'order',                    // 当前阶段: order|container|arrival|install
  stages: {                          // 4 阶段详细数据
    order:     { date: 'YYYY-MM-DD', factory: '',   remarks: '' },
    container: { date: 'YYYY-MM-DD', company: '',   remarks: '' },
    arrival:   { date: 'YYYY-MM-DD', location: '',  remarks: '' },
    install:   { date: 'YYYY-MM-DD', installer: '', remarks: '' }
  },
  customColumns: [],                 // v2: 用户自定义栏目 [{name, type, value}]
  createdAt: 'ISO datetime',
  updatedAt: 'ISO datetime'
}
```

## 业务员简称 → 真实名字映射

| 简称 | 真名 |
|---|---|
| admin | Administrator |
| SSD  | SAMI |
| PSD  | PEGGY |
| FSD  | STELLA |
| JSD  | JESSY |
| TSD  | VICTOR |
| VSD  | JOVEN |
| TESD | TEO |
| ASD  | ANDREW |

这是项目里的硬编码映射。所有涉及"判定 quote 归属" / "过滤" / "显示" 的逻辑都用这个映射。

## GAS Action 清单

| Action | 用途 |
|---|---|
| `addManualRecord` | 手动补单，存 1 条 JSON，**自动同步 Calendar** |
| `importRecords`   | 批量导入（JSON 上传），**逐条自动同步 Calendar** |
| `getAllRecords`   | 拉所有记录 |
| `getRecord`       | 单条详情 |
| `updateRecord`    | 局部更新（合并 + sanitize），**自动同步 Calendar** |
| `deleteRecord`    | 移到回收站 + **删除 Calendar event** |
| `syncToCalendar`  | 手动同步单条到 Calendar（fallback） |
| `health`          | 健康检查，返回 version |

## 颜色规范（4 阶段）

- 下单 (order):     `#2196f3` 蓝
- 装柜 (container): `#ff9800` 橙
- 抵达 (arrival):   `#4caf50` 绿
- 安装 (install):   `#9c27b0` 紫

## 实施路线

- [x] v1.0 (2026-08-13): 框架 + 手动补单 + JSON 导入 + Kanban UI + 详情编辑
- [x] v1.4 (2026-08-13): Google Calendar 同步（OAuth 阻塞，v1.5 已禁用）
- [x] v1.4.1 (2026-08-13): 禁用 Calendar 同步（OAuth 留 v1.5+）
- [x] v1.5 (2026-08-13): 全局搜索（顶栏模糊匹配 + 高亮）
- [x] v1.6 (2026-08-13): 一锅端 — B 自定义栏目 + C 拖拽换阶段 + D Dashboard 强化 + E Excel 导出 + F 单条打印
- [x] v1.6.2 (2026-08-13): 修 import JSON + 同步 GAS URL
- [x] v1.7 (2026-08-13): G 修小问题（拖拽点击 + Excel 自定义字段） + H 接入 backadmin
- [x] v1.8 (2026-08-13): Calendar OAuth debug + 重新打开同步
- [x] v1.8.2 (2026-08-13): 同步最终 GAS URL
- [x] v2.0 (2026-08-14): 数据模型重构 — multi-dates, dynamic rows, shared notes, collapsible sections
- [x] v2.0.1 (2026-08-14): 修复缺失 `</script>` 闭合标签
- [x] v2.1 (2026-08-14): **云端导入改读 Squirrel Designer**（不是 backadmin）— 因为 SD 有 customerContact / salespersonContact 全字段
- [x] v2.1.1 (2026-08-14): filter 改 `orderedMarked` (不是 `commission50/100`) — 用户原话 "带'下单'字样"
- [x] v2.2 (2026-08-14): **加速云端导入** — 并行拉取 (10x) + 5 分钟 localStorage 缓存 + 页面打开后台预热

## Calendar 同步机制

- **每个工程 = 1 个 all-day event**
- **标题**: `[projNo] 客户地址 - 业务员`（超 250 字符截断）
- **时间**: 覆盖 4 阶段日期 min → max（没填日期就不创建 event）
- **颜色**: 按当前阶段染色
  - order (下单)     → BLUE (9)
  - container (装柜) → ORANGE (6)
  - arrival (抵达)   → GREEN (10)
  - install (安装)   → MAUVE (3)
- **描述**: 工程信息 + 4 阶段时间表 + 备注 + 系统元信息
- **触发**:
  - 自动：`addManualRecord` / `importRecords` / `updateRecord` 内部都调 `syncToCalendar`
  - 手动：详情页点 "📅 同步 Calendar" 按钮
  - 删除：删记录自动删 event
- **Calendar ID**: `squirreldesigner9068@gmail.com` (公司主日历)
- **存储**: 记录里加 `calendarEventId` 字段追踪 event，重保存时更新而非重建

## 云端导入源（v2.1 改）

**Squirrel Designer (报价系统) 是唯一云端导入源** — 不要再用 backadmin。

| 系统 | 有 customerContact | 有 salespersonContact | 有 customerAddress | 适合导入? |
|---|---|---|---|---|
| **Squirrel Designer** | ✅ | ✅ | ✅ | **✅ 是** |
| backadmin | ❌ | ❌ | ⚠️ 部分 | ❌ 否（缺电话） |

**导入流程** (`fetchFromBackadmin` 函数):
1. 遍历 10 个业务员 (`admin`, `test`, `SSD`, `PSD`, `FSD`, `JSD`, `TSD`, `VSD`, `TESD`, `ASD`)
2. 调 SD `getQuoteList&username=X`
3. 跳过 `stats_cache` cache 行
4. filter: `orderedMarked = true` (Squirrel Designer 「下单」复选框) — **不是** `commission50/100`
5. 字段映射:
   - `customerContact` → `customerPhone`
   - `customerAddress` → `customerAddress`
   - `salesperson`     → `salesperson`
   - `salespersonContact` → `salespersonPhone`
   - `orderedAt` (fallback: `commission50At / commission100At / lastModified`)

**`orderedMarked` vs `commission50/100` 区别（v2.1.1 关键）**：
- `commission50Marked`: 收 50% 订金 (可能还没正式下单，ADD ON 报价也算)
- `commission100Marked`: 收 100% 订金
- `orderedMarked`: Squirrel Designer 报价页面**「下单」复选框** = 真正下单 = 用户原话 "带'下单'字样"
- **正确做法**: filter 用 `orderedMarked`（不是 commission）
- 错误做法: 用 `commission50/100` 会拉进 27 个仅订金未下单的 (如 ADD ON 报价)

**性能优化（v2.2 关键）**：
- **并行 fetch** (`Promise.all`): 10 用户串行 50-100s → 并行 5-10s
- **5 分钟 localStorage 缓存** (key: `squirrel_designer_quotes_v1`): 5 分钟内重复导入 0s
- **后台预热** (`onMounted` 后 2s 触发): 页面打开即 fire-and-forget 拉 SD 缓存
  - 预热**必须并行**，否则 50-100s 太长，预热白做
  - 不阻塞 `loadRecords` (主 GAS)
- **30s 单用户 timeout** (`AbortController`): 1 用户卡住不阻塞其他 9 个

**速度对比**:
| 场景 | 旧 (v2.1.1) | 新 (v2.2) |
|---|---|---|
| 首次页面打开 + 立即点导入 | 50-100s | 5-10s (并行) 或 0s (若预热已完成) |
| 5 分钟内再次导入 | 50-100s | 0s (走缓存) |
| 预热完成后再导入 | 50-100s | 0s (走缓存) |

**Squirrel Designer GAS URL**:
`https://script.google.com/macros/s/AKfycbyOEmxMojsICWRgpLgII-fB1jniWTCMLBMSvwFUxAz6IhpZsdRnMRfENV2p88LOQ7cm/exec`

## 部署 v1.4 时额外步骤

由于 v1.4 新增 Calendar 权限：
1. 部署时 GAS 会弹授权窗口，**必须勾选「Google 日历」权限**并允许
2. 部署后等 10-20 秒缓存刷新
3. 在 Calendar 网页版检查是否出现新 event
4. 如果 Calendar 同步失败：GAS 编辑器 → 执行 `trySyncToCalendar('<record-id>')` 看错误

## 部署流程

### 首次部署

1. 用户在 https://github.com/new 建空仓库 `squirrelinstall` (Public)
2. 用户在 https://github.com/settings/personal-access-tokens/new 建 fine-grained PAT
   - Resource owner: `ongsami-create`
   - Repository access: `Only select repositories` → `squirrelinstall`
   - Permissions: `Contents` (Read and write), `Pages` (Read and write)
3. 用户在 https://script.google.com/home 新建 GAS 项目 `SquirrelInstall`
4. 用户在 GAS 项目里粘贴 `Code.gs` 全部内容 → Ctrl+S
5. GAS 部署 → 新部署 → Web 应用 → 任何人 → 复制 URL
6. 把 URL 填到 `index.html` 的 `GAS_URL` 常量
7. agent 用 PAT git push `index.html` + `AGENTS.md` + `Code.gs`
8. 用户在 GitHub 仓库 → Settings → Pages → Source: main, / (root) → Save
9. 等 1-2 分钟，访问 `https://ongsami-create.github.io/squirrelinstall/`

### 后续更新

- 前端: agent 直接改 `index.html` → 备份 → git commit → git push
- GAS: agent 改 `Code.gs` → 给用户新版 → 用户粘贴 → 部署新版本 → 复制新 URL → agent 改 index.html 的 GAS_URL

### ⚠️ 「新部署」vs「新版本」

| 操作 | URL 变吗 | OAuth scope 变吗 | 什么时候用 |
|---|---|---|---|
| **新版本** (管理部署 → ✏️ → 新版本) | 不变 | 沿用旧 token | 日常改代码 |
| **新部署** (部署 → 新部署) | **变** | **重新弹授权** | 加新 API scope（Calendar / Drive / Sheets 等）|

**新部署之后必须改 index.html 的 GAS_URL** 否则前端 404。

## 当前 GAS Web App URL

- v1.8.2 用: `https://script.google.com/macros/s/AKfycbx_yj7nLI2gCFQxvFFUg6zizFB8T4Eq-Ts1zoxn4DkKMPtAT-iK8DC9g555jh_UjSc-KA/exec`
- 历史 URL (已废弃):
  - v1.7: `AKfycbxXdUu2...`
  - v1.0: `AKfycbz4Q47lL...`

## appsscript.json 必备 scopes (SquirrelInstall)

```json
{
  "oauthScopes": [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/drive",  // 注意：不能用 drive.file
    "https://www.googleapis.com/auth/script.webapp.deploy"
  ]
}
```

## GAS 调试技巧

- GAS 编辑器 → "执行" 里跑函数看 Logger.log 输出
- `Ctrl+Enter` 选中函数名可以直接跑
- 健康检查: `?action=health`
- 冷启动 5-10 秒是正常，第一次调会慢
- 跨域 CORS: GAS Web App 默认允许任何来源，前端 fetch 没问题

## 已知坑

- **Drive folder 创建是惰性的**: 第一次调 getAllRecords 才创建 `SquirrelInstall_Records/`
- **GAS 部署后缓存**: 改完代码要"新建版本"才生效，不是保存就生效
- **GAS 120s timeout**: PowerShell 调 GAS 可能超时，但 GAS 函数会继续跑
- **JSON 字段 sanitize**: 前端传过来的 `stages` 字段可能缺项，GAS 要兜底
- **同名 projNo**: 暂不防重（依赖 id 区分），如要防重加 unique 检查

## 备份策略

- 每次发版前: `Copy-Item index.html index_backup_YYYYMMDD_HHMMSS_<tag>.html`
- 备份目录: 同级目录，不清理（最多几十个文件）
- 重要改版加 `_pre_<feature>.html` 后缀方便对照

## 关键设计原则

- **本地优先**: 写入 GAS 不阻塞 UI（虽然 v1 是同步的，但未来要 fire-and-forget）
- **保存即更新**: 编辑后点保存，stage 跟着日期自动推进
- **手动覆盖**: auto-progress 按钮在详情页，用户可手动改 stage 下拉
- **不锁字段**: 任何字段任何时候都可改（不像 backadmin 有 6 种撤回类型）
- **删除进回收站**: GAS 文件 setTrashed(true)，可恢复
