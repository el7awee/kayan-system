const BACKEND_API_URL = "https://script.google.com/macros/s/AKfycbwopmT-4P7RvvEO2g6Hz4TvMv5loMHsOPbjiDxOWblJvpxm_zL60Gmy995JjevrKebG/exec";

const state = {
    user: { id: null, name: null, username: null, role: null, token: null, tokenExpiry: null },
    activeTrips: [],
    users: [],
    vehicles: [],
    drivers: [],
    clients: [],
    notifications: [],
    fuelTransactions: [],
    balanceTransactions: [],
    myBalance: 0,
    cache: {
        trips: null, vehicles: null, drivers: null, clients: null,
        fuelTransactions: null, balanceTransactions: null,
        notifications: null, users: null, maintenance: null
    }
};

const USE_FIREBASE = true;
const USE_FIREBASE_AUTH = true;
let autoRefreshTimer = null;
let dropdownsLoaded = false;

let chartExpenses = null;
let chartBalance = null;

const PAGINATION = {
    trips: { page: 1, size: 50 },
    expenses: { page: 1, size: 50 }
};
