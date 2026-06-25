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
    let action = e.parameter.action || "";
    let userId = e.parameter.User_ID || "GUEST";
    let userRole = e.parameter.User_Role || "Operations";
    
    console.log(`📨 [${method}] Action: ${action} | User: ${userId}`);
    
    // 1. تفعيل نظام الـ Rate Limiter الصارم
    if (!checkRateLimit(userId, userRole)) {
      endTimer("handleRequest_total");
      return createJsonResponse({
        "success": false,
        "error_code": "RATE_LIMIT_EXCEEDED",
        "message": `تم تجاوز الحد الأقصى للطلبات المسموحة لدورك التشغيلي (${RATE_LIMITS[userRole]} طلب/دقيقة).`,
        "timestamp": new Date().toISOString()
      }, 429);
    }
    
    // 2. تسجيل الدخول لا يحتاج middleware (لا يوجد توكن بعد)
    if (action === "login") {
      let result = routeRequest(e, method, userId, userRole);
      endTimer("handleRequest_total");
      resetExecutionCache();
      return result;
    }
    
    // 3. 🛡️ تطبيق سلسلة الـ MIDDLEWARE على كل الطلبات الأخرى
    //    (التحقق من التوكن ← صلاحية الوصول ← CSRF للكتابة)
    let validated = executeMiddlewarePipeline(e, action);
    let realUserId = validated.userId;
    let realUserRole = validated.role;
    
    // 4. تمرير الطلب لطبقة الـ Router بمعلومات موثّقة
    let result = routeRequest(e, method, realUserId, realUserRole);
    
    endTimer("handleRequest_total");
    resetExecutionCache();
    
    return result;
    
  } catch (error) {
    endTimer("handleRequest_total");
    resetExecutionCache();
    
    // أخطاء الأعمال (مثل INVALID_TOKEN, INSUFFICIENT_PERMISSIONS, CSRF_MISSING)
    if (error.name && error.name !== "Error") {
      console.warn(`⚠️ Business Error [${error.name}]: ${error.message}`);
      return createJsonResponse({
        "success": false,
        "error_code": error.name,
        "message": error.message,
        "timestamp": new Date().toISOString()
      });
    }
    
    // أخطاء النظام الفادحة
    console.error("❌ خطأ فادح:", error.message);
    return createJsonResponse({
      "success": false,
      "error_code": "SYSTEM_CRITICAL_ERROR",
      "message": "حدث خطأ داخلي فادح في خوادم المنظومة: " + error.message,
      "timestamp": new Date().toISOString()
    }, 500);
  }
}

/**
 * دالة فحص وتطبيق محددات الاستهلاك (Rate Limiter)
 * ✅ محسّنة: كاش أسرع + logging
 */
function checkRateLimit(userId, userRole) {
  let cache = CacheService.getScriptCache();
  let currentMinute = new Date().getMinutes();
  let cacheKey = `rate_${userId}_min_${currentMinute}`;
  
  let currentRequests = cache.get(cacheKey);
  let maxAllowed = RATE_LIMITS[userRole] || 60;
  
  if (currentRequests === null) {
    cache.put(cacheKey, "1", 60);
    return true;
  }
  
  let requestCount = parseInt(currentRequests);
  if (requestCount >= maxAllowed) {
    console.warn(`⚠️ Rate limit exceeded for ${userId} (${requestCount}/${maxAllowed})`);
    return false;
  }
  
  cache.put(cacheKey, (requestCount + 1).toString(), 60);
  return true;
}

/**
 * دالة مساعدة لتنسيق وإرجاع ناتج الـ JSON
 * ✅ لم تتغير
 */
function createJsonResponse(dataObject, statusCode) {
  let jsonString = JSON.stringify(dataObject);
  return ContentService.createTextOutput(jsonString)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * دالة اختبار إنشاء رحلة
 */
function testCreateTrip() {
  let userId = "USER-001";
  
  // 1️⃣ أضف رصيد أولاً
  console.log("🔹 إضافة رصيد 5000 ج.م للمستخدم...");
  balanceService_addBalance(userId, 5000, "رصيد اختبار", "SYSTEM");
  
  // ⚡ امسح الكاش من Server-Side
  let cache = CacheService.getScriptCache();
  cache.removeAll(["sheet_data_Users"]);
  clearExecutionCache();
  
  // 2️⃣ بعدين أنشئ رحلة
  console.log("🔹 إنشاء رحلة...");
  let testParams = {
    parameter: {
      Customer_ID: "CUST-001",
      Driver_ID: "DRV-001",
      Vehicle_ID: "VEH-001",
      Route: "الجيزة - القاهرة",
      Advance_Cash: "1000",
      Fuel_Liters: "50",
      Fuel_Price: "20.5"
    }
  };
  
  let result = tripService_createTrip(testParams, userId);
  console.log("✅ النتيجة:", JSON.stringify(result, null, 2));
}