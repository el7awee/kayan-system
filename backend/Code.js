/**
 * منظومة الكيان v6.0 - النواة الصلبة للخلفية
 * ملف: Code.gs (نقطة الانطلاق والـ Rate Limiter)
 * [تحديث: إضافة دعم لـ GET للـ login + تمرير المعاملات للـ Router]
 */

// إعدادات الحدود القصوى للطلبات في الدقيقة بناءً على صلاحيات المستخدم
const RATE_LIMITS = {
  'Operations': 60,
  'Accountant': 120,
  'Admin': 150,
  'Manager': 150
};

/**
 * معالج طلبات POST (إنشاء، تعديل، عمليات حساسة)
 */
function doPost(e) {
  return handleRequest(e, 'POST');
}

/**
 * معالج طلبات GET (جلب البيانات، الاستعلامات)
 * 🆕 تم التعديل: أصبح يدعم login عبر GET أيضاً للتسهيل
 */
function doGet(e) {
  return handleRequest(e, 'GET');
}

/**
 * الدالة المركزية لمعالجة وتوجيه الطلبات وتطبيق الـ Rate Limiting
 * ✅ محسّنة: إضافة tagging للأداء
 */
function handleRequest(e, method) {
  startTimer("handleRequest_total");
  
  try {
    // 🚀 استثناء: تصدير كل البيانات كـ JSON (للهجرة)
    if (e.parameter.export === "all") {
      let allData = {};
      const COLLECTIONS = [
        { sheet: "Users" }, { sheet: "Trips_Log" }, { sheet: "Expenses_Log" },
        { sheet: "Vehicles" }, { sheet: "Drivers" }, { sheet: "Clients" },
        { sheet: "Fuel_Balance" }, { sheet: "Fuel_Transactions" },
        { sheet: "Trip_Advances" }, { sheet: "Notifications" },
        { sheet: "System_Settings" }, { sheet: "Balance_Transactions" },
        { sheet: "Maintenance_Log" }, { sheet: "Driver_Advances_Log" }
      ];
      for (let cfg of COLLECTIONS) {
        let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(cfg.sheet);
        if (!sheet) continue;
        let data = sheet.getDataRange().getValues();
        if (data.length < 2) continue;
        let headers = data[0];
        let rows = [];
        for (let i = 1; i < data.length; i++) {
          let obj = {};
          headers.forEach((h, idx) => { obj[h] = data[i][idx]; });
          rows.push(obj);
        }
        allData[cfg.sheet] = rows;
      }
      return ContentService.createTextOutput(JSON.stringify(allData, null, 2))
        .setMimeType(ContentService.MimeType.JSON);
    }

    let userId = e.parameter.User_ID || "GUEST";
    let action = e.parameter.action || "";
    
    console.log(`📨 [${method}] Action: ${action} | User: ${userId}`);
    
    // حد عام للمجهولين (قبل المصادقة)
    if (action !== "login") {
      let anonKey = "rate_anon_" + (e.parameter.Session_Token || "no-token") + "_min_" + new Date().getMinutes();
      let anonCount = CacheService.getScriptCache().get(anonKey);
      if (anonCount && parseInt(anonCount) > 30) {
        endTimer("handleRequest_total");
        return createJsonResponse({
          "success": false, "error_code": "RATE_LIMIT_EXCEEDED",
          "message": "تجاوزت الحد الأقصى للطلبات المسموحة.",
          "timestamp": new Date().toISOString()
        }, 429);
      }
      CacheService.getScriptCache().put(anonKey, (parseInt(anonCount || "0") + 1).toString(), 60);
    }
    
    let result = routeRequest(e, method, userId, "Operations");
    
    endTimer("handleRequest_total");
    resetExecutionCache();
    
    return result;
    
  } catch (error) {
    endTimer("handleRequest_total");
    console.error("❌ خطأ فادح:", error.message);
    resetExecutionCache();
    
    return createJsonResponse({
      "success": false,
      "error_code": "SYSTEM_CRITICAL_ERROR",
      "message": "حدث خطأ داخلي فادح في خوادم المنظومة: " + error.message,
      "timestamp": new Date().toISOString()
    }, 500);
  }
}

/**
 * دالة مساعدة لتنسيق وإرجاع ناتج الـ JSON
 */
function createJsonResponse(dataObject, statusCode) {
  let jsonString = JSON.stringify(dataObject);
  return ContentService.createTextOutput(jsonString)
    .setMimeType(ContentService.MimeType.JSON);
}