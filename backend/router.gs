/**
 * منظومة الكيان v6.0 - النواة الصلبة للخلفية
 * ملف: router.gs (التوجيه وإدارة الأقفال وحوكمة الاتساق وإدارة الحسابات)
 * [تحديث: إضافة الأكشنات الجديدة للبنزينة والعربيات والسائقين والعملاء + العهدات]
 */

/**
 * الدالة المسؤولة عن توجيه العمليات وتأمين التزامن (Concurrency)
 */
function routeRequest(e, method, userId, userRole) {
  let action = e.parameter.action;
  
  if (!action) {
    return createJsonResponse({
      "success": false,
      "error_code": "MISSING_ACTION",
      "message": "معامل الطلب (action) مفقود، لا يمكن توجيه العملية.",
      "timestamp": new Date().toISOString()
    });
  }
  
  if (action === "login") {
    return handleLoginAction(e);
  }
  
  let token = e.parameter.Session_Token;
  if (!token || token === "null") {
    return createJsonResponse({
      "success": false,
      "error_code": "UNAUTHORIZED",
      "message": "جلسة المستخدم غير صالحة، برجاء تسجيل الدخول.",
      "timestamp": new Date().toISOString()
    }, 401);
  }
  
  let authResult = authService_validateToken(token, userId);
  if (!authResult.valid) {
    return createJsonResponse({
      "success": false,
      "error_code": "UNAUTHORIZED",
      "message": authResult.message || "جلسة المستخدم غير صالحة.",
      "timestamp": new Date().toISOString()
    }, 401);
  }
  
  let realUserId = authResult.user_id;
  let realUserRole = authResult.role;
  
  if (!authService_checkPermission(realUserRole, action)) {
    return createJsonResponse({
      "success": false,
      "error_code": "INSUFFICIENT_PERMISSIONS",
      "message": `عذراً، دورك التشغيلي (${realUserRole}) لا يمتلك الصلاحية لتنفيذ الإجراء: ${action}`,
      "timestamp": new Date().toISOString()
    }, 403);
  }
  
  let isWriteOperation = checkIfWriteOperation(action);
  let lock = LockService.getScriptLock();
  
  try {
    if (isWriteOperation) {
      let hasLock = lock.tryLock(30000);
      if (!hasLock) {
        return createJsonResponse({
          "success": false,
          "error_code": "CONCURRENCY_ERROR",
          "message": "النظام يشهد ضغطاً تشغيلياً عالياً حالياً، برجاء إعادة المحاولة خلال ثوانٍ.",
          "timestamp": new Date().toISOString()
        }, 503);
      }
    }
    
    let resultPayload;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    let idempotencyKey = e.parameter.Idempotency_Key;
    
    if (isWriteOperation) {
      // تطبيق قيود العمل (BC_01 / BC_03 / BC_04)
      validateBusinessConstraints(e, action);
      
      // حماية من تنفيذ الطلب المكرر
      if (idempotencyKey) {
        let cachedResponse = checkIdempotency(idempotencyKey, action, realUserId);
        if (cachedResponse) {
          return createJsonResponse(cachedResponse);
        }
      }
    }
    
    switch (action) {
      case 'getTrips':
        resultPayload = tripService_getTrips(e);
        break;
      
      case 'getVehicles':
        resultPayload = vehicleService_getVehicles(ss);
        break;
      case 'createVehicle':
        resultPayload = vehicleService_createVehicle(ss, e.parameter, realUserId);
        break;
      case 'updateVehicle':
        resultPayload = vehicleService_updateVehicle(ss, e.parameter, realUserId);
        break;
      case 'deleteVehicle':
        resultPayload = vehicleService_deleteVehicle(ss, e.parameter);
        break;
      
      case 'getDriversList':
        resultPayload = driverService_getDrivers(ss);
        break;
      case 'createDriver':
        resultPayload = driverService_createDriver(ss, e.parameter, realUserId);
        break;
      case 'updateDriverData':
        resultPayload = driverService_updateDriver(ss, e.parameter, realUserId);
        break;
      case 'deleteDriver':
        resultPayload = driverService_deleteDriver(ss, e.parameter);
        break;
      
      case 'getClients':
        resultPayload = clientService_getClients(ss);
        break;
      case 'createClient':
        resultPayload = clientService_createClient(ss, e.parameter, realUserId);
        break;
      case 'updateClient':
        resultPayload = clientService_updateClient(ss, e.parameter, realUserId);
        break;
      case 'deleteClient':
        resultPayload = clientService_deleteClient(ss, e.parameter);
        break;
      
      case 'getFuelBalance':
        resultPayload = fuelService_getBalance(ss);
        break;
      case 'addFuelBalance':
        resultPayload = fuelService_addBalance(ss, e.parameter, realUserId);
        break;
      case 'getFuelTransactions':
        resultPayload = fuelService_getTransactions(ss, e.parameter);
        break;
      case 'updateFuelPrice':
        resultPayload = fuelService_updatePrice(ss, e.parameter, realUserId);
        break;
      
      case 'getNotifications':
        resultPayload = notificationService_getNotifications(ss, realUserId);
        break;
      case 'markNotificationRead':
        resultPayload = notificationService_markRead(ss, e.parameter, realUserId);
        break;
      case 'markAllNotificationsRead':
        resultPayload = notificationService_markAllRead(ss, realUserId);
        break;
      case 'deleteNotification':
        resultPayload = notificationService_deleteNotification(ss, e.parameter, realUserId);
        break;
      
      case 'getDriverAdvances':
        resultPayload = driverService_getAdvances(ss, e.parameter);
        break;
      case 'settleDriverAdvance':
        resultPayload = driverService_settleAdvance(ss, e.parameter, realUserId);
        break;
      
      // ⚖️ العهدات
      case 'getMyBalance':
        resultPayload = balanceService_getUserBalance(realUserId);
        break;
      case 'getUserBalance':
        resultPayload = balanceService_getUserBalance(e.parameter.Target_User_ID);
        break;
      case 'getMyTransactions':
        resultPayload = balanceService_getUserTransactions(realUserId, e.parameter.Limit);
        break;
      case 'getAllTransactions':
        resultPayload = balanceService_getAllTransactions(e.parameter.Limit);
        break;
      case 'addBalance':
        resultPayload = balanceService_addBalanceWrapper(e.parameter.Target_User_ID, parseFloat(e.parameter.Amount), e.parameter.Notes, realUserId);
        break;
      case 'deductBalance':
        resultPayload = balanceService_deductBalanceWrapper(e.parameter.Target_User_ID, parseFloat(e.parameter.Amount), e.parameter.Notes, realUserId);
        break;
      case 'transferBalance':
        resultPayload = balanceService_transferBalanceWrapper(e.parameter.From_User_ID, e.parameter.To_User_ID, parseFloat(e.parameter.Amount), e.parameter.Notes, realUserId);
        break;
      
      case 'createUser':
        resultPayload = userService_createUser(ss, e.parameter, realUserId);
        break;
      case 'getUsers':
        resultPayload = userService_getUsers(ss);
        break;
      case 'toggleUserStatus':
        resultPayload = userService_toggleUserStatus(ss, e.parameter);
        break;
      case 'updateUserRole':
        resultPayload = userService_updateUserRole(ss, e.parameter);
        break;
      case 'deleteUser':
        resultPayload = userService_deleteUser(ss, e.parameter);
        break;
      case 'resetUserPassword':
        resultPayload = userService_resetPassword(ss, e.parameter);
        break;
      
      case 'createTrip':
        resultPayload = tripService_createTrip(e, realUserId);
        break;
      case 'updateTripStatus':
        resultPayload = tripService_updateTripStatus(e, realUserId);
        break;
      case 'updateTrip':
        resultPayload = tripService_updateTrip(e, realUserId);
        break;
      case 'addExpense':
        resultPayload = expenseService_addExpense(e, realUserId);
        break;
      case 'getMonthlyExpenses':
        resultPayload = expenseService_getMonthlyExpenses(ss);
        break;
      case 'settleTripFinancials':
        resultPayload = accountingService_settleTrip(e, realUserId);
        break;
      
      case 'logout':
        authService_logout(realUserId);
        resultPayload = { success: true, message: "تم تسجيل الخروج بنجاح." };
        break;
        
      default:
        return createJsonResponse({
          "success": false,
          "error_code": "UNKNOWN_ACTION",
          "message": `العملية المطلوبة (${action}) غير معرفة بالنظام.`,
          "timestamp": new Date().toISOString()
        }, 404);
    }
    
    // حفظ نتيجة العملية في كاش منع التكرار
    if (isWriteOperation && idempotencyKey) {
      updateIdempotencyCache(idempotencyKey, resultPayload);
    }
    
    return createJsonResponse(resultPayload);
    
  } catch (bizError) {
    return createJsonResponse({
      "success": false,
      "error_code": bizError.name || "BUSINESS_CONSTRAINT_VIOLATION",
      "message": bizError.message || "فشلت العملية.",
      "timestamp": new Date().toISOString()
    }, 400);
    
  } finally {
    if (isWriteOperation) {
      lock.releaseLock();
    }
  }
}

