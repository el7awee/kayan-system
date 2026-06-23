/**
 * منظومة الكيان v6.0 - طبقة إدارة البنزينة
 * ملف: fuelService.gs (إدارة رصيد البنزينة وحركة الجاز)
 */

/**
 * ─── جلب رصيد البنزينة الحالي ───
 */
function fuelService_getBalance(ss) {
  let sheet = ss.getSheetByName("Fuel_Balance");
  if (!sheet) {
    return { "success": false, "message": "شيت Fuel_Balance غير موجود." };
  }
  
  let data = sheet.getDataRange().getValues();
  let balance = 0;
  let lastUpdated = "";
  let updatedBy = "";
  
  // جلب الرصيد من آخر سطر
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] !== undefined && data[i][1] !== "") {
      balance = parseFloat(data[i][1]) || 0;
      lastUpdated = data[i][2] || "";
      updatedBy = data[i][3] || "";
      break;
    }
  }
  
  // 🆕 جلب سعر اللتر من System_Settings
  let fuelPrice = getFuelPrice();
  
  return {
    "success": true,
    "data": {
      "current_balance": balance,
      "fuel_price_per_liter": fuelPrice,
      "last_updated": lastUpdated,
      "updated_by": updatedBy
    }
  };
}

/**
 * ─── إضافة رصيد للبنزينة ───
 */
function fuelService_addBalance(ss, params, userId) {
  let sheet = ss.getSheetByName("Fuel_Balance");
  if (!sheet) {
    return { "success": false, "message": "شيت Fuel_Balance غير موجود." };
  }
  
  let amount = parseFloat(params.Amount) || 0;
  let notes = params.Notes || "";
  
  if (amount <= 0) {
    return { "success": false, "message": "المبلغ يجب أن يكون أكبر من صفر." };
  }
  
  // جلب الرصيد الحالي
  let currentBalance = 0;
  let data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] !== undefined && data[i][1] !== "") {
      currentBalance = parseFloat(data[i][1]) || 0;
      break;
    }
  }
  
  let newBalance = currentBalance + amount;
  let now = new Date().toISOString();
  
  // إضافة سطر جديد في Fuel_Balance
  let balanceId = generateBalanceId(sheet);
  sheet.appendRow([
    balanceId,
    newBalance,
    now,
    userId
  ]);
  
  // تسجيل حركة الجاز
  let fuelPrice = getFuelPrice();
  logFuelTransaction({
    vehicleId: "",
    tripId: "",
    amountLiters: 0,
    amountEGP: amount,
    fuelPrice: fuelPrice,
    transactionType: 'ADD',
    source: 'FUEL_STATION',
    createdBy: userId,
    notes: notes || `إضافة رصيد بقيمة ${amount}`
  });
  
  logApiAudit(userId, "Accountant", "addFuelBalance", 0, "N/A", 200);
  
  // 🆕 إنشاء تنبيه لو الرصيد أصبح أعلى من الصفر
  if (currentBalance < 0 && newBalance >= 0) {
    createNotification(
      'SYSTEM',
      'FUEL_BALANCE_POSITIVE',
      'رصيد البنزينة أصبح موجباً',
      `تم تحويل الرصيد من سالب (${currentBalance}) إلى موجب (${newBalance})`,
      ''
    );
  }
  
  return {
    "success": true,
    "data": {
      "previous_balance": currentBalance,
      "added_amount": amount,
      "new_balance": newBalance
    },
    "message": `تم إضافة ${amount} ج.م للبنزينة بنجاح. الرصيد الحالي: ${newBalance} ج.م`
  };
}

/**
 * ─── جلب حركة الجاز ───
 */
function fuelService_getTransactions(ss, params) {
  let sheet = ss.getSheetByName("Fuel_Transactions");
  if (!sheet) {
    return { "success": false, "message": "شيت Fuel_Transactions غير موجود." };
  }
  
  let limit = parseInt(params.Limit) || 50;
  let vehicleId = params.Vehicle_ID || "";
  let transactionType = params.Transaction_Type || "";
  
  let data = sheet.getDataRange().getValues();
  let transactions = [];
  
  for (let i = data.length - 1; i >= 1; i--) {
    let row = data[i];
    
    // فلتر حسب العربية
    if (vehicleId && row[1] !== vehicleId) continue;
    
    // فلتر حسب النوع
    if (transactionType && row[3] !== transactionType) continue;
    
    transactions.push({
      transaction_id: row[0],
      vehicle_id: row[1],
      trip_id: row[2],
      transaction_type: row[3],
      amount_liters: row[4],
      amount_egp: row[5],
      fuel_price: row[6],
      source: row[7],
      created_by: row[8],
      created_at: row[9],
      notes: row[10]
    });
    
    if (transactions.length >= limit) break;
  }
  
  return { "success": true, "data": transactions };
}

/**
 * ─── تحديث سعر اللتر ───
 */
