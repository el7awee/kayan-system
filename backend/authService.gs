/**
 * منظومة الكيان v6.0 - خدمة المصادقة وإدارة الجلسات
 * ملف: authService.gs (تسجيل الدخول، تشفير كلمات المرور، إدارة التوكنات)
 * [تحديث: إضافة الشيتات الجديدة للبنزينة والعربيات والسائقين والعملاء + العهدات]
 */

// SALT_ROUNDS غير موجودة في ملفات أخرى، نضعها هنا
const SALT_ROUNDS = 10;

// ⚠️ ملاحظة: SESSION_TIMEOUT_MS مُعرّفة بالفعل في middleware.gs

/**
 * ─── دالة التهيئة الأولية للنظام ───
 */
function initializeSystem() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. التأكد من وجود جميع الشيتات المطلوبة
  ensureSheetsExist(ss);
  
  // 2. إنشاء مستخدم Admin افتراضي إذا لم يكن موجوداً
  let usersSheet = ss.getSheetByName("Users");
  if (!usersSheet) {
    usersSheet = ss.insertSheet("Users");
    usersSheet.getRange(1, 1, 1, 13).setValues([[
      "User_ID", "Full_Name", "Username", "Password_Hash", "Role", 
      "Status", "Created_By", "Created_At", "Last_Login", 
      "Session_Token", "Token_Expiry", "IsDeleted", "Current_Balance"
    ]]);
  }
  
  let data = usersSheet.getDataRange().getValues();
  let adminExists = false;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][2] === "admin") {
      adminExists = true;
      break;
    }
  }
  
  if (!adminExists) {
    let hashedPassword = hashPassword("Admin@123");
    let userId = generateUserId(usersSheet);
    let now = new Date().toISOString();
    
    usersSheet.appendRow([
      userId,
      "مدير النظام الأساسي",
      "admin",
      hashedPassword,
      "Admin",
      "ACTIVE",
      "SYSTEM_INIT",
      now,
      "",
      "",
      "",
      false,
      0 // Current_Balance
    ]);
    
    console.log("✅ تم إنشاء مستخدم Admin افتراضي:");
    console.log(`   👤 Username: admin`);
    console.log(`   🔑 Password: Admin@123`);
    console.log(`   ⚠️  يُرجى تغيير كلمة المرور فور تسجيل الدخول!`);
  } else {
    console.log("ℹ️ مستخدم Admin موجود مسبقاً.");
  }
  
  // 🆕 إضافة الإعدادات الافتراضية في System_Settings
  initializeSystemSettings(ss);
}

/**
 * ─── دالة التأكد من وجود جميع الشيتات المطلوبة ───
 */
function ensureSheetsExist(ss) {
  const requiredSheets = [
    // الشيتات القديمة
    "Users", "Trips_Log", "Expenses_Log", 
    "Idempotency_Cache", "Trips_Archive",
    // 🆕 الشيتات الجديدة
    "Vehicles", "Drivers", "Clients",
    "Fuel_Balance", "Fuel_Transactions",
    "Trip_Advances", "Notifications",
    "System_Settings",
    // 🆕 شيت العهدات
    "Balance_Transactions"
  ];
  
  requiredSheets.forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      console.log(`📄 تم إنشاء شيت: ${sheetName}`);
      addSheetHeaders(sheet, sheetName);
    }
  });
}

/**
 * ─── إضافة رؤوس الأعمدة للشيتات الجديدة ───
 */
function addSheetHeaders(sheet, sheetName) {
  const headers = {
    'Vehicles': ['Vehicle_ID', 'Plate_Number', 'Model', 'Type', 'Load_Capacity', 'License_Expiry', 'Status', 'Created_By', 'Created_At', 'Updated_At', 'IsDeleted'],
    'Drivers': ['Driver_ID', 'Full_Name', 'Phone', 'License_Number', 'License_Expiry', 'National_ID', 'Current_Advance', 'Status', 'Created_By', 'Created_At', 'IsDeleted'],
    'Clients': ['Client_ID', 'Client_Name', 'Phone', 'Address', 'Tax_Number', 'Commercial_Record', 'Created_By', 'Created_At', 'IsDeleted'],
    'Fuel_Balance': ['Balance_ID', 'Total_Balance_EGP', 'Last_Updated', 'Updated_By'],
    'Fuel_Transactions': ['Transaction_ID', 'Vehicle_ID', 'Trip_ID', 'Transaction_Type', 'Amount_Liters', 'Amount_EGP', 'Fuel_Price', 'Source', 'Created_By', 'Created_At', 'Notes'],
    'Trip_Advances': ['Advance_ID', 'Trip_ID', 'Driver_ID', 'Advance_Amount', 'Spent_Amount', 'Remaining_Amount', 'Settlement_Type', 'Settled_At', 'Settled_By', 'Created_At'],
    'Notifications': ['Notification_ID', 'User_ID', 'Type', 'Title', 'Message', 'Related_ID', 'Is_Read', 'Is_Sent_Email', 'Created_At'],
    'System_Settings': ['Setting_Key', 'Setting_Value'],
    'Balance_Transactions': ['Transaction_ID', 'User_ID', 'Related_User_ID', 'Trip_ID', 'Transaction_Type', 'Amount', 'Balance_After', 'Notes', 'Created_By', 'Created_At']
  };
  
  if (headers[sheetName]) {
    sheet.getRange(1, 1, 1, headers[sheetName].length).setValues([headers[sheetName]]);
  }
}

