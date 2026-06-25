/**
 * منظومة الكيان v6.0 - طبقة الخدمات المالية
 * ملف: expenseService.gs (إدارة مصاريف الشركة)
 * [تحديث: مصاريف شركة عامة - كهرباء، مياه، غاز، إيجار، الخ]
 */

// معرف المجلد الرئيسي لحفظ إيصالات المصروفات على Google Drive
const EXPENSES_DRIVE_FOLDER_ID = "1NiRSLKcUnL2eFb0huo414h_BmZSnluXsq_GszYIxMMc";

/**
 * 1. دالة إضافة مصروف شركة (addExpense)
 */
function expenseService_addExpense(e, userId) {
  let ss = getCachedSS();
  let sheet = getCachedSheet("Expenses_Log");
  if (!sheet) throwBusinessError("SYSTEM_ERROR", "شيت Expenses_Log غير موجود.");
  
  let amount = parseFloat(e.parameter.Amount || "0");
  if (amount <= 0) {
    throwBusinessError("BAD_REQUEST", "المبلغ غير صالح.");
  }
  
  let category = e.parameter.Expense_Category || "أخرى";
  let description = e.parameter.Description || "";
  let vendor = e.parameter.Vendor || "";
  let expenseDate = e.parameter.Expense_Date || new Date().toISOString();
  
  // معالجة المرفق
  let receiptFileId = "";
  let base64Str = e.parameter.Receipt_File_Base64;
  let fileName = e.parameter.File_Name || `Receipt_${Date.now()}`;
  
  if (base64Str && base64Str.trim() !== "") {
    receiptFileId = uploadBase64FileToDrive(base64Str, fileName);
  }
  
  // توليد معرف فريد للمصروف
  let expenseId = `EXP-${Date.now()}-${Math.floor(Math.random() * 100)}`;
  
  let newExpenseRow = [
    expenseId,                                    // A: Expense_ID
    "",                                           // B: Trip_ID (غير مستخدم لمصاريف الشركة)
    "",                                           // C: Driver_ID
    "",                                           // D: Vehicle_ID
    category,                                     // E: Expense_Category
    amount,                                       // F: Amount
    receiptFileId,                                // G: Receipt_File_ID
    userId,                                       // H: Created_By
    expenseDate,                                  // I: Expense_Date
    1,                                            // J: Version_Number
    false,                                        // K: IsDeleted
    "COMPANY",                                    // L: Expense_Type
    description,                                  // M: Description
    vendor                                        // N: Vendor
  ];
  
  sheet.appendRow(newExpenseRow);
  
  logApiAudit(userId, "User", "addExpense", 0, "N/A", 200);
  
  return {
    "success": true,
    "expense_id": expenseId,
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
 * 3. دالة جلب مصروفات رحلة محددة (للمحاسبة)
 */
function expenseService_getTripExpenses(ss, params) {
  let tripId = params.Trip_ID;
  if (!tripId) {
    return { "success": false, "message": "Trip_ID مطلوب." };
  }
  
  let data = getCachedData("Expenses_Log");
  if (!data) {
    return { "success": false, "message": "شيت Expenses_Log غير موجود." };
  }
  let expenses = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === tripId && data[i][10] !== true) {
      expenses.push({
        expense_id: data[i][0],
        trip_id: data[i][1],
        category: data[i][4],
        amount: parseFloat(data[i][5]) || 0,
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
  let data = getCachedData("Expenses_Log");
  if (!data) {
    return { "success": false, "message": "شيت Expenses_Log غير موجود." };
  }
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

/**
 * 5. دالة جلب كل مصاريف الشركة مع فلترة
 */
function expenseService_getExpenses(ss, params) {
  let data = getCachedData("Expenses_Log");
  if (!data) return { "success": false, "message": "شيت Expenses_Log غير موجود." };
  
  let categoryFilter = params.Category || "";
  let typeFilter = params.Type || ""; // COMPANY, REGULAR, etc.
  let limit = parseInt(params.Limit) || 200;
  let offset = parseInt(params.Offset) || 0;
  
  let results = [];
  for (let i = data.length - 1; i >= 1; i--) {
    let row = data[i];
    if (row[10] === true || row[10] === "TRUE") continue;
    if (categoryFilter && row[4] !== categoryFilter) continue;
    if (typeFilter && (row[11] || "REGULAR") !== typeFilter) continue;
    
    results.push({
      expense_id: row[0],
      category: row[4],
      amount: parseFloat(row[5]) || 0,
      receipt_file_id: row[6],
      created_by: row[7],
      expense_date: row[8],
      expense_type: row[11] || "REGULAR",
      description: row[12] || "",
      vendor: row[13] || ""
    });
  }
  
  let total = results.length;
  let page = results.slice(offset, offset + limit);
  
  return { "success": true, "data": page, "total": total };
}

/**
 * 6. دالة تعديل مصروف
 */
function expenseService_updateExpense(ss, e, userId) {
  let expenseId = e.parameter.Expense_ID;
  if (!expenseId) throwBusinessError("BAD_REQUEST", "Expense_ID مطلوب.");
  
  let sheet = getCachedSheet("Expenses_Log");
  let data = getCachedData("Expenses_Log");
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === expenseId && data[i][10] !== true) {
      let row = i + 1;
      
      if (e.parameter.Amount) sheet.getRange(row, 6).setValue(parseFloat(e.parameter.Amount));
      if (e.parameter.Expense_Category) sheet.getRange(row, 5).setValue(e.parameter.Expense_Category);
      if (e.parameter.Description !== undefined) sheet.getRange(row, 13).setValue(e.parameter.Description);
      if (e.parameter.Vendor !== undefined) sheet.getRange(row, 14).setValue(e.parameter.Vendor);
      
      let ver = (parseInt(data[i][9]) || 0) + 1;
      sheet.getRange(row, 10).setValue(ver);
      
      logApiAudit(userId, "User", "updateExpense", 0, "N/A", 200);
      return { "success": true, "message": "تم تحديث المصروف بنجاح." };
    }
  }
  
  throwBusinessError("NOT_FOUND", "المصروف غير موجود.");
}

/**
 * 7. دالة حذف مصروف (soft delete)
 */
function expenseService_deleteExpense(ss, e, userId) {
  let expenseId = e.parameter.Expense_ID;
  if (!expenseId) throwBusinessError("BAD_REQUEST", "Expense_ID مطلوب.");
  
  let sheet = getCachedSheet("Expenses_Log");
  let data = getCachedData("Expenses_Log");
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === expenseId && data[i][10] !== true) {
      let row = i + 1;
      sheet.getRange(row, 11).setValue(true);
      
      logApiAudit(userId, "User", "deleteExpense", 0, "N/A", 200);
      return { "success": true, "message": "تم حذف المصروف بنجاح." };
    }
  }
  
  throwBusinessError("NOT_FOUND", "المصروف غير موجود.");
}