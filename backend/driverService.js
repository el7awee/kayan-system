/**
 * منظومة الكيان v6.0 - طبقة إدارة السائقين
 * ملف: driverService.gs (إدارة السائقين والعهدات)
 */

/**
 * ─── إنشاء سائق جديد ───
 */
function driverService_createDriver(ss, params, userId) {
  let sheet = ss.getSheetByName("Drivers");
  if (!sheet) {
    return { "success": false, "message": "شيت Drivers غير موجود." };
  }
  
  // استخراج البيانات
  let fullName = params.Full_Name?.trim() || "";
  let phone = params.Phone?.trim() || "";
  let licenseNumber = params.License_Number?.trim() || "";
  let licenseExpiry = params.License_Expiry?.trim() || "";
  let nationalId = params.National_ID?.trim() || "";
  let status = params.Status || "ACTIVE";
  
  // التحقق من المدخلات
  if (!fullName || !phone) {
    return { "success": false, "message": "الاسم ورقم التليفون مطلوبين." };
  }
  
  // التحقق من عدم تكرار رقم التليفون
  let data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][2] === phone && data[i][10] !== true) {
      return { "success": false, "message": "رقم التليفون هذا مسجل مسبقاً." };
    }
  }
  
  // توليد معرف فريد
  let driverId = generateDriverId(sheet);
  let now = new Date().toISOString();
  
  // إضافة السائق
  sheet.appendRow([
    driverId,           // A: Driver_ID
    fullName,           // B: Full_Name
    phone,              // C: Phone
    licenseNumber,      // D: License_Number
    licenseExpiry,      // E: License_Expiry
    nationalId,         // F: National_ID
    0,                  // G: Current_Advance (يبدأ بصفر)
    status,             // H: Status
    userId,             // I: Created_By
    now,                // J: Created_At
    false               // K: IsDeleted
  ]);
  
  logApiAudit(userId, "Admin", "createDriver", 0, "N/A", 200);
  
  return {
    "success": true,
    "data": {
      "driver_id": driverId,
      "full_name": fullName,
      "phone": phone,
      "status": status
    },
    "message": `تم إضافة السائق ${fullName} بنجاح.`
  };
}

/**
 * ─── جلب جميع السائقين ───
 */
function driverService_getDrivers(ss) {
  let data = getCachedData("Drivers");
  if (!data) {
    return { "success": false, "message": "شيت Drivers غير موجود." };
  }
  let drivers = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][10] === true || data[i][10] === "TRUE") continue;
    
    drivers.push({
      driver_id: data[i][0],
      full_name: data[i][1],
      phone: data[i][2],
      license_number: data[i][3],
      license_expiry: data[i][4],
      national_id: data[i][5],
      current_advance: data[i][6] || 0,
      status: data[i][7],
      created_by: data[i][8],
      created_at: data[i][9]
    });
  }
  
  return { "success": true, "data": drivers };
}

/**
 * ─── تحديث بيانات سائق ───
 */
function driverService_updateDriver(ss, params, userId) {
  let sheet = ss.getSheetByName("Drivers");
  if (!sheet) {
    return { "success": false, "message": "شيت Drivers غير موجود." };
  }
  
  let driverId = params.Driver_ID;
  if (!driverId) {
    return { "success": false, "message": "Driver_ID مطلوب." };
  }
  
  let data = sheet.getDataRange().getValues();
  let found = false;
  let now = new Date().toISOString();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === driverId && data[i][10] !== true) {
      if (params.Full_Name) sheet.getRange(i + 1, 2).setValue(params.Full_Name.trim());
      if (params.Phone) sheet.getRange(i + 1, 3).setValue(params.Phone.trim());
      if (params.License_Number) sheet.getRange(i + 1, 4).setValue(params.License_Number.trim());
      if (params.License_Expiry) sheet.getRange(i + 1, 5).setValue(params.License_Expiry.trim());
      if (params.National_ID) sheet.getRange(i + 1, 6).setValue(params.National_ID.trim());
      if (params.Status) sheet.getRange(i + 1, 8).setValue(params.Status);
      
      found = true;
      break;
    }
  }
  
  if (!found) {
    return { "success": false, "message": "السائق غير موجود." };
  }
  
  logApiAudit(userId, "Admin", "updateDriverData", 0, "N/A", 200);
  
  return { "success": true, "message": "تم تحديث بيانات السائق بنجاح." };
}

/**
 * ─── حذف سائق (حذف ناعم) ───
 */
function driverService_deleteDriver(ss, params) {
  let sheet = ss.getSheetByName("Drivers");
  if (!sheet) {
    return { "success": false, "message": "شيت Drivers غير موجود." };
  }
  
  let driverId = params.Driver_ID;
  if (!driverId) {
    return { "success": false, "message": "Driver_ID مطلوب." };
  }
  
  let data = sheet.getDataRange().getValues();
  let found = false;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === driverId && data[i][10] !== true) {
      sheet.getRange(i + 1, 11).setValue(true); // IsDeleted
      found = true;
      break;
    }
  }
  
  if (!found) {
    return { "success": false, "message": "السائق غير موجود." };
  }
  
  return { "success": true, "message": "تم حذف السائق بنجاح." };
}

