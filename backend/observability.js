/**
 * منظومة الكيان v6.0 - طبقة المراقبة والرصد
 * ملف: observability.gs (System Logs, API Audit, Performance Metrics)
 */

// معرف ملف السجلات المنفصل تماماً (يستبدل بمعرف الـ Spreadsheet المخصصة للـ Logs)
const OBSERVABILITY_SPREADSHEET_ID = "19_dn2v0Vnq9tCHRxcuKmZpjJo-jEgFbEWWAOKFLFqNM";

/**
 * دالة مساعدة لفتح شيت السجلات بأمان
 */
function getLogsSheet(sheetName) {
  try {
    let logSs = (OBSERVABILITY_SPREADSHEET_ID === "YOUR_LOGS_SPREADSHEET_ID_HERE") 
      ? SpreadsheetApp.getActiveSpreadsheet() 
      : SpreadsheetApp.openById(OBSERVABILITY_SPREADSHEET_ID);
    return logSs.getSheetByName(sheetName);
  } catch(e) {
    console.error(`فشل الوصول إلى شيت السجلات ${sheetName}: ` + e.message);
    return null;
  }
}

/**
 * 1. تسجيل الأخطاء البرمجية الفادحة غير المتوقعة (System_Logs)
 */
function logSystemError(errorCode, errorMessage, stackTrace, userId) {
  let sheet = getLogsSheet("System_Logs");
  if (!sheet) return;
  
  // الـ ID الفريد للـ Log
  let logId = `ERR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
  // الهيكل: Log_ID | Timestamp | Error_Code | Error_Message | Stack_Trace | User_ID | Function_Name
  sheet.appendRow([
    logId,
    new Date().toISOString(),
    errorCode,
    errorMessage,
    stackTrace || "No Stack Trace",
    userId || "SYSTEM",
    "Backend_Exception"
  ]);
}

/**
 * 2. تسجيل كل طلب يضرب الـ Router للمراجعة والأمان (API_Audit_Trail)
 */
function logApiAudit(userId, userRole, action, executionTimeMs, idempotencyKey, responseCode) {
  let sheet = getLogsSheet("API_Audit_Trail");
  if (!sheet) return;
  
  let auditId = `AUD-${Date.now()}`;
  
  // الهيكل: Audit_ID | Timestamp | User_ID | User_Role | Action | IP_Address | Execution_Time_MS | Idempotency_Key | Response_Code
  sheet.appendRow([
    auditId,
    new Date().toISOString(),
    userId || "GUEST",
    userRole || "N/A",
    action || "UNKNOWN_ACTION",
    "0.0.0.0", // في بيئة Apps Script الـ IP المباشر للمستخدم لا يجلب إلا بصلاحيات متقدمة، نضع قيمة افتراضية
    executionTimeMs,
    idempotencyKey || "N/A",
    responseCode || 200
  ]);
}

/**
 * 3. مراقبة الأداء للطلبات البطيئة التي تتعدى 3 ثوانٍ (Performance_Metrics)
 */
function logPerformanceMetric(targetEndpoint, executionTimeMs) {
  if (executionTimeMs < 3000) return; // حارس برمجى: تفعيل التسجيل فقط إذا تخطى الـ Threshold المذكور (3000ms)
  
  let sheet = getLogsSheet("Performance_Metrics");
  if (!sheet) return;
  
  let metricId = `PERF-${Date.now()}`;
  let severity = (executionTimeMs > 5000) ? "CRITICAL" : "WARNING"; // تصنيف الخطورة بناءً على البطء
  
  // الهيكل: Metric_ID | Timestamp | Target_Endpoint | Execution_Time_MS | Severity_Level | Rows_Processed_Count
  sheet.appendRow([
    metricId,
    new Date().toISOString(),
    targetEndpoint,
    executionTimeMs,
    severity,
    "N/A" // تمثل عدد السطور المعالجة إن وجدت مستقبلاً للـ Pagination
  ]);
}