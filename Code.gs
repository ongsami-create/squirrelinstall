/**
 * Squirrel Install - GAS Backend
 *
 * 存储：每个工程 1 个 JSON 文件，存到 Drive 文件夹 `SquirrelInstall_Records/`
 * API：通过 Web App URL 暴露，GET 请求 ?action=xxx&...
 *
 * 部署步骤：
 * 1. 打开 https://script.google.com/home，新建项目，命名 SquirrelInstall
 * 2. 把这个文件全部内容粘贴到 Code.gs（覆盖默认内容）
 * 3. 保存（Ctrl+S）
 * 4. 部署 → 新部署 → 类型选「Web 应用」
 *    - 执行身份：我自己
 *    - 访问权限：任何人
 * 5. 复制 Web 应用 URL，填到前端 index.html 的 GAS_URL 常量
 */

// ===== 配置 =====
const RECORDS_FOLDER_NAME = 'SquirrelInstall_Records';

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
      case 'health':          result = { success: true, message: 'SquirrelInstall GAS OK', version: 'v1.0' }; break;
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

// ===== 工具 =====
function getRecordsFolder() {
  const folders = DriveApp.getFoldersByName(RECORDS_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  const folder = DriveApp.createFolder(RECORDS_FOLDER_NAME);
  Logger.log('Created records folder: ' + folder.getId());
  return folder;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function emptyStages() {
  return {
    order:     { date: '', factory: '',  remarks: '' },
    container: { date: '', company: '',  remarks: '' },
    arrival:   { date: '', location: '', remarks: '' },
    install:   { date: '', installer: '', remarks: '' }
  };
}

function sanitizeStages(raw) {
  // 保证 stages 4 阶段完整，缺字段用 emptyStages 兜底
  const base = emptyStages();
  if (!raw || typeof raw !== 'object') return base;
  ['order', 'container', 'arrival', 'install'].forEach(k => {
    if (raw[k] && typeof raw[k] === 'object') {
      base[k] = Object.assign({}, base[k], raw[k]);
    }
  });
  return base;
}

function validStage(stage) {
  return ['order', 'container', 'arrival', 'install'].indexOf(stage) >= 0;
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
  folder.createFile(id + '.json', JSON.stringify(record, null, 2), MimeType.PLAIN_TEXT);
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
  const results = { success: 0, failed: 0, errors: [] };

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
  // 按 updatedAt 倒序排
  records.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return { success: true, records: records, count: records.length };
}

// 单条
function getRecord(id) {
  if (!id) return { success: false, error: 'id 必填' };
  const folder = getRecordsFolder();
  const files = folder.getFilesByName(id + '.json');
  if (!files.hasNext()) return { success: false, error: '记录不存在: ' + id };
  const content = files.next().getBlob().getDataAsString();
  return { success: true, record: JSON.parse(content) };
}

// 更新（局部更新）
function updateRecord(params) {
  const id = params.id;
  if (!id) return { success: false, error: 'id 必填' };
  const folder = getRecordsFolder();
  const files = folder.getFilesByName(id + '.json');
  if (!files.hasNext()) return { success: false, error: '记录不存在: ' + id };

  const file = files.next();
  let existing;
  try { existing = JSON.parse(file.getBlob().getDataAsString()); }
  catch (e) { return { success: false, error: '原文件损坏' }; }

  let updates;
  try { updates = JSON.parse(params.updates || '{}'); }
  catch (e) { return { success: false, error: 'updates 不是合法 JSON: ' + e.message }; }

  // 合并
  const merged = Object.assign({}, existing, updates);
  // 特殊处理 stages（要 sanitize）
  if (updates.stages) {
    merged.stages = sanitizeStages(updates.stages);
  }
  // stage 必须合法
  if (merged.stage && !validStage(merged.stage)) {
    merged.stage = existing.stage || 'order';
  }
  merged.updatedAt = new Date().toISOString();

  file.setContent(JSON.stringify(merged, null, 2));
  return { success: true, record: merged };
}

// 删除（移到回收站）
function deleteRecord(id) {
  if (!id) return { success: false, error: 'id 必填' };
  const folder = getRecordsFolder();
  const files = folder.getFilesByName(id + '.json');
  if (!files.hasNext()) return { success: false, error: '记录不存在' };
  files.next().setTrashed(true);
  return { success: true };
}

// ===== 辅助 =====
function safeJsonParse(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}

// 测试用：在 GAS 编辑器里直接跑验证
function _test() {
  Logger.log('Test 1: health');
  const h = handleRequest({ parameter: { action: 'health' } });
  Logger.log(h.getContent());

  Logger.log('Test 2: addManualRecord');
  const add = addManualRecord({
    projNo: 'TEST-001',
    salesperson: 'PEGGY',
    customerPhone: '012-3456789',
    customerAddress: 'Test Address',
    salespersonPhone: '011-11111111',
    stage: 'order',
    stages: JSON.stringify({ order: { date: '2026-08-13', factory: 'Test Factory' } })
  });
  Logger.log(add);

  Logger.log('Test 3: getAllRecords');
  const all = getAllRecords();
  Logger.log('Count: ' + all.count);
}
