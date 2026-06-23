/**
 * منظومة الكيان v6.0 - جدار الحماية والحوكمة
 * ملف: middleware.gs (التحقق، حماية التكرار، وقيود العمل)
 * [تحديث: توسيع الصلاحيات لتشمل البنزينة والعربيات والسائقين والعملاء + العهدات]
 */

// إعدادات افتراضية
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 دقيقة
const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000; // 5 دقائق

// ═══════════════════════════════════════════════════
// 📋 مصفوفة الصلاحيات (Role-Based Access Control - RBAC)
// ═══════════════════════════════════════════════════
const ROLE_PERMISSIONS = {
  'Admin': [
    // القديمة
    'getTrips', 'getDrivers', 'createTrip', 'updateTripStatus', 
    'addExpense', 'settleTripFinancials', 'updateDriver', 'updateVehicle',
    'createUser', 'getUsers', 'toggleUserStatus', 'updateUserRole', 
    'deleteUser', 'resetUserPassword', 'viewAuditLog', 'logout',
    // العربيات
    'getVehicles', 'createVehicle', 'updateVehicle', 'deleteVehicle',
    // السائقين
    'getDriversList', 'createDriver', 'updateDriverData', 'deleteDriver',
    // العملاء
    'getClients', 'createClient', 'updateClient', 'deleteClient',
    // البنزينة
    'getFuelBalance', 'addFuelBalance', 'getFuelTransactions', 'updateFuelPrice',
    // المصروفات
    'getMonthlyExpenses',
    // التنبيهات
    'getNotifications', 'markNotificationRead', 'deleteNotification', 'markAllNotificationsRead',
    // العهدات (القديمة - للسائقين)
    'getDriverAdvances', 'settleDriverAdvance',
    // 🆕 العهدات (الجديدة - للجميع)
    'getMyBalance', 'getUserBalance', 'getMyTransactions', 'getAllTransactions',
    'addBalance', 'deductBalance', 'transferBalance',
    // 🆕 تعديل الرحلات
    'updateTrip'
  ],
  'Manager': [
    // القديمة
    'getTrips', 'getDrivers', 'createTrip', 'updateTripStatus', 
    'addExpense', 'settleTripFinancials', 'updateDriver', 'updateVehicle',
    'getUsers', 'viewAuditLog', 'logout',
    // العربيات
    'getVehicles', 'createVehicle', 'updateVehicle', 'deleteVehicle',
    // السائقين
    'getDriversList', 'createDriver', 'updateDriverData', 'deleteDriver',
    // العملاء
    'getClients', 'createClient', 'updateClient', 'deleteClient',
    // البنزينة
    'getFuelBalance', 'addFuelBalance', 'getFuelTransactions', 'updateFuelPrice',
    // المصروفات
    'getMonthlyExpenses',
    // التنبيهات
    'getNotifications', 'markNotificationRead',
    // العهدات (القديمة - للسائقين)
    'getDriverAdvances', 'settleDriverAdvance',
    // 🆕 العهدات (الجديدة - للجميع)
    'getMyBalance', 'getUserBalance', 'getMyTransactions', 'getAllTransactions',
    'addBalance', 'deductBalance', 'transferBalance',
    // 🆕 تعديل الرحلات
    'updateTrip'
  ],
  'Operations': [
    // القديمة
    'getTrips', 'getDrivers', 'createTrip', 'updateTripStatus', 
    'updateDriver', 'updateVehicle', 'logout',
    // البنزينة (قراءة فقط)
    'getFuelBalance', 'getFuelTransactions',
    // التنبيهات (قراءة فقط)
    'getNotifications',
    // العربيات (قراءة فقط)
    'getVehicles',
    // السائقين (قراءة فقط)
    'getDriversList',
    // العملاء (قراءة فقط)
    'getClients',
    'getMonthlyExpenses',
    // 🆕 العهدات (محدودة)
    'getMyBalance', 'getMyTransactions',
    // 🆕 تعديل الرحلات
    'updateTrip'
  ],
  'Accountant': [
    // القديمة
    'getTrips', 'getDrivers', 'addExpense', 'settleTripFinancials', 'logout',
    // البنزينة (إضافة رصيد + قراءة)
    'getFuelBalance', 'addFuelBalance', 'getFuelTransactions',
    // التنبيهات
    'getNotifications', 'markNotificationRead',
    // العهدات (القديمة - للسائقين)
    'getDriverAdvances', 'settleDriverAdvance',
    // 🆕 العهدات (الجديدة - للجميع)
    'getMyBalance', 'getUserBalance', 'getMyTransactions', 'getAllTransactions',
    'addBalance', 'transferBalance',
    'getUsers',
    // العربيات (قراءة فقط)
    'getVehicles',
    // السائقين (قراءة فقط)
    'getDriversList',
    // العملاء (قراءة فقط)
    'getClients',
    'getMonthlyExpenses',
    // 🆕 تعديل الرحلات
    'updateTrip'
  ]
};

/**
 * ─── المايسترو الرئيسي للـ MIDDLEWARE ───
 */
function executeMiddlewarePipeline(e, action, userId, userRole) {
  let token = e.parameter.Session_Token;
  validateAuthenticationAndRBAC(token, action, userId, userRole);
  
  let idempotencyKey = e.parameter.Idempotency_Key;
  if (idempotencyKey && checkIfWriteOperation(action)) {
    let cachedResponse = checkIdempotency(idempotencyKey, action, userId);
    if (cachedResponse) {
      let bypassError = new Error(JSON.stringify(cachedResponse));
      bypassError.name = "IDEMPOTENCY_BYPASS";
      throw bypassError;
    }
  }
  
  if (checkIfWriteOperation(action)) {
    validateBusinessConstraints(e, action);
  }
}

