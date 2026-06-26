/**
 * منظومة الكيان v6.0 - طبقة الخدمات التشغيلية
 * ملف: tripService.gs (إدارة الرحلات والتحكم بالنسخ المتفائلة)
 * [تحديث: دعم الجاز والعهدة والقوائم المنسدلة + ربط العهدة بالسائقين]
 */

/**
 * 1. دالة إنشاء رحلة جديدة (createTrip) - معدلة
 * تدعم: اختيار من القوائم المنسدلة + تسجيل الجاز والعهدة
 */
function tripService_createTrip(e, userId) {
  startTimer("tripService_createTrip");
  
  let ss = getCachedSS();
  let sheet = getCachedSheet("Trips_Log");
  if (!sheet) throwBusinessError("SYSTEM_ERROR", "شيت Trips_Log غير موجود.");
  
  // توليد معرف فريد للرحلة
  let tripId = generateTripId();
  let nowStr = new Date().toISOString();
  
  // استخراج المدخلات
  let customerId = e.parameter.Customer_ID || "";
  let driverId   = e.parameter.Driver_ID || "";
  let vehicleId  = e.parameter.Vehicle_ID || "";
  let route      = e.parameter.Route || "";
  let advanceCash = parseFloat(e.parameter.Advance_Cash || "0");
  
  let fuelLiters = parseFloat(e.parameter.Fuel_Liters || "0");
  let fuelPrice = parseFloat(e.parameter.Fuel_Price || "0");
  let fuelAmount = fuelLiters * fuelPrice;
  
  // التحقق من صحة البيانات
  if (!customerId || !driverId || !vehicleId) {
    throwBusinessError("BAD_REQUEST", "يرجى اختيار العميل والسائق والعربية من القائمة.");
  }
  
  if (fuelLiters <= 0) {
    throwBusinessError("BAD_REQUEST", "يرجى إدخال كمية الجاز المأخوذة.");
  }
  
  // ==========================================
  // ✅ الخطوة 1: التحقق المسبق من كفاية رصيد العهدة قبل أي كتابة
  //    (عشان منكتبش رحلة يتيمة لو الرصيد مش كفاية)
  // ==========================================
  if (advanceCash > 0) {
    let operatorBalance = balanceService_getBalance(userId);
    if (operatorBalance < advanceCash) {
      throwBusinessError("BALANCE_ERROR", `رصيدك غير كافٍ. الرصيد الحالي: ${operatorBalance}، المطلوب: ${advanceCash}`);
    }
  }
  
  // ==========================================
  // ✅ الخطوة 2: تسجيل الرحلة (بعد التأكد من الرصيد)
  // ==========================================
  let newRow = [
    tripId,
    nowStr.split('T')[0],
    customerId,
    driverId,
    vehicleId,
    route,
    advanceCash,
    "OPEN",
    "",
    userId,
    nowStr,
    nowStr,
    1,
    false,
    fuelLiters,
    fuelAmount,
    0,
    0,
    fuelLiters,
    fuelAmount,
    fuelPrice,
    "OPEN",
    0
  ];
  
  sheet.appendRow(newRow);
  
  // ==========================================
  // ✅ الخطوة 3: تحديث العهدة (الرصيد اتأكدنا منه فوق قبل الكتابة)
  // ==========================================
  if (advanceCash > 0) {
    try {
      // خصم من عهدة الأوبريشن (المنفذ)
      balanceService_updateBalance(userId, -advanceCash, 'DEDUCT', '', tripId, `عهدة رحلة ${tripId}`, userId);
      
      // إضافة للسائق
      driverService_updateDriverAdvance(driverId, advanceCash, userId, `عهدة رحلة ${tripId}`);
      
    } catch (balanceError) {
      // الرحلة متسجّلة بالفعل والرصيد كان كافياً؛ في حالة خطأ غير متوقع ننبّه فقط بدون ما نرمي خطأ يخلّي صف يتيم
      console.error("خطأ في تحديث العهدة:", balanceError.message);
      createNotification(
        userId,
        'BALANCE_ERROR',
        '⚠️ خطأ في العهدة',
        `تم إنشاء الرحلة ${tripId} لكن حدث خطأ في العهدة: ${balanceError.message}`,
        tripId
      );
    }
  }
  
  // ==========================================
  // ✅ الخطوة 4: تحديث البنزينة
  // ==========================================
  try {
    let currentFuelBalance = getFuelBalance();
    let newFuelBalance = currentFuelBalance - fuelAmount;
    updateFuelBalance(newFuelBalance, userId, `استهلاك جاز للرحلة ${tripId}`);
    
    logFuelTransaction({
      vehicleId: vehicleId,
      tripId: tripId,
      amountLiters: fuelLiters,
      amountEGP: fuelAmount,
      fuelPrice: fuelPrice,
      transactionType: 'INITIAL',
      source: 'FUEL_STATION',
      createdBy: userId,
      notes: `بداية رحلة ${tripId}`
    });
  } catch (fuelError) {
    console.error("خطأ في تحديث البنزينة:", fuelError.message);
    // الرحلة متسجلة، لكن البنزينة متحدثتش
    createNotification(
      userId,
      'FUEL_ERROR',
      '⚠️ خطأ في البنزينة',
      `تم إنشاء الرحلة ${tripId} لكن حدث خطأ في البنزينة: ${fuelError.message}`,
      tripId
    );
  }
  
  // تنبيه لو الرصيد سالب
  let currentFuelBalance = getFuelBalance();
  if (currentFuelBalance < 0) {
    createNotification(
      'ALL',
      'FUEL_BALANCE_NEGATIVE',
      '⚠️ تنبيه: رصيد البنزينة أصبح سالباً',
      `الرصيد الحالي (${currentFuelBalance}) بعد خصم ${fuelAmount} ج.م للرحلة ${tripId}`,
      tripId
    );
  }
  
  endTimer("tripService_createTrip");
  
  return {
    "success": true,
    "trip_id": tripId,
    "fuel_amount": fuelAmount,
    "fuel_liters": fuelLiters,
    "advance_cash": advanceCash,
    "message": `تم إنشاء الرحلة ${tripId} بنجاح.`
  };
}

