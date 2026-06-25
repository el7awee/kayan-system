// ====== دوال مساعدة ======

function _col(name) {
  if (!fbDb) throw new Error('Firebase غير مهيأ');
  return fbDb.collection(name);
}

function lowercaseKeys(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  if (Array.isArray(doc)) return doc.map(lowercaseKeys);
  const result = {};
  for (const [key, val] of Object.entries(doc)) {
    result[key.toLowerCase()] = val;
  }
  return result;
}

async function getAllFromCollection(collectionName) {
  try {
    const snapshot = await _col(collectionName).get();
    const docs = [];
    snapshot.forEach(doc => {
      const data = lowercaseKeys(doc.data());
      data.firebase_id = doc.id;
      docs.push(data);
    });
    return { success: true, data: docs };
  } catch (err) {
    console.error(`Firestore Error [${collectionName}]:`, err);
    return { success: false, error: err.message, data: [] };
  }
}

function listenToCollection(collectionName, callback) {
  return _col(collectionName).onSnapshot(snapshot => {
    const docs = [];
    snapshot.forEach(doc => {
      const data = lowercaseKeys(doc.data());
      data.firebase_id = doc.id;
      docs.push(data);
    });
    callback({ success: true, data: docs });
  }, err => {
    console.error(`Firestore Listener Error [${collectionName}]:`, err);
  });
}

const TRIP_FIELDS = [
  "trip_id", "trip_date", "customer_code", "driver_code",
  "vehicle_number", "route", "advance_cash", "trip_status",
  "pod_file_id", "created_by", "created_at", "updated_at",
  "version_number", "isdeleted", "fuel_liters_initial",
  "fuel_amount_initial", "road_fuel_liters", "road_fuel_amount",
  "total_fuel_liters", "total_fuel_amount", "fuel_price",
  "settlement_status", "carried_over_advance"
];

function tripObjToArray(obj) {
  const arr = new Array(TRIP_FIELDS.length).fill(null);
  for (const [key, val] of Object.entries(obj)) {
    const idx = TRIP_FIELDS.indexOf(key.toLowerCase());
    if (idx !== -1) arr[idx] = val;
  }
  return arr;
}

const fbDbAPI = {
  getTrips: async () => {
    const res = await getAllFromCollection('trips');
    if (res.success) res.data = res.data.map(tripObjToArray);
    return res;
  },
  listenTrips: (cb) => listenToCollection('trips', cb),

  getVehicles: () => getAllFromCollection('vehicles'),
  listenVehicles: (cb) => listenToCollection('vehicles', cb),

  getDrivers: () => getAllFromCollection('drivers'),
  listenDrivers: (cb) => listenToCollection('drivers', cb),

  getClients: () => getAllFromCollection('clients'),
  listenClients: (cb) => listenToCollection('clients', cb),

  getExpenses: () => getAllFromCollection('expenses'),
  listenExpenses: (cb) => listenToCollection('expenses', cb),

  getFuelBalance: () => getAllFromCollection('fuelBalance'),
  getFuelTransactions: () => getAllFromCollection('fuelTransactions'),

  getNotifications: () => getAllFromCollection('notifications'),

  getUsers: () => getAllFromCollection('users'),

  getSettings: () => getAllFromCollection('settings'),

  getBalanceTransactions: () => getAllFromCollection('balanceTransactions'),

  getMaintenance: () => getAllFromCollection('maintenance'),

  getDashboard: async () => {
    let trips = [], drivers = [], vehicles = [], clients = [], expenses = [], fuel = [];
    try { const s = await _col('trips').get(); s.forEach(d => trips.push(lowercaseKeys(d.data()))); } catch (e) {}
    try { const s = await _col('drivers').get(); s.forEach(d => drivers.push(lowercaseKeys(d.data()))); } catch (e) {}
    try { const s = await _col('vehicles').get(); s.forEach(d => vehicles.push(lowercaseKeys(d.data()))); } catch (e) {}
    try { const s = await _col('clients').get(); s.forEach(d => clients.push(lowercaseKeys(d.data()))); } catch (e) {}
    try { const s = await _col('expenses').get(); s.forEach(d => expenses.push(lowercaseKeys(d.data()))); } catch (e) {}
    try { const s = await _col('fuelBalance').orderBy('last_updated', 'desc').limit(1).get(); s.forEach(d => fuel.push(lowercaseKeys(d.data()))); } catch (e) {}

    const activeTrips = trips.filter(t => t.trip_status === 'OPEN');
    const totalExpenses = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const currentBalance = fuel.length > 0 ? parseFloat(fuel[0].total_balance_egp) || 0 : 0;

    const catMap = {};
    for (const ex of expenses) {
      const cat = (ex.category || '').trim();
      const amt = parseFloat(ex.amount) || 0;
      catMap[cat] = (catMap[cat] || 0) + amt;
    }

    return {
      success: true,
      data: {
        active_trips: activeTrips.length,
        total_drivers: drivers.filter(d => d.status !== 'INACTIVE').length,
        total_vehicles: vehicles.filter(v => v.status !== 'INACTIVE').length,
        total_clients: clients.length,
        total_expenses: totalExpenses,
        current_fuel_balance: currentBalance,
        trips: trips,
        monthly_expenses: {
          total: totalExpenses,
          expenses: expenses,
          categories: catMap
        }
      }
    };
  }
};

