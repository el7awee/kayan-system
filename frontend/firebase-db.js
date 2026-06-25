// ====== دوال مساعدة ======

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
    const snapshot = await fbDb.collection(collectionName).get();
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
  return fbDb.collection(collectionName).onSnapshot(snapshot => {
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
        fbDb.collection('fuelBalance').orderBy('last_updated', 'desc').limit(1).get()
      ]);

      const trips = []; tripsSnap.forEach(d => trips.push(lowercaseKeys(d.data())));
      const drivers = []; driversSnap.forEach(d => drivers.push(lowercaseKeys(d.data())));
      const vehicles = []; vehiclesSnap.forEach(d => vehicles.push(lowercaseKeys(d.data())));
      const clients = []; clientsSnap.forEach(d => clients.push(lowercaseKeys(d.data())));
      const expenses = []; expensesSnap.forEach(d => expenses.push(lowercaseKeys(d.data())));
      const fuel = []; fuelSnap.forEach(d => fuel.push(lowercaseKeys(d.data())));

      const activeTrips = trips.filter(t => t.trip_status === 'OPEN');
      const totalExpenses = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
      const currentBalance = fuel.length > 0 ? parseFloat(fuel[0].total_balance_egp) || 0 : 0;

      return {
        success: true,
        data: {
          active_trips: activeTrips.length,
          total_drivers: drivers.filter(d => d.status !== 'INACTIVE').length,
          total_vehicles: vehicles.filter(v => v.status !== 'INACTIVE').length,
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

window.fbDbAPI = fbDbAPI;