// ==========================================
// 💰 عمليات العهدات
// ==========================================

/**
 * ─── جلب عهدة سائق ───
 */
function driverService_getDriverAdvance(driverId) {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Drivers");
  if (!sheet) return 0;
  
  let data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === driverId && data[i][10] !== true) {
      return parseFloat(data[i][6]) || 0;
    }
  }
  
  return 0;
}

/**
 * ─── تحديث عهدة سائق ───
 */
function driverService_updateDriverAdvance(driverId, amount, userId, note) {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Drivers");
  if (!sheet) return;
  
  let data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === driverId && data[i][10] !== true) {
      let currentAdvance = parseFloat(data[i][6]) || 0;
      let newAdvance = currentAdvance + amount;
      sheet.getRange(i + 1, 7).setValue(newAdvance);
      
      // تسجيل في سجل العهدات
      logDriverAdvance(driverId, amount, 'UPDATE', userId, '', note || 'تحديث العهدة');
      break;
    }
  }
}

/**
 * ─── جلب عهدات السائقين ───
 */
function driverService_getAdvances(ss, params) {
  let sheet = ss.getSheetByName("Drivers");
  if (!sheet) {
    return { "success": false, "message": "شيت Drivers غير موجود." };
  }
  
  let data = sheet.getDataRange().getValues();
  let advances = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][10] === true || data[i][10] === "TRUE") continue;
    if (parseFloat(data[i][6]) > 0) {
      advances.push({
        driver_id: data[i][0],
        full_name: data[i][1],
        current_advance: data[i][6],
        phone: data[i][2]
      });
    }
  }
  
  return { "success": true, "data": advances };
}

/**
 * ─── تصفية عهدة سائق ───
 */
function driverService_settleAdvance(ss, params, userId) {
  let driverId = params.Driver_ID;
  let settlementType = params.Settlement_Type; // 'RETURNED' أو 'CARRIED_OVER'
  let amount = parseFloat(params.Amount) || 0;
  
  if (!driverId || !settlementType) {
    return { "success": false, "message": "Driver_ID و Settlement_Type مطلوبين." };
  }
  
  let sheet = ss.getSheetByName("Drivers");
  if (!sheet) {
    return { "success": false, "message": "شيت Drivers غير موجود." };
  }
  
  let data = sheet.getDataRange().getValues();
  let found = false;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === driverId && data[i][10] !== true) {
      let currentAdvance = parseFloat(data[i][6]) || 0;
      
      if (settlementType === 'RETURNED') {
        // السائق يرد الباقي للمحاسب
        sheet.getRange(i + 1, 7).setValue(0);
        logDriverAdvance(driverId, -currentAdvance, 'SETTLE', userId, '', `تصفية كاملة - رجع للمحاسب ${currentAdvance}`);
      } else if (settlementType === 'CARRIED_OVER') {
        // الباقي يفضل مع السائق
        let remaining = currentAdvance - amount;
        sheet.getRange(i + 1, 7).setValue(remaining > 0 ? remaining : 0);
        logDriverAdvance(driverId, -amount, 'SETTLE', userId, '', `تصفية - خصم ${amount}، المتبقي ${remaining}`);
      }
      
      found = true;
      break;
    }
  }
  
  if (!found) {
    return { "success": false, "message": "السائق غير موجود." };
  }
  
  return { 
    "success": true, 
    "message": `تمت تصفية العهدة بنجاح (${settlementType}).` 
  };
}

/**
 * ─── توليد معرف فريد للسائق (DR-XXX) ───
 */
function generateDriverId(sheet) {
  let data = sheet.getDataRange().getValues();
  let maxNum = 0;
  
  for (let i = 1; i < data.length; i++) {
    let id = data[i][0] || "";
    if (id.startsWith("DR-")) {
      let num = parseInt(id.replace("DR-", ""));
      if (num > maxNum) maxNum = num;
    }
  }
  
  let nextNum = maxNum + 1;
  return "DR-" + String(nextNum).padStart(3, '0');
}
/**
 * ─── تسجيل حركة عهدة السائق في سجل العهدات ───
 */
function logDriverAdvance(driverId, amount, transactionType, userId, tripId, notes) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Driver_Advances_Log");
  if (!sheet) {
    // لو مش موجود، ننشئه
    sheet = ss.insertSheet("Driver_Advances_Log");
    sheet.getRange(1, 1, 1, 8).setValues([[
      "Advance_ID", "Driver_ID", "Trip_ID", "Amount", 
      "Transaction_Type", "Created_By", "Created_At", "Notes"
    ]]);
  }
  
  var advanceId = "ADV-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
  var now = new Date().toISOString();
  
  sheet.appendRow([
    advanceId,
    driverId || "",
    tripId || "",
    amount || 0,
    transactionType || "UPDATE",
    userId || "SYSTEM",
    now,
    notes || ""
  ]);
}