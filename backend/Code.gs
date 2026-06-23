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
 * ✅ لم تتغير - نفس الكود القديم
 */
function handleRequest(e, method) {
  try {
    // 1. التحقق من وجود معاملات الطلب الأساسية
    let userId = e.parameter.User_ID || "GUEST";
    let userRole = e.parameter.User_Role || "Operations";
    
    // 2. تفعيل نظام الـ Rate Limiter الصارم
    if (!checkRateLimit(userId, userRole)) {
      return createJsonResponse({
        "success": false,
        "error_code": "RATE_LIMIT_EXCEEDED",
        "message": `تم تجاوز الحد الأقصى للطلبات المسموحة لدورك التشغيلي (${RATE_LIMITS[userRole]} طلب/دقيقة).`,
        "timestamp": new Date().toISOString()
      }, 429);
    }
    
    // 3. تمرير الطلب السليم لطبقة الـ Router
    return routeRequest(e, method, userId, userRole);
    
  } catch (error) {
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
 * ✅ لم تتغير - نفس الكود القديم
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
    return false;
  }
  
  cache.put(cacheKey, (requestCount + 1).toString(), 60);
  return true;
}

/**
 * دالة مساعدة لتنسيق وإرجاع ناتج الـ JSON
 * ✅ لم تتغير - نفس الكود القديم
 */
function createJsonResponse(dataObject, statusCode) {
  let jsonString = JSON.stringify(dataObject);
  return ContentService.createTextOutput(jsonString)
    .setMimeType(ContentService.MimeType.JSON);
}