function fuelService_updatePrice(ss, params, userId) {
  let sheet = ss.getSheetByName("System_Settings");
  if (!sheet) {
    return { "success": false, "message": "شيت System_Settings غير موجود." };
  }
  
  let newPrice = parseFloat(params.Fuel_Price);
  if (!newPrice || newPrice <= 0) {
    return { "success": false, "message": "سعر اللتر غير صالح." };
  }
  
  let data = sheet.getDataRange().getValues();
  let found = false;
  let now = new Date().toISOString();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === "FUEL_PRICE_PER_LITER") {
      sheet.getRange(i + 1, 2).setValue(newPrice);
      found = true;
      break;
    }
  }
  
  if (!found) {
    sheet.appendRow(["FUEL_PRICE_PER_LITER", newPrice]);
  }
  
  logApiAudit(userId, "Manager", "updateFuelPrice", 0, "N/A", 200);
  
  // 🆕 إنشاء تنبيه بتغيير السعر
  createNotification(
    'SYSTEM',
    'FUEL_PRICE_CHANGED',
    'تم تغيير سعر اللتر',
    `تم تغيير سعر اللتر إلى ${newPrice} ج.م`,
    ''
  );
  
  return {
    "success": true,
    "message": `تم تحديث سعر اللتر إلى ${newPrice} ج.م`,
    "data": { "new_price": newPrice }
  };
}

// ==========================================
// دوال مساعدة (تُستخدم من ملفات أخرى)
// ==========================================

/**
 * ─── جلب سعر اللتر الحالي ───
 */
function getFuelPrice() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("System_Settings");
  if (!sheet) return 20.50;
  
  let data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === "FUEL_PRICE_PER_LITER") {
      return parseFloat(data[i][1]) || 20.50;
    }
  }
  
  return 20.50;
}

/**
 * ─── جلب رصيد البنزينة (تُستخدم في tripService) ───
 */
function getFuelBalance() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Fuel_Balance");
  if (!sheet) return 0;
  
  let data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] !== undefined && data[i][1] !== "") {
      return parseFloat(data[i][1]) || 0;
    }
  }
  
  return 0;
}

/**
 * ─── تحديث رصيد البنزينة (تُستخدم في tripService) ───
 */
function updateFuelBalance(newBalance, userId, note) {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Fuel_Balance");
  if (!sheet) return;
  
  let balanceId = generateBalanceId(sheet);
  let now = new Date().toISOString();
  
  sheet.appendRow([
    balanceId,
    newBalance,
    now,
    userId || "SYSTEM"
  ]);
  
  // 🆕 التحقق من الرصيد المنخفض
  let threshold = getLowFuelThreshold();
  if (newBalance < threshold) {
    createNotification(
      'SYSTEM',
      'LOW_FUEL_BALANCE',
      '⚠️ تنبيه: رصيد البنزينة منخفض',
      `الرصيد الحالي (${newBalance}) أقل من الحد الأدنى (${threshold})`,
      ''
    );
  }
}

/**
 * ─── جلب حد التنبيه للرصيد المنخفض ───
 */
function getLowFuelThreshold() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("System_Settings");
  if (!sheet) return 10000;
  
  let data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === "LOW_FUEL_THRESHOLD") {
      return parseFloat(data[i][1]) || 10000;
    }
  }
  
  return 10000;
}

/**
 * ─── توليد معرف فريد للرصيد (BAL-XXX) ───
 */
function generateBalanceId(sheet) {
  let data = sheet.getDataRange().getValues();
  let maxNum = 0;
  
  for (let i = 1; i < data.length; i++) {
    let id = data[i][0] || "";
    if (id.startsWith("BAL-")) {
      let num = parseInt(id.replace("BAL-", ""));
      if (num > maxNum) maxNum = num;
    }
  }
  
  let nextNum = maxNum + 1;
  return "BAL-" + String(nextNum).padStart(3, '0');
}
/**
 * ─── تسجيل حركة الجاز في Fuel_Transactions ───
 */
function logFuelTransaction(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Fuel_Transactions");
  if (!sheet) {
    // لو مش موجود، ننشئه
    sheet = ss.insertSheet("Fuel_Transactions");
    sheet.getRange(1, 1, 1, 11).setValues([[
      "Transaction_ID", "Vehicle_ID", "Trip_ID", "Transaction_Type", 
      "Amount_Liters", "Amount_EGP", "Fuel_Price", "Source", 
      "Created_By", "Created_At", "Notes"
    ]]);
  }
  
  var transactionId = "FUEL-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
  var now = new Date().toISOString();
  
  sheet.appendRow([
    transactionId,
    data.vehicleId || "",
    data.tripId || "",
    data.transactionType || "UNKNOWN",
    data.amountLiters || 0,
    data.amountEGP || 0,
    data.fuelPrice || 0,
    data.source || "FUEL_STATION",
    data.createdBy || "SYSTEM",
    now,
    data.notes || ""
  ]);
  
  return transactionId;
}