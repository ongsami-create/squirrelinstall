/**
 * Squirrel Install - GAS Backend
 *
 * 存储：每个工程 1 个 JSON 文件，存到 Drive 文件夹 `SquirrelInstall_Records/`
 * Calendar 同步：每个工程 1 个 all-day event，写入指定 Google Calendar
 * API：通过 Web App URL 暴露，GET 请求 ?action=xxx&...
 *
 * 部署步骤：
 * 1. 打开 https://script.google.com/home，新建项目，命名 SquirrelInstall
 * 2. 把这个文件全部内容粘贴到 Code.gs（覆盖默认内容）
 * 3. 保存（Ctrl+S）
 * 4. 部署 → 新部署 → 类型选「Web 应用」
 *    - 执行身份：我自己
 *    - 访问权限：任何人
 *    - 第一次部署会要求授权 Calendar / Drive 权限
 * 5. 复制 Web 应用 URL，填到前端 index.html 的 GAS_URL 常量
 */

// ===== 配置 =====
const RECORDS_FOLDER_NAME = 'SquirrelInstall_Records';
const CALENDAR_ID = 'squirreldesigner9068@gmail.com';
const VERSION = 'v1.6';

// ===== 入口 =====
function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const action = params.action || '';
    let result;

    switch (action) {
      case 'addManualRecord': result = addManualRecord(params); break;
      case 'importRecords':   result = importRecords(params);   break;
      case 'getAllRecords':   result = getAllRecords();          break;
      case 'getRecord':       result = getRecord(params.id);     break;
      case 'updateRecord':    result = updateRecord(params);     break;
      case 'deleteRecord':    result = deleteRecord(params.id);  break;
      case 'syncToCalendar':  result = syncToCalendar(params.id); break;
      case 'health':          result = { success: true, message: 'SquirrelInstall GAS OK', version: VERSION }; break;
      default:                result = { success: false, error: 'Unknown action: ' + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message, stack: err.stack }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ===== Drive 工具 =====
function getRecordsFolder() {
  const folders = DriveApp.getFoldersByName(RECORDS_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  const folder = DriveApp.createFolder(RECORDS_FOLDER_NAME);
  Logger.log('Created records folder: ' + folder.getId());
  return folder;
}

function loadRecordById(id) {
  const folder = getRecordsFolder();
  const files = folder.getFilesByName(id + '.json');
  if (!files.hasNext()) return { error: '记录不存在: ' + id };
  const file = files.next();
  let record;
  try { record = JSON.parse(file.getBlob().getDataAsString()); }
  catch (e) { return { error: '文件损坏' }; }
  return { record: record, file: file };
}

function saveRecordToFile(file, record) {
  file.setContent(JSON.stringify(record, null, 2));
}

// ===== Calendar 工具 =====
function getCalendar() {
  return CalendarApp.getCalendarById(CALENDAR_ID);
}

function getStageColor(stage) {
  // CalendarApp.EventColor:
  // 1=PALE_BLUE, 2=PALE_GREEN, 3=MAUVE, 4=PALE_RED, 5=YELLOW,
  // 6=ORANGE, 7=CYAN, 8=GRAY, 9=BLUE, 10=GREEN, 11=RED
  const map = {
    'order':     CalendarApp.EventColor.BLUE,    // 9 - 下单蓝
    'container': CalendarApp.EventColor.ORANGE,  // 6 - 装柜橙
    'arrival':   CalendarApp.EventColor.GREEN,   // 10 - 抵达绿
    'install':   CalendarApp.EventColor.MAUVE    // 3 - 安装紫
  };
  return map[stage] || CalendarApp.EventColor.GRAY;
}

function buildEventTitle(record) {
  const proj = record.projNo || 'NOID';
  const addr = record.customerAddress || '—';
  const sales = record.salesperson || '—';
  // Calendar 标题有长度限制，截断
  let title = '[' + proj + '] ' + addr + ' - ' + sales;
  if (title.length > 250) title = title.substring(0, 247) + '...';
  return title;
}

function buildEventDescription(record) {
  const s = record.stages || {};
  const fmt = (d) => d || '—';
  const lines = [
    '📋 工程编号: ' + (record.projNo || '—'),
    '👤 业务员: ' + (record.salesperson || '—') + (record.salespersonPhone ? ' (' + record.salespersonPhone + ')' : ''),
    '📞 客户电话: ' + (record.customerPhone || '—'),
    '📍 客户地址: ' + (record.customerAddress || '—'),
    '',
    '━━━ 4 阶段时间表 ━━━',
    '🛒 下单: ' + fmt(s.order && s.order.date) + (s.order && s.order.factory ? ' @ ' + s.order.factory : ''),
    '📦 装柜: ' + fmt(s.container && s.container.date) + (s.container && s.container.company ? ' @ ' + s.container.company : ''),
    '🚚 抵达: ' + fmt(s.arrival && s.arrival.date) + (s.arrival && s.arrival.location ? ' @ ' + s.arrival.location : ''),
    '🔨 安装: ' + fmt(s.install && s.install.date) + (s.install && s.install.installer ? ' @ ' + s.install.installer : ''),
    '',
    '━━━ 备注 ━━━',
    '下单: ' + ((s.order && s.order.remarks) || '—'),
    '装柜: ' + ((s.container && s.container.remarks) || '—'),
    '抵达: ' + ((s.arrival && s.arrival.remarks) || '—'),
    '安装: ' + ((s.install && s.install.remarks) || '—'),
    '',
    '━━━ 系统信息 ━━━',
    '记录ID: ' + record.id,
    '最后更新: ' + (record.updatedAt || '—'),
    '当前阶段: ' + (record.stage || '—')
  ];
  return lines.join('\n');
}

function getEventDateRange(record) {
  const s = record.stages || {};
  const dates = [];
  ['order', 'container', 'arrival', 'install'].forEach(k => {
    if (s[k] && s[k].date) {
      try {
        // T00:00:00 避免时区问题
        const d = new Date(s[k].date + 'T00:00:00');
        if (!isNaN(d.getTime())) dates.push(d);
      } catch (e) {}
    }
  });
  return dates;
}

function trySyncToCalendar(recordId) {
  try {
    return { success: true, sync: syncToCalendar(recordId) };
  } catch (e) {
    return { success: false, error: e.message, stack: e.stack };
  }
}

function syncToCalendar(recordId) {
  if (!recordId) return { success: false, error: 'id 必填' };

  const loaded = loadRecordById(recordId);
  if (loaded.error) return { success: false, error: loaded.error };
  const { record, file } = loaded;

  let cal;
  try { cal = getCalendar(); }
  catch (e) { return { success: false, error: '找不到日历 ' + CALENDAR_ID + ': ' + e.message }; }
  if (!cal) return { success: false, error: '找不到日历 ' + CALENDAR_ID };

  const dates = getEventDateRange(record);

  // 没填日期 → 如果之前有 event，删掉
  if (dates.length === 0) {
    if (record.calendarEventId) {
      try {
        const ev = cal.getEventById(record.calendarEventId);
        if (ev) ev.deleteEvent();
      } catch (e) {
        Logger.log('Delete event failed: ' + e.message);
      }
      delete record.calendarEventId;
      saveRecordToFile(file, record);
      return { success: true, action: 'deleted', message: '日期已清空，Calendar event 已删除' };
    }
    return { success: true, action: 'none', message: '没填日期，没 Calendar event' };
  }

  dates.sort((a, b) => a - b);
  const start = dates[0];
  const end = new Date(dates[dates.length - 1]);
  end.setDate(end.getDate() + 1); // all-day events: end = next day

  const title = buildEventTitle(record);
  const desc = buildEventDescription(record);
  const color = getStageColor(record.stage);

  let event;
  let action = 'created';

  if (record.calendarEventId) {
    try {
      event = cal.getEventById(record.calendarEventId);
      if (event) action = 'updated';
    } catch (e) {
      event = null;
    }
  }

  try {
    if (event) {
      event.setTitle(title);
      event.setDescription(desc);
      event.setAllDayDates(start, end);
      try { event.setColor(color); } catch (e) { Logger.log('setColor failed: ' + e.message); }
    } else {
      event = cal.createAllDayEvent(title, start, end, { description: desc });
      try { event.setColor(color); } catch (e) { Logger.log('setColor failed: ' + e.message); }
      record.calendarEventId = event.getId();
    }
  } catch (e) {
    return { success: false, error: '创建/更新 event 失败: ' + e.message };
  }

  record.lastSyncedAt = new Date().toISOString();
  saveRecordToFile(file, record);

  return {
    success: true,
    action: action,
    eventId: record.calendarEventId,
    lastSyncedAt: record.lastSyncedAt
  };
}

// ===== 数据模型工具 =====
function emptyStages() {
  return {
    order:     { date: '', factory: '',  remarks: '', customFields: [] },
    container: { date: '', company: '',  remarks: '', customFields: [] },
    arrival:   { date: '', location: '', remarks: '', customFields: [] },
    install:   { date: '', installer: '', remarks: '', customFields: [] }
  };
}

function sanitizeStages(raw) {
  const base = emptyStages();
  if (!raw || typeof raw !== 'object') return base;
  ['order', 'container', 'arrival', 'install'].forEach(k => {
    if (raw[k] && typeof raw[k] === 'object') {
      base[k] = Object.assign({}, base[k], raw[k]);
      // customFields 必须是数组
      if (!Array.isArray(base[k].customFields)) {
        base[k].customFields = [];
      }
    }
  });
  return base;
}

function validStage(stage) {
  return ['order', 'container', 'arrival', 'install'].indexOf(stage) >= 0;
}

function safeJsonParse(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}

// ===== CRUD =====

// 新增 1 条
function addManualRecord(params) {
  const folder = getRecordsFolder();
  const id = Utilities.getUuid();
  const now = new Date().toISOString();
  const stage = validStage(params.stage) ? params.stage : 'order';
  const record = {
    id: id,
    projNo: (params.projNo || '').trim(),
    customerPhone: (params.customerPhone || '').trim(),
    customerAddress: (params.customerAddress || '').trim(),
    salesperson: (params.salesperson || '').trim(),
    salespersonPhone: (params.salespersonPhone || '').trim(),
    stage: stage,
    stages: sanitizeStages(safeJsonParse(params.stages)),
    customColumns: [],
    createdAt: now,
    updatedAt: now
  };
  if (!record.projNo) {
    return { success: false, error: '工程编号 (projNo) 不能为空' };
  }
  const file = folder.createFile(id + '.json', JSON.stringify(record, null, 2), MimeType.PLAIN_TEXT);

  // Calendar 同步已禁用 (v1.5 待修 OAuth 后启用)
  // let calendarSync = null;
  // try { calendarSync = syncToCalendar(id); }
  // catch (e) { calendarSync = { success: false, error: e.message }; }

  return { success: true, record: record };
}

// 批量导入
function importRecords(params) {
  let arr;
  try { arr = JSON.parse(params.records || '[]'); }
  catch (e) { return { success: false, error: 'records 不是合法 JSON: ' + e.message }; }

  if (!Array.isArray(arr)) {
    return { success: false, error: 'records 必须是数组' };
  }

  const folder = getRecordsFolder();
  const now = new Date().toISOString();
  const results = { success: 0, failed: 0, errors: [], calendarSynced: 0, calendarFailed: 0 };

  arr.forEach((r, i) => {
    try {
      const id = Utilities.getUuid();
      const stage = validStage(r.stage) ? r.stage : 'order';
      const record = {
        id: id,
        projNo: (r.projNo || '').trim(),
        customerPhone: (r.customerPhone || '').trim(),
        customerAddress: (r.customerAddress || '').trim(),
        salesperson: (r.salesperson || '').trim(),
        salespersonPhone: (r.salespersonPhone || '').trim(),
        stage: stage,
        stages: sanitizeStages(r.stages),
        customColumns: Array.isArray(r.customColumns) ? r.customColumns : [],
        createdAt: now,
        updatedAt: now
      };
      if (!record.projNo) {
        results.failed++;
        results.errors.push('第 ' + (i+1) + ' 条: 工程编号为空');
        return;
      }
      folder.createFile(id + '.json', JSON.stringify(record, null, 2), MimeType.PLAIN_TEXT);
      results.success++;

      // Calendar 同步已禁用 (v1.5 待修 OAuth 后启用)
      // try {
      //   const sync = syncToCalendar(id);
      //   if (sync.success && (sync.action === 'created' || sync.action === 'updated')) {
      //     results.calendarSynced++;
      //   } else {
      //     results.calendarFailed++;
      //   }
      // } catch (e) {
      //   results.calendarFailed++;
      // }
    } catch (err) {
      results.failed++;
      results.errors.push('第 ' + (i+1) + ' 条: ' + err.message);
    }
  });

  return { success: true, results: results };
}

// 拉所有
function getAllRecords() {
  const folder = getRecordsFolder();
  const files = folder.getFiles();
  const records = [];
  while (files.hasNext()) {
    const file = files.next();
    try {
      const content = file.getBlob().getDataAsString();
      if (content) records.push(JSON.parse(content));
    } catch (err) {
      Logger.log('Skip invalid file: ' + file.getName() + ' - ' + err.message);
    }
  }
  records.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return { success: true, records: records, count: records.length };
}

// 单条
function getRecord(id) {
  if (!id) return { success: false, error: 'id 必填' };
  const loaded = loadRecordById(id);
  if (loaded.error) return { success: false, error: loaded.error };
  return { success: true, record: loaded.record };
}

// 更新（局部更新）
function updateRecord(params) {
  const id = params.id;
  if (!id) return { success: false, error: 'id 必填' };
  const loaded = loadRecordById(id);
  if (loaded.error) return { success: false, error: loaded.error };
  const { record: existing, file } = loaded;

  let updates;
  try { updates = JSON.parse(params.updates || '{}'); }
  catch (e) { return { success: false, error: 'updates 不是合法 JSON: ' + e.message }; }

  const merged = Object.assign({}, existing, updates);
  if (updates.stages) {
    merged.stages = sanitizeStages(updates.stages);
  }
  if (merged.stage && !validStage(merged.stage)) {
    merged.stage = existing.stage || 'order';
  }
  merged.updatedAt = new Date().toISOString();

  saveRecordToFile(file, merged);

  // Calendar 同步已禁用 (v1.5 待修 OAuth 后启用)
  // let calendarSync = null;
  // try { calendarSync = syncToCalendar(id); }
  // catch (e) { calendarSync = { success: false, error: e.message }; }

  return { success: true, record: merged };
}

// 删除（移到回收站 + 删 Calendar event）
function deleteRecord(id) {
  if (!id) return { success: false, error: 'id 必填' };
  const loaded = loadRecordById(id);
  if (loaded.error) return { success: false, error: loaded.error };
  const { record, file } = loaded;

  // 先删 Calendar event
  let calendarDeleted = false;
  if (record.calendarEventId) {
    try {
      const cal = getCalendar();
      if (cal) {
        const ev = cal.getEventById(record.calendarEventId);
        if (ev) {
          ev.deleteEvent();
          calendarDeleted = true;
        }
      }
    } catch (e) {
      Logger.log('Delete calendar event failed: ' + e.message);
    }
  }

  file.setTrashed(true);
  return { success: true, calendarDeleted: calendarDeleted };
}

// ===== 测试 =====
function _test() {
  Logger.log('Test 1: health');
  const h = handleRequest({ parameter: { action: 'health' } });
  Logger.log(h.getContent());

  Logger.log('Test 2: getAllRecords');
  const all = getAllRecords();
  Logger.log('Count: ' + all.count);

  Logger.log('Test 3: Calendar access');
  try {
    const cal = getCalendar();
    Logger.log('Calendar: ' + (cal ? cal.getName() : 'NULL'));
  } catch (e) {
    Logger.log('Calendar error: ' + e.message);
  }
}