/**
 * ─── إضافة الإعدادات الافتراضية في System_Settings ───
 */
function initializeSystemSettings(ss) {
  let sheet = ss.getSheetByName("System_Settings");
  if (!sheet) return;
  
  let data = sheet.getDataRange().getValues();
  let settings = {
    'FUEL_PRICE_PER_LITER': '20.50',
    'ARCHIVE_THRESHOLD_MONTHS': '6',
    'NOTIFICATION_RETENTION_DAYS': '90',
    'LOW_FUEL_THRESHOLD': '10000'
  };
  
  let existingKeys = [];
  for (let i = 1; i < data.length; i++) {
    existingKeys.push(data[i][0]);
  }
  
  for (let [key, value] of Object.entries(settings)) {
    if (!existingKeys.includes(key)) {
      sheet.appendRow([key, value]);
      console.log(`⚙️ تم إضافة الإعداد: ${key} = ${value}`);
    }
  }
}

// ==========================================
// دوال تسجيل الدخول والتحقق (نفسها القديمة)
// ==========================================

function authService_login(params) {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Users");
  if (!sheet) {
    return { success: false, message: "خطأ: شيت المستخدمين غير موجود." };
  }
  
  let username = params.Username?.trim().toLowerCase() || "";
  let password = params.Password || "";
  
  if (!username || !password) {
    return { success: false, message: "يرجى إدخال اسم المستخدم وكلمة المرور." };
  }
  
  let data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    let dbUsername = data[i][2]?.toString().toLowerCase() || "";
    let dbPasswordHash = data[i][3] || "";
    let status = data[i][5] || "INACTIVE";
    let isDeleted = data[i][11] || false;
    
    if (isDeleted === true || isDeleted === "TRUE" || status !== "ACTIVE") {
      continue;
    }
    
    if (dbUsername === username) {
      if (verifyPassword(password, dbPasswordHash)) {
        let token = generateSessionToken();
        let expiry = new Date(Date.now() + SESSION_TIMEOUT_MS);
        let now = new Date().toISOString();
        
        sheet.getRange(i + 1, 10).setValue(token);
        sheet.getRange(i + 1, 11).setValue(expiry.toISOString());
        sheet.getRange(i + 1, 9).setValue(now);
        
        return {
          success: true,
          user_id: data[i][0],
          full_name: data[i][1],
          username: data[i][2],
          role: data[i][4],
          session_token: token,
          token_expiry: expiry.toISOString(),
          message: `مرحباً ${data[i][1]}`
        };
      } else {
        return { success: false, message: "كلمة المرور غير صحيحة." };
      }
    }
  }
  
  return { success: false, message: "اسم المستخدم غير موجود." };
}

function authService_validateToken(token, userId) {
  if (!token || token === "null" || token === "") {
    return { valid: false, message: "توكن الجلسة مفقود." };
  }
  
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Users");
  if (!sheet) {
    return { valid: false, message: "خطأ: شيت المستخدمين غير موجود." };
  }
  
  let data = sheet.getDataRange().getValues();
  let now = new Date();
  
  for (let i = 1; i < data.length; i++) {
    let dbToken = data[i][9] || "";
    let dbUserId = data[i][0] || "";
    let expiryStr = data[i][10] || "";
    let status = data[i][5] || "INACTIVE";
    let isDeleted = data[i][11] || false;
    
    if (isDeleted === true || isDeleted === "TRUE" || status !== "ACTIVE") {
      continue;
    }
    
    if (dbToken === token) {
      if (userId && dbUserId !== userId) {
        return { valid: false, message: "التوكن لا يخص هذا المستخدم." };
      }
      
      if (expiryStr) {
        let expiry = new Date(expiryStr);
        if (expiry <= now) {
          return { valid: false, message: "انتهت صلاحية الجلسة." };
        }
      } else {
        return { valid: false, message: "التوكن غير صالح." };
      }
      
      return {
        valid: true,
        user_id: dbUserId,
        full_name: data[i][1],
        username: data[i][2],
        role: data[i][4]
      };
    }
  }
  
  return { valid: false, message: "التوكن غير صالح." };
}

