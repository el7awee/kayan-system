/**
 * منظومة الكيان v7.0 — ترحيل البيانات من Sheets إلى Firestore
 * 
 * التشغيل:
 *   1. افتح Apps Script Editor (script.google.com)
 *   2. شغّل `migrateAllToFirestore`
 *   3. راقب الـ Logs (View → Logs)
 * 
 * هتكتب كل البيانات من Sheets → Firestore collection/document
 * باستخدام Firestore REST API + OAuth token من السكريبت
 */

const PROJECT_ID = "kayan-system-f494f";
const FIRESTORE_API = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ====== تعريف الـ Collections ======
const COLLECTIONS = [
  { sheet: "Users", collection: "users", idField: "User_ID" },
  { sheet: "Trips_Log", collection: "trips", idField: "Trip_ID" },
  { sheet: "Expenses_Log", collection: "expenses", idField: "Expense_ID" },
  { sheet: "Vehicles", collection: "vehicles", idField: "Vehicle_ID" },
  { sheet: "Drivers", collection: "drivers", idField: "Driver_ID" },
  { sheet: "Clients", collection: "clients", idField: "Client_ID" },
  { sheet: "Fuel_Balance", collection: "fuelBalance", idField: "Balance_ID" },
  { sheet: "Fuel_Transactions", collection: "fuelTransactions", idField: "Transaction_ID" },
  { sheet: "Trip_Advances", collection: "tripAdvances", idField: "Advance_ID" },
  { sheet: "Notifications", collection: "notifications", idField: "Notification_ID" },
  { sheet: "System_Settings", collection: "settings", idField: "Setting_Key" },
  { sheet: "Balance_Transactions", collection: "balanceTransactions", idField: "Transaction_ID" },
  { sheet: "Maintenance_Log", collection: "maintenance", idField: "Maintenance_ID" },
  { sheet: "Driver_Advances_Log", collection: "driverAdvances", idField: "Advance_ID" }
];

// الحصول على OAuth Token للـ Script
function getFirestoreToken() {
  return ScriptApp.getOAuthToken();
}

// تحويل قيمة من Sheet إلى قيمة Firestore
function toFirestoreValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'boolean') return { "booleanValue": val };
  if (typeof val === 'number') return { "integerValue": String(Math.floor(val)) };
  if (typeof val === 'string') {
    if (val === "TRUE") return { "booleanValue": true };
    if (val === "FALSE") return { "booleanValue": false };
    let num = Number(val);
    if (!isNaN(num) && val.trim() !== "") return { "integerValue": String(Math.floor(num)) };
    return { "stringValue": val };
  }
  return { "stringValue": String(val) };
}

// تحويل Row من Sheet → Firestore Document
function rowToDocument(collection, docId, row) {
  let fields = {};
  for (let [key, val] of Object.entries(row)) {
    if (val === "" || val === null || val === undefined) continue;
    let fv = toFirestoreValue(val);
    if (fv) fields[key] = fv;
  }
  return {
    "name": `${FIRESTORE_API}/${collection}/${docId}`,
    "fields": fields
  };
}

// إنشاء Batch Write (حد 500 مستند لكل commit)
function batchWriteToFirestore(writes, batchNum) {
  let token = getFirestoreToken();
  let url = `${FIRESTORE_API}:commit`;
  
  let payload = {
    "writes": writes.map(w => ({ "update": w }))
  };
  
  let options = {
    "method": "POST",
    "headers": {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  
  let response = UrlFetchApp.fetch(url, options);
  let code = response.getResponseCode();
  let body = response.getContentText();
  
  if (code >= 200 && code < 300) {
    Logger.log(`  ✅ Batch ${batchNum}: ${writes.length} مستند`);
    return JSON.parse(body);
  } else {
    throw new Error(`Firestore API Error (${code}): ${body}`);
  }
}

// ترحيل شيت واحد إلى Firestore
function migrateSheet(config) {
  let data = sheetToObjects(config.sheet);
  if (data.length === 0) {
    Logger.log(`⏭️ ${config.sheet}: لا توجد بيانات`);
    return 0;
  }
  
  Logger.log(`📤 ${config.sheet}: ${data.length} مستند (→ ${config.collection})`);
  
  let allWrites = [];
  for (let row of data) {
    let docId = String(row[config.idField] || `${config.collection}_${Date.now()}_${Math.random()}`);
    let doc = rowToDocument(config.collection, docId, row);
    allWrites.push(doc);
  }
  
  // دفع على دفعات (500 لكل batch)
  let batchSize = 500;
  let total = 0;
  for (let i = 0; i < allWrites.length; i += batchSize) {
    let batch = allWrites.slice(i, i + batchSize);
    let batchNum = Math.floor(i / batchSize) + 1;
    batchWriteToFirestore(batch, batchNum);
    total += batch.length;
  }
  
  Logger.log(`✅ ${config.sheet}: ${total} مستند`);
  return total;
}

// ====== الوظيفة الرئيسية — شغلها من Apps Script Editor ======
function migrateAllToFirestore() {
  Logger.log("🚀 بدء ترحيل البيانات إلى Firestore...\n");
  
  // تحقق من التوكن
  try {
    let token = getFirestoreToken();
    if (!token || token.length < 10) {
      Logger.log("❌ فشل الحصول على OAuth Token. تأكد من صلاحيات السكريبت.");
      return;
    }
    Logger.log("🔑 OAuth Token: ✅");
  } catch (e) {
    Logger.log(`❌ خطأ في التوكن: ${e.message}`);
    return;
  }
  
  let total = 0;
  for (let config of COLLECTIONS) {
    let count = migrateSheet(config);
    total += count;
  }
  
  Logger.log(`\n🎉 تم ترحيل ${total} مستند بنجاح!`);
}

// ====== دوال المساعدة ======

function sheetToObjects(sheetName) {
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  let data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  let headers = data[0];
  let result = [];
  for (let i = 1; i < data.length; i++) {
    let row = data[i];
    let obj = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx];
    });
    result.push(obj);
  }
  return result;
}

function migrateAllToFirestore_DryRun() {
  for (let config of COLLECTIONS) {
    let data = sheetToObjects(config.sheet);
    Logger.log(`📋 ${config.sheet}: ${data.length} مستند → ${config.collection} (id: ${config.idField})`);
  }
}

// ====== تصدير البيانات إلى JSON (للاستخدام مع Node.js import) ======
const MIGRATION_FOLDER_NAME = "منظومة الكيان - Migration";

function getMigrationFolder() {
  let folders = DriveApp.getFoldersByName(MIGRATION_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(MIGRATION_FOLDER_NAME);
}

function exportAllDataToJson() {
  let allData = {};
  
  for (let config of COLLECTIONS) {
    let data = sheetToObjects(config.sheet);
    if (data.length > 0) allData[config.sheet] = data;
    Logger.log(`📋 ${config.sheet}: ${data.length} rows`);
  }
  
  let jsonStr = JSON.stringify(allData, null, 2);
  let folder = getMigrationFolder();
  let fileName = `kayan_export_${new Date().toISOString().split('T')[0]}.json`;
  let file = folder.createFile(fileName, jsonStr, MimeType.PLAIN_TEXT);
  
  Logger.log(`✅ Exported to: ${file.getUrl()}`);
  return file.getUrl();
}
