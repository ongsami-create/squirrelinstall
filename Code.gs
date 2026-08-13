/**
 * Squirrel Install v2.0 - GAS Backend
 *
 * 存储：每个工程 1 个 JSON 文件，存到 Drive 文件夹 `SquirrelInstall_Records/`
 * Calendar 同步：每工程 1 个 all-day event，按当前阶段显示对应日期
 * API：通过 Web App URL 暴露，GET 请求 ?action=xxx&...
 *
 * 数据模型 v2.0:
 * - dates: 数组（多选）
 * - 每个 stage 有自己的字段 + 动态 rows
 * - 备注是全工程共享
 * - 无 custom fields
 *
 * 部署步骤：
 * 1. 打开 https://script.google.com/home，新建/打开 SquirrelInstall 项目
 * 2. 把这个文件全部内容粘贴到 Code.gs
 * 3. Ctrl+S 保存
 * 4. 部署 → 新部署 → Web 应用 → 任何人
 * 5. 复制 Web 应用 URL 填到 index.html 的 GAS_URL
 */

// ===== 配置 =====
const RECORDS_FOLDER_NAME = 'SquirrelInstall_Records';
const CALENDAR_ID = 'squirreldesigner9068@gmail.com';
const VERSION = 'v2.0';

// ===== 入口 =====
function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const action = params.action || '';
    let result;

    switch (action) {
      case 'addManualRecord':   result = addManualRecord(params); break;
      case 'importRecords':     result = importRecords(params); break;
      case 'getAllRecords':     result = getAllRecords(); break;
      case 'getRecord':         result = getRecord(params.id); break;
      case 'updateRecord':      result = updateRecord(params); break;
      case 'deleteRecord':      result = deleteRecord(params.id); break;
      case 'syncToCalendar':    result = syncToCalendar(params.id); break;
      case 'syncAllToCalendar': result = syncAllToCalendar(); break;
      case 'health':            result = { success: true, message: 'SquirrelInstall GAS OK', version: VERSION }; break;
      default:                  result = { success: false, error: 'Unknown action: ' + action };
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
  const map = {
    'order':     CalendarApp.EventColor.BLUE,    // 9
    'container': CalendarApp.EventColor.ORANGE,  // 6
    'arrival':   CalendarApp.EventColor.GREEN,   // 10
    'install':   CalendarApp.EventColor.MAUVE    // 3
  };
  return map[stage] || CalendarApp.EventColor.GRAY;
}

function buildEventTitle(record) {
  // 标题: [projNo] 客户名字 | 客户电话 | 客户地址 | 数量 | 业务员 (电话)
  const r = record;
  const s = r.stages || {};
  const totalQty = (s.container && s.container.quantity) || (s.arrival && s.arrival.quantity) || '';
  const sales = r.salesperson || '—';
  const salesPhone = r.salespersonPhone ? ' (' + r.salespersonPhone + ')' : '';
  let title = '[' + (r.projNo || 'NOID') + ']';
  if (r.customerName) title += ' ' + r.customerName;
  if (r.customerPhone) title += ' | ' + r.customerPhone;
  if (r.customerAddress) title += ' | ' + r.customerAddress;
  if (totalQty) title += ' | 数量:' + totalQty;
  title += ' | ' + sales + salesPhone;
  if (title.length > 250) title = title.substring(0, 247) + '...';
  return title;
}

function buildEventDescription(record) {
  const s = record.stages || {};
  const lines = [
    '📋 工程: ' + (record.projNo || '—'),
    '👤 客户: ' + (record.customerName || '—') + (record.customerPhone ? ' (' + record.customerPhone + ')' : ''),
    '📍 地址: ' + (record.customerAddress || '—'),
    '🏠 抵达: ' + (record.arrivalAddress || '—'),
    '💼 业务员: ' + (record.salesperson || '—') + (record.salespersonPhone ? ' (' + record.salespersonPhone + ')' : ''),
    '',
    '━━━ 各阶段日期 ━━━',
    '🛒 下单: ' + fmtDateList(s.order && s.order.dates) + (s.order && s.order.factory ? ' | ' + s.order.factory : ''),
    '📦 装柜: ' + fmtDateList(s.container && s.container.dates) + (s.container && s.container.company ? ' | ' + s.container.company : '') + (s.container && s.container.trackingNo ? ' | ' + s.container.trackingNo : '') + (s.container && s.container.quantity ? ' | 数量:' + s.container.quantity : ''),
    '🚚 抵达: ' + fmtDateList(s.arrival && s.arrival.dates) + (s.arrival && s.arrival.deliveryTime ? ' | 送货:' + s.arrival.deliveryTime : ''),
    '🔨 安装: ' + fmtDateList(s.install && s.install.dates),
    '',
    '━━━ 备注 ━━━',
    record.notes || '—',
    '',
    '━━━ 系统 ━━━',
    '记录ID: ' + record.id,
    '最后更新: ' + (record.updatedAt || '—'),
    '当前阶段: ' + (record.stage || '—')
  ];
  return lines.join('\n');
}

