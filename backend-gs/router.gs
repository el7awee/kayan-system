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
  
  // 🛡️ Auth already validated by middleware pipeline — using verified userId/userRole
  let isWriteOperation = checkIfWriteOperation(action);
  let lock = LockService.getScriptLock();
  
  try {
    if (isWriteOperation) {
      let hasLock = lock.tryLock(3000);
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
        let cachedResponse = checkIdempotency(idempotencyKey, action, userId);
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
        resultPayload = vehicleService_createVehicle(ss, e.parameter, userId);
        break;
      case 'updateVehicle':
        resultPayload = vehicleService_updateVehicle(ss, e.parameter, userId);
        break;
      case 'deleteVehicle':
        resultPayload = vehicleService_deleteVehicle(ss, e.parameter);
        break;
      
      case 'getDriversList':
        resultPayload = driverService_getDrivers(ss);
        break;
      case 'createDriver':
        resultPayload = driverService_createDriver(ss, e.parameter, userId);
        break;
      case 'updateDriverData':
        resultPayload = driverService_updateDriver(ss, e.parameter, userId);
        break;
      case 'deleteDriver':
        resultPayload = driverService_deleteDriver(ss, e.parameter);
        break;
      
      case 'getClients':
        resultPayload = clientService_getClients(ss);
        break;
      case 'createClient':
        resultPayload = clientService_createClient(ss, e.parameter, userId);
        break;
      case 'updateClient':
        resultPayload = clientService_updateClient(ss, e.parameter, userId);
        break;
      case 'deleteClient':
        resultPayload = clientService_deleteClient(ss, e.parameter);
        break;
      
      case 'getFuelBalance':
        resultPayload = fuelService_getBalance(ss);
        break;
      case 'addFuelBalance':
        resultPayload = fuelService_addBalance(ss, e.parameter, userId);
        break;
      case 'getFuelTransactions':
        resultPayload = fuelService_getTransactions(ss, e.parameter);
        break;
      case 'getFuelAnalytics':
        resultPayload = fuelService_getAnalytics(ss);
        break;
      case 'updateFuelPrice':
        resultPayload = fuelService_updatePrice(ss, e.parameter, userId);
        break;
      
      case 'getNotifications':
        resultPayload = notificationService_getNotifications(ss, userId);
        break;
      case 'markNotificationRead':
        resultPayload = notificationService_markRead(ss, e.parameter, userId);
        break;
      case 'markAllNotificationsRead':
        resultPayload = notificationService_markAllRead(ss, userId);
        break;
      case 'deleteNotification':
        resultPayload = notificationService_deleteNotification(ss, e.parameter, userId);
        break;
      
      case 'getDriverAdvances':
        resultPayload = driverService_getAdvances(ss, e.parameter);
        break;
      case 'settleDriverAdvance':
        resultPayload = driverService_settleAdvance(ss, e.parameter, userId);
        break;
      
      // ⚖️ العهدات
      case 'getMyBalance':
        resultPayload = balanceService_getUserBalance(userId);
        break;
      case 'getUserBalance':
        resultPayload = balanceService_getUserBalance(e.parameter.Target_User_ID);
        break;
      case 'getMyTransactions':
        resultPayload = balanceService_getUserTransactions(userId, e.parameter.Limit);
        break;
      case 'getAllTransactions':
        resultPayload = balanceService_getAllTransactions(e.parameter.Limit);
        break;
      case 'addBalance':
        resultPayload = balanceService_addBalanceWrapper(e.parameter.Target_User_ID, parseFloat(e.parameter.Amount), e.parameter.Notes, userId);
        break;
      case 'deductBalance':
        resultPayload = balanceService_deductBalanceWrapper(e.parameter.Target_User_ID, parseFloat(e.parameter.Amount), e.parameter.Notes, userId);
        break;
      case 'transferBalance':
        resultPayload = balanceService_transferBalanceWrapper(e.parameter.From_User_ID, e.parameter.To_User_ID, parseFloat(e.parameter.Amount), e.parameter.Notes, userId);
        break;
      
      case 'createUser':
        resultPayload = userService_createUser(ss, e.parameter, userId);
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
        resultPayload = tripService_createTrip(e, userId);
        break;
      case 'updateTripStatus':
        resultPayload = tripService_updateTripStatus(e, userId);
        break;
      case 'updateTrip':
        resultPayload = tripService_updateTrip(e, userId);
        break;
      case 'softDeleteTrip':
        resultPayload = tripService_softDeleteTrip(e, userId);
        break;
      case 'addExpense':
        resultPayload = expenseService_addExpense(e, userId);
        break;
      case 'getMonthlyExpenses':
        resultPayload = expenseService_getMonthlyExpenses(ss);
        break;
      case 'getTripExpenses':
        resultPayload = expenseService_getTripExpenses(ss, e.parameter);
        break;
      case 'getExpenses':
        resultPayload = expenseService_getExpenses(ss, e.parameter);
        break;
      case 'updateExpense':
        resultPayload = expenseService_updateExpense(ss, e, userId);
        break;
      case 'deleteExpense':
        resultPayload = expenseService_deleteExpense(ss, e, userId);
        break;
      case 'getDashboard':
        resultPayload = aggregateService_getDashboard(ss, e, userId);
        break;
      case 'getLookups':
        resultPayload = aggregateService_getLookups(ss);
        break;
      case 'settleTripFinancials':
        resultPayload = accountingService_settleTrip(e, userId);
        break;
      
      // 🔧 الصيانة
      case 'getMaintenance':
        resultPayload = maintenanceService_getAll(ss, e.parameter);
        break;
      case 'getVehicleMaintenance':
        resultPayload = maintenanceService_getByVehicle(ss, e.parameter);
        break;
      case 'getTripMaintenance':
        resultPayload = maintenanceService_getByTrip(ss, e.parameter);
        break;
      case 'updateMaintenance':
        resultPayload = maintenanceService_updateMaintenance(ss, e.parameter, userId);
        break;
      case 'deleteMaintenance':
        resultPayload = maintenanceService_deleteMaintenance(ss, e.parameter);
        break;
      
      // 🔐 الصلاحيات
      case 'getPermissions':
        resultPayload = permissionService_getAll(ss);
        break;
      case 'savePermissions':
        resultPayload = permissionService_save(ss, e);
        break;
      
      // 📊 التقارير
      case 'getProfitLoss':
        resultPayload = reportService_getProfitLoss(e.parameter);
        break;
      case 'getExpenseBreakdown':
        resultPayload = reportService_getExpenseBreakdown(e.parameter);
        break;
      case 'getFuelSummary':
        resultPayload = reportService_getFuelSummary(e.parameter);
        break;
      case 'getDriverPerformance':
        resultPayload = reportService_getDriverPerformance(e.parameter);
        break;
      case 'getClientActivity':
        resultPayload = reportService_getClientActivity(e.parameter);
        break;
      case 'getMonthlyTrends':
        resultPayload = reportService_getMonthlyTrends(e.parameter);
        break;
      case 'getVehicleUtilization':
        resultPayload = reportService_getVehicleUtilization(e.parameter);
        break;
        
      case 'logout':
        authService_logout(userId);
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
    'createTrip', 'updateTripStatus', 'updateTrip', 'softDeleteTrip', 'addExpense', 'settleTripFinancials',
    'updateDriver', 'updateVehicle', 'createUser', 'toggleUserStatus',
    'updateUserRole', 'deleteUser', 'resetUserPassword',
    'createVehicle', 'updateVehicle', 'deleteVehicle',
    'createDriver', 'updateDriverData', 'deleteDriver',
    'createClient', 'updateClient', 'deleteClient',
    'addFuelBalance', 'updateFuelPrice',
    'markNotificationRead', 'markAllNotificationsRead', 'deleteNotification',
    'settleDriverAdvance',
    'addBalance', 'deductBalance', 'transferBalance',
    'updateExpense', 'deleteExpense',
    'updateMaintenance', 'deleteMaintenance',
    'savePermissions'
  ];
  return writeActions.indexOf(action) !== -1;
}

