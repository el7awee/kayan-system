const BACKEND_API_URL = "https://script.google.com/macros/s/AKfycbwTaLdsu6hAfZtJdlEavVdKBVniXo4VV7_W3AwkV9gljjiuRM9N1RplLWc_WB3OstrQ/exec";

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
