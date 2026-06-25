/**
 * منظومة الكيان v6.0 - طبقة إدارة العملاء
 * ملف: clientService.gs (إدارة العملاء)
 */

/**
 * ─── إنشاء عميل جديد ───
 */
function clientService_createClient(ss, params, userId) {
  let sheet = ss.getSheetByName("Clients");
  if (!sheet) {
    return { "success": false, "message": "شيت Clients غير موجود." };
  }
  
  // استخراج البيانات
  let clientName = params.Client_Name?.trim() || "";
  let phone = params.Phone?.trim() || "";
  let address = params.Address?.trim() || "";
  let taxNumber = params.Tax_Number?.trim() || "";
  let commercialRecord = params.Commercial_Record?.trim() || "";
  
  // التحقق من المدخلات (الاسم والرقم فقط إجبارية)
  if (!clientName || !phone) {
    return { "success": false, "message": "اسم العميل ورقم التليفون مطلوبين." };
  }
  
  // التحقق من عدم تكرار الاسم
  let data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === clientName && data[i][8] !== true) {
      return { "success": false, "message": "اسم العميل هذا مسجل مسبقاً." };
    }
  }
  
  // توليد معرف فريد
  let clientId = generateClientId(sheet);
  let now = new Date().toISOString();
  
  // إضافة العميل
  sheet.appendRow([
    clientId,           // A: Client_ID
    clientName,         // B: Client_Name
    phone,              // C: Phone
    address,            // D: Address
    taxNumber,          // E: Tax_Number
    commercialRecord,   // F: Commercial_Record
    userId,             // G: Created_By
    now,                // H: Created_At
    false               // I: IsDeleted
  ]);
  
  logApiAudit(userId, "Admin", "createClient", 0, "N/A", 200);
  
  return {
    "success": true,
    "data": {
      "client_id": clientId,
      "client_name": clientName,
      "phone": phone
    },
    "message": `تم إضافة العميل ${clientName} بنجاح.`
  };
}

/**
 * ─── جلب جميع العملاء ───
 */
function clientService_getClients(ss) {
  let data = getCachedData("Clients");
  if (!data) {
    return { "success": false, "message": "شيت Clients غير موجود." };
  }
  let clients = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][8] === true || data[i][8] === "TRUE") continue;
    
    clients.push({
      client_id: data[i][0],
      client_name: data[i][1],
      phone: data[i][2],
      address: data[i][3],
      tax_number: data[i][4],
      commercial_record: data[i][5],
      created_by: data[i][6],
      created_at: data[i][7]
    });
  }
  
  return { "success": true, "data": clients };
}

/**
 * ─── تحديث بيانات عميل ───
 */
function clientService_updateClient(ss, params, userId) {
  let sheet = ss.getSheetByName("Clients");
  if (!sheet) {
    return { "success": false, "message": "شيت Clients غير موجود." };
  }
  
  let clientId = params.Client_ID;
  if (!clientId) {
    return { "success": false, "message": "Client_ID مطلوب." };
  }
  
  let data = sheet.getDataRange().getValues();
  let found = false;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === clientId && data[i][8] !== true) {
      if (params.Client_Name) sheet.getRange(i + 1, 2).setValue(params.Client_Name.trim());
      if (params.Phone) sheet.getRange(i + 1, 3).setValue(params.Phone.trim());
      if (params.Address) sheet.getRange(i + 1, 4).setValue(params.Address.trim());
      if (params.Tax_Number) sheet.getRange(i + 1, 5).setValue(params.Tax_Number.trim());
      if (params.Commercial_Record) sheet.getRange(i + 1, 6).setValue(params.Commercial_Record.trim());
      
      found = true;
      break;
    }
  }
  
  if (!found) {
    return { "success": false, "message": "العميل غير موجود." };
  }
  
  logApiAudit(userId, "Admin", "updateClient", 0, "N/A", 200);
  
  return { "success": true, "message": "تم تحديث بيانات العميل بنجاح." };
}

/**
 * ─── حذف عميل (حذف ناعم) ───
 */
function clientService_deleteClient(ss, params) {
  let sheet = ss.getSheetByName("Clients");
  if (!sheet) {
    return { "success": false, "message": "شيت Clients غير موجود." };
  }
  
  let clientId = params.Client_ID;
  if (!clientId) {
    return { "success": false, "message": "Client_ID مطلوب." };
  }
  
  let data = sheet.getDataRange().getValues();
  let found = false;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === clientId && data[i][8] !== true) {
      sheet.getRange(i + 1, 9).setValue(true); // IsDeleted
      found = true;
      break;
    }
  }
  
  if (!found) {
    return { "success": false, "message": "العميل غير موجود." };
  }
  
  return { "success": true, "message": "تم حذف العميل بنجاح." };
}

/**
 * ─── جلب عميل بواسطة ID ───
 */
function clientService_getClientById(clientId) {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Clients");
  if (!sheet) return null;
  
  let data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === clientId && data[i][8] !== true) {
      return {
        client_id: data[i][0],
        client_name: data[i][1],
        phone: data[i][2],
        address: data[i][3]
      };
    }
  }
  
  return null;
}

/**
 * ─── توليد معرف فريد للعميل (CL-XXX) ───
 */
function generateClientId(sheet) {
  let data = sheet.getDataRange().getValues();
  let maxNum = 0;
  
  for (let i = 1; i < data.length; i++) {
    let id = data[i][0] || "";
    if (id.startsWith("CL-")) {
      let num = parseInt(id.replace("CL-", ""));
      if (num > maxNum) maxNum = num;
    }
  }
  
  let nextNum = maxNum + 1;
  return "CL-" + String(nextNum).padStart(3, '0');
}