window.fbDbAPI = fbDbAPI;

// ====== دوال مساعدة للكتابة ======

function genId(prefix) {
  const ts = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${ts}-${r}`;
}

async function uploadFile(base64Data, fileName) {
  if (!base64Data || !fbStorage) return null;
  const ref = fbStorage.ref(`receipts/${genId('FILE')}_${fileName}`);
  const snapshot = await ref.putString(base64Data, 'data_url');
  return await snapshot.ref.getDownloadURL();
}

const fbWriteAPI = {
  // 💸 المصروفات
  addExpense: async ({ category, description, amount, fileBase64, fileName }) => {
    const expenseId = genId('EXP');
    let receiptURL = '', receiptFile = '';
    if (fileBase64 && fileName) {
      receiptURL = await uploadFile(fileBase64, fileName);
      receiptFile = fileName;
    }
    const doc = {
      Expense_ID: expenseId,
      Category: category || '',
      Description: description || '',
      Amount: parseFloat(amount) || 0,
      Receipt_URL: receiptURL,
      Receipt_File: receiptFile,
      Created_By: state.user?.id || 'SYSTEM',
      Created_At: new Date().toISOString(),
      Updated_At: new Date().toISOString()
    };
    await _col('expenses').add(doc);
    return { success: true, message: 'تم إضافة المصروف', expense_id: expenseId };
  },

  updateExpense: async ({ expense_id, category, description, amount }) => {
    const snap = await _col('expenses').where('Expense_ID', '==', expense_id).get();
    if (snap.empty) return { success: false, message: 'المصروف غير موجود' };
    await snap.docs[0].ref.update({
      Category: category,
      Description: description || '',
      Amount: parseFloat(amount) || 0,
      Updated_At: new Date().toISOString()
    });
    return { success: true, message: 'تم تحديث المصروف' };
  },

  deleteExpense: async (expenseId) => {
    const snap = await _col('expenses').where('Expense_ID', '==', expenseId).get();
    if (snap.empty) return { success: false, message: 'المصروف غير موجود' };
    await snap.docs[0].ref.delete();
    return { success: true, message: 'تم حذف المصروف' };
  },

  // 📋 الرحلات
  createTrip: async (data) => {
    const tripId = genId('TRP');
    const doc = {
      Trip_ID: tripId,
      Trip_Date: new Date().toISOString(),
      Customer_Code: data.Customer_ID,
      Driver_Code: data.Driver_ID,
      Vehicle_Number: data.Vehicle_ID,
      Route: data.Route || '',
      Advance_Cash: parseFloat(data.Advance_Cash) || 0,
      Trip_Status: 'OPEN',
      Fuel_Liters_Initial: parseFloat(data.Fuel_Liters) || 0,
      Fuel_Amount_Initial: (parseFloat(data.Fuel_Liters) || 0) * (parseFloat(data.Fuel_Price) || 0),
      Fuel_Price: parseFloat(data.Fuel_Price) || 0,
      Total_Fuel_Liters: parseFloat(data.Fuel_Liters) || 0,
      Total_Fuel_Amount: (parseFloat(data.Fuel_Liters) || 0) * (parseFloat(data.Fuel_Price) || 0),
      Version_Number: 1,
      IsDeleted: false,
      Created_By: state.user?.id || 'SYSTEM',
      Created_At: new Date().toISOString(),
      Updated_At: new Date().toISOString()
    };
    await _col('trips').add(doc);
    return { success: true, message: 'تم بث الرحلة', trip_id: tripId };
  },

  updateTrip: async (data) => {
    const snap = await _col('trips').where('Trip_ID', '==', data.Trip_ID).get();
    if (snap.empty) return { success: false, message: 'الرحلة غير موجودة' };
    const trip = snap.docs[0];
    const existing = trip.data();
    const update = {
      Route: data.Route ?? existing.Route,
      Advance_Cash: parseFloat(data.Advance_Cash) ?? existing.Advance_Cash,
      Fuel_Liters_Initial: parseFloat(data.Fuel_Liters) ?? existing.Fuel_Liters_Initial,
      Fuel_Price: parseFloat(data.Fuel_Price) ?? existing.Fuel_Price,
      Total_Fuel_Liters: parseFloat(data.Fuel_Liters) ?? existing.Total_Fuel_Liters,
      Total_Fuel_Amount: (parseFloat(data.Fuel_Liters) ?? 0) * (parseFloat(data.Fuel_Price) ?? existing.Fuel_Price),
      Version_Number: (existing.Version_Number || 0) + 1,
      Updated_At: new Date().toISOString()
    };
    await trip.ref.update(update);
    return { success: true, message: 'تم تحديث الرحلة' };
  },

  updateTripStatus: async (tripId, newStatus, currentVersion) => {
    const snap = await _col('trips').where('Trip_ID', '==', tripId).get();
    if (snap.empty) return { success: false, message: 'الرحلة غير موجودة' };
    const trip = snap.docs[0];
    const existing = trip.data();
    if ((existing.Version_Number || 0) !== (currentVersion || 0)) {
      return { success: false, message: 'تعارض في الإصدار، الرجاء إعادة التحميل' };
    }
    await trip.ref.update({ Trip_Status: newStatus, Version_Number: (existing.Version_Number || 0) + 1, Updated_At: new Date().toISOString() });
    return { success: true, message: 'تم تحديث الحالة' };
  },

  // 🚛 العربيات
  createVehicle: async (data) => {
    const vehicleId = genId('VH');
    const doc = {
      Vehicle_ID: vehicleId,
      Plate_Number: data.Plate_Number,
      Model: data.Model || '',
      Type: data.Type || '',
      Load_Capacity: data.Load_Capacity || '',
      License_Expiry: data.License_Expiry || '',
      Status: 'ACTIVE',
      Created_At: new Date().toISOString(),
      Updated_At: new Date().toISOString()
    };
    await _col('vehicles').add(doc);
    return { success: true, message: 'تمت الإضافة', vehicle_id: vehicleId };
  },

  updateVehicle: async (data) => {
    const snap = await _col('vehicles').where('Vehicle_ID', '==', data.Vehicle_ID).get();
    if (snap.empty) return { success: false, message: 'العربية غير موجودة' };
    await snap.docs[0].ref.update({
      Plate_Number: data.Plate_Number,
      Model: data.Model,
      Type: data.Type,
      Load_Capacity: data.Load_Capacity,
      License_Expiry: data.License_Expiry,
      Updated_At: new Date().toISOString()
    });
    return { success: true, message: 'تم التحديث' };
  },

  deleteVehicle: async (vehicleId) => {
    const snap = await _col('vehicles').where('Vehicle_ID', '==', vehicleId).get();
    if (snap.empty) return { success: false, message: 'العربية غير موجودة' };
    await snap.docs[0].ref.update({ Status: 'INACTIVE', Updated_At: new Date().toISOString() });
    return { success: true, message: 'تم الحذف' };
  },

  // 👨‍✈️ السواقين
  createDriver: async (data) => {
    const driverId = genId('DR');
    const doc = {
      Driver_ID: driverId,
      Full_Name: data.Full_Name,
      Phone: data.Phone || '',
      License_Number: data.License_Number || '',
      License_Expiry: data.License_Expiry || '',
      National_ID: data.National_ID || '',
      Status: 'ACTIVE',
      Current_Advance: 0,
      Created_At: new Date().toISOString(),
      Updated_At: new Date().toISOString()
    };
    await _col('drivers').add(doc);
    return { success: true, message: 'تمت الإضافة', driver_id: driverId };
  },

  updateDriver: async (data) => {
    const snap = await _col('drivers').where('Driver_ID', '==', data.Driver_ID).get();
    if (snap.empty) return { success: false, message: 'السائق غير موجود' };
    await snap.docs[0].ref.update({
      Full_Name: data.Full_Name,
      Phone: data.Phone,
      License_Number: data.License_Number,
      License_Expiry: data.License_Expiry,
      Updated_At: new Date().toISOString()
    });
    return { success: true, message: 'تم التحديث' };
  },

  deleteDriver: async (driverId) => {
    const snap = await _col('drivers').where('Driver_ID', '==', driverId).get();
    if (snap.empty) return { success: false, message: 'السائق غير موجود' };
    await snap.docs[0].ref.update({ Status: 'INACTIVE', Updated_At: new Date().toISOString() });
    return { success: true, message: 'تم الحذف' };
  },

  // 🏢 العملاء
  createClient: async (data) => {
    const clientId = genId('CL');
    const doc = {
      Client_ID: clientId,
      Client_Name: data.Client_Name,
      Phone: data.Phone,
      Address: data.Address || '',
      Tax_Number: data.Tax_Number || '',
      Commercial_Record: data.Commercial_Record || '',
      Created_At: new Date().toISOString(),
      Updated_At: new Date().toISOString()
    };
    await _col('clients').add(doc);
    return { success: true, message: 'تمت الإضافة', client_id: clientId };
  },

  updateClient: async (data) => {
    const snap = await _col('clients').where('Client_ID', '==', data.Client_ID).get();
    if (snap.empty) return { success: false, message: 'العميل غير موجود' };
    await snap.docs[0].ref.update({
      Client_Name: data.Client_Name,
      Phone: data.Phone,
      Address: data.Address,
      Updated_At: new Date().toISOString()
    });
    return { success: true, message: 'تم التحديث' };
  },

  deleteClient: async (clientId) => {
    const snap = await _col('clients').where('Client_ID', '==', clientId).get();
    if (snap.empty) return { success: false, message: 'العميل غير موجود' };
    await snap.docs[0].ref.delete();
    return { success: true, message: 'تم الحذف' };
  },

  // ⛽ البنزينة
  addFuelBalance: async (amount) => {
    const doc = {
      Amount: parseFloat(amount) || 0,
      Type: 'ADD',
      Created_By: state.user?.id || 'SYSTEM',
      Created_At: new Date().toISOString()
    };
    await _col('fuelTransactions').add(doc);
    // تحدث الرصيد الحالي
    const balSnap = await _col('fuelBalance').orderBy('Last_Updated', 'desc').limit(1).get();
    let newBalance = parseFloat(amount) || 0;
    if (!balSnap.empty) {
      const current = balSnap.docs[0].data();
      newBalance = (parseFloat(current.Total_Balance_EGP) || 0) + (parseFloat(amount) || 0);
    }
    await _col('fuelBalance').add({
      Total_Balance_EGP: newBalance,
      Last_Updated: new Date().toISOString(),
      Updated_By: state.user?.id || 'SYSTEM'
    });
    return { success: true, message: 'تم إضافة رصيد البنزينة' };
  },

  // 🔧 الصيانة
  addMaintenance: async (data) => {
    const maintId = genId('MNT');
    const doc = {
      Maintenance_ID: maintId,
      Vehicle_ID: data.Vehicle_ID,
      Description: data.Description || '',
      Cost: parseFloat(data.Cost) || 0,
      Date: data.Date || new Date().toISOString().split('T')[0],
      Status: 'PENDING',
      Created_By: state.user?.id || 'SYSTEM',
      Created_At: new Date().toISOString(),
      Updated_At: new Date().toISOString()
    };
    await _col('maintenance').add(doc);
    return { success: true, message: 'تمت الإضافة', maintenance_id: maintId };
  },

  deleteMaintenance: async (maintId) => {
    const snap = await _col('maintenance').where('Maintenance_ID', '==', maintId).get();
    if (snap.empty) return { success: false, message: 'غير موجود' };
    await snap.docs[0].ref.delete();
    return { success: true, message: 'تم الحذف' };
  },

  // 🔔 الإشعارات
  markNotificationRead: async (notifId) => {
    const snap = await _col('notifications').where('Notification_ID', '==', notifId).get();
    if (snap.empty) return { success: false };
    await snap.docs[0].ref.update({ Is_Read: true });
    return { success: true };
  },

  markAllNotificationsRead: async () => {
    const snap = await _col('notifications').where('Is_Read', '==', false).get();
    const batch = fbDb.batch();
    snap.forEach(d => batch.update(d.ref, { Is_Read: true }));
    await batch.commit();
    return { success: true };
  },

  deleteNotification: async (notifId) => {
    const snap = await _col('notifications').where('Notification_ID', '==', notifId).get();
    if (snap.empty) return { success: false };
    await snap.docs[0].ref.delete();
    return { success: true };
  },

  // 💰 العهدات
  addBalance: async ({ user_id, amount, note }) => {
    const txId = genId('BAL');
    const doc = {
      Transaction_ID: txId,
      User_ID: user_id,
      Amount: Math.abs(parseFloat(amount) || 0),
      Type: 'ADD',
      Note: note || 'إيداع',
      Created_By: state.user?.id || 'SYSTEM',
      Created_At: new Date().toISOString()
    };
    await _col('balanceTransactions').add(doc);
    return { success: true, message: 'تم الإيداع', transaction_id: txId };
  },

  deductBalance: async ({ user_id, amount, note }) => {
    const txId = genId('BAL');
    const doc = {
      Transaction_ID: txId,
      User_ID: user_id,
      Amount: Math.abs(parseFloat(amount) || 0),
      Type: 'DEDUCT',
      Note: note || 'صرف',
      Created_By: state.user?.id || 'SYSTEM',
      Created_At: new Date().toISOString()
    };
    await _col('balanceTransactions').add(doc);
    return { success: true, message: 'تم الصرف', transaction_id: txId };
  },

  transferBalance: async ({ from_user_id, to_user_id, amount, note }) => {
    const txId1 = genId('BAL');
    const txId2 = genId('BAL');
    const batch = fbDb.batch();
    const amt = Math.abs(parseFloat(amount) || 0);
    const now = new Date().toISOString();
    batch.set(_col('balanceTransactions').doc(), {
      Transaction_ID: txId1, User_ID: from_user_id, Amount: amt,
      Type: 'TRANSFER_OUT', Note: note || 'تحويل صادر',
      Target_User_ID: to_user_id, Created_By: state.user?.id || 'SYSTEM', Created_At: now
    });
    batch.set(_col('balanceTransactions').doc(), {
      Transaction_ID: txId2, User_ID: to_user_id, Amount: amt,
      Type: 'TRANSFER_IN', Note: note || 'تحويل وارد',
      Source_User_ID: from_user_id, Created_By: state.user?.id || 'SYSTEM', Created_At: now
    });
    await batch.commit();
    return { success: true, message: 'تم التحويل' };
  },

  // 👥 المستخدمين
  createUser: async (data) => {
    const userId = genId('USR');
    const email = data.Email || `${data.New_Username || data.Username}@kayan.system`;
    let authUid = '';
    try {
      if (fbAuth) {
        const fbUser = await fbAuth.createUserWithEmailAndPassword(email, data.New_Password || data.Password || 'Kayan@2026');
        authUid = fbUser.user.uid;
      }
    } catch (e) { /* user may already exist in auth */ }
    const doc = {
      User_ID: userId,
      Full_Name: data.Full_Name,
      Username: data.New_Username || data.Username,
      Role: data.Assigned_Role || data.Role || 'Operations',
      Status: 'ACTIVE',
      Created_By: state.user?.id || 'SYSTEM',
      Created_At: new Date().toISOString()
    };
    if (authUid) { doc.auth_uid = authUid; doc.auth_email = email; }
    await _col('users').add(doc);
    return { success: true, message: 'تمت الإضافة', user_id: userId };
  },

  toggleUserStatus: async ({ Target_User_ID: userId, New_Status: newStatus }) => {
    const snap = await _col('users').where('User_ID', '==', userId).get();
    if (snap.empty) return { success: false, message: 'المستخدم غير موجود' };
    const user = snap.docs[0];
    const newStat = newStatus || (user.data().Status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
    await user.ref.update({ Status: newStat });
    return { success: true, message: 'تم تغيير الحالة' };
  },

  updateUserRole: async ({ Target_User_ID: userId, New_Role: newRole }) => {
    const snap = await _col('users').where('User_ID', '==', userId).get();
    if (snap.empty) return { success: false, message: 'المستخدم غير موجود' };
    await snap.docs[0].ref.update({ Role: newRole });
    return { success: true, message: 'تم تحديث الصلاحية' };
  },

  deleteUser: async (userId) => {
    const snap = await _col('users').where('User_ID', '==', userId).get();
    if (snap.empty) return { success: false, message: 'المستخدم غير موجود' };
    await snap.docs[0].ref.update({ IsDeleted: true, Status: 'INACTIVE' });
    return { success: true, message: 'تم حذف المستخدم' };
  },

  updateFuelPrice: async (price) => {
    await _col('settings').doc('fuel').update({
      fuel_price_per_liter: parseFloat(price),
      last_updated: new Date().toISOString()
    });
    return { success: true, message: 'تم تحديث سعر البنزين' };
  }
};

// Wrap all write functions with error handling (safe against null fbDb)
const _safeWrite = {};
Object.keys(fbWriteAPI).forEach(key => {
  _safeWrite[key] = async (...args) => {
    try {
      return await fbWriteAPI[key](...args);
    } catch (e) {
      console.error(`fbWriteAPI.${key} error:`, e);
      return { success: false, message: e.message || 'حدث خطأ في الاتصال بقاعدة البيانات' };
    }
  };
});
window.fbWriteAPI = _safeWrite;