function authService_logout(userId) {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Users");
  if (!sheet) return;
  
  let data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      sheet.getRange(i + 1, 10).setValue("");
      sheet.getRange(i + 1, 11).setValue("");
      break;
    }
  }
}

function authService_changePassword(params, requestingUserId) {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Users");
  if (!sheet) {
    return { success: false, message: "شيت المستخدمين غير موجود." };
  }
  
  let targetUserId = params.Target_User_ID || requestingUserId;
  let newPassword = params.New_Password;
  let oldPassword = params.Old_Password;
  
  if (!newPassword || newPassword.length < 6) {
    return { success: false, message: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل." };
  }
  
  let data = sheet.getDataRange().getValues();
  let found = false;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === targetUserId) {
      if (targetUserId === requestingUserId && oldPassword) {
        if (!verifyPassword(oldPassword, data[i][3])) {
          return { success: false, message: "كلمة المرور الحالية غير صحيحة." };
        }
      }
      
      let newHash = hashPassword(newPassword);
      sheet.getRange(i + 1, 4).setValue(newHash);
      found = true;
      break;
    }
  }
  
  if (!found) {
    return { success: false, message: "المستخدم غير موجود." };
  }
  
  return { success: true, message: "تم تغيير كلمة المرور بنجاح." };
}

// ==========================================
// دوال مساعدة للتشفير والتوليد
// ==========================================

function sha256Hex(value) {
  let encoded = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    value,
    Utilities.Charset.UTF_8
  );
  return encoded.map(byte => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');
}

/**
 * توليد ملح (salt) عشوائي لكل مستخدم.
 */
function generateSalt() {
  return Utilities.getUuid().replace(/-/g, '');
}

/**
 * تشفير كلمة المرور بصيغة salted: "salt:hash" حيث hash = SHA256(salt + password).
 */
function hashPassword(password) {
  let salt = generateSalt();
  let hash = sha256Hex(salt + password);
  return salt + ":" + hash;
}

/**
 * التحقق من كلمة المرور.
 * يدعم الصيغتين: الجديدة (salt:hash) والقديمة (SHA256 بدون ملح) للتوافق العكسي.
 */
function verifyPassword(plainPassword, hashedPassword) {
  if (!hashedPassword) return false;

  if (hashedPassword.indexOf(":") !== -1) {
    let parts = hashedPassword.split(":");
    let salt = parts[0];
    let storedHash = parts[1];
    return sha256Hex(salt + plainPassword) === storedHash;
  }

  // صيغة قديمة (بدون ملح) — للتوافق مع الحسابات المسجّلة قبل التحديث
  return sha256Hex(plainPassword) === hashedPassword;
}

function generateSessionToken() {
  let randomPart = Utilities.getUuid();
  let timestamp = Date.now();
  let randomHex = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  return `SESS-${timestamp}-${randomHex}-${randomPart.substring(0, 8)}`;
}

function generateUserId(sheet) {
  let data = sheet.getDataRange().getValues();
  let maxNum = 0;
  
  for (let i = 1; i < data.length; i++) {
    let id = data[i][0] || "";
    if (id.startsWith("USR-")) {
      let num = parseInt(id.replace("USR-", ""));
      if (num > maxNum) maxNum = num;
    }
  }
  
  let nextNum = maxNum + 1;
  return "USR-" + String(nextNum).padStart(3, '0');
}

function authService_getUserFromToken(token) {
  let result = authService_validateToken(token, null);
  if (result.valid) {
    return {
      user_id: result.user_id,
      full_name: result.full_name,
      username: result.username,
      role: result.role
    };
  }
  return null;
}

// ==========================================
// دوال اختبار
// ==========================================

function testHashSimple() {
  var password = "Admin@123";
  var hash = hashPassword(password);
  Logger.log("Password: " + password);
  Logger.log("Hash: " + hash);
}

function testVerify() {
  var plain = "Admin@123";
  var storedHash = "e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7";
  var result = verifyPassword(plain, storedHash);
  Logger.log("نتيجة التحقق: " + result);
}

function testLogin() {
  var params = {
    Username: "admin",
    Password: "Admin@123"
  };
  var result = authService_login(params);
  Logger.log(JSON.stringify(result));
}