/**
 * 1️⃣ دالة التحقق من الهوية والصلاحيات
 */
function validateAuthenticationAndRBAC(token, action, userId, userRole) {
  if (!token || token === "null" || token === "") {
    throwBusinessError("INVALID_TOKEN", "جلسة المستخدم غير صالحة أو انتهت، برجاء تسجيل الدخول مجدداً.");
  }
  
  let authResult = authService_validateToken(token, userId);
  
  if (!authResult.valid) {
    throwBusinessError("INVALID_TOKEN", authResult.message || "جلسة المستخدم غير صالحة.");
  }
  
  let realRole = authResult.role;
  
  let allowedActions = ROLE_PERMISSIONS[realRole];
  if (!allowedActions) {
    throwBusinessError("INSUFFICIENT_PERMISSIONS", `دور المستخدم (${realRole}) غير معروف.`);
  }
  
  if (allowedActions.indexOf(action) === -1) {
    throwBusinessError("INSUFFICIENT_PERMISSIONS", 
      `عذراً، دورك التشغيلي (${realRole}) لا يمتلك الصلاحية لتنفيذ الإجراء: ${action}`);
  }
}

/**
 * 2️⃣ دالة فحص مفتاح التكرار
 */
function checkIdempotency(key, action, userId) {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Idempotency_Cache");
  if (!sheet) return null;
  
  let data = sheet.getDataRange().getValues();
  let now = new Date().getTime();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      let createdAt = new Date(data[i][4]).getTime();
      
      if (now - createdAt < IDEMPOTENCY_WINDOW_MS) {
        try {
          return JSON.parse(data[i][5]);
        } catch (e) {
          return { "success": true, "message": "طلب مكرر تم تنفيذه مسبقاً." };
        }
      }
    }
  }
  
  sheet.appendRow([
    key, 
    userId, 
    action, 
    "", 
    new Date().toISOString(), 
    JSON.stringify({ "success": true, "message": "Pending execution", "is_cached": true })
  ]);
  
  return null;
}

function updateIdempotencyCache(key, finalResponsePayload) {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Idempotency_Cache");
  if (!sheet) return;
  
  let data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 6).setValue(JSON.stringify(finalResponsePayload));
      break;
    }
  }
}

/**
 * 3️⃣ دالة تطبيق قيود العمل
 */
function validateBusinessConstraints(e, action) {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // [BC_01]: لا يمكن إضافة مصروف إلا إذا كانت الرحلة OPEN أو IN_PROGRESS
  if (action === "addExpense") {
    let tripId = e.parameter.Trip_ID;
    let tripStatus = getTripStatusFromDb(ss, tripId);
    
    if (tripStatus !== "OPEN" && tripStatus !== "IN_PROGRESS") {
      throwBusinessError("TRIP_NOT_ACTIVE", "لا يمكن إضافة مصروفات على رحلة حالتها ليست OPEN أو IN_PROGRESS.");
    }
  }
  
  // [BC_03]: لا يمكن إغلاق الرحلة إلا إذا كانت MANAGEMENT_APPROVED
  if (action === "updateTripStatus" && e.parameter.New_Status === "CLOSED") {
    let tripId = e.parameter.Trip_ID;
    let currentStatus = getTripStatusFromDb(ss, tripId);
    
    if (currentStatus !== "MANAGEMENT_APPROVED") {
      throwBusinessError("MISSING_MANAGEMENT_APPROVAL", "لا يمكن إغلاق الرحلة إلا بعد اعتماد الإدارة العليا.");
    }
  }
  
  // [BC_04]: لا يمكن تعديل بيانات سائق أو سيارة في رحلة نشطة
  if (action === "updateDriver" || action === "updateVehicle") {
    let resourceId = (action === "updateDriver") ? e.parameter.Driver_Code : e.parameter.Vehicle_Number;
    let targetColumnIndex = (action === "updateDriver") ? 3 : 4;
    
    if (isResourceBusyInActiveTrip(ss, resourceId, targetColumnIndex)) {
      throwBusinessError("RESOURCES_BUSY", "لا يمكن تعديل بيانات المورد لارتباطه برحلة نشطة.");
    }
  }
}

function getTripStatusFromDb(ss, tripId) {
  let sheet = ss.getSheetByName("Trips_Log");
  if (!sheet) return null;
  
  let data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == tripId && data[i][13] === false) {
      return data[i][7];
    }
  }
  throwBusinessError("TRIP_NOT_FOUND", `الرحلة (${tripId}) غير موجودة.`);
}

function isResourceBusyInActiveTrip(ss, resourceId, columnIndex) {
  let sheet = ss.getSheetByName("Trips_Log");
  if (!sheet) return false;
  
  let data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][columnIndex] == resourceId && data[i][7] === "IN_PROGRESS" && data[i][13] === false) {
      return true;
    }
  }
  return false;
}

function throwBusinessError(code, message) {
  let errorObj = new Error(message);
  errorObj.name = code;
  throw errorObj;
}

/**
 * ─── دالة التحقق من صلاحية المستخدم (واجهة مبسطة) ───
 */
function authService_checkPermission(userRole, action) {
  let allowed = ROLE_PERMISSIONS[userRole] || [];
  return allowed.indexOf(action) !== -1;
}