/**
 * 2. دالة تحديث حالة الرحلة (معدلة - تدعم الإغلاق والعهدة)
 */
function tripService_updateTripStatus(e, userId) {
  startTimer("tripService_updateTripStatus");
  
  let ss = getCachedSS();
  let sheet = getCachedSheet("Trips_Log");
  if (!sheet) throwBusinessError("SYSTEM_ERROR", "شيت Trips_Log غير موجود.");
  
  let tripId = e.parameter.Trip_ID;
  let newStatus = e.parameter.New_Status;
  let clientVersion = parseInt(e.parameter.Version_Number || "0");
  
  if (!tripId || !newStatus || !clientVersion) {
    throwBusinessError("BAD_REQUEST", "المعاملات الأساسية للتحديث مفقودة.");
  }
  
  let data = getCachedData("Trips_Log");
  let foundRowIndex = -1;
  let dbVersion = -1;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == tripId && data[i][13] === false) {
      foundRowIndex = i + 1;
      dbVersion = parseInt(data[i][12]);
      break;
    }
  }
  
  if (foundRowIndex === -1) {
    throwBusinessError("TRIP_NOT_FOUND", `الرحلة (${tripId}) غير موجودة.`);
  }
  
  if (clientVersion !== dbVersion) {
    throwBusinessError("VERSION_MISMATCH", `النسخة الحالية [${dbVersion}]، نسختك [${clientVersion}].`);
  }
  
  let nextVersion = dbVersion + 1;
  let nowStr = new Date().toISOString();
  
  // ==========================================
  // 🆕 لو الحالة بقت CLOSED، نتعامل مع العهدة
  // ==========================================
  if (newStatus === "CLOSED") {
    let driverId = data[foundRowIndex - 1][3]; // Driver_ID
    let advanceCash = parseFloat(data[foundRowIndex - 1][6]) || 0; // Advance_Cash
    let totalExpenses = 0;
    
    // حساب إجمالي المصروفات من Expenses_Log
    let expensesSheet = getCachedSheet("Expenses_Log");
    if (expensesSheet) {
      let expensesData = getCachedData("Expenses_Log");
      for (let i = 1; i < expensesData.length; i++) {
        if (expensesData[i][1] === tripId && expensesData[i][10] !== true) {
          totalExpenses += parseFloat(expensesData[i][5]) || 0;
  }
}

/**
 * 8. دالة أرشفة/حذف رحلة (soft delete)
 */
function tripService_softDeleteTrip(e, userId) {
  let tripId = e.parameter.Trip_ID;
  if (!tripId) throwBusinessError("BAD_REQUEST", "Trip_ID مطلوب.");
  
  let sheet = getCachedSheet("Trips_Log");
  let data = getCachedData("Trips_Log");
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === tripId) {
      let row = i + 1;
      sheet.getRange(row, 14).setValue(true);
      sheet.getRange(row, 15).setValue(new Date().toISOString());
      
      logApiAudit(userId, "User", "softDeleteTrip", 0, "N/A", 200);
      return { "success": true, "message": "تم أرشفة الرحلة بنجاح." };
    }
  }
  
  throwBusinessError("NOT_FOUND", "الرحلة غير موجودة.");
}
    }
    
    let remainingAdvance = advanceCash - totalExpenses;
    let settlementType = e.parameter.Settlement_Type || "CARRIED_OVER"; // CARRIED_OVER أو RETURNED
    
    if (settlementType === "RETURNED" && remainingAdvance > 0) {
      // السائق رجع المتبقي للمحاسب
      // خصم من عهدة السائق
      driverService_updateDriverAdvance(driverId, -remainingAdvance, userId, `تصفية عهدة الرحلة ${tripId} - رجع للمحاسب`);
      
      // إضافة لعهدة المحاسب (المنفذ)
      balanceService_updateBalance(userId, remainingAdvance, 'ADD', '', tripId, `استلام عهدة من السائق للرحلة ${tripId}`, userId);
      
    } else {
      // ترحيل العهدة مع السائق
      // العهدة تفضل مع السائق كما هي
      // تسجيل ملاحظة في شيت الرحلة
      sheet.getRange(foundRowIndex, 23).setValue(remainingAdvance); // Carried_Over_Advance
    }
    
    // تحديث Settlement_Status
    sheet.getRange(foundRowIndex, 22).setValue(settlementType === "RETURNED" ? "FULLY_SETTLED" : "CARRIED_OVER");
  }
  
  // تحديث الحالة والنسخة
  sheet.getRange(foundRowIndex, 8).setValue(newStatus);
  sheet.getRange(foundRowIndex, 12).setValue(nowStr);
  sheet.getRange(foundRowIndex, 13).setValue(nextVersion);
  
  // إنشاء تنبيه عند الإغلاق
  if (newStatus === "CLOSED") {
    createNotification(
      'ALL',
      'TRIP_CLOSED',
      `✅ الرحلة ${tripId} أغلقت`,
      `تم إغلاق الرحلة ${tripId} بواسطة ${userId}`,
      tripId
    );
  }
  
  endTimer("tripService_updateTripStatus");
  
  return {
    "success": true,
    "trip_id": tripId,
    "message": `تم تحويل الحالة إلى [${newStatus}]`,
    "next_version": nextVersion
  };
}

