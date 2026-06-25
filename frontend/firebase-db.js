/**
 * منظومة الكيان v7.0 — طبقة الوصول لـ Firestore
 * 
 * كل الدوال ترجع بنفس صيغة callBackend ({ success, data })
 * بس بقري من Firestore مباشرة (أسرع بكتير)
 * 
 * حاليًا: قراءة فقط (READ) — الكتابة لسه من Apps Script
 */

// ====== دوال مساعدة ======

/** تحويل أسماء الحقول من (Pascal_Case) → (snake_case) */
function normalizeFields(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  if (Array.isArray(doc)) return doc.map(normalizeFields);
  const result = {};
  for (const [key, val] of Object.entries(doc)) {
    const lower = key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
    result[lower] = val;
  }
  return result;
}

/** قراءة collection كاملة من Firestore */
async function getAllFromCollection(collectionName) {
  try {
    const snapshot = await fbDb.collection(collectionName).get();
    const docs = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      data.firebase_id = doc.id;
      docs.push(data);
    });
    return { success: true, data: docs };
  } catch (err) {
    console.error(`Firestore Error [${collectionName}]:`, err);
    return { success: false, error: err.message, data: [] };
  }
}

/** إعداد real-time listener لمجموعة */
function listenToCollection(collectionName, callback) {
  return fbDb.collection(collectionName).onSnapshot(snapshot => {
    const docs = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      data.firebase_id = doc.id;
      docs.push(data);
    });
    callback({ success: true, data: docs });
  }, err => {
    console.error(`Firestore Listener Error [${collectionName}]:`, err);
  });
}

// ====== واجهات برمجية ======

const fbDbAPI = {
  // 📋 الرحلات
  getTrips: () => getAllFromCollection('trips'),
  listenTrips: (cb) => listenToCollection('trips', cb),

  // 🚛 العربيات
  getVehicles: () => getAllFromCollection('vehicles'),
  listenVehicles: (cb) => listenToCollection('vehicles', cb),

  // 👨‍✈️ السواقين
  getDrivers: () => getAllFromCollection('drivers'),
  listenDrivers: (cb) => listenToCollection('drivers', cb),

  // 🏢 العملاء
  getClients: () => getAllFromCollection('clients'),
  listenClients: (cb) => listenToCollection('clients', cb),

  // 💸 المصروفات
  getExpenses: () => getAllFromCollection('expenses'),
  listenExpenses: (cb) => listenToCollection('expenses', cb),

  // ⛽ البنزينة
  getFuelBalance: () => getAllFromCollection('fuelBalance'),
  getFuelTransactions: () => getAllFromCollection('fuelTransactions'),

  // 🔔 الإشعارات
  getNotifications: () => getAllFromCollection('notifications'),

  // 👥 المستخدمين
  getUsers: () => getAllFromCollection('users'),

  // ⚙️ الإعدادات
  getSettings: () => getAllFromCollection('settings'),

  // 💰 العهدات
  getBalanceTransactions: () => getAllFromCollection('balanceTransactions'),

  // 🔧 الصيانة
  getMaintenance: () => getAllFromCollection('maintenance'),

  // 📊 Dashboard — يجمع بيانات كل الكوليكشنز دفعة واحدة
  getDashboard: async () => {
    try {
      const [
        tripsSnap, driversSnap, vehiclesSnap, clientsSnap,
        expensesSnap, fuelSnap
      ] = await Promise.all([
        fbDb.collection('trips').get(),
        fbDb.collection('drivers').get(),
        fbDb.collection('vehicles').get(),
        fbDb.collection('clients').get(),
        fbDb.collection('expenses').get(),
        fbDb.collection('fuelBalance').orderBy('Last_Updated', 'desc').limit(1).get()
      ]);

      const trips = []; tripsSnap.forEach(d => trips.push(d.data()));
      const drivers = []; driversSnap.forEach(d => drivers.push(d.data()));
      const vehicles = []; vehiclesSnap.forEach(d => vehicles.push(d.data()));
      const clients = []; clientsSnap.forEach(d => clients.push(d.data()));
      const expenses = []; expensesSnap.forEach(d => expenses.push(d.data()));
      const fuel = []; fuelSnap.forEach(d => fuel.push(d.data()));

      const activeTrips = trips.filter(t => t.Trip_Status === 'OPEN');
      const totalExpenses = expenses.reduce((s, e) => s + (parseFloat(e.Amount) || 0), 0);
      const currentBalance = fuel.length > 0 ? parseFloat(fuel[0].Total_Balance_EGP) || 0 : 0;

      return {
        success: true,
        data: {
          active_trips: activeTrips.length,
          total_drivers: drivers.filter(d => d.Status !== 'INACTIVE').length,
          total_vehicles: vehicles.filter(v => v.Status !== 'INACTIVE').length,
          total_clients: clients.length,
          total_expenses: totalExpenses,
          current_fuel_balance: currentBalance
        }
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
};

// تصدير للاستخدام من app.js
window.fbDbAPI = fbDbAPI;
