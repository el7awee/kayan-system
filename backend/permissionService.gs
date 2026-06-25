/**
 * منظومة الكيان v6.0 - خدمة الصلاحيات الديناميكية
 * ملف: permissionService.gs
 * [تحديث: قراءة/كتابة الصلاحيات من شيت Permissions بدلاً من الكود]
 */

const PERMISSIONS_SHEET_NAME = "Permissions";

// كل الأكشنات المتاحة في النظام (مرجع)
const ALL_ACTIONS = [
  // الرحلات
  'getTrips', 'getDrivers', 'createTrip', 'updateTripStatus',
  'updateTrip', 'settleTripFinancials', 'getTripExpenses',
  // المصروفات
  'addExpense', 'updateExpense', 'deleteExpense',
  'getExpenses', 'getMonthlyExpenses',
  // لوحة التحكم
  'getDashboard', 'getLookups',
  // المستخدمين
  'createUser', 'getUsers', 'toggleUserStatus', 'updateUserRole',
  'deleteUser', 'resetUserPassword',
  // العربيات
  'getVehicles', 'createVehicle', 'updateVehicle', 'deleteVehicle',
  // السائقين
  'getDriversList', 'createDriver', 'updateDriverData', 'deleteDriver',
  // العملاء
  'getClients', 'createClient', 'updateClient', 'deleteClient',
  // البنزينة
  'getFuelBalance', 'addFuelBalance', 'getFuelTransactions', 'getFuelAnalytics', 'updateFuelPrice',
  // التنبيهات
  'getNotifications', 'markNotificationRead', 'markAllNotificationsRead', 'deleteNotification',
  // الصيانة
  'getMaintenance', 'getVehicleMaintenance', 'getTripMaintenance',
  'updateMaintenance', 'deleteMaintenance',
  // العهدات
  'getMyBalance', 'getUserBalance', 'getMyTransactions', 'getAllTransactions',
  'addBalance', 'deductBalance', 'transferBalance',
  // أخرى
  'logout', 'viewAuditLog'
];

// الأدوار المعروفة
const ALL_ROLES = ['Admin', 'Manager', 'Operations', 'Accountant'];

/**
 * قراءة الصلاحيات من شيت Permissions
 * لو الشيت مش موجود، يرجع الـ hardcoded ROLE_PERMISSIONS
 */
function getPermissionsFromSheet(ss) {
  let sheet = ss.getSheetByName(PERMISSIONS_SHEET_NAME);
  if (!sheet) {
    return JSON.parse(JSON.stringify(ROLE_PERMISSIONS));
  }
  
  let data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return JSON.parse(JSON.stringify(ROLE_PERMISSIONS));
  }
  
  let result = {};
  // Row 0 = header: role names
  let roles = [];
  for (let col = 1; col < data[0].length; col++) {
    let roleName = String(data[0][col]).trim();
    if (roleName) roles.push(roleName);
  }
  
  if (roles.length === 0) {
    return JSON.parse(JSON.stringify(ROLE_PERMISSIONS));
  }
  
  roles.forEach(r => result[r] = []);
  
  for (let row = 1; row < data.length; row++) {
    let action = String(data[row][0]).trim();
    if (!action || action.startsWith('#')) continue;
    for (let c = 0; c < roles.length; c++) {
      let col = c + 1;
      let val = String(data[row][col]).trim().toUpperCase();
      if (val === 'TRUE' || val === '1' || val === 'YES') {
        result[roles[c]].push(action);
      }
    }
  }
  
  return result;
}

/**
 * حفظ الصلاحيات في شيت Permissions
 */
function savePermissionsToSheet(ss, permissions) {
  let sheet = ss.getSheetByName(PERMISSIONS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PERMISSIONS_SHEET_NAME);
  }
  
  // جمع كل الأدوار من الـ permissions
  let roles = Object.keys(permissions).filter(r => ALL_ROLES.includes(r));
  if (roles.length === 0) roles = ALL_ROLES;
  
  // جمع كل الأكشنات من ALL_ACTIONS + أي أكشنات إضافية في الـ permissions
  let actionSet = new Set(ALL_ACTIONS);
  Object.values(permissions).forEach(actions => actions.forEach(a => actionSet.add(a)));
  let actions = Array.from(actionSet);
  
  // بناء البيانات
  let header = ['Action', ...roles];
  let rows = [header];
  
  actions.forEach(action => {
    let row = [action];
    roles.forEach(role => {
      let allowed = (permissions[role] || []).includes(action);
      row.push(allowed ? 'TRUE' : 'FALSE');
    });
    rows.push(row);
  });
  
  // مسح وكتابة
  sheet.clear();
  let range = sheet.getRange(1, 1, rows.length, rows[0].length);
  range.setValues(rows);
  
  // تنسيق
  sheet.setFrozenRows(1);
  range.getCell(1, 1).setFontWeight('bold');
  for (let c = 1; c <= roles.length; c++) {
    range.getCell(1, c + 1).setFontWeight('bold');
  }
  
  return { success: true, message: 'تم حفظ الصلاحيات' };
}

/**
 * جلب كل الصلاحيات (للواجهة الأمامية)
 */
function permissionService_getAll(ss) {
  let permissions = getPermissionsFromSheet(ss);
  
  // بناء مصفوفة لكل دور
  let roles = {};
  ALL_ROLES.forEach(role => {
    roles[role] = permissions[role] || [];
  });
  
  return {
    success: true,
    data: {
      roles: roles,
      allActions: ALL_ACTIONS
    }
  };
}

/**
 * حفظ الصلاحيات من الواجهة الأمامية
 */
function permissionService_save(ss, params) {
  let payload = params.bodyPayload;
  if (!payload) {
    return { success: false, message: 'لا توجد بيانات للحفظ' };
  }
  
  let permissions;
  try {
    permissions = JSON.parse(payload);
  } catch (e) {
    return { success: false, message: 'بيانات غير صالحة' };
  }
  
  return savePermissionsToSheet(ss, permissions);
}

function validateRoleAccessFromSheet(action, userRole) {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  let permissions = getPermissionsFromSheet(ss);
  
  let allowedActions = permissions[userRole];
  if (!allowedActions) return false;
  return allowedActions.indexOf(action) !== -1;
}
