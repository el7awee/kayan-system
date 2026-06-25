/**
 * منظومة الكيان v6.0 - أدوات تحسين الأداء
 * ملف: utils.gs (كاش محلي + قياس الأداء)
 */

// ==========================================
// 🔧 كاش محلي داخل التنفيذ
// ==========================================
var __EXECUTION_CACHE = {
  ss: null,
  sheets: {},
  data: {}
};

/**
 * الحصول على مرجع Spreadsheet (مرة واحدة فقط لكل طلب)
 */
function getCachedSS() {
  if (__EXECUTION_CACHE.ss) return __EXECUTION_CACHE.ss;
  __EXECUTION_CACHE.ss = SpreadsheetApp.getActiveSpreadsheet();
  return __EXECUTION_CACHE.ss;
}

/**
 * الحصول على مرجع الشيت (مرة واحدة فقط لكل طلب)
 */
function getCachedSheet(sheetName) {
  if (!sheetName) return null;
  if (__EXECUTION_CACHE.sheets[sheetName]) {
    return __EXECUTION_CACHE.sheets[sheetName];
  }
  
  let ss = getCachedSS();
  let sheet = ss.getSheetByName(sheetName);
  __EXECUTION_CACHE.sheets[sheetName] = sheet || null;
  return sheet;
}

/**
 * الحصول على بيانات الشيت (مرة واحدة فقط لكل طلب)
 */
function getCachedData(sheetName) {
  if (!sheetName) return null;
  if (__EXECUTION_CACHE.data[sheetName]) {
    return __EXECUTION_CACHE.data[sheetName];
  }
  
  let sheet = getCachedSheet(sheetName);
  if (!sheet) return null;
  
  let data = sheet.getDataRange().getValues();
  __EXECUTION_CACHE.data[sheetName] = data;
  return data;
}

/**
 * مسح الكاش (محلي + Server-Side)
 */
function clearExecutionCache() {
  // مسح الكاش من Server-Side (CacheService) فقط
  // نترك الكاش المحلي عشان الدوال المتداخلة تستفيد منه
  let cache = CacheService.getScriptCache();
  cache.removeAll(["sheet_data_Users", "sheet_data_Balance_Transactions", "sheet_data_Trips_Log", "sheet_data_Fuel_Balance"]);
}

function resetExecutionCache() {
  // مسح كامل للذاكرة المحلية - يُستدعى فقط في نهاية المعالجة
  __EXECUTION_CACHE = {
    ss: null,
    sheets: {},
    data: {}
  };
  let cache = CacheService.getScriptCache();
  cache.removeAll(["sheet_data_Users", "sheet_data_Balance_Transactions", "sheet_data_Trips_Log", "sheet_data_Fuel_Balance"]);
}

// ==========================================
// ⏱️ أدوات قياس الأداء (للتشخيص)
// ==========================================
var __TIMERS = {};

/**
 * بدء قياس الوقت
 */
function startTimer(label) {
  __TIMERS[label] = Date.now();
}

/**
 * إنهاء قياس الوقت وطباعة النتيجة
 */
function endTimer(label) {
  if (!__TIMERS[label]) return null;
  let elapsed = Date.now() - __TIMERS[label];
  console.log(`⏱️ [${label}]: ${elapsed} ms`);
  delete __TIMERS[label];
  return elapsed;
}
/**
 * كاش Server-Side طويل المدى (24 ساعة)
 */
function getCachedValueLongTerm(key, fetchFunction, ttlSeconds = 86400) {
  let cache = CacheService.getScriptCache();
  let cached = cache.get(key);
  
  if (cached) {
    console.log(`✅ [CACHE HIT - Long Term] ${key}`);
    return JSON.parse(cached);
  }
  
  console.log(`❌ [CACHE MISS] ${key} - قراءة من الشيت...`);
  let value = fetchFunction();
  
  cache.put(key, JSON.stringify(value), ttlSeconds);
  return value;
}
/**
 * تنظيف الذاكرة والموارد
 */
function cleanupResources() {
  // امسح متغيرات عامة
  __EXECUTION_CACHE = { ss: null, sheets: {}, data: {} };
  __TIMERS = {};
}