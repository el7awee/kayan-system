/**
 * منظومة الكيان v6.0 - طبقة إدارة العربيات
 * ملف: vehicleService.gs (إدارة المركبات)
 */

/**
 * ─── إنشاء عربية جديدة ───
 */
function vehicleService_createVehicle(ss, params, userId) {
  let sheet = ss.getSheetByName("Vehicles");
  if (!sheet) {
    return { "success": false, "message": "شيت Vehicles غير موجود." };
  }
  
  // استخراج البيانات
  let plateNumber = params.Plate_Number?.trim() || "";
  let model = params.Model?.trim() || "";
  let type = params.Type?.trim() || "";
  let loadCapacity = params.Load_Capacity?.trim() || "";
  let licenseExpiry = params.License_Expiry?.trim() || "";
  let status = params.Status || "ACTIVE";
  
  // التحقق من المدخلات
  if (!plateNumber || !model) {
    return { "success": false, "message": "رقم اللوحة والموديل مطلوبين." };
  }
  
  // التحقق من عدم تكرار رقم اللوحة
  let data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === plateNumber && data[i][10] !== true) {
      return { "success": false, "message": "رقم اللوحة هذا مسجل مسبقاً." };
    }
  }
  
  // توليد معرف فريد
  let vehicleId = generateVehicleId(sheet);
  let now = new Date().toISOString();
  
  // إضافة العربية
  sheet.appendRow([
    vehicleId,          // A: Vehicle_ID
    plateNumber,        // B: Plate_Number
    model,              // C: Model
    type,               // D: Type
    loadCapacity,       // E: Load_Capacity
    licenseExpiry,      // F: License_Expiry
    status,             // G: Status
    userId,             // H: Created_By
    now,                // I: Created_At
    now,                // J: Updated_At
    false               // K: IsDeleted
  ]);
  
  // تسجيل في Audit Log
  logApiAudit(userId, "Admin", "createVehicle", 0, "N/A", 200);
  
  return {
    "success": true,
    "data": {
      "vehicle_id": vehicleId,
      "plate_number": plateNumber,
      "model": model,
      "type": type,
      "status": status
    },
    "message": `تم إضافة العربية ${plateNumber} بنجاح.`
  };
}

/**
 * ─── جلب جميع العربيات ───
 */
function vehicleService_getVehicles(ss) {
  let data = getCachedData("Vehicles");
  if (!data) {
    return { "success": false, "message": "شيت Vehicles غير موجود." };
  }
  let vehicles = [];
  
  for (let i = 1; i < data.length; i++) {
    // تخطي المحذوف
    if (data[i][10] === true || data[i][10] === "TRUE") continue;
    
    vehicles.push({
      vehicle_id: data[i][0],
      plate_number: data[i][1],
      model: data[i][2],
      type: data[i][3],
      load_capacity: data[i][4],
      license_expiry: data[i][5],
      status: data[i][6],
      created_by: data[i][7],
      created_at: data[i][8],
      updated_at: data[i][9]
    });
  }
  
  return { "success": true, "data": vehicles };
}

/**
 * ─── تحديث بيانات عربية ───
 */
function vehicleService_updateVehicle(ss, params, userId) {
  let sheet = ss.getSheetByName("Vehicles");
  if (!sheet) {
    return { "success": false, "message": "شيت Vehicles غير موجود." };
  }
  
  let vehicleId = params.Vehicle_ID;
  if (!vehicleId) {
    return { "success": false, "message": "Vehicle_ID مطلوب." };
  }
  
  let data = sheet.getDataRange().getValues();
  let found = false;
  let now = new Date().toISOString();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === vehicleId && data[i][10] !== true) {
      // تحديث الحقول
      if (params.Plate_Number) sheet.getRange(i + 1, 2).setValue(params.Plate_Number.trim());
      if (params.Model) sheet.getRange(i + 1, 3).setValue(params.Model.trim());
      if (params.Type) sheet.getRange(i + 1, 4).setValue(params.Type.trim());
      if (params.Load_Capacity) sheet.getRange(i + 1, 5).setValue(params.Load_Capacity.trim());
      if (params.License_Expiry) sheet.getRange(i + 1, 6).setValue(params.License_Expiry.trim());
      if (params.Status) sheet.getRange(i + 1, 7).setValue(params.Status);
      
      // تحديث Updated_At
      sheet.getRange(i + 1, 10).setValue(now);
      
      found = true;
      break;
    }
  }
  
  if (!found) {
    return { "success": false, "message": "العربية غير موجودة." };
  }
  
  logApiAudit(userId, "Admin", "updateVehicle", 0, "N/A", 200);
  
  return { "success": true, "message": "تم تحديث بيانات العربية بنجاح." };
}

/**
 * ─── حذف عربية (حذف ناعم) ───
 */
function vehicleService_deleteVehicle(ss, params) {
  let sheet = ss.getSheetByName("Vehicles");
  if (!sheet) {
    return { "success": false, "message": "شيت Vehicles غير موجود." };
  }
  
  let vehicleId = params.Vehicle_ID;
  if (!vehicleId) {
    return { "success": false, "message": "Vehicle_ID مطلوب." };
  }
  
  let data = sheet.getDataRange().getValues();
  let found = false;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === vehicleId && data[i][10] !== true) {
      sheet.getRange(i + 1, 11).setValue(true); // IsDeleted
      found = true;
      break;
    }
  }
  
  if (!found) {
    return { "success": false, "message": "العربية غير موجودة." };
  }
  
  return { "success": true, "message": "تم حذف العربية بنجاح." };
}

/**
 * ─── توليد معرف فريد للعربية (VH-XXX) ───
 */
function generateVehicleId(sheet) {
  let data = sheet.getDataRange().getValues();
  let maxNum = 0;
  
  for (let i = 1; i < data.length; i++) {
    let id = data[i][0] || "";
    if (id.startsWith("VH-")) {
      let num = parseInt(id.replace("VH-", ""));
      if (num > maxNum) maxNum = num;
    }
  }
  
  let nextNum = maxNum + 1;
  return "VH-" + String(nextNum).padStart(3, '0');
}