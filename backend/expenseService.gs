/**
 * منظومة الكيان v6.0 - طبقة الخدمات المالية
 * ملف: expenseService.gs (إدارة المصروفات والرفع السحابي الثنائي)
 * [تحديث: دعم جاز الطريق والعهدة]
 */

// معرف المجلد الرئيسي لحفظ إيصالات المصروفات على Google Drive
const EXPENSES_DRIVE_FOLDER_ID = "1NiRSLKcUnL2eFb0huo414h_BmZSnluXsq_GszYIxMMc";

/**
 * 1. دالة إضافة مصروف مع إيصال (addExpense) - معدلة
 */
function expenseService_addExpense(e, userId) {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Expenses_Log");
  if (!sheet) throwBusinessError("SYSTEM_ERROR", "شيت Expenses_Log غير موجود.");
  
  let tripId = e.parameter.Trip_ID;
  let amount = parseFloat(e.parameter.Amount || "0");
  let category = e.parameter.Expense_Category || "General";
  
  // دعم الـ IDs
  let driverId = e.parameter.Driver_ID || "";
  let vehicleId = e.parameter.Vehicle_ID || "";
  
  if (!tripId || amount <= 0) {
    throwBusinessError("BAD_REQUEST", "بيانات المصروف غير صالحة، يجب تحديد رقم الرحلة والمبلغ بشكل صحيح.");
  }
  
  // ==========================================
  // 🆕 إذا كان المصروف من نوع "بنزين / سولار" (جاز طريق)
  // ==========================================
  let isRoadFuel = (category === "بنزين / سولار" || category === "بنزين طريق" || category === "Road Fuel");
  
  if (isRoadFuel && tripId) {
    let fuelLiters = parseFloat(e.parameter.Fuel_Liters || "0");
    let fuelPrice = parseFloat(e.parameter.Fuel_Price || "0");
    let fuelAmount = fuelLiters * fuelPrice;
    
    if (fuelLiters > 0) {
      // تسجيل في Fuel_Transactions
      logFuelTransaction({
        vehicleId: vehicleId,
        tripId: tripId,
        amountLiters: fuelLiters,
        amountEGP: fuelAmount,
        fuelPrice: fuelPrice,
        transactionType: 'ROAD',
        source: 'DRIVER_ADVANCE',
        createdBy: userId,
        notes: `جاز طريق - ${category}`
      });
      
      // تحديث إجمالي جاز الطريق في الرحلة
      tripService_addRoadFuel(tripId, fuelLiters, fuelAmount, userId);
    }
  }
  
  // ==========================================
  // 🆕 خصم المصروف من عهدة السائق
  // ==========================================
  if (driverId) {
    // تحديث عهدة السائق (خصم)
    driverService_updateDriverAdvance(driverId, -amount, userId, `مصروف: ${category} للرحلة ${tripId}`);
    
    // تحديث مصروفات العهدة في Trip_Advances
    tripService_updateAdvanceSpent(tripId, amount, userId);
  }
  
  // ملاحظة: جاز الطريق بيتدفع من عهدة السائق ومبيتخصمش من رصيد بنزينة الشركة.
  // اللي بيتخصم من بنزينة الشركة هو بس لترات بداية الرحلة (في tripService_createTrip).
  // هنا بنضيف لترات جاز الطريق على إجمالي لترات الرحلة (فوق) ونخصم قيمته من عهدة السائق (تحت).
  
  // معالجة المرفق
  let receiptFileId = "";
  let base64Str = e.parameter.Receipt_File_Base64;
  let fileName = e.parameter.File_Name || `Receipt_${tripId}_${Date.now()}`;
  
  if (base64Str && base64Str.trim() !== "") {
    receiptFileId = uploadBase64FileToDrive(base64Str, fileName);
  }
  
  // توليد معرف فريد للمصروف
  let expenseId = `EXP-${Date.now()}-${Math.floor(Math.random() * 100)}`;
  let nowStr = new Date().toISOString();
  
  // الهيكل المعدل: استخدام IDs بدلاً من النصوص
  let newExpenseRow = [
    expenseId,                                    // A: Expense_ID
    tripId,                                       // B: Trip_ID
    driverId,                                     // C: Driver_ID
    vehicleId,                                    // D: Vehicle_ID
    category,                                     // E: Expense_Category
    amount,                                       // F: Amount
    receiptFileId,                                // G: Receipt_File_ID
    userId,                                       // H: Created_By
    nowStr,                                       // I: Created_At
    1,                                            // J: Version_Number
    false,                                        // K: IsDeleted
    isRoadFuel ? "ROAD_FUEL" : "REGULAR"          // L: Expense_Type
  ];
  
  sheet.appendRow(newExpenseRow);
  
  // تسجيل في Audit Log
  logApiAudit(userId, "User", "addExpense", 0, "N/A", 200);
  
  return {
    "success": true,
    "expense_id": expenseId,
    "trip_id": tripId,
    "receipt_drive_id": receiptFileId,
    "is_road_fuel": isRoadFuel,
    "message": `تم تسجيل المصروف بقيمة (${amount} ج.م) بنجاح.`
  };
}