/**
 * 3. دالة تحديث بيانات الرحلة (updateTrip)
 */
function tripService_updateTrip(e, userId) {
  startTimer("tripService_updateTrip");
  
  let ss = getCachedSS();
  let sheet = getCachedSheet("Trips_Log");
  if (!sheet) throwBusinessError("SYSTEM_ERROR", "شيت Trips_Log غير موجود.");
  
  let tripId = e.parameter.Trip_ID;
  let newRoute = e.parameter.Route;
  let newAdvance = parseFloat(e.parameter.Advance_Cash) || 0;
  let newFuelLiters = parseFloat(e.parameter.Fuel_Liters) || 0;
  let newFuelPrice = parseFloat(e.parameter.Fuel_Price) || 0;
  let clientVersion = parseInt(e.parameter.Version_Number) || 0;
  
  if (!tripId) {
    throwBusinessError("BAD_REQUEST", "معامل Trip_ID مطلوب.");
  }
  
  let data = getCachedData("Trips_Log");
  let foundRowIndex = -1;
  let dbVersion = -1;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == tripId && data[i][13] === false) {
      foundRowIndex = i + 1;
      dbVersion = parseInt(data[i][12]);
      break;
    }
  }
  
  if (foundRowIndex === -1) {
    throwBusinessError("TRIP_NOT_FOUND", `الرحلة (${tripId}) غير موجودة.`);
  }
  
  if (clientVersion !== dbVersion) {
    throwBusinessError("VERSION_MISMATCH", `النسخة الحالية [${dbVersion}]، نسختك [${clientVersion}].`);
  }
  
  let nextVersion = dbVersion + 1;
  let nowStr = new Date().toISOString();
  
  // تحديث الحقول
  if (newRoute) sheet.getRange(foundRowIndex, 6).setValue(newRoute);
  sheet.getRange(foundRowIndex, 7).setValue(newAdvance);
  sheet.getRange(foundRowIndex, 15).setValue(newFuelLiters);
  sheet.getRange(foundRowIndex, 16).setValue(newFuelLiters * newFuelPrice);
  sheet.getRange(foundRowIndex, 21).setValue(newFuelPrice);
  sheet.getRange(foundRowIndex, 12).setValue(nowStr);
  sheet.getRange(foundRowIndex, 13).setValue(nextVersion);
  
  endTimer("tripService_updateTrip");
  
  return {
    "success": true,
    "trip_id": tripId,
    "message": "تم تحديث بيانات الرحلة بنجاح.",
    "next_version": nextVersion
  };
}

