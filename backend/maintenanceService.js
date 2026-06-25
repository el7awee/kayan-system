/**
 * منظومة الكيان v6.0 - طبقة إدارة الصيانة
 * ملف: maintenanceService.gs (تسجيل وتتبع صيانة العربيات)
 */

const MAINTENANCE_TYPES = [
  "زيت/فلتر", "إطارات", "فرامل", "فتيس/دبرياج",
  "موتور", "كهرباء", "تكييف", "سمكرة/دهان",
  "شاسيه", "دوري", "أخرى"
];

/**
 * ─── إضافة صيانة جديدة ───
 */
function maintenanceService_addMaintenance(params, userId) {
  let ss = getCachedSS();
  let sheet = getCachedSheet("Maintenance_Log");
  if (!sheet) {
    sheet = ss.insertSheet("Maintenance_Log");
    sheet.getRange(1, 1, 1, 13).setValues([[
      "Maintenance_ID", "Trip_ID", "Vehicle_ID", "Driver_ID",
      "Maintenance_Type", "Amount", "Workshop", "Odometer",
      "Next_Due_Date", "Notes", "Created_By", "Created_At", "IsDeleted"
    ]]);
  }

  let maintenanceId = `MNT-${Date.now()}-${Math.floor(Math.random() * 100)}`;
  let nowStr = new Date().toISOString();

  sheet.appendRow([
    maintenanceId,
    params.Trip_ID || "",
    params.Vehicle_ID || "",
    params.Driver_ID || "",
    params.Maintenance_Type || "",
    parseFloat(params.Amount) || 0,
    params.Workshop || "",
    params.Odometer || "",
    params.Next_Due_Date || "",
    params.Notes || "",
    userId,
    nowStr,
    false
  ]);

  return {
    "success": true,
    "maintenance_id": maintenanceId,
    "message": `تم تسجيل الصيانة (${maintenanceId}) بنجاح.`
  };
}

/**
 * ─── جلب صيانات عربية معينة ───
 */
function maintenanceService_getByVehicle(ss, params) {
  let vehicleId = params.Vehicle_ID;
  if (!vehicleId) {
    return { "success": false, "message": "Vehicle_ID مطلوب." };
  }

  let data = getCachedData("Maintenance_Log");
  if (!data) return { "success": true, "data": [] };

  let records = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][2] === vehicleId && data[i][12] !== true) {
      records.push({
        maintenance_id: data[i][0],
        trip_id: data[i][1],
        vehicle_id: data[i][2],
        driver_id: data[i][3],
        maintenance_type: data[i][4],
        amount: data[i][5],
        workshop: data[i][6],
        odometer: data[i][7],
        next_due_date: data[i][8],
        notes: data[i][9],
        created_by: data[i][10],
        created_at: data[i][11]
      });
    }
  }

  return { "success": true, "data": records };
}

/**
 * ─── جلب صيانات رحلة معينة ───
 */
function maintenanceService_getByTrip(ss, params) {
  let tripId = params.Trip_ID;
  if (!tripId) {
    return { "success": false, "message": "Trip_ID مطلوب." };
  }

  let data = getCachedData("Maintenance_Log");
  if (!data) return { "success": true, "data": [] };

  let records = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === tripId && data[i][12] !== true) {
      records.push({
        maintenance_id: data[i][0],
        trip_id: data[i][1],
        vehicle_id: data[i][2],
        driver_id: data[i][3],
        maintenance_type: data[i][4],
        amount: data[i][5],
        workshop: data[i][6],
        odometer: data[i][7],
        next_due_date: data[i][8],
        notes: data[i][9],
        created_by: data[i][10],
        created_at: data[i][11]
      });
    }
  }

  return { "success": true, "data": records };
}

/**
 * ─── جلب كل الصيانات ───
 */
function maintenanceService_getAll(ss, params) {
  let data = getCachedData("Maintenance_Log");
  if (!data) return { "success": true, "data": [] };

  let limit = parseInt(params.Limit) || 50;
  let records = [];

  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][12] === true) continue;
    records.push({
      maintenance_id: data[i][0],
      trip_id: data[i][1],
      vehicle_id: data[i][2],
      driver_id: data[i][3],
      maintenance_type: data[i][4],
      amount: data[i][5],
      workshop: data[i][6],
      odometer: data[i][7],
      next_due_date: data[i][8],
      notes: data[i][9],
      created_by: data[i][10],
      created_at: data[i][11]
    });
    if (records.length >= limit) break;
  }

  return { "success": true, "data": records };
}

/**
 * ─── تحديث صيانة ───
 */
function maintenanceService_updateMaintenance(ss, params, userId) {
  let sheet = getCachedSheet("Maintenance_Log");
  if (!sheet) throwBusinessError("SYSTEM_ERROR", "شيت Maintenance_Log غير موجود.");

  let maintenanceId = params.Maintenance_ID;
  if (!maintenanceId) throwBusinessError("BAD_REQUEST", "Maintenance_ID مطلوب.");

  let data = getCachedData("Maintenance_Log");
  let found = false;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === maintenanceId && data[i][12] !== true) {
      let row = i + 1;
      if (params.Maintenance_Type) sheet.getRange(row, 5).setValue(params.Maintenance_Type);
      if (params.Amount) sheet.getRange(row, 6).setValue(parseFloat(params.Amount));
      if (params.Workshop) sheet.getRange(row, 7).setValue(params.Workshop);
      if (params.Odometer) sheet.getRange(row, 8).setValue(params.Odometer);
      if (params.Next_Due_Date) sheet.getRange(row, 9).setValue(params.Next_Due_Date);
      if (params.Notes) sheet.getRange(row, 10).setValue(params.Notes);
      found = true;
      break;
    }
  }

  if (!found) throwBusinessError("NOT_FOUND", "الصيانة غير موجودة.");
  return { "success": true, "message": "تم تحديث الصيانة بنجاح." };
}

/**
 * ─── حذف صيانة ───
 */
function maintenanceService_deleteMaintenance(ss, params) {
  let sheet = getCachedSheet("Maintenance_Log");
  if (!sheet) throwBusinessError("SYSTEM_ERROR", "شيت Maintenance_Log غير موجود.");

  let maintenanceId = params.Maintenance_ID;
  if (!maintenanceId) throwBusinessError("BAD_REQUEST", "Maintenance_ID مطلوب.");

  let data = getCachedData("Maintenance_Log");
  let found = false;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === maintenanceId && data[i][12] !== true) {
      sheet.getRange(i + 1, 13).setValue(true);
      found = true;
      break;
    }
  }

  if (!found) throwBusinessError("NOT_FOUND", "الصيانة غير موجودة.");
  return { "success": true, "message": "تم حذف الصيانة بنجاح." };
}