function fmtDateList(dates) {
  if (!Array.isArray(dates) || dates.length === 0) return '—';
  return dates.join(', ');
}

// v2.0: 按当前阶段拿要显示的日期
function getEventDateRange(record) {
  const s = record.stages || {};
  const stage = record.stage;
  const dates = [];

  if (stage === 'install') {
    // 安装: 所有日期连续
    if (s.install && Array.isArray(s.install.dates)) dates.push(...s.install.dates);
  } else if (stage === 'arrival') {
    // 抵达: 抵达日期 + 送货时间日期
    if (s.arrival && Array.isArray(s.arrival.dates)) dates.push(...s.arrival.dates);
    if (s.arrival && s.arrival.deliveryTime) {
      const d = s.arrival.deliveryTime.substring(0, 10);
      if (d) dates.push(d);
    }
  } else if (stage === 'container') {
    // 装柜: 只装柜日期
    if (s.container && Array.isArray(s.container.dates)) dates.push(...s.container.dates);
  } else if (stage === 'order') {
    // 下单: 只下单日期
    if (s.order && Array.isArray(s.order.dates)) dates.push(...s.order.dates);
  }

  return dates;
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

  // 没日期 → 如果之前有 event，删掉
  if (dates.length === 0) {
    if (record.calendarEventId) {
      try {
        const ev = cal.getEventById(record.calendarEventId);
        if (ev) ev.deleteEvent();
      } catch (e) { Logger.log('Delete event failed: ' + e.message); }
      delete record.calendarEventId;
      saveRecordToFile(file, record);
      return { success: true, action: 'deleted', message: '日期已清空' };
    }
    return { success: true, action: 'none', message: '没填日期' };
  }

  // 多日期连续: min → max
  const sortedDates = dates.slice().sort();
  const start = new Date(sortedDates[0] + 'T00:00:00');
  const end = new Date(sortedDates[sortedDates.length - 1] + 'T00:00:00');
  end.setDate(end.getDate() + 1); // all-day 事件 end = next day

  const title = buildEventTitle(record);
  const desc = buildEventDescription(record);
  const color = getStageColor(record.stage);

  let event;
  let action = 'created';

  if (record.calendarEventId) {
    try {
      event = cal.getEventById(record.calendarEventId);
      if (event) action = 'updated';
    } catch (e) { event = null; }
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

function syncAllToCalendar() {
  const folder = getRecordsFolder();
  const files = folder.getFiles();
  const results = { total: 0, success: 0, failed: 0, errors: [] };
  while (files.hasNext()) {
    const file = files.next();
    let record;
    try { record = JSON.parse(file.getBlob().getDataAsString()); }
    catch (e) { continue; }
    if (!record.id) continue;
    results.total++;
    try {
      const r = syncToCalendar(record.id);
      if (r.success) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push((record.projNo || record.id) + ': ' + (r.error || '未知'));
      }
    } catch (e) {
      results.failed++;
      results.errors.push((record.projNo || record.id) + ': ' + e.message);
    }
  }
  return { success: true, results: results };
}

// ===== 数据模型工具 (v2.0) =====
function emptyStages() {
  return {
    order:     { dates: [], factory: '', rows: [] },
    container: { dates: [], factory: '', company: '', trackingNo: '', quantity: 0, rows: [] },
    arrival:   { dates: [], factory: '', company: '', trackingNo: '', quantity: 0, rows: [], deliveryTime: '' },
    install:   { dates: [], installers: [] }
  };
}

function sanitizeStages(raw) {
  const base = emptyStages();
  if (!raw || typeof raw !== 'object') return base;
  ['order', 'container', 'arrival', 'install'].forEach(k => {
    if (raw[k] && typeof raw[k] === 'object') {
      base[k] = Object.assign({}, base[k], raw[k]);
    }
  });
  // Ensure types
  ['order', 'container', 'arrival', 'install'].forEach(k => {
    if (!Array.isArray(base[k].dates)) base[k].dates = [];
    if (k === 'install') {
      if (!Array.isArray(base[k].installers)) base[k].installers = [];
    } else {
      if (!Array.isArray(base[k].rows)) base[k].rows = [];
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

function addManualRecord(params) {
  const folder = getRecordsFolder();
  const id = Utilities.getUuid();
  const now = new Date().toISOString();
  const stage = validStage(params.stage) ? params.stage : 'order';
  const record = {
    id: id,
    projNo: (params.projNo || '').trim(),
    customerName: (params.customerName || '').trim(),
    customerPhone: (params.customerPhone || '').trim(),
    customerAddress: (params.customerAddress || '').trim(),
    arrivalAddress: (params.arrivalAddress || '').trim(),
    salesperson: (params.salesperson || '').trim(),
    salespersonPhone: (params.salespersonPhone || '').trim(),
    stage: stage,
    notes: (params.notes || '').trim(),
    stages: sanitizeStages(safeJsonParse(params.stages)),
    createdAt: now,
    updatedAt: now
  };
  if (!record.projNo) {
    return { success: false, error: '工程编号 (projNo) 不能为空' };
  }
  const file = folder.createFile(id + '.json', JSON.stringify(record, null, 2), MimeType.PLAIN_TEXT);
  // v2.0: 自动同步 Calendar
  let calendarSync = null;
  try { calendarSync = syncToCalendar(id); }
  catch (e) { calendarSync = { success: false, error: e.message }; }
  return { success: true, record: record, calendarSync: calendarSync };
}

function importRecords(params) {
  let arr;
  try { arr = JSON.parse(params.records || '[]'); }
  catch (e) { return { success: false, error: 'records 不是合法 JSON: ' + e.message }; }
  if (!Array.isArray(arr)) return { success: false, error: 'records 必须是数组' };

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
        customerName: (r.customerName || r.customer_name || '').trim(),
        customerPhone: (r.customerPhone || r.customer_phone || r.phone || '').trim(),
        customerAddress: (r.customerAddress || r.customer_address || r.address || '').trim(),
        arrivalAddress: (r.arrivalAddress || r.arrival_address || '').trim(),
        salesperson: (r.salesperson || '').trim(),
        salespersonPhone: (r.salespersonPhone || r.salesperson_phone || '').trim(),
        stage: stage,
        notes: (r.notes || r.remarks || '').trim(),
        stages: sanitizeStages(r.stages),
        createdAt: now,
        updatedAt: now
      };
      if (r.source) record.source = String(r.source).trim();
      if (r.orderedAt) record.backadminOrderedAt = String(r.orderedAt).trim();
      if (!record.projNo) {
        results.failed++;
        results.errors.push('第 ' + (i+1) + ' 条: 工程编号为空');
        return;
      }
      folder.createFile(id + '.json', JSON.stringify(record, null, 2), MimeType.PLAIN_TEXT);
      results.success++;
      // 自动同步 Calendar
      try {
        const sync = syncToCalendar(id);
        if (sync.success && (sync.action === 'created' || sync.action === 'updated')) {
          results.calendarSynced++;
        } else {
          results.calendarFailed++;
        }
      } catch (e) { results.calendarFailed++; }
    } catch (err) {
      results.failed++;
      results.errors.push('第 ' + (i+1) + ' 条: ' + err.message);
    }
  });
  return { success: true, results: results };
}

function getAllRecords() {
  const folder = getRecordsFolder();
  const files = folder.getFiles();
  const records = [];
  while (files.hasNext()) {
    const file = files.next();
    try {
      const content = file.getBlob().getDataAsString();
      if (content) records.push(sanitizeRecordForClient(JSON.parse(content)));
    } catch (err) {
      Logger.log('Skip invalid file: ' + file.getName() + ' - ' + err.message);
    }
  }
  records.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return { success: true, records: records, count: records.length };
}

// 把 storage 格式转为 client 格式（v2.0）
function sanitizeRecordForClient(rec) {
  if (!rec) return rec;
  const out = Object.assign({}, rec);
  out.stages = sanitizeStages(rec.stages);
  out.notes = rec.notes || '';
  return out;
}

function getRecord(id) {
  if (!id) return { success: false, error: 'id 必填' };
  const loaded = loadRecordById(id);
  if (loaded.error) return { success: false, error: loaded.error };
  return { success: true, record: sanitizeRecordForClient(loaded.record) };
}

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
  if (updates.stages) merged.stages = sanitizeStages(updates.stages);
  if (merged.stage && !validStage(merged.stage)) merged.stage = existing.stage || 'order';
  merged.updatedAt = new Date().toISOString();

  saveRecordToFile(file, merged);

  // 自动同步 Calendar
  let calendarSync = null;
  try { calendarSync = syncToCalendar(id); }
  catch (e) { calendarSync = { success: false, error: e.message }; }

  return { success: true, record: sanitizeRecordForClient(merged), calendarSync: calendarSync };
}

function deleteRecord(id) {
  if (!id) return { success: false, error: 'id 必填' };
  const loaded = loadRecordById(id);
  if (loaded.error) return { success: false, error: loaded.error };
  const { record, file } = loaded;
  // 删 Calendar event
  if (record.calendarEventId) {
    try {
      const cal = getCalendar();
      if (cal) {
        const ev = cal.getEventById(record.calendarEventId);
        if (ev) ev.deleteEvent();
      }
    } catch (e) { Logger.log('Delete calendar event failed: ' + e.message); }
  }
  file.setTrashed(true);
  return { success: true };
}

// ===== 测试 =====
function _test() {
  Logger.log('Test 1: health');
  const h = handleRequest({ parameter: { action: 'health' } });
  Logger.log(h.getContent());
  Logger.log('Test 2: Calendar access');
  try {
    const cal = getCalendar();
    Logger.log('Calendar: ' + (cal ? cal.getName() : 'NULL'));
  } catch (e) {
    Logger.log('Calendar error: ' + e.message);
  }
}