/**
 * 2. دالة معالجة وتحويل الـ Base64 String إلى ملف ورفعه على Google Drive
 */
function uploadBase64FileToDrive(base64Data, fileName) {
  try {
    let cleanBase64 = base64Data;
    let contentType = "application/octet-stream";
    
    if (base64Data.indexOf(",") !== -1) {
      let parts = base64Data.split(",");
      cleanBase64 = parts[1];
      contentType = parts[0].split(":")[1].split(";")[0];
    }
    
    let decodedBytes = Utilities.base64Decode(cleanBase64);
    let blob = Utilities.newBlob(decodedBytes, contentType, fileName);
    
    let folder;
    if (EXPENSES_DRIVE_FOLDER_ID === "YOUR_GOOGLE_DRIVE_FOLDER_ID_HERE") {
      folder = DriveApp.getRootFolder();
    } else {
      folder = DriveApp.getFolderById(EXPENSES_DRIVE_FOLDER_ID);
    }
    
    let file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return file.getId();
    
  } catch (driveError) {
    throwBusinessError("CLOUD_STORAGE_ERROR", "فشل النظام في معالجة ورفع الملف: " + driveError.message);
  }
}

/**
 * 3. دالة جلب مصروفات رحلة محددة
 */
function expenseService_getTripExpenses(ss, params) {
  let tripId = params.Trip_ID;
  if (!tripId) {
    return { "success": false, "message": "Trip_ID مطلوب." };
  }
  
  let sheet = ss.getSheetByName("Expenses_Log");
  if (!sheet) {
    return { "success": false, "message": "شيت Expenses_Log غير موجود." };
  }
  
  let data = sheet.getDataRange().getValues();
  let expenses = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === tripId && data[i][10] !== true) {
      expenses.push({
        expense_id: data[i][0],
        trip_id: data[i][1],
        driver_id: data[i][2],
        vehicle_id: data[i][3],
        category: data[i][4],
        amount: data[i][5],
        receipt_file_id: data[i][6],
        created_by: data[i][7],
        created_at: data[i][8],
        expense_type: data[i][11] || "REGULAR"
      });
    }
  }
  
  return { "success": true, "data": expenses };
}

/**
 * 4. دالة جلب مصروفات الشهر الحالي
 */
function expenseService_getMonthlyExpenses(ss) {
  let sheet = ss.getSheetByName("Expenses_Log");
  if (!sheet) {
    return { "success": false, "message": "شيت Expenses_Log غير موجود." };
  }
  
  let data = sheet.getDataRange().getValues();
  let now = new Date();
  let currentMonth = now.getMonth();
  let currentYear = now.getFullYear();
  let total = 0;
  let expenses = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][10] === true || data[i][10] === "TRUE") continue;
    
    let createdAt = new Date(data[i][8]);
    if (createdAt.getMonth() === currentMonth && createdAt.getFullYear() === currentYear) {
      let amount = parseFloat(data[i][5]) || 0;
      total += amount;
      expenses.push({
        expense_id: data[i][0],
        trip_id: data[i][1],
        category: data[i][4],
        amount: amount,
        created_at: data[i][8]
      });
    }
  }
  
  return { 
    "success": true, 
    "data": {
      "total": total,
      "expenses": expenses
    }
  };
}