// ==========================================
// 📋 دوال خدمات المستخدمين
// ==========================================

function userService_createUser(ss, params, requestingUserId) {
  let sheet = getCachedSheet("Users");
  if (!sheet) {
    return { "success": false, "message": "شيت Users غير موجود!" };
  }
  
  let data = getCachedData("Users");
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
      0,
      ""
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
  let data = getCachedData("Users");
  if (!data) {
    return { "success": false, "message": "شيت Users غير موجود." };
  }
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
    var data = getCachedData("Trips_Log");
    if (!data) {
      return { "success": false, "message": "شيت Trips_Log غير موجود." };
    }
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

/**
 * تصفية عهدة الرحلة وإغلاقها (خطوة المحاسب).
 * - يحسب المتبقّي = العهدة − إجمالي مصاريف الرحلة.
 * - settlementType = "RETURNED": السائق يرجّع المتبقّي → يتخصم من عهدته ويتضاف لعهدة المحاسب (اللي بيقفل).
 * - settlementType = "CARRIED_OVER": المتبقّي يفضل مع السائق كعهدة للرحلة الجاية.
 * - يحوّل حالة الرحلة إلى CLOSED.
 */
function accountingService_settleTrip(e, uid) {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Trips_Log");
  if (!sheet) throwBusinessError("SYSTEM_ERROR", "شيت Trips_Log غير موجود.");

  let tripId = e.parameter.Trip_ID;
  let settlementType = e.parameter.Settlement_Type || "RETURNED"; // RETURNED أو CARRIED_OVER
  let clientVersion = parseInt(e.parameter.Version_Number || "0");

  if (!tripId) {
    throwBusinessError("BAD_REQUEST", "معامل Trip_ID مطلوب.");
  }
  if (settlementType !== "RETURNED" && settlementType !== "CARRIED_OVER") {
    throwBusinessError("BAD_REQUEST", "نوع التصفية غير صالح (RETURNED أو CARRIED_OVER).");
  }

  let data = sheet.getDataRange().getValues();
  let foundRowIndex = -1;
  let dbVersion = -1;
  let driverId = "";
  let advanceCash = 0;
  let currentStatus = "";

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == tripId && data[i][13] === false) {
      foundRowIndex = i + 1;
      dbVersion = parseInt(data[i][12]);
      driverId = data[i][3];
      advanceCash = parseFloat(data[i][6]) || 0;
      currentStatus = data[i][7];
      break;
    }
  }

  if (foundRowIndex === -1) {
    throwBusinessError("TRIP_NOT_FOUND", `الرحلة (${tripId}) غير موجودة.`);
  }

  if (currentStatus === "CLOSED") {
    throwBusinessError("TRIP_ALREADY_CLOSED", "الرحلة مغلقة بالفعل ولا يمكن تصفيتها مرة أخرى.");
  }

  if (clientVersion && clientVersion !== dbVersion) {
    throwBusinessError("VERSION_MISMATCH", `النسخة الحالية [${dbVersion}]، نسختك [${clientVersion}].`);
  }

  // حساب إجمالي مصاريف الرحلة من Expenses_Log
  let totalExpenses = 0;
  let expensesSheet = ss.getSheetByName("Expenses_Log");
  if (expensesSheet) {
    let expensesData = expensesSheet.getDataRange().getValues();
    for (let i = 1; i < expensesData.length; i++) {
      if (expensesData[i][1] === tripId && expensesData[i][10] !== true) {
        totalExpenses += parseFloat(expensesData[i][5]) || 0;
      }
    }
  }

  // المتبقّي الحقيقي = إجمالي العهدة اللي السائق ماسكها فعلًا الآن
  // (بتشمل المترحّل من رحلات سابقة، وبتكون صافية بعد خصم كل المصاريف لأن كل مصروف بيتخصم من عهدة السائق وقت تسجيله)
  let driverCustody = driverId ? driverService_getDriverAdvance(driverId) : 0;
  let remainingAdvance = driverCustody;
  let carriedOver = 0;
  let settlementStatus = "";

  if (settlementType === "RETURNED") {
    // السائق يسلّم كل اللي معاه للمحاسب → عهدته تبقى صفر، والمبلغ يدخل عهدة المحاسب
    if (remainingAdvance !== 0 && driverId) {
      driverService_updateDriverAdvance(driverId, -remainingAdvance, uid, `تصفية وإغلاق الرحلة ${tripId} - تسليم كامل العهدة للمحاسب`);
      balanceService_updateBalance(uid, remainingAdvance, 'ADD', driverId, tripId, `استلام عهدة السائق عند تصفية الرحلة ${tripId}`, uid);
    }
    settlementStatus = "FULLY_SETTLED";
    carriedOver = 0;
  } else {
    // ترحيل: المتبقّي يفضل مع السائق كعهدة للرحلة الجاية (عهدته متغيّرتش)
    settlementStatus = "CARRIED_OVER";
    carriedOver = remainingAdvance;
  }

  let nextVersion = dbVersion + 1;
  let nowStr = new Date().toISOString();

  sheet.getRange(foundRowIndex, 8).setValue("CLOSED");        // Status
  sheet.getRange(foundRowIndex, 12).setValue(nowStr);         // Updated_At
  sheet.getRange(foundRowIndex, 13).setValue(nextVersion);    // Version
  sheet.getRange(foundRowIndex, 22).setValue(settlementStatus); // Settlement_Status
  sheet.getRange(foundRowIndex, 23).setValue(carriedOver);    // Carried_Over_Advance

  createNotification(
    'ALL',
    'TRIP_SETTLED',
    `✅ تمت تصفية وإغلاق الرحلة ${tripId}`,
    `العهدة: ${advanceCash} ج.م، المصاريف: ${totalExpenses} ج.م، المتبقّي: ${remainingAdvance} ج.م (${settlementType === "RETURNED" ? "رجع للمحاسب" : "اترحّل للسائق"})`,
    tripId
  );

  return {
    "success": true,
    "trip_id": tripId,
    "message": `تمت تصفية وإغلاق الرحلة ${tripId} بنجاح.`,
    "next_version": nextVersion,
    "data": {
      "advance_cash": advanceCash,
      "total_expenses": totalExpenses,
      "driver_custody": driverCustody,
      "remaining_advance": remainingAdvance,
      "carried_over": carriedOver,
      "settlement_type": settlementType
    }
  };
}

/**
 * ─── نقاط تجميع لتقليل عدد الطلبات (أداء) ───
 * بدل ما الواجهة تبعت 5-9 طلبات منفصلة، تبعت طلب واحد يرجّع كل اللازم.
 */
function _extractData(res) {
  if (res && typeof res === "object" && "data" in res) return res.data;
  return res;
}

function aggregateService_getDashboard(ss, e, userId) {
  return {
    "success": true,
    "data": {
      "trips": _extractData(tripService_getTrips(e)) || [],
      "fuel": _extractData(fuelService_getBalance(ss)) || {},
      "my_balance": _extractData(balanceService_getUserBalance(userId)) || {},
      "notifications": _extractData(notificationService_getNotifications(ss, userId)) || {},
      "monthly_expenses": _extractData(expenseService_getMonthlyExpenses(ss)) || {}
    }
  };
}

function aggregateService_getLookups(ss) {
  return {
    "success": true,
    "data": {
      "clients": _extractData(clientService_getClients(ss)) || [],
      "drivers": _extractData(driverService_getDrivers(ss)) || [],
      "vehicles": _extractData(vehicleService_getVehicles(ss)) || [],
      "fuel": _extractData(fuelService_getBalance(ss)) || {}
    }
  };
}