/**
 * ─── معالج تسجيل الدخول ───
 */
function handleLoginAction(e) {
  let params = {
    Username: e.parameter.Username || "",
    Password: e.parameter.Password || ""
  };
  
  let result = authService_login(params);
  
  if (result.success) {
    logApiAudit(result.user_id, result.role, "login", 0, "N/A", 200);
  }
  
  return createJsonResponse(result);
}

/**
 * دالة فحص تصنيف العمليات لمعرفة ما إذا كانت تتطلب تفعيل الـ LockService
 */
function checkIfWriteOperation(action) {
  const writeActions = [
    'createTrip', 'updateTripStatus', 'updateTrip', 'addExpense', 'settleTripFinancials',
    'updateDriver', 'updateVehicle', 'createUser', 'toggleUserStatus',
    'updateUserRole', 'deleteUser', 'resetUserPassword',
    'createVehicle', 'updateVehicle', 'deleteVehicle',
    'createDriver', 'updateDriverData', 'deleteDriver',
    'createClient', 'updateClient', 'deleteClient',
    'addFuelBalance', 'updateFuelPrice',
    'markNotificationRead', 'markAllNotificationsRead', 'deleteNotification',
    'settleDriverAdvance',
    'addBalance', 'deductBalance', 'transferBalance'
  ];
  return writeActions.indexOf(action) !== -1;
}

// ==========================================
// 📋 دوال خدمات المستخدمين
// ==========================================

function userService_createUser(ss, params, requestingUserId) {
  let sheet = ss.getSheetByName("Users");
  if (!sheet) {
    return { "success": false, "message": "شيت Users غير موجود!" };
  }
  
  let data = sheet.getDataRange().getValues();
  let username = params.New_Username?.trim().toLowerCase() || "";
  let fullName = params.Full_Name?.trim() || "";
  let password = params.New_Password || "";
  let role = params.Assigned_Role || "Operations";
  
  if (!username || !fullName || !password) {
    return { "success": false, "message": "جميع الحقول مطلوبة." };
  }
  
  if (password.length < 6) {
    return { "success": false, "message": "كلمة المرور يجب أن تكون 6 أحرف على الأقل." };
  }
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][2]?.toString().toLowerCase() === username) {
      return { "success": false, "message": "اسم المستخدم هذا مسجل مسبقاً." };
    }
  }
  
  let userId = generateUserId(sheet);
  let hashedPassword = hashPassword(password);
  let now = new Date().toISOString();
  
  sheet.appendRow([
    userId,
    fullName,
    username,
    hashedPassword,
    role,
    "ACTIVE",
    requestingUserId || "SYSTEM",
    now,
    "",
    "",
    "",
    false,
    0
  ]);
  
  logApiAudit(requestingUserId, "Admin", "createUser", 0, "N/A", 200);
  
  return {
    "success": true,
    "data": {
      "user_id": userId,
      "full_name": fullName,
      "username": username,
      "role": role,
      "current_balance": 0
    },
    "message": `تم إنشاء حساب ${fullName} بنجاح.`
  };
}

function userService_getUsers(ss) {
  let sheet = ss.getSheetByName("Users");
  if (!sheet) {
    return { "success": false, "message": "شيت Users غير موجود." };
  }
  
  let data = sheet.getDataRange().getValues();
  let sanitizedData = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][11] === true || data[i][11] === "TRUE") continue;
    sanitizedData.push({
      user_id: data[i][0],
      full_name: data[i][1],
      username: data[i][2],
      role: data[i][4],
      status: data[i][5],
      created_by: data[i][6],
      created_at: data[i][7],
      last_login: data[i][8] || "لم يسجل دخول بعد",
      current_balance: data[i][12] || 0
    });
  }
  
  return { "success": true, "data": sanitizedData };
}

function userService_toggleUserStatus(ss, params) {
  let sheet = ss.getSheetByName("Users");
  if (!sheet) {
    return { "success": false, "message": "شيت Users غير موجود." };
  }
  
  let targetId = params.Target_User_ID;
  let newStatus = params.New_Status;
  
  if (!targetId || !newStatus) {
    return { "success": false, "message": "Target_User_ID و New_Status مطلوبين." };
  }
  
  let data = sheet.getDataRange().getValues();
  let found = false;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === targetId) {
      if (data[i][2] === "admin" && newStatus !== "ACTIVE") {
        return { "success": false, "message": "لا يمكن تعطيل حساب المدير الأساسي." };
      }
      sheet.getRange(i + 1, 6).setValue(newStatus);
      found = true;
      break;
    }
  }
  
  if (!found) {
    return { "success": false, "message": "المستخدم غير موجود." };
  }
  
  return { "success": true, "message": `تم تحديث الحالة إلى ${newStatus}.` };
}

function userService_updateUserRole(ss, params) {
  let sheet = ss.getSheetByName("Users");
  if (!sheet) {
    return { "success": false, "message": "شيت Users غير موجود." };
  }
  
  let targetId = params.Target_User_ID;
  let newRole = params.New_Role;
  
  if (!targetId || !newRole) {
    return { "success": false, "message": "Target_User_ID و New_Role مطلوبين." };
  }
  
  let validRoles = ["Admin", "Manager", "Operations", "Accountant"];
  if (validRoles.indexOf(newRole) === -1) {
    return { "success": false, "message": `الدور غير صالح. الأدوار: ${validRoles.join(", ")}` };
  }
  
  let data = sheet.getDataRange().getValues();
  let found = false;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === targetId) {
      if (data[i][2] === "admin") {
        return { "success": false, "message": "لا يمكن تغيير دور المدير الأساسي." };
      }
      sheet.getRange(i + 1, 5).setValue(newRole);
      found = true;
      break;
    }
  }
  
  if (!found) {
    return { "success": false, "message": "المستخدم غير موجود." };
  }
  
  return { "success": true, "message": `تم تحديث الصلاحية إلى ${newRole}.` };
}

function userService_deleteUser(ss, params) {
  let sheet = ss.getSheetByName("Users");
  if (!sheet) {
    return { "success": false, "message": "شيت Users غير موجود." };
  }
  
  let targetId = params.Target_User_ID;
  
  if (!targetId) {
    return { "success": false, "message": "Target_User_ID مطلوب." };
  }
  
  let data = sheet.getDataRange().getValues();
  let found = false;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === targetId) {
      if (data[i][2] === "admin") {
        return { "success": false, "message": "لا يمكن حذف المدير الأساسي." };
      }
      sheet.getRange(i + 1, 12).setValue(true);
      found = true;
      break;
    }
  }
  
  if (!found) {
    return { "success": false, "message": "المستخدم غير موجود." };
  }
  
  return { "success": true, "message": "تم حذف المستخدم بنجاح." };
}

function userService_resetPassword(ss, params) {
  let sheet = ss.getSheetByName("Users");
  if (!sheet) {
    return { "success": false, "message": "شيت Users غير موجود." };
  }
  
  let targetId = params.Target_User_ID;
  let newPassword = params.New_Password || "Temp@123";
  
  if (!targetId) {
    return { "success": false, "message": "Target_User_ID مطلوب." };
  }
  
  if (newPassword.length < 6) {
    return { "success": false, "message": "كلمة المرور 6 أحرف على الأقل." };
  }
  
  let data = sheet.getDataRange().getValues();
  let found = false;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === targetId) {
      let hashedPassword = hashPassword(newPassword);
      sheet.getRange(i + 1, 4).setValue(hashedPassword);
      found = true;
      break;
    }
  }
  
  if (!found) {
    return { "success": false, "message": "المستخدم غير موجود." };
  }
  
  return {
    "success": true,
    "message": "تم إعادة تعيين كلمة المرور بنجاح."
  };
}

// ==========================================
// 🚛 دوال الرحلات
// ==========================================

function tripService_getTrips(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Trips_Log");
    if (!sheet) {
      return { "success": false, "message": "شيت Trips_Log غير موجود." };
    }
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      return { "success": true, "data": [] };
    }
    var tripsData = data.slice(1);
    return { "success": true, "data": tripsData };
  } catch (err) {
    throw new Error("فشل في استخراج بيانات الرحلات: " + err.message);
  }
}

// ==========================================
// ⚖️ دوال العهدات (واجهة للـ balanceService)
// ==========================================

function balanceService_getUserBalance(userId) {
  let balance = balanceService_getBalance(userId);
  return { "success": true, "data": { "user_id": userId, "current_balance": balance } };
}

function balanceService_getUserTransactions(userId, limit) {
  let transactions = balanceService_getTransactions(userId, limit || 50);
  return { "success": true, "data": transactions };
}

function balanceService_getAllTransactions(limit) {
  let transactions = balanceService_fetchAllTransactionsList(limit || 100);
  return { "success": true, "data": transactions };
}

// ✅ الدوال الجديدة (Wrapper) عشان منكررش الاستدعاء
function balanceService_addBalanceWrapper(userId, amount, notes, createdBy) {
  if (!userId || !amount || amount <= 0) {
    return { "success": false, "message": "بيانات غير صالحة: المستخدم والمبلغ مطلوبين." };
  }
  return balanceService_addBalance(userId, amount, notes, createdBy);
}

function balanceService_deductBalanceWrapper(userId, amount, notes, createdBy) {
  if (!userId || !amount || amount <= 0) {
    return { "success": false, "message": "بيانات غير صالحة: المستخدم والمبلغ مطلوبين." };
  }
  return balanceService_deductBalance(userId, amount, notes, createdBy);
}

function balanceService_transferBalanceWrapper(fromUserId, toUserId, amount, notes, createdBy) {
  if (!fromUserId || !toUserId || !amount || amount <= 0) {
    return { "success": false, "message": "بيانات غير صالحة: المرسل والمستقبل والمبلغ مطلوبين." };
  }
  return balanceService_transferBalance(fromUserId, toUserId, amount, notes, createdBy);
}

function accountingService_settleTrip(e, uid) {
  return { "success": false, "message": "تسوية الرحلة المالية غير مفعّلة بعد." };
}