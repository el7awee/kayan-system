/**
 * منظومة الكيان v7.0 — تصدير كل البيانات من Sheets لملف JSON
 * تشغيل: من Apps Script Editor → تشغيل `exportAllDataToJson`
 * الناتج: JSON file في Drive → نستخدمه في Firebase Migration Script
 */

const MIGRATION_FOLDER_NAME = "منظومة الكيان - Migration";

function getMigrationFolder() {
  let folders = DriveApp.getFoldersByName(MIGRATION_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(MIGRATION_FOLDER_NAME);
}

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

function exportAllDataToJson() {
  let allData = {};
  
  let sheets = [
    "Users", "Trips_Log", "Expenses_Log", "Vehicles", "Drivers",
    "Clients", "Fuel_Balance", "Fuel_Transactions", "Trip_Advances",
    "Notifications", "System_Settings", "Balance_Transactions",
    "Maintenance_Log", "Driver_Advances_Log"
  ];
  
  sheets.forEach(name => {
    let data = sheetToObjects(name);
    if (data.length > 0) allData[name] = data;
    Logger.log(`📋 ${name}: ${data.length} rows`);
  });
  
  let jsonStr = JSON.stringify(allData, null, 2);
  let folder = getMigrationFolder();
  let fileName = `kayan_export_${new Date().toISOString().split('T')[0]}.json`;
  let file = folder.createFile(fileName, jsonStr, MimeType.PLAIN_TEXT);
  
  Logger.log(`✅ Exported to: ${file.getUrl()}`);
  return file.getUrl();
}