/**
 * 4. دالة مساعدة لتوليد معرف فريد للرحلة
 */
function generateTripId() {
  let datePart = Utilities.formatDate(new Date(), "GMT+3", "yyyyMMdd");
  let randomPart = Math.floor(1000 + Math.random() * 9000);
  return `TRP-${datePart}-${randomPart}`;
}

/**
 * 5. دالة تسجيل العهدة في Trip_Advances
 */
function logTripAdvance(tripId, driverId, amount, userId) {
  let ss = getCachedSS();
  let sheet = getCachedSheet("Trip_Advances");
  if (!sheet) return;
  
  let advanceId = `ADV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  let now = new Date().toISOString();
  
  sheet.appendRow([
    advanceId,
    tripId,
    driverId,
    amount,
    0,
    amount,
    "",
    "",
    "",
    now
  ]);
  
}

/**
 * 6. دالة إضافة جاز الطريق (تُستخدم من expenseService)
 */
function tripService_addRoadFuel(tripId, liters, amount, userId) {
  let ss = getCachedSS();
  let sheet = getCachedSheet("Trips_Log");
  if (!sheet) return;
  
  let data = getCachedData("Trips_Log");
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == tripId && data[i][13] === false) {
      let currentRoadLiters = parseFloat(data[i][16]) || 0;
      let currentRoadEGP = parseFloat(data[i][17]) || 0;
      let currentTotalLiters = parseFloat(data[i][18]) || 0;
      let currentTotalEGP = parseFloat(data[i][19]) || 0;
      
      let newRoadLiters = currentRoadLiters + liters;
      let newRoadEGP = currentRoadEGP + amount;
      let newTotalLiters = currentTotalLiters + liters;
      let newTotalEGP = currentTotalEGP + amount;
      
      sheet.getRange(i + 1, 17).setValue(newRoadLiters);
      sheet.getRange(i + 1, 18).setValue(newRoadEGP);
      sheet.getRange(i + 1, 19).setValue(newTotalLiters);
      sheet.getRange(i + 1, 20).setValue(newTotalEGP);
      
      break;
    }
  }
}

/**
 * 7. دالة تحديث مصروفات العهدة (تُستخدم من expenseService)
 */
function tripService_updateAdvanceSpent(tripId, amount, userId) {
  let ss = getCachedSS();
  let sheet = getCachedSheet("Trip_Advances");
  if (!sheet) return;
  
  let data = getCachedData("Trip_Advances");
  
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] === tripId && data[i][6] === "") {
      let currentSpent = parseFloat(data[i][4]) || 0;
      let currentRemaining = parseFloat(data[i][5]) || 0;
      
      let newSpent = currentSpent + amount;
      let newRemaining = currentRemaining - amount;
      
      sheet.getRange(i + 1, 5).setValue(newSpent);
      sheet.getRange(i + 1, 6).setValue(newRemaining);
      
      break;
    }
  }
}

/**
 * 9. دالة جلب السائقين والعربيات المتاحين (غير مرتبطين برحلة مفتوحة)
 */
function tripService_getAvailableResources(e) {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. جلب كل الرحلات المفتوحة
  let tripsData = getCachedData("Trips_Log");
  let busyDriverIds = {};
  let busyVehicleIds = {};
  
  if (tripsData) {
    for (let i = 1; i < tripsData.length; i++) {
      if (tripsData[i][7] === "OPEN" && tripsData[i][13] !== true) {
        let driverId = tripsData[i][3];
        let vehicleId = tripsData[i][4];
        if (driverId) busyDriverIds[driverId] = true;
        if (vehicleId) busyVehicleIds[vehicleId] = true;
      }
    }
  }
  
  // 2. جلب كل السائقين وفلترة المتاحين
  let drivers = _extractData(driverService_getDrivers(ss)) || [];
  let availableDrivers = drivers.filter(d => !busyDriverIds[d.driver_id] && d.status === "ACTIVE");
  
  // 3. جلب كل العربيات وفلترة المتاحة
  let vehicles = _extractData(vehicleService_getVehicles(ss)) || [];
  let availableVehicles = vehicles.filter(v => !busyVehicleIds[v.vehicle_id] && v.status === "ACTIVE");
  
  // 4. جلب العملاء (كلهم)
  let clients = _extractData(clientService_getClients(ss)) || [];
  
  return {
    "success": true,
    "data": {
      "drivers": availableDrivers,
      "vehicles": availableVehicles,
      "clients": clients
    }
  };
}