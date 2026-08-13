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
- [x] v1.4 (2026-08-13): Google Calendar 同步（每工程 1 个 all-day event）
- [ ] v1.1: 自定义栏目增删（文本 + 日期）
- [ ] v1.2: 拖拽换阶段
- [ ] v1.3: Dashboard 强化（今日装柜/本周安装/逾期）
- [ ] v1.5: Excel 导出
- [ ] v1.6: 全局搜索 + 单条打印

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
