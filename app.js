/**
 * منظومة الكيان v6.0 - المحرك التنفيذي للواجهة الأمامية
 * ملف: app.js (إدارة الحالة، التحويل الثنائي، وتأمين الـ Idempotency)
 * [تحديث: إصلاح مشكلة MISSING_ACTION - إرسال action في FormData]
 */

// ─── 1️⃣ الإعدادات والثوابت العالمية ───
const BACKEND_API_URL = "https://script.google.com/macros/s/AKfycbwDQ9OcY3hza8dXaN27JJ-xnLwO8BFinUvxhIDZwF2J56v9nQR0aw3FN1TVWzjZtA_y/exec";

// حالة التطبيق المحلية
const state = {
    user: {
        id: null,
        name: null,
        username: null,
        role: null,
        token: null,
        tokenExpiry: null
    },
    activeTrips: [],
    users: [],
    vehicles: [],
    drivers: [],
    clients: [],
    notifications: [],
    fuelTransactions: [],
    balanceTransactions: [],
    myBalance: 0,
    // Cache للبيانات (تحسين الأداء)
    cache: {
        trips: null,
        vehicles: null,
        drivers: null,
        clients: null,
        fuelTransactions: null,
        balanceTransactions: null,
        notifications: null,
        users: null,
        maintenance: null
    }
};

// 🟢 تفعيل وضع Firebase (يستخدم Firestore بدل Apps Script للقراءة)
const USE_FIREBASE = false;
const USE_FIREBASE_AUTH = false; // Auth لسه من Apps Script
let autoRefreshTimer = null;

// متغير للتحميل مرة واحدة
let dropdownsLoaded = false;

// ─── Toast System ───
function showToast(message, type = 'info', duration = 3500) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i> ${message}`;
    container.appendChild(el);
    setTimeout(() => {
        el.classList.add('toast-out');
        setTimeout(() => el.remove(), 300);
    }, duration);
}

// ─── Chart Instances ───
let chartExpenses = null;
let chartBalance = null;

// ─── Animated Counter ───
function animateCounter(el, target, suffix = '', duration = 800) {
    if (!el) return;
    const start = parseFloat(el.innerText.replace(/[^0-9.-]/g, '')) || 0;
    const diff = target - start;
    const steps = 30;
    const stepTime = duration / steps;
    let current = 0;
    const isFloat = target % 1 !== 0 || start % 1 !== 0;
    const tick = () => {
        current++;
        const progress = Math.min(current / steps, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const val = start + diff * eased;
        el.innerText = (isFloat ? val.toFixed(2) : Math.round(val)) + suffix;
        if (current < steps) setTimeout(tick, stepTime);
    };
    tick();
}

// ─── 2️⃣ إدارة الأحداث والتشغيل الأولي ───
document.addEventListener("DOMContentLoaded", () => {
    initApp();
    bindUIEvents();
    loadThemePreference();
});

function initApp() {
    const savedToken = localStorage.getItem("kyan_session_token");
    const savedUser = localStorage.getItem("kyan_user_data");
    const savedExpiry = localStorage.getItem("kyan_token_expiry");

    if (savedToken && savedUser && savedExpiry) {
        const expiry = new Date(savedExpiry);
        if (expiry > new Date()) {
            try {
                const parsedUser = JSON.parse(savedUser);
                state.user = {
                    ...parsedUser,
                    token: savedToken,
                    tokenExpiry: savedExpiry
                };
                setupUserLayout();
                switchView("view-dashboard");
                refreshDashboard();
                return;
            } catch (e) {
                clearSession();
            }
        } else {
            clearSession();
            Swal.fire({
                icon: 'warning',
                title: 'انتهت صلاحية الجلسة',
                text: 'برجاء تسجيل الدخول مجدداً.',
                timer: 2000,
                showConfirmButton: false
            });
        }
    }
    initAllTableSearch();
    switchView("view-login");
}

// ─── تحديث تلقائي كل 30 ثانية ───
function startAutoRefresh() {
    stopAutoRefresh();
        autoRefreshTimer = setInterval(() => {
            const curView = document.querySelector(".view-section:not(.hidden)");
            if (curView && curView.id === "view-dashboard") {
                refreshDashboard(false);
            }
        }, 30000);
}
function stopAutoRefresh() {
    if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
}

function bindUIEvents() {
    // هامبورجر للموبايل - toggle sidebar
    document.getElementById("btn-sidebar-toggle")?.addEventListener("click", () => {
        document.querySelector(".sidebar")?.classList.toggle("sidebar-open");
    });
    // إغلاق sidebar تلقائياً عند اختيار قائمة (موبايل)
    document.querySelectorAll(".sidebar .nav-item").forEach(el => {
        el.addEventListener("click", () => {
            document.querySelector(".sidebar")?.classList.remove("sidebar-open");
        });
    });
    // التنقل
    document.getElementById("nav-dashboard")?.addEventListener("click", () => { switchView("view-dashboard"); refreshDashboard(); });
    document.getElementById("nav-trips")?.addEventListener("click", async () => {
        switchView("view-trips");
        await loadDropdowns();
        loadTripsData();
    });
    document.getElementById("nav-expenses")?.addEventListener("click", () => {
        switchView("view-expenses");
        loadDropdowns();
        loadExpensesData();
    });
    document.getElementById("nav-fuel")?.addEventListener("click", () => { switchView("view-fuel"); loadFuelData(); });
    document.getElementById("nav-maintenance")?.addEventListener("click", () => { switchView("view-maintenance"); loadMaintenanceData(); });
    document.getElementById("nav-vehicles")?.addEventListener("click", () => { switchView("view-vehicles"); loadVehiclesData(); });
    document.getElementById("nav-drivers")?.addEventListener("click", () => { switchView("view-drivers"); loadDriversData(); });
    document.getElementById("nav-clients")?.addEventListener("click", () => { switchView("view-clients"); loadClientsData(); });
    document.getElementById("nav-balance")?.addEventListener("click", () => { switchView("view-balance"); loadBalanceData(); });
    document.getElementById("nav-notifications")?.addEventListener("click", () => { switchView("view-notifications"); loadNotificationsData(); });
    document.getElementById("btn-notif-bell")?.addEventListener("click", () => { switchView("view-notifications"); loadNotificationsData(); });
    document.getElementById("nav-settings")?.addEventListener("click", () => {
        if (state.user.role === "Admin" || state.user.role === "Manager") {
            switchView("view-settings");
            loadUsersData();
        } else {
            Swal.fire({ icon: 'error', title: 'صلاحية مرفوضة', text: 'هذه الصفحة متاحة للمديرين فقط.' });
        }
    });

    // كبس KPIs — ضغطة ع الكارت توديك لصفحته
    document.getElementById("card-active-trips")?.addEventListener("click", () => { switchView("view-trips"); loadTripsData(); });
    document.getElementById("card-expenses")?.addEventListener("click", () => { switchView("view-expenses"); loadDropdowns(); loadExpensesData(); });
    document.getElementById("card-fuel")?.addEventListener("click", () => { switchView("view-fuel"); loadFuelData(); });
    document.getElementById("card-balance")?.addEventListener("click", () => { switchView("view-balance"); loadBalanceData(); });
    document.getElementById("card-vehicles")?.addEventListener("click", () => { switchView("view-vehicles"); loadVehiclesData(); });
    document.getElementById("card-drivers")?.addEventListener("click", () => { switchView("view-drivers"); loadDriversData(); });

    // أزرار التحديث
    document.getElementById("btn-refresh-dashboard")?.addEventListener("click", (e) => {
        const btn = e.currentTarget;
        const icon = btn.querySelector("i");
        if (icon) { icon.className = "fa-solid fa-spinner fa-spin text-xs"; }
        setTimeout(() => {
            refreshDashboard(true);
            if (icon) setTimeout(() => { icon.className = "fa-solid fa-rotate text-xs"; }, 500);
        }, 100);
    });
    document.getElementById("btn-refresh-trips")?.addEventListener("click", () => loadTripsData(true));
    document.getElementById("btn-refresh-fuel-data")?.addEventListener("click", loadFuelData);
    document.getElementById("btn-refresh-maintenance")?.addEventListener("click", () => loadMaintenanceData(true));
    document.getElementById("btn-refresh-vehicles")?.addEventListener("click", () => loadVehiclesData(true));
    document.getElementById("btn-refresh-drivers")?.addEventListener("click", () => loadDriversData(true));
    document.getElementById("btn-refresh-clients")?.addEventListener("click", () => loadClientsData(true));
    document.getElementById("btn-refresh-users")?.addEventListener("click", () => loadUsersData(true));
    document.getElementById("btn-refresh-notifications")?.addEventListener("click", loadNotificationsData);
    document.getElementById("btn-refresh-balance")?.addEventListener("click", () => loadBalanceData(true));
    document.getElementById("btn-refresh-expenses-table")?.addEventListener("click", () => loadExpensesData(true));

    // إلغاء تعديل المصروف
    document.getElementById("btn-expense-cancel-edit")?.addEventListener("click", cancelExpenseEdit);

    // فلتر المصروفات
    document.getElementById("filter-expense-category")?.addEventListener("change", () => loadExpensesData());
    document.getElementById("search-expenses")?.addEventListener("input", debounce(() => loadExpensesData(), 300));

    // البنزينة
    document.getElementById("btn-add-fuel-balance")?.addEventListener("click", handleAddFuelBalance);
    document.getElementById("btn-update-fuel-price")?.addEventListener("click", handleUpdateFuelPrice);
    document.getElementById("btn-refresh-fuel-data")?.addEventListener("click", loadFuelData);

    // العهدات
    document.getElementById("btn-add-balance")?.addEventListener("click", handleAddBalance);
    document.getElementById("btn-transfer-balance")?.addEventListener("click", handleTransferBalance);
    document.getElementById("balance-filter-user")?.addEventListener("change", loadBalanceData);

    // إدارة
    document.getElementById("btn-add-vehicle")?.addEventListener("click", handleAddVehicle);
    document.getElementById("btn-add-driver")?.addEventListener("click", handleAddDriver);
    document.getElementById("btn-add-client")?.addEventListener("click", handleAddClient);

    // التنبيهات
    document.getElementById("btn-mark-all-read")?.addEventListener("click", handleMarkAllRead);


    // تسجيل الخروج والوضع
    document.getElementById("btn-logout")?.addEventListener("click", handleLogout);
    document.getElementById("btn-theme-toggle")?.addEventListener("click", toggleTheme);

    // النماذج
    document.getElementById("form-login")?.addEventListener("submit", handleLoginSubmit);
    document.getElementById("form-create-trip")?.addEventListener("submit", handleCreateTripSubmit);
    document.getElementById("form-add-expense")?.addEventListener("submit", handleAddExpenseSubmit);
    document.getElementById("form-create-user")?.addEventListener("submit", handleCreateUserSubmit);

    // رفع الملفات
    document.getElementById("expense-file-input")?.addEventListener("change", handleFileProcessing);
}

// ─── 3️⃣ إدارة التنقل ───
function switchView(viewId) {
    const sections = ["view-login", "view-dashboard", "view-trips", "view-expenses",
                      "view-fuel", "view-maintenance", "view-vehicles", "view-drivers", "view-clients",
                      "view-balance", "view-notifications", "view-settings"];
    sections.forEach(id => {
        const sec = document.getElementById(id);
        if (sec) sec.classList.add("hidden");
    });

    const mainLayout = document.getElementById("main-layout");
    if (viewId === "view-login") {
        if (mainLayout) mainLayout.classList.add("hidden");
        document.getElementById("view-login")?.classList.remove("hidden");
        stopAutoRefresh();
    } else {
        if (mainLayout) mainLayout.classList.remove("hidden");
        document.getElementById(viewId)?.classList.remove("hidden");
        updateSidebarActiveState(viewId);
        if (viewId === "view-dashboard") { startAutoRefresh(); } else { stopAutoRefresh(); }
    }
}

function updateSidebarActiveState(viewId) {
    const navMapping = {
        "view-dashboard": "nav-dashboard",
        "view-trips": "nav-trips",
        "view-expenses": "nav-expenses",
        "view-fuel": "nav-fuel",
        "view-vehicles": "nav-vehicles",
        "view-drivers": "nav-drivers",
        "view-clients": "nav-clients",
        "view-balance": "nav-balance",
        "view-notifications": "nav-notifications",
        "view-settings": "nav-settings"
    };

    document.querySelectorAll(".nav-item").forEach(btn => btn.classList.remove("active"));

    const activeNavId = navMapping[viewId];
    const activeBtn = document.getElementById(activeNavId);
    if (activeBtn) activeBtn.classList.add("active");
}

// ─── 4️⃣ طبقة الاتصال بالخادم (معدلة) ───
// ─── كاش للاستعلامات المتكررة ───
const apiCache = new Map();
const CACHE_TTL = {
    getDashboard: 15000,    // 15 ثانية
    getTrips: 20000,
    getVehicles: 30000,
    getDriversList: 30000,
    getFuelBalance: 15000,
    getFuelTransactions: 20000,
    getFuelAnalytics: 30000,
    getMonthlyExpenses: 30000,
    getNotifications: 10000,
    getMyBalance: 15000,
    getLookups: 60000,
    default: 10000
};
function getCachedResponse(action, params) {
    const key = action + JSON.stringify(params || {});
    const entry = apiCache.get(key);
    if (entry && Date.now() - entry.ts < (CACHE_TTL[action] || CACHE_TTL.default)) {
        return entry.data;
    }
    return null;
}
function setCachedResponse(action, params, data) {
    const key = action + JSON.stringify(params || {});
    apiCache.set(key, { data, ts: Date.now() });
}

async function callBackend(action, parameters = {}) {
    // للقراءة فقط — نشوف الكاش الأول
    const isReadAction = !["login", "createTrip", "updateTrip", "updateTripStatus", "settleTripFinancials", "addExpense", "createUser", "toggleUserStatus", "updateUserRole", "deleteUser", "resetUserPassword", "createVehicle", "updateVehicle", "deleteVehicle", "createDriver", "updateDriverData", "deleteDriver", "createClient", "updateClient", "deleteClient", "addFuelBalance", "updateFuelPrice", "updateMaintenance", "deleteMaintenance", "markNotificationRead", "markAllNotificationsRead", "deleteNotification", "addBalance", "deductBalance", "transferBalance"].includes(action);
    if (isReadAction && !parameters._force) {
        const cached = getCachedResponse(action, parameters);
        if (cached) return cached;
    }

    let url = new URL(BACKEND_API_URL);
    
    // ✅ إزالة action من الـ URL
    // url.searchParams.append("action", action);

    // ✅ Irsal Session Token fi POST body (mish URL)
    if (action !== "login") {
        parameters["Session_Token"] = state.user.token || "null";
        parameters["User_ID"] = state.user.id || "GUEST";
        parameters["User_Role"] = state.user.role || "Operations";
    }

    // ✅ bina2 FormData li'irsal kull al-bayanat
    const formData = new FormData();
    formData.append("action", action); // 🔥 أهم خطوة

    // إضافة باقي المعاملات
    for (const [key, value] of Object.entries(parameters)) {
        if (key === "bodyPayload") {
            // لو فيه ملفات مرفقة
            if (value && typeof value === 'object') {
                for (const [fileKey, fileValue] of Object.entries(value)) {
                    if (fileValue) {
                        formData.append(fileKey, fileValue);
                    }
                }
            }
        } else {
            formData.append(key, value);
        }
    }

    // إضافة Idempotency Key
    const isWriteAction = ["createTrip", "updateTrip", "settleTripFinancials", "addExpense", "createUser", "toggleUserStatus", "updateUserRole", "deleteUser", "resetUserPassword", "createVehicle", "updateVehicle", "deleteVehicle", "createDriver", "updateDriverData", "deleteDriver", "createClient", "updateClient", "deleteClient", "addFuelBalance", "updateFuelPrice", "markNotificationRead", "markAllNotificationsRead", "deleteNotification", "addBalance", "transferBalance"].includes(action);
    if (isWriteAction) {
        const timestamp = Date.now();
        const randomHex = Math.floor(Math.random() * 0xffffff).toString(16);
        const idempotencyKey = `IDMP-${timestamp}-${randomHex}`;
        formData.append("Idempotency_Key", idempotencyKey);
    }

    const fetchOptions = {
        method: "POST",
        mode: "cors",
        body: formData // ✅ إرسال FormData كامل
    };

    const response = await fetch(url.toString(), fetchOptions);
    if (!response.ok) {
        if (response.status === 429) {
            throw new Error(JSON.stringify({ error_code: "RATE_LIMIT_EXCEEDED", message: "تجاوزت الحد الأقصى للطلبات!" }));
        }
        if (response.status === 401) {
            clearSession();
            switchView("view-login");
            throw new Error(JSON.stringify({ error_code: "UNAUTHORIZED", message: "انتهت صلاحية الجلسة." }));
        }
        throw new Error(JSON.stringify({ error_code: "NETWORK_ERROR", message: "فشل الاتصال بالخادم." }));
    }

    const responseData = await response.json();
    if (responseData.success === false) {
        throw new Error(JSON.stringify(responseData));
    }
    // خزن في الكاش للقراءة فقط
    if (isReadAction) setCachedResponse(action, parameters, responseData);
    return responseData;
}

// ─── 5️⃣ العمليات ───

// ─── 5️⃣-أ: تسجيل الدخول ───
async function handleLoginSubmit(e) {
    e.preventDefault();
    const username = document.getElementById("input-username").value.trim();
    const password = document.getElementById("input-password").value.trim();
    const submitBtn = document.getElementById("btn-login-submit");

    if (!username || !password) {
        Swal.fire({ icon: 'warning', title: 'بيانات ناقصة', text: 'يرجى إدخال اسم المستخدم وكلمة المرور.' });
        return;
    }

    setButtonLoading(submitBtn, true, "جاري التحقق...");

    try {
        clearSession();
        state.user = { id: null, name: null, username: null, role: null, token: null, tokenExpiry: null };

        const response = await callBackend("login", { Username: username, Password: password });

        if (response.success) {
            localStorage.setItem("kyan_session_token", response.session_token);
            localStorage.setItem("kyan_user_data", JSON.stringify({
                id: response.user_id,
                name: response.full_name,
                username: response.username,
                role: response.role
            }));
            localStorage.setItem("kyan_token_expiry", response.token_expiry);

            state.user = {
                id: response.user_id,
                name: response.full_name,
                username: response.username,
                role: response.role,
                token: response.session_token,
                tokenExpiry: response.token_expiry
            };

            setupUserLayout();
            switchView("view-dashboard");
            refreshDashboard();

            Swal.fire({ icon: 'success', title: 'تم تسجيل الدخول', text: `مرحباً ${response.full_name}`, timer: 2000, showConfirmButton: false });
        } else {
            Swal.fire({ icon: 'error', title: 'فشل الدخول', text: response.message });
        }
    } catch (err) {
        handleStandardError(err);
    } finally {
        setButtonLoading(submitBtn, false, '<i class="fa-solid fa-right-to-bracket ml-2"></i> تسجيل الدخول آمن');
    }
}

// ─── 5️⃣-ب: لوحة التحكم ───
async function refreshDashboard(forceRefresh = false) {
    const dashStatus = document.getElementById("dash-last-update");
    const loadingDot = document.getElementById("dash-loading");
    try {
        const now = new Date();
        if (dashStatus) dashStatus.innerText = now.toLocaleString('ar-EG');
        if (loadingDot) loadingDot.classList.remove("hidden");

        if (USE_FIREBASE && window.fbDbAPI) {
            // 🟢 قراءة من Firestore مباشرة (أسرع + real-time)
            const [dash, vehRes, drvRes, fuelTxnRes] = await Promise.all([
                fbDbAPI.getDashboard(),
                fbDbAPI.getVehicles(),
                fbDbAPI.getDrivers(),
                fbDbAPI.getFuelTransactions()
            ]);
            const d = dash?.data || {};

            // كروت Dashboard
            animateCounter(document.getElementById("stat-active-trips"), d.active_trips || 0);
            animateCounter(document.getElementById("stat-fuel-balance"), d.current_fuel_balance || 0, ' ج.م');
            animateCounter(document.getElementById("stat-total-expenses"), d.total_expenses || 0, ' ج.م');
            animateCounter(document.getElementById("stat-my-balance"), state.myBalance || 0, ' ج.م');

            // العربيات
            const vehicles = vehRes?.data || [];
            const trips = d.trips || [];
            const openTrips = trips.filter(t => t.Trip_Status === 'OPEN');
            const busyVehIds = new Set(openTrips.map(t => t.Vehicle_Number).filter(Boolean));
            const totalVeh = vehicles.length;
            const busyVeh = busyVehIds.size;
            document.getElementById("stat-vehicles").innerHTML = `<span class="text-emerald-400">${totalVeh - busyVeh}</span> / <span class="text-rose-400">${busyVeh}</span>`;
            state.cache.vehicles = vehicles;

            // السواقين
            const drivers = drvRes?.data || [];
            const busyDrvIds = new Set(openTrips.map(t => t.Driver_Code).filter(Boolean));
            const totalDrv = drivers.length;
            const busyDrv = busyDrvIds.size;
            document.getElementById("stat-drivers").innerHTML = `<span class="text-emerald-400">${totalDrv - busyDrv}</span> / <span class="text-rose-400">${busyDrv}</span>`;
            state.cache.drivers = drivers;

            // Charts (Fuel + Expenses)
            const fuelTxns = fuelTxnRes?.data || [];
            window._lastFuelData = buildFuelChartData(fuelTxns);
            renderCharts(null, window._lastFuelData);
            loadFuelAnalytics();

        } else {
            // 🔵 قراءة من Apps Script (الطريقة القديمة)
            const dash = await callBackend("getDashboard", { Limit: 20, _force: forceRefresh });
            const d = dash?.data || {};
            const tripsRes = { data: d.trips };
            const fuelRes = { data: d.fuel };
            const balanceRes = { data: d.my_balance };
            const notifRes = { data: d.notifications };
            const expensesRes = { data: d.monthly_expenses };

            if (tripsRes?.data) {
                const trips = tripsRes.data;
                const activeCount = trips.filter(t => t[7] === "OPEN").length;
                animateCounter(document.getElementById("stat-active-trips"), activeCount);
                state.cache.trips = trips;
                state.activeTrips = trips;
            }

            if (fuelRes?.data) {
                const bal = fuelRes.data.current_balance || 0;
                const el = document.getElementById("stat-fuel-balance");
                animateCounter(el, bal, ' ج.م');
                el.style.color = bal < 0 ? "#ef4444" : "#22c55e";
            }

            if (balanceRes?.data) {
                const myBalance = balanceRes.data.current_balance || 0;
                animateCounter(document.getElementById("stat-my-balance"), myBalance, ' ج.م');
                state.myBalance = myBalance;
            }

            // جرس التنبيهات
            const unreadCount = notifRes?.data?.unread_count || 0;
            state.cache.notifications = notifRes?.data?.notifications || [];
            const bellBadge = document.getElementById("bell-badge");
            const notifBadge = document.getElementById("notif-badge");
            if (unreadCount > 0) {
                if (bellBadge) { bellBadge.innerText = unreadCount; bellBadge.classList.remove("hidden"); }
                if (notifBadge) { notifBadge.innerText = unreadCount; notifBadge.classList.remove("hidden"); }
            } else {
                if (bellBadge) bellBadge.classList.add("hidden");
                if (notifBadge) notifBadge.classList.add("hidden");
            }

            // إحصائيات العربيات والسائقين
            const trips = tripsRes?.data || [];
            const busyVehicleIds = new Set(trips.filter(t => t[7] === "OPEN").map(t => t[4]).filter(Boolean));
            const busyDriverIds = new Set(trips.filter(t => t[7] === "OPEN").map(t => t[3]).filter(Boolean));

            try {
                const vehRes = await callBackend("getVehicles");
                const vehicles = vehRes?.data || [];
                const totalVeh = vehicles.length;
                const busyVeh = busyVehicleIds.size;
                document.getElementById("stat-vehicles").innerHTML = `<span class="text-emerald-400">${totalVeh - busyVeh}</span> / <span class="text-rose-400">${busyVeh}</span>`;
                state.cache.vehicles = vehicles;
            } catch (e) { /* ignore */ }

            try {
                const drvRes = await callBackend("getDriversList");
                const drivers = drvRes?.data || [];
                const totalDrv = drivers.length;
                const busyDrv = busyDriverIds.size;
                document.getElementById("stat-drivers").innerHTML = `<span class="text-emerald-400">${totalDrv - busyDrv}</span> / <span class="text-rose-400">${busyDrv}</span>`;
                state.cache.drivers = drivers;
            } catch (e) { /* ignore */ }

            if (expensesRes?.data) {
                const monthlyTotal = expensesRes.data.total || 0;
                animateCounter(document.getElementById("stat-total-expenses"), monthlyTotal, ' ج.م');
                window._lastExpensesData = expensesRes.data;
            }

            if (balanceRes?.data) {
                window._lastBalanceData = balanceRes.data;
            }

            await loadFuelTransactions();
            window._lastFuelData = buildFuelChartData(state.fuelTransactions || []);
            renderCharts(window._lastExpensesData, window._lastFuelData);
            loadFuelAnalytics();
        }

    } catch (err) {
        console.error("فشل تحديث لوحة التحكم:", err);
    }
}

// ─── تحليل استهلاك البنزين ───
async function loadFuelAnalytics() {
    try {
        if (USE_FIREBASE && window.fbDbAPI) {
            const [txnRes] = await Promise.all([fbDbAPI.getFuelTransactions()]);
            const txns = txnRes?.data || [];
            const initialTxns = txns.filter(t => t.Transaction_Type === 'INITIAL' || t.Transaction_Type === 'ADD');

            const totalLiters = initialTxns.reduce((s, t) => s + (parseFloat(t.Amount_Liters) || 0), 0);
            const totalCost = initialTxns.reduce((s, t) => s + (parseFloat(t.Amount_EGP) || 0), 0);
            const tripCount = new Set(initialTxns.map(t => t.Trip_ID).filter(Boolean)).size;

            document.getElementById("fuel-analytics-total").innerText = totalLiters || 0;
            document.getElementById("fuel-analytics-cost").innerText = (totalCost || 0).toLocaleString('ar-EG');
            document.getElementById("fuel-analytics-avg").innerText = initialTxns.length > 0 ? (totalLiters / initialTxns.length).toFixed(1) : 0;
            document.getElementById("fuel-analytics-trips").innerText = tripCount;

            const vehicleMap = {};
            initialTxns.filter(t => t.Trip_ID).forEach(t => {
                const vId = t.Vehicle_ID || t.Vehicle_Number || 'أخرى';
                if (!vehicleMap[vId]) vehicleMap[vId] = { liters: 0, cost: 0, trips: new Set() };
                vehicleMap[vId].liters += parseFloat(t.Amount_Liters) || 0;
                vehicleMap[vId].cost += parseFloat(t.Amount_EGP) || 0;
                vehicleMap[vId].trips.add(t.Trip_ID);
            });

            const tbody = document.querySelector("#fuel-analytics-table tbody");
            if (!tbody) return;
            const entries = Object.entries(vehicleMap);
            if (entries.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">لا توجد بيانات</td></tr>';
                return;
            }
            tbody.innerHTML = entries.map(([vId, v]) => `
                <tr class="border-b border-border hover:bg-secondary/30 transition">
                    <td class="py-2 px-2 font-medium">${vId}</td>
                    <td class="py-2 px-2 font-mono">${v.liters.toFixed(1)}</td>
                    <td class="py-2 px-2 font-mono">${v.cost.toLocaleString()}</td>
                    <td class="py-2 px-2">${v.trips.size}</td>
                </tr>
            `).join('');
        } else {
            const res = await callBackend("getFuelAnalytics");
            const data = res?.data;
            if (!data) return;
            
            document.getElementById("fuel-analytics-total").innerText = data.total_liters || 0;
            
            const tbody = document.querySelector("#fuel-analytics-table tbody");
            if (!tbody) return;
            
            if (!data.vehicles || data.vehicles.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">لا توجد بيانات</td></tr>';
                return;
            }
            
            tbody.innerHTML = data.vehicles.map(v => `
                <tr class="border-b border-border hover:bg-secondary/30 transition">
                    <td class="py-2 px-2 font-medium">${v.vehicle_id}</td>
                    <td class="py-2 px-2 font-mono">${v.total_liters}</td>
                    <td class="py-2 px-2 font-mono">${v.total_cost.toLocaleString()}</td>
                    <td class="py-2 px-2">${v.trip_count}</td>
                </tr>
            `).join('');
        }
    } catch (e) {
        if (!USE_FIREBASE) console.error("فشل تحليل استهلاك البنزين:", e);
    }
}

// ─── 5️⃣-ج: القوائم المنسدلة ───
async function loadDropdowns(forceRefresh = false) {
    if (dropdownsLoaded && !forceRefresh) return;
    
    try {
        // طلب واحد مجمّع بدل 4 طلبات منفصلة (تحسين السرعة)
        const lookups = await callBackend("getLookups");
        const lk = lookups?.data || {};
        const clientsRes = { data: lk.clients };
        const driversRes = { data: lk.drivers };
        const vehiclesRes = { data: lk.vehicles };
        const fuelRes = { data: lk.fuel };

        if (clientsRes?.data) {
            const clientSelect = document.getElementById("trip-customer-id");
            if (clientSelect) {
                clientSelect.innerHTML = '<option value="">-- اختر العميل --</option>';
                clientsRes.data.forEach(client => {
                    const opt = document.createElement("option");
                    opt.value = client.client_id;
                    opt.textContent = client.client_name;
                    clientSelect.appendChild(opt);
                });
            }
            state.cache.clients = clientsRes.data;
        }

        // تحديد السائقين والعربيات المشغولين (في رحلة مفتوحة)
        let busyDriverIds = new Set();
        let busyVehicleIds = new Set();
        try {
            const tripsRes = await callBackend("getTrips", { Limit: 200 });
            const trips = tripsRes?.data || [];
            trips.forEach(t => {
                if (t[7] === "OPEN") {
                    if (t[3]) busyDriverIds.add(t[3]);
                    if (t[4]) busyVehicleIds.add(t[4]);
                }
            });
        } catch (e) { /* ignore */ }

        if (driversRes?.data) {
            state.cache.drivers = driversRes.data;
            const select = document.getElementById("trip-driver-id");
            if (select) {
                select.innerHTML = '<option value="">-- اختر --</option>';
                driversRes.data.forEach(driver => {
                    const opt = document.createElement("option");
                    opt.value = driver.driver_id;
                    const isBusy = busyDriverIds.has(driver.driver_id);
                    opt.textContent = driver.full_name + (isBusy ? ' (❌ مشغول)' : '') + (driver.current_advance > 0 ? ` (عهدة: ${driver.current_advance})` : "");
                    if (isBusy) opt.disabled = true;
                    select.appendChild(opt);
                });
            }
            const expenseSelect = document.getElementById("expense-driver-id");
            if (expenseSelect) {
                expenseSelect.innerHTML = '<option value="">-- اختر --</option>';
                driversRes.data.forEach(driver => {
                    const opt = document.createElement("option");
                    opt.value = driver.driver_id;
                    opt.textContent = driver.full_name;
                    expenseSelect.appendChild(opt);
                });
            }
        }

        if (vehiclesRes?.data) {
            state.cache.vehicles = vehiclesRes.data;
            const tripSelect = document.getElementById("trip-vehicle-id");
            if (tripSelect) {
                tripSelect.innerHTML = '<option value="">-- اختر --</option>';
                vehiclesRes.data.forEach(vehicle => {
                    const opt = document.createElement("option");
                    opt.value = vehicle.vehicle_id;
                    const isBusy = busyVehicleIds.has(vehicle.vehicle_id);
                    opt.textContent = vehicle.plate_number + " (" + vehicle.model + ")" + (isBusy ? ' (❌ مشغول)' : '');
                    if (isBusy) opt.disabled = true;
                    tripSelect.appendChild(opt);
                });
            }
            const expenseSelect = document.getElementById("expense-vehicle-id");
            if (expenseSelect) {
                expenseSelect.innerHTML = '<option value="">-- اختر --</option>';
                vehiclesRes.data.forEach(vehicle => {
                    const opt = document.createElement("option");
                    opt.value = vehicle.vehicle_id;
                    opt.textContent = vehicle.plate_number + " (" + vehicle.model + ")";
                    expenseSelect.appendChild(opt);
                });
            }
        }

        if (fuelRes?.data) {
            const priceInput = document.getElementById("trip-fuel-price");
            if (priceInput) {
                priceInput.value = fuelRes.data.fuel_price_per_liter || 20.50;
            }
        }

        dropdownsLoaded = true;
        console.log("✅ Dropdowns Loaded");

    } catch (err) {
        console.error("فشل تحميل القوائم:", err);
    }
}

// ─── 5️⃣-د: الرحلات ───
async function loadTripsData(forceRefresh = false) {
    const tbody = document.getElementById("table-trips-body");
    if (!tbody) return;

    if (!forceRefresh && state.cache.trips) {
        renderTripsTable(state.cache.trips);
        return;
    }

    tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-muted"><i class="fa-solid fa-spinner fa-spin ml-2"></i>جاري التحميل...</td></tr>`;

    try {
        const response = await callBackend("getTrips", { Limit: 50 });
        state.cache.trips = response.data || [];
        state.activeTrips = state.cache.trips;
        renderTripsTable(state.cache.trips);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-rose-500">فشل جلب البيانات</td></tr>`;
        console.error("loadTripsData Error:", err);
    }
}

function renderTripsTable(trips) {
    const tbody = document.getElementById("table-trips-body");
    if (!tbody) return;

    const fragment = document.createDocumentFragment();
    const validTrips = trips.filter(t => t[0] && t[0] !== "Trip_ID" && !(t[13] === true || t[13] === "TRUE"));

    if (validTrips.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-muted">لا يوجد رحلات</td></tr>`;
        return;
    }

    validTrips.forEach(trip => {
        const tripId = trip[0];
        const status = trip[7] || "OPEN";
        const currentVersion = trip[12] || 1;
        const role = state.user.role;

        let badgeClass = "badge badge-pending";
        let statusLabel = status;
        if (status === "OPEN") { badgeClass = "badge badge-open"; statusLabel = "مفتوحة"; }
        if (status === "CLOSED") { badgeClass = "badge badge-closed"; statusLabel = "مغلقة"; }

        let actionButtons = "";
        if (status === "OPEN") {
            const canEdit = ["Operations", "Admin", "Manager"].includes(role);
            const canSettle = ["Accountant", "Admin", "Manager"].includes(role);
            if (canEdit) {
                actionButtons += `<button onclick="editTrip('${tripId}')" class="px-2 py-1 text-xs bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition"><i class="fa-solid fa-pen ml-1"></i> تعديل</button> `;
            }
            if (canSettle) {
                actionButtons += `<button onclick="triggerSettlement('${tripId}', ${currentVersion})" class="px-2 py-1 text-xs bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500 hover:text-slate-950 font-medium transition active:scale-95"><i class="fa-solid fa-circle-check ml-1"></i> تصفية وإغلاق</button>`;
            }
            if (!actionButtons) {
                actionButtons = `<span class="text-xs text-muted">—</span>`;
            }
        } else {
            actionButtons = `<span class="badge badge-closed"><i class="fa-solid fa-lock text-[10px]"></i> مغلقة</span>`;
        }

        const row = document.createElement("tr");
        row.className = "table-row hover:bg-hover transition";
        row.innerHTML = `
            <td class="p-4 font-mono text-xs text-muted">${tripId}</td>
            <td class="p-4 font-medium">${lookupDriverName(trip[3])}</td>
            <td class="p-4 text-xs">${lookupVehicleLabel(trip[4])}</td>
            <td class="p-4 font-mono text-xs text-amber-400">${parseFloat(trip[14] || 0).toFixed(1)} لتر</td>
            <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold ${badgeClass}">${statusLabel}</span></td>
            <td class="p-4 text-center">${actionButtons}</td>
        `;
        fragment.appendChild(row);
    });

    tbody.innerHTML = "";
    tbody.appendChild(fragment);
    reapplyTableFilter('table-trips-body');
}

window.editTrip = async function(tripId) {
    const trip = (state.cache.trips || []).find(t => t[0] === tripId);
    if (!trip) {
        Swal.fire({ icon: 'error', title: 'غير موجود', text: 'الرحلة غير موجودة' });
        return;
    }

    const { value: formValues } = await Swal.fire({
        title: 'تعديل الرحلة',
        html: `
            <div class="text-right">
                <label class="block text-sm font-medium mb-1">خط السير</label>
                <input id="edit-trip-route" class="swal2-input w-full" value="${trip[5] || ''}">
                <label class="block text-sm font-medium mb-1 mt-3">العهدة (ج.م)</label>
                <input id="edit-trip-advance" class="swal2-input w-full" type="number" step="0.01" value="${trip[6] || 0}">
                <label class="block text-sm font-medium mb-1 mt-3">لترات الجاز</label>
                <input id="edit-trip-fuel" class="swal2-input w-full" type="number" step="0.1" value="${trip[14] || 0}">
                <label class="block text-sm font-medium mb-1 mt-3">سعر اللتر</label>
                <input id="edit-trip-price" class="swal2-input w-full" type="number" step="0.01" value="${trip[20] || 0}">
                <p class="text-xs text-muted mt-2">⚠️ النسخة الحالية: ${trip[12] || 1}</p>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'حفظ',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            return {
                Trip_ID: tripId,
                Route: document.getElementById('edit-trip-route').value,
                Advance_Cash: document.getElementById('edit-trip-advance').value,
                Fuel_Liters: document.getElementById('edit-trip-fuel').value,
                Fuel_Price: document.getElementById('edit-trip-price').value,
                Version_Number: trip[12] || 1
            };
        }
    });

    if (formValues) {
        try {
            const response = await callBackend("updateTrip", formValues);
            Swal.fire({ icon: 'success', title: 'تم التحديث', text: response.message || 'تم تحديث الرحلة بنجاح', timer: 2000, showConfirmButton: false });
            loadTripsData(true);
            refreshDashboard();
        } catch (err) {
            handleStandardError(err);
        }
    }
};

// فئات المصروفات (نفس فئات شاشة المصروفات) — "بنزين / سولار" = جاز طريق (يحتاج لترات)
const SETTLE_EXPENSE_CATEGORIES = ["بنزين / سولار", "كارتة طرق", "صيانة", "إكراميات", "مبيت ومأكل", "أخرى"];
const ROAD_FUEL_CATEGORY = "بنزين / سولار";

// تصفية وإغلاق الرحلة (خطوة المحاسب): إدخال المصروفات + التصفية على عهدة السائق الفعلية
window.triggerSettlement = async function(tripId, currentVersion) {
    const trip = (state.cache.trips || []).find(t => t[0] === tripId);
    if (!trip) {
        Swal.fire({ icon: 'error', title: 'غير موجود', text: 'الرحلة غير موجودة' });
        return;
    }

    const driverId = trip[3];
    const vehicleId = trip[4];
    const fuelPrice = parseFloat(trip[20] || 0);

    // جلب عهدة السائق الحالية (المبلغ اللي ماسكه فعلًا، شامل المترحّل)
    Swal.fire({ title: 'جاري تحميل بيانات العهدة...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    let custody = 0;
    let driverName = lookupDriverName(driverId);
    try {
        const res = await callBackend("getDriversList");
        const drv = (res?.data || []).find(d => d.driver_id === driverId);
        custody = drv ? (parseFloat(drv.current_advance) || 0) : 0;
        if (drv && drv.full_name) driverName = drv.full_name;
    } catch (err) {
        Swal.close();
        handleStandardError(err);
        return;
    }

    const catOptions = SETTLE_EXPENSE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join("");

    const result = await Swal.fire({
        title: `تصفية وإغلاق الرحلة ${tripId}`,
        width: 600,
        html: `
            <div class="text-right" style="line-height:1.9;font-size:14px">
                <div>السائق: <b>${driverName}</b></div>
                <div>العهدة الحالية مع السائق: <b id="settle-custody" style="color:#0ea5e9">${custody.toFixed(2)} ج.م</b></div>
                <hr style="margin:10px 0">
                <div style="font-weight:bold;margin-bottom:6px">مصاريف الرحلة (سجّلها قبل الإغلاق):</div>
                <div id="settle-rows"></div>
                <button type="button" id="settle-add-row" style="background:#334155;color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer;margin:4px 0">+ إضافة مصروف</button>
                <hr style="margin:10px 0">
                <div>إجمالي المصاريف الجديدة: <b id="settle-newexp">0.00 ج.م</b></div>
                <div>المتبقّي بعد التصفية: <b id="settle-remaining" style="color:#22c55e">${custody.toFixed(2)} ج.م</b></div>
                <hr style="margin:10px 0">
                <label style="display:block;margin-bottom:6px;cursor:pointer"><input type="radio" name="settle-type" value="RETURNED" checked> رجّع المتبقّي للمحاسب (العهدة تبقى صفر)</label>
                <label style="display:block;cursor:pointer"><input type="radio" name="settle-type" value="CARRIED_OVER"> ترحيل المتبقّي مع السائق للرحلة الجاية</label>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'تأكيد الإغلاق',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#22c55e',
        cancelButtonColor: '#334155',
        didOpen: () => {
            const rowsBox = document.getElementById("settle-rows");

            const recalc = () => {
                let newExp = 0;
                rowsBox.querySelectorAll(".settle-row").forEach(r => {
                    newExp += parseFloat(r.querySelector(".r-amt").value) || 0;
                });
                const rem = custody - newExp;
                document.getElementById("settle-newexp").innerText = newExp.toFixed(2) + " ج.م";
                const remEl = document.getElementById("settle-remaining");
                remEl.innerText = rem.toFixed(2) + " ج.م";
                remEl.style.color = rem < 0 ? "#ef4444" : "#22c55e";
            };

            const addRow = () => {
                const div = document.createElement("div");
                div.className = "settle-row";
                div.style.cssText = "display:flex;gap:6px;margin-bottom:6px;align-items:center";
                div.innerHTML = `
                    <select class="r-cat" style="flex:1;padding:6px;border-radius:8px;border:1px solid #cbd5e1">${catOptions}</select>
                    <input class="r-amt" type="number" step="0.01" min="0" placeholder="المبلغ" style="width:90px;padding:6px;border-radius:8px;border:1px solid #cbd5e1">
                    <input class="r-lit" type="number" step="0.1" min="0" placeholder="لتر" style="width:64px;padding:6px;border-radius:8px;border:1px solid #cbd5e1;display:none">
                    <button type="button" class="r-del" style="color:#ef4444;border:none;background:none;font-size:20px;cursor:pointer">&times;</button>
                `;
                rowsBox.appendChild(div);

                const catSel = div.querySelector(".r-cat");
                const litInp = div.querySelector(".r-lit");
                const toggleLit = () => { litInp.style.display = (catSel.value === ROAD_FUEL_CATEGORY) ? "" : "none"; };
                toggleLit();
                catSel.addEventListener("change", toggleLit);
                div.querySelector(".r-amt").addEventListener("input", recalc);
                div.querySelector(".r-del").addEventListener("click", () => { div.remove(); recalc(); });
            };

            document.getElementById("settle-add-row").addEventListener("click", addRow);
        },
        preConfirm: () => {
            const rows = [];
            let invalid = false;
            document.querySelectorAll("#settle-rows .settle-row").forEach(r => {
                const category = r.querySelector(".r-cat").value;
                const amount = parseFloat(r.querySelector(".r-amt").value) || 0;
                const liters = parseFloat(r.querySelector(".r-lit").value) || 0;
                if (amount <= 0) { invalid = true; return; }
                rows.push({ category, amount, liters });
            });
            if (invalid) {
                Swal.showValidationMessage("كل مصروف لازم يكون مبلغه أكبر من صفر (أو احذف الصف الفاضي)");
                return false;
            }
            const sel = document.querySelector('input[name="settle-type"]:checked');
            return { rows, settlementType: sel ? sel.value : 'RETURNED' };
        }
    });

    if (!result.isConfirmed || !result.value) return;
    const { rows, settlementType } = result.value;

    Swal.fire({ title: 'جاري التسجيل والإغلاق...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        // 1) تسجيل المصاريف الجديدة (كل مصروف بيتخصم من عهدة السائق)
        for (const row of rows) {
            await callBackend("addExpense", {
                Trip_ID: tripId,
                Driver_ID: driverId,
                Vehicle_ID: vehicleId,
                Expense_Category: row.category,
                Amount: row.amount,
                Fuel_Liters: row.liters || 0,
                Fuel_Price: fuelPrice
            });
        }

        // 2) التصفية والإغلاق على العهدة الفعلية المتبقّية
        const response = await callBackend("settleTripFinancials", {
            Trip_ID: tripId,
            Settlement_Type: settlementType,
            Version_Number: currentVersion
        });

        const dd = response?.data || {};
        Swal.fire({
            icon: 'success',
            title: 'تمت التصفية والإغلاق',
            html: `المتبقّي: <b>${(dd.remaining_advance ?? 0)} ج.م</b><br>${settlementType === "RETURNED" ? "رجع للمحاسب" : "اترحّل مع السائق"}`,
            timer: 2600,
            showConfirmButton: false
        });
        loadTripsData(true);
        refreshDashboard();
    } catch (err) {
        handleStandardError(err);
    }
};

// ─── 5️⃣-هـ: إنشاء رحلة ───
async function handleCreateTripSubmit(e) {
    e.preventDefault();
    const submitBtn = document.getElementById("btn-trip-submit");

    // ✅ validation
    const customer = document.getElementById("trip-customer-id")?.value;
    const driver = document.getElementById("trip-driver-id")?.value;
    const vehicle = document.getElementById("trip-vehicle-id")?.value;
    const route = document.getElementById("trip-route")?.value.trim();
    if (!customer || !driver || !vehicle || !route) {
        Swal.fire({ icon: 'warning', title: 'بيانات ناقصة', text: 'الرجاء اختيار العميل والسائق والعربية وكتابة خط السير.' });
        return;
    }
    const liters = parseFloat(document.getElementById("trip-fuel-liters")?.value) || 0;
    const price = parseFloat(document.getElementById("trip-fuel-price")?.value) || 0;
    if (liters <= 0 || price <= 0) {
        Swal.fire({ icon: 'warning', title: 'بيانات غير صحيحة', text: 'لترات الجاز وسعر اللتر يجب أن يكونا أكبر من صفر.' });
        return;
    }

    setButtonLoading(submitBtn, true, "جاري البث...");

    const params = {
        Customer_ID: customer,
        Driver_ID: driver,
        Vehicle_ID: vehicle,
        Route: route,
        Advance_Cash: parseFloat(document.getElementById("trip-advance-cash")?.value) || 0,
        Fuel_Liters: liters,
        Fuel_Price: price
    };

    try {
        const response = await callBackend("createTrip", params);
        Swal.fire({ icon: 'success', title: 'تم البث', text: `المعرف: ${response.trip_id}` });
        document.getElementById("form-create-trip").reset();
        loadTripsData(true);
        refreshDashboard();
    } catch (err) {
        handleStandardError(err);
    } finally {
        setButtonLoading(submitBtn, false, '<i class="fa-solid fa-paper-plane ml-1"></i> بث أمر الرحلة');
    }
}

// ─── 5️⃣-و: المصروفات ───
// ─── 5️⃣-و: تحميل المصروفات ───
let expensesCache = null;
async function loadExpensesData(forceRefresh = false) {
    const tbody = document.getElementById("table-expenses-body");
    if (!tbody) return;

    if (!forceRefresh && expensesCache) {
        renderExpensesTable(expensesCache);
        return;
    }

    tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-muted"><i class="fa-solid fa-spinner fa-spin ml-2"></i>جاري التحميل...</td></tr>`;

    try {
        const res = await callBackend("getExpenses", { Limit: 500 });
        const expenses = res?.data || [];
        expensesCache = expenses;
        
        // جلب monthly summary
        const monthlyRes = await callBackend("getMonthlyExpenses");
        const monthly = monthlyRes?.data;
        if (monthly) {
            animateCounter(document.getElementById("exp-summary-total"), monthly.total || 0, ' ج.م');
            
            let utilitiesTotal = 0, rentTotal = 0, otherTotal = 0;
            (monthly.expenses || []).forEach(ex => {
                if (ex.category === "كهرباء" || ex.category === "مياه" || ex.category === "نت") utilitiesTotal += ex.amount;
                else if (ex.category === "إيجار") rentTotal += ex.amount;
                else otherTotal += ex.amount;
            });
            animateCounter(document.getElementById("exp-summary-utilities"), utilitiesTotal, ' ج.م');
            animateCounter(document.getElementById("exp-summary-rent"), rentTotal, ' ج.م');
            animateCounter(document.getElementById("exp-summary-other"), otherTotal, ' ج.م');
        }
        
        renderExpensesTable(expenses);
        
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-rose-400">فشل التحميل</td></tr>`;
        handleStandardError(err);
    }
}

function renderExpensesTable(expenses) {
    const tbody = document.getElementById("table-expenses-body");
    const countEl = document.getElementById("exp-table-count");
    if (!tbody) return;
    
    const catFilter = document.getElementById("filter-expense-category")?.value;
    const searchQuery = (document.getElementById("search-expenses")?.value || "").toLowerCase();
    
    let filtered = expenses;
    if (catFilter) filtered = filtered.filter(e => e.category === catFilter);
    if (searchQuery) {
        filtered = filtered.filter(e =>
            (e.category || "").toLowerCase().includes(searchQuery) ||
            (e.description || "").toLowerCase().includes(searchQuery) ||
            (e.amount || "").toString().includes(searchQuery)
        );
    }
    
    if (countEl) countEl.innerText = `${filtered.length} مصروف`;
    
    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-muted">لا توجد مصروفات</td></tr>';
        return;
    }
    
    tbody.innerHTML = filtered.map(ex => {
        const isOwner = state.user.id === ex.created_by;
        const showActions = state.user.role === "Admin" || state.user.role === "Manager" || isOwner;
        const hasReceipt = ex.receipt_file_id && ex.receipt_file_id !== "0" && ex.receipt_file_id !== "";
        return `
            <tr class="border-b border-border hover:bg-secondary/20 transition">
                <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded-full text-[10px] ${getCategoryBadge(ex.category)}">${ex.category}</span></td>
                <td class="py-2.5 px-3 text-muted max-w-[200px] truncate" title="${ex.description || ''}">${ex.description || '<span class="text-muted/50">—</span>'}</td>
                <td class="py-2.5 px-3 font-mono font-bold">${(ex.amount || 0).toLocaleString()} ج.م</td>
                <td class="py-2.5 px-3">${hasReceipt ? `<a href="https://drive.google.com/file/d/${ex.receipt_file_id}/view" target="_blank" class="text-sky-400 hover:text-sky-300" title="عرض الإيصال"><i class="fa-solid fa-image"></i></a>` : '<span class="text-muted/50">—</span>'}</td>
                <td class="py-2.5 px-3 text-muted text-[10px]">${formatDate(ex.created_at)}</td>
                <td class="py-2.5 px-3 text-center">
                    ${showActions ? `
                        <button class="text-amber-400 hover:text-amber-300 mx-1 edit-expense-btn" data-id="${ex.expense_id}" title="تعديل"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button class="text-rose-400 hover:text-rose-300 mx-1 delete-expense-btn" data-id="${ex.expense_id}" title="حذف"><i class="fa-solid fa-trash-can"></i></button>
                    ` : ''}
                </td>
            </tr>
        `;
    }).join('');
    
    tbody.querySelectorAll(".edit-expense-btn").forEach(btn => {
        btn.addEventListener("click", () => handleExpenseEdit(btn.dataset.id));
    });
    tbody.querySelectorAll(".delete-expense-btn").forEach(btn => {
        btn.addEventListener("click", () => handleExpenseDelete(btn.dataset.id));
    });
}

function getCategoryBadge(cat) {
    const map = {
        "كهرباء": "bg-yellow-500/10 text-yellow-400",
        "مياه": "bg-sky-500/10 text-sky-400",
        "نت": "bg-violet-500/10 text-violet-400",
        "إيجار": "bg-orange-500/10 text-orange-400",
        "أدوات نظافة": "bg-emerald-500/10 text-emerald-400",
        "قرطاسية": "bg-pink-500/10 text-pink-400",
        "صيانة مكتب": "bg-purple-500/10 text-purple-400",
    };
    return map[cat] || "bg-rose-500/10 text-rose-400";
}

function formatDate(iso) {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        return d.toLocaleDateString('ar-EG', { day: '2-digit', month: '2-digit' });
    } catch { return iso; }
}

function cancelExpenseEdit() {
    document.getElementById("expense-edit-id").value = "";
    document.getElementById("form-add-expense").reset();
    document.getElementById("expense-file-base64").value = "";
    document.getElementById("expense-file-name").value = "";
    document.getElementById("btn-expense-cancel-edit").classList.add("hidden");
    document.getElementById("btn-expense-submit").innerHTML = '<i class="fa-solid fa-cloud-arrow-up ml-1"></i> حفظ المصروف';
}

async function handleExpenseEdit(expenseId) {
    const expense = (expensesCache || []).find(e => e.expense_id === expenseId);
    if (!expense) {
        Swal.fire({ icon: 'error', title: 'خطأ', text: 'لم يتم العثور على المصروف.' });
        return;
    }
    
    document.getElementById("expense-edit-id").value = expenseId;
    document.getElementById("expense-category").value = expense.category || '';
    document.getElementById("expense-description").value = expense.description || '';
    document.getElementById("expense-amount").value = expense.amount || 0;
    
    document.getElementById("btn-expense-cancel-edit").classList.remove("hidden");
    document.getElementById("btn-expense-submit").innerHTML = '<i class="fa-solid fa-pen ml-1"></i> تحديث المصروف';
    
    document.querySelector("#view-expenses .card").scrollIntoView({ behavior: 'smooth' });
}

async function handleExpenseDelete(expenseId) {
    const confirm = await Swal.fire({
        title: 'حذف المصروف؟',
        text: 'لا يمكن التراجع عن هذا الإجراء.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'حذف',
        cancelButtonText: 'إلغاء'
    });
    if (!confirm.isConfirmed) return;
    
    try {
        await callBackend("deleteExpense", { Expense_ID: expenseId });
        Swal.fire({ icon: 'success', title: 'تم الحذف', timer: 1500, showConfirmButton: false });
        loadExpensesData(true);
        refreshDashboard();
    } catch (err) {
        handleStandardError(err);
    }
}

async function handleAddExpenseSubmit(e) {
    e.preventDefault();
    const submitBtn = document.getElementById("btn-expense-submit");

    // ✅ validation
    const category = document.getElementById("expense-category")?.value;
    const description = document.getElementById("expense-description")?.value.trim();
    const amount = parseFloat(document.getElementById("expense-amount")?.value) || 0;
    if (!category || amount <= 0) {
        Swal.fire({ icon: 'warning', title: 'بيانات ناقصة', text: 'الرجاء إدخال النوع والمبلغ.' });
        return;
    }

    setButtonLoading(submitBtn, true, "جاري الحفظ...");

    const base64Payload = document.getElementById("expense-file-base64")?.value || "";
    const fileNamePayload = document.getElementById("expense-file-name")?.value || "";

    const params = {
        Expense_Category: category,
        Description: description,
        Amount: amount,
        bodyPayload: {
            Receipt_File_Base64: base64Payload,
            File_Name: fileNamePayload
        }
    };

    try {
        const editId = document.getElementById("expense-edit-id")?.value;
        if (editId) {
            params.Expense_ID = editId;
            await callBackend("updateExpense", params);
            Swal.fire({ icon: 'success', title: 'تم التحديث', timer: 1500, showConfirmButton: false });
            cancelExpenseEdit();
        } else {
            await callBackend("addExpense", params);
            Swal.fire({ icon: 'success', title: 'تم الحفظ', timer: 1500, showConfirmButton: false });
            document.getElementById("form-add-expense").reset();
            document.getElementById("expense-file-base64").value = "";
            document.getElementById("expense-file-name").value = "";
        }
        loadExpensesData(true);
        refreshDashboard();
    } catch (err) {
        handleStandardError(err);
    } finally {
        setButtonLoading(submitBtn, false, '<i class="fa-solid fa-cloud-arrow-up ml-1"></i> حفظ المصروف');
    }
}

function handleFileProcessing(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
        Swal.fire({ icon: 'error', title: 'حجم الملف ضخم', text: 'الرجاء رفع ملف أقل من 4 ميجابايت.' });
        e.target.value = "";
        return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
        const rawBase64 = event.target.result.split(',')[1];
        document.getElementById("expense-file-base64").value = rawBase64;
        document.getElementById("expense-file-name").value = `Receipt_${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    };
    reader.readAsDataURL(file);
}

// ─── 5️⃣-ز: البنزينة ───
async function loadFuelData() {
    try {
        const response = await callBackend("getFuelBalance");
        if (response && response.data) {
            animateCounter(document.getElementById("fuel-current-balance"), response.data.current_balance || 0, ' ج.م');
            animateCounter(document.getElementById("fuel-current-price"), response.data.fuel_price_per_liter || 0, ' ج.م');
            document.getElementById("fuel-last-updated").innerText = response.data.last_updated ? new Date(response.data.last_updated).toLocaleString('ar-EG') : "--";
        }
        await loadFuelTransactions();
    } catch (err) {
        handleStandardError(err);
    }
}

async function loadFuelTransactions() {
    // Show loading in both tables
    const loadingRow = `<tr><td colspan="6" class="p-8 text-center text-muted"><i class="fa-solid fa-spinner fa-spin ml-2"></i>جاري التحميل...</td></tr>`;
    const tb1 = document.getElementById("table-fuel-transactions");
    const tb2 = document.getElementById("table-fuel-body");
    if (tb1) tb1.innerHTML = loadingRow;
    if (tb2) tb2.innerHTML = loadingRow;
    if (!tb1 && !tb2) return;

    try {
        const response = await callBackend("getFuelTransactions", { Limit: 20 });
        if (response && response.data) {
            state.fuelTransactions = response.data;
            renderFuelTransactions(response.data);
        }
    } catch (err) {
        const errRow = `<tr><td colspan="6" class="p-8 text-center text-rose-500">فشل جلب البيانات</td></tr>`;
        if (tb1) tb1.innerHTML = errRow;
        if (tb2) tb2.innerHTML = errRow;
    }
}

function renderFuelTransactions(transactions) {
    const tbodies = [
        document.getElementById("table-fuel-transactions"),
        document.getElementById("table-fuel-body")
    ].filter(Boolean);

    if (tbodies.length === 0) return;

    const emptyRow = `<tr><td colspan="6" class="p-8 text-center text-muted">لا توجد حركات</td></tr>`;

    if (!transactions || transactions.length === 0) {
        tbodies.forEach(tb => { tb.innerHTML = emptyRow; });
        return;
    }

    const typeMap = {
        'ADD': '➕ إضافة',
        'INITIAL': '⛽ بداية رحلة',
        'ROAD': '🛣️ جاز طريق'
    };

    const fragment1 = document.createDocumentFragment();
    const fragment2 = document.createDocumentFragment();

    transactions.forEach(t => {
        const cells = `
            <td class="p-3 text-xs">${t.created_at ? new Date(t.created_at).toLocaleString('ar-EG') : ''}</td>
            <td class="p-3 text-xs">${t.vehicle_id || '--'}</td>
            <td class="p-3 text-xs">${typeMap[t.transaction_type] || t.transaction_type}</td>
            <td class="p-3 text-xs">${t.amount_liters || 0}</td>
            <td class="p-3 text-xs ${t.amount_egp < 0 ? 'text-rose-400' : 'text-emerald-400'}">${t.amount_egp || 0}</td>
            <td class="p-3 text-xs">${t.source || '--'}</td>
        `;
        const row1 = document.createElement("tr");
        row1.className = "table-row hover:bg-hover transition";
        row1.innerHTML = cells;
        fragment1.appendChild(row1);

        const row2 = document.createElement("tr");
        row2.className = "table-row hover:bg-hover transition";
        row2.innerHTML = cells;
        fragment2.appendChild(row2);
    });

    tbodies.forEach(tb => { tb.innerHTML = ""; });
    if (tbodies[0]) tbodies[0].appendChild(fragment1);
    if (tbodies[1]) tbodies[1].appendChild(fragment2);
    reapplyTableFilter('table-fuel-body');
    reapplyTableFilter('table-fuel-transactions');
}

// ─── 5️⃣-ي: الصيانة ───
async function loadMaintenanceData(forceRefresh = false) {
    const tbody = document.getElementById("table-maintenance-body");
    if (!tbody) return;

    if (!forceRefresh && state.cache.maintenance) {
        renderMaintenanceTable(state.cache.maintenance);
        return;
    }

    tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-muted"><i class="fa-solid fa-spinner fa-spin ml-2"></i>جاري التحميل...</td></tr>';

    try {
        const res = await callBackend("getMaintenance", { Limit: 100 });
        const data = res?.data || [];
        state.cache.maintenance = data;

        // ملء فلتر العربيات
        const filterEl = document.getElementById("filter-maintenance-vehicle");
        const vehicleIds = [...new Set(data.map(r => r.vehicle_id).filter(Boolean))];
        filterEl.innerHTML = '<option value="">كل العربيات</option>' +
            vehicleIds.map(v => `<option value="${v}">${v}</option>`).join('');

        renderMaintenanceTable(data);
    } catch (err) {
        handleStandardError(err);
        tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-rose-400">فشل تحميل بيانات الصيانة.</td></tr>';
    }
}

function renderMaintenanceTable(data) {
    const tbody = document.getElementById("table-maintenance-body");
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-muted"><i class="fa-solid fa-circle-check ml-2 text-emerald-400"></i>لا توجد صيانات مسجلة.</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment();
    data.forEach(r => {
        const row = document.createElement("tr");
        row.className = "table-row hover:bg-hover transition";
        row.innerHTML = `
            <td class="p-3 text-xs">${r.created_at ? new Date(r.created_at).toLocaleString('ar-EG') : '--'}</td>
            <td class="p-3 text-xs font-medium">${r.vehicle_id || '--'}</td>
            <td class="p-3 text-xs">${r.trip_id || '--'}</td>
            <td class="p-3 text-xs"><span class="badge badge-open">${r.maintenance_type || '--'}</span></td>
            <td class="p-3 text-xs text-rose-400 font-mono">${r.amount || 0} ج.م</td>
            <td class="p-3 text-xs">${r.workshop || '--'}</td>
            <td class="p-3 text-xs">${r.odometer || '--'}</td>
        `;
        fragment.appendChild(row);
    });

    tbody.innerHTML = "";
    tbody.appendChild(fragment);
    reapplyTableFilter('table-maintenance-body');
}

// ─── بناء بيانات شارت البنزينة (دائري حسب العربية) ───
function buildFuelChartData(transactions) {
    let byVehicle = {};
    let vehicleLabels = {};

    for (let t of transactions) {
        let lts = parseFloat(t.amount_liters) || 0;
        if (lts <= 0) continue;
        let vid = t.vehicle_id || 'غير معروف';
        if (!byVehicle[vid]) { byVehicle[vid] = 0; }
        byVehicle[vid] += lts;
        vehicleLabels[vid] = vid;
    }

    // نرتب تنازلي وناخد أول 6
    let sorted = Object.entries(byVehicle).sort((a, b) => b[1] - a[1]);
    let labels = [];
    let values = [];
    let others = 0;
    sorted.forEach(([vid, sum], i) => {
        if (i < 5) { labels.push(vid); values.push(sum); }
        else { others += sum; }
    });
    if (others > 0) { labels.push('باقي'); values.push(others); }

    return { labels, values };
}

// ─── 5️⃣-ز1: الرسوم البيانية (Chart.js) ───
function renderCharts(expensesData, fuelData) {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const gridColor = isDark ? 'rgba(148,163,184,0.1)' : 'rgba(0,0,0,0.06)';
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const orange = '#f97316';
    const green = '#10b981';

    // Expense chart (bar — حسب التصنيف)
    const expCtx = document.getElementById('chart-expenses');
    if (expCtx) {
        if (chartExpenses) chartExpenses.destroy();

        // حساب المجموع لكل تصنيف من المصروفات الفعلية
        let جاز = 0, صيانة = 0, شركة = 0;
        const expenses = expensesData?.expenses || [];
        for (const ex of expenses) {
            const cat = (ex.category || '').trim();
            const amt = parseFloat(ex.amount) || 0;
            if (cat === "بنزين / سولار") {
                جاز += amt;
            } else if (cat === "صيانة") {
                صيانة += amt;
            } else {
                شركة += amt;
            }
        }

        const labels = ['الجاز', 'الصيانة', 'شركة'];
        const values = [جاز, صيانة, شركة];
        const brandOrange = '#ff6b00';
        const bgColors = [
            'rgba(255,107,0,0.75)',
            'rgba(255,107,0,0.5)',
            'rgba(255,107,0,0.2)',
        ];

        chartExpenses = new Chart(expCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'ج.م',
                    data: values,
                    backgroundColor: bgColors,
                    borderColor: bgColors.map(() => brandOrange),
                    borderWidth: 1,
                    borderRadius: 6,
                    barPercentage: 0.6,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ctx.parsed.y.toLocaleString() + ' ج.م'
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: textColor, font: { size: 10 } }
                    },
                    y: {
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { size: 10 }, callback: v => v.toLocaleString() + ' ج.م' }
                    }
                }
            }
        });
    }

    // Fuel chart (doughnut — حسب العربية)
    const fuelCtx = document.getElementById('chart-fuel');
    if (fuelCtx) {
        if (chartBalance) chartBalance.destroy();
        const labels = fuelData?.labels?.length ? fuelData.labels : ['لا توجد بيانات'];
        const values = fuelData?.values?.length ? fuelData.values : [1];
        const colors = ['#10b981','#f59e0b','#f97316','#3b82f6','#8b5cf6','#64748b'];
        chartBalance = new Chart(fuelCtx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 0,
                    hoverOffset: 6,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: textColor, font: { size: 10 }, padding: 8 }
                    }
                }
            }
        });
    }
}

document.addEventListener("themeChanged", function() {
    const expData = window._lastExpensesData;
    const fuelData = window._lastFuelData;
    if (expData || fuelData) renderCharts(expData, fuelData);
});

async function handleAddFuelBalance() {
    const { value: amount } = await Swal.fire({
        title: 'إضافة رصيد للبنزينة',
        input: 'number',
        inputLabel: 'المبلغ (ج.م)',
        inputPlaceholder: '0.00',
        inputAttributes: { min: '0.01', step: '0.01' },
        showCancelButton: true,
        confirmButtonText: 'إضافة',
        cancelButtonText: 'إلغاء'
    });

    if (amount && parseFloat(amount) > 0) {
        try {
            const response = await callBackend("addFuelBalance", { Amount: amount });
            Swal.fire({ icon: 'success', title: 'تم الإضافة', text: response.message, timer: 2000, showConfirmButton: false });
            loadFuelData();
            refreshDashboard();
        } catch (err) {
            handleStandardError(err);
        }
    }
}

async function handleUpdateFuelPrice() {
    const { value: price } = await Swal.fire({
        title: 'تغيير سعر اللتر',
        input: 'number',
        inputLabel: 'سعر اللتر الجديد (ج.م)',
        inputPlaceholder: '0.00',
        inputAttributes: { min: '0.01', step: '0.01' },
        showCancelButton: true,
        confirmButtonText: 'تحديث',
        cancelButtonText: 'إلغاء'
    });

    if (price && parseFloat(price) > 0) {
        try {
            const response = await callBackend("updateFuelPrice", { Fuel_Price: price });
            Swal.fire({ icon: 'success', title: 'تم التحديث', text: response.message, timer: 2000, showConfirmButton: false });
            loadFuelData();
        } catch (err) {
            handleStandardError(err);
        }
    }
}

// ─── 5️⃣-ح: العربيات ───
async function loadVehiclesData(forceRefresh = false) {
    const tbody = document.getElementById("table-vehicles-body");
    if (!tbody) return;

    if (!forceRefresh && state.cache.vehicles) {
        renderVehiclesTable(state.cache.vehicles);
        return;
    }

    tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-muted"><i class="fa-solid fa-spinner fa-spin ml-2"></i>جاري التحميل...</td></tr>`;

    try {
        const response = await callBackend("getVehicles");
        state.cache.vehicles = response.data || [];
        renderVehiclesTable(state.cache.vehicles);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-rose-500">فشل جلب البيانات</td></tr>`;
        console.error("loadVehiclesData Error:", err);
    }
}

function renderVehiclesTable(vehicles) {
    const tbody = document.getElementById("table-vehicles-body");
    if (!tbody) return;

    const fragment = document.createDocumentFragment();

    if (!vehicles || vehicles.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-muted">لا توجد عربيات</td></tr>`;
        return;
    }

    vehicles.forEach(v => {
        const row = document.createElement("tr");
        row.className = "table-row hover:bg-hover transition";
        const isExpired = v.license_expiry && new Date(v.license_expiry) < new Date();
        row.innerHTML = `
            <td class="p-4 text-xs font-mono">${v.vehicle_id}</td>
            <td class="p-4 font-medium">${v.plate_number}</td>
            <td class="p-4 text-xs">${v.model}</td>
            <td class="p-4 text-xs">${v.type || '--'}</td>
            <td class="p-4 text-xs ${isExpired ? 'text-rose-400' : 'text-emerald-400'}">${v.license_expiry || '--'}</td>
            <td class="p-4 text-center">
                <button onclick="editVehicle('${v.vehicle_id}')" class="px-2 py-1 text-xs bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition"><i class="fa-solid fa-pen ml-1"></i> تعديل</button>
                <button onclick="deleteVehicle('${v.vehicle_id}')" class="px-2 py-1 text-xs bg-rose-500/20 text-rose-400 rounded-lg hover:bg-rose-500/30 transition"><i class="fa-solid fa-trash ml-1"></i> حذف</button>
            </td>
        `;
        fragment.appendChild(row);
    });

    tbody.innerHTML = "";
    tbody.appendChild(fragment);
    reapplyTableFilter('table-vehicles-body');
}

async function handleAddVehicle() {
    const { value: formValues } = await Swal.fire({
        title: 'إضافة عربية جديدة',
        html: `
            <div class="text-right">
                <label class="block text-sm font-medium mb-1">رقم اللوحة *</label>
                <input id="vehicle-plate" class="swal2-input w-full" placeholder="مثال: ق أ ج 1234">
                <label class="block text-sm font-medium mb-1 mt-3">الموديل *</label>
                <input id="vehicle-model" class="swal2-input w-full" placeholder="مثال: مرسيدس 2020">
                <label class="block text-sm font-medium mb-1 mt-3">النوع</label>
                <input id="vehicle-type" class="swal2-input w-full" placeholder="نقل / ركاب">
                <label class="block text-sm font-medium mb-1 mt-3">الحمولة (طن)</label>
                <input id="vehicle-load" class="swal2-input w-full" placeholder="20">
                <label class="block text-sm font-medium mb-1 mt-3">تاريخ انتهاء الرخصة</label>
                <input id="vehicle-license" class="swal2-input w-full" type="date">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'إضافة',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            return {
                Plate_Number: document.getElementById('vehicle-plate').value,
                Model: document.getElementById('vehicle-model').value,
                Type: document.getElementById('vehicle-type').value,
                Load_Capacity: document.getElementById('vehicle-load').value,
                License_Expiry: document.getElementById('vehicle-license').value
            };
        }
    });

    if (formValues && formValues.Plate_Number && formValues.Model) {
        try {
            await callBackend("createVehicle", formValues);
            Swal.fire({ icon: 'success', title: 'تمت الإضافة', timer: 1500, showConfirmButton: false });
            loadVehiclesData(true);
        } catch (err) {
            handleStandardError(err);
        }
    }
}

window.editVehicle = async function(vehicleId) {
    const vehicle = (state.cache.vehicles || []).find(v => v.vehicle_id === vehicleId);
    if (!vehicle) return;

    const { value: formValues } = await Swal.fire({
        title: 'تعديل العربية',
        html: `
            <div class="text-right">
                <label class="block text-sm font-medium mb-1">رقم اللوحة</label>
                <input id="edit-vehicle-plate" class="swal2-input w-full" value="${vehicle.plate_number || ''}">
                <label class="block text-sm font-medium mb-1 mt-3">الموديل</label>
                <input id="edit-vehicle-model" class="swal2-input w-full" value="${vehicle.model || ''}">
                <label class="block text-sm font-medium mb-1 mt-3">النوع</label>
                <input id="edit-vehicle-type" class="swal2-input w-full" value="${vehicle.type || ''}">
                <label class="block text-sm font-medium mb-1 mt-3">الحمولة (طن)</label>
                <input id="edit-vehicle-load" class="swal2-input w-full" value="${vehicle.load_capacity || ''}">
                <label class="block text-sm font-medium mb-1 mt-3">تاريخ انتهاء الرخصة</label>
                <input id="edit-vehicle-license" class="swal2-input w-full" type="date" value="${vehicle.license_expiry || ''}">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'حفظ',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            return {
                Vehicle_ID: vehicleId,
                Plate_Number: document.getElementById('edit-vehicle-plate').value,
                Model: document.getElementById('edit-vehicle-model').value,
                Type: document.getElementById('edit-vehicle-type').value,
                Load_Capacity: document.getElementById('edit-vehicle-load').value,
                License_Expiry: document.getElementById('edit-vehicle-license').value
            };
        }
    });

    if (formValues) {
        try {
            await callBackend("updateVehicle", formValues);
            Swal.fire({ icon: 'success', title: 'تم التحديث', timer: 1500, showConfirmButton: false });
            loadVehiclesData(true);
        } catch (err) {
            handleStandardError(err);
        }
    }
};

window.deleteVehicle = async function(vehicleId) {
    const confirm = await Swal.fire({
        title: 'تأكيد الحذف؟',
        text: 'هل أنت متأكد من حذف هذه العربية؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء'
    });
    if (!confirm.isConfirmed) return;

    try {
        await callBackend("deleteVehicle", { Vehicle_ID: vehicleId });
        Swal.fire({ icon: 'success', title: 'تم الحذف', timer: 1500, showConfirmButton: false });
        loadVehiclesData(true);
    } catch (err) {
        handleStandardError(err);
    }
};

// ─── 5️⃣-ط: السائقين ───
async function loadDriversData(forceRefresh = false) {
    const tbody = document.getElementById("table-drivers-body");
    if (!tbody) return;

    if (!forceRefresh && state.cache.drivers) {
        renderDriversTable(state.cache.drivers);
        return;
    }

    tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-muted"><i class="fa-solid fa-spinner fa-spin ml-2"></i>جاري التحميل...</td></tr>`;

    try {
        const response = await callBackend("getDriversList");
        state.cache.drivers = response.data || [];
        renderDriversTable(state.cache.drivers);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-rose-500">فشل جلب البيانات</td></tr>`;
        console.error("loadDriversData Error:", err);
    }
}

function renderDriversTable(drivers) {
    const tbody = document.getElementById("table-drivers-body");
    if (!tbody) return;

    const fragment = document.createDocumentFragment();

    if (!drivers || drivers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-muted">لا يوجد سائقين</td></tr>`;
        return;
    }

    drivers.forEach(d => {
        const row = document.createElement("tr");
        row.className = "table-row hover:bg-hover transition";
        row.innerHTML = `
            <td class="p-4 font-medium">${d.full_name}</td>
            <td class="p-4 text-xs">${d.phone || '--'}</td>
            <td class="p-4 text-xs">${d.license_number || '--'}</td>
            <td class="p-4 text-xs ${d.current_advance > 0 ? 'text-amber-400' : 'text-emerald-400'}">${d.current_advance || 0}</td>
            <td class="p-4 text-center">
                <button onclick="editDriver('${d.driver_id}')" class="px-2 py-1 text-xs bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition"><i class="fa-solid fa-pen ml-1"></i> تعديل</button>
                <button onclick="deleteDriver('${d.driver_id}')" class="px-2 py-1 text-xs bg-rose-500/20 text-rose-400 rounded-lg hover:bg-rose-500/30 transition"><i class="fa-solid fa-trash ml-1"></i> حذف</button>
            </td>
        `;
        fragment.appendChild(row);
    });

    tbody.innerHTML = "";
    tbody.appendChild(fragment);
    reapplyTableFilter('table-drivers-body');
}

async function handleAddDriver() {
    const { value: formValues } = await Swal.fire({
        title: 'إضافة سائق جديد',
        html: `
            <div class="text-right">
                <label class="block text-sm font-medium mb-1">الاسم *</label>
                <input id="driver-name" class="swal2-input w-full" placeholder="محمود سعد">
                <label class="block text-sm font-medium mb-1 mt-3">رقم التليفون *</label>
                <input id="driver-phone" class="swal2-input w-full" placeholder="01000000000">
                <label class="block text-sm font-medium mb-1 mt-3">رقم الرخصة</label>
                <input id="driver-license" class="swal2-input w-full" placeholder="رقم الرخصة">
                <label class="block text-sm font-medium mb-1 mt-3">تاريخ انتهاء الرخصة</label>
                <input id="driver-license-expiry" class="swal2-input w-full" type="date">
                <label class="block text-sm font-medium mb-1 mt-3">الرقم القومي</label>
                <input id="driver-national" class="swal2-input w-full" placeholder="الرقم القومي">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'إضافة',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            return {
                Full_Name: document.getElementById('driver-name').value,
                Phone: document.getElementById('driver-phone').value,
                License_Number: document.getElementById('driver-license').value,
                License_Expiry: document.getElementById('driver-license-expiry').value,
                National_ID: document.getElementById('driver-national').value
            };
        }
    });

    if (formValues && formValues.Full_Name && formValues.Phone) {
        try {
            await callBackend("createDriver", formValues);
            Swal.fire({ icon: 'success', title: 'تمت الإضافة', timer: 1500, showConfirmButton: false });
            loadDriversData(true);
        } catch (err) {
            handleStandardError(err);
        }
    }
}

window.editDriver = async function(driverId) {
    const driver = (state.cache.drivers || []).find(d => d.driver_id === driverId);
    if (!driver) return;

    const { value: formValues } = await Swal.fire({
        title: 'تعديل السائق',
        html: `
            <div class="text-right">
                <label class="block text-sm font-medium mb-1">الاسم</label>
                <input id="edit-driver-name" class="swal2-input w-full" value="${driver.full_name || ''}">
                <label class="block text-sm font-medium mb-1 mt-3">رقم التليفون</label>
                <input id="edit-driver-phone" class="swal2-input w-full" value="${driver.phone || ''}">
                <label class="block text-sm font-medium mb-1 mt-3">رقم الرخصة</label>
                <input id="edit-driver-license" class="swal2-input w-full" value="${driver.license_number || ''}">
                <label class="block text-sm font-medium mb-1 mt-3">تاريخ انتهاء الرخصة</label>
                <input id="edit-driver-license-expiry" class="swal2-input w-full" type="date" value="${driver.license_expiry || ''}">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'حفظ',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            return {
                Driver_ID: driverId,
                Full_Name: document.getElementById('edit-driver-name').value,
                Phone: document.getElementById('edit-driver-phone').value,
                License_Number: document.getElementById('edit-driver-license').value,
                License_Expiry: document.getElementById('edit-driver-license-expiry').value
            };
        }
    });

    if (formValues) {
        try {
            await callBackend("updateDriverData", formValues);
            Swal.fire({ icon: 'success', title: 'تم التحديث', timer: 1500, showConfirmButton: false });
            loadDriversData(true);
        } catch (err) {
            handleStandardError(err);
        }
    }
};

window.deleteDriver = async function(driverId) {
    const confirm = await Swal.fire({
        title: 'تأكيد الحذف؟',
        text: 'هل أنت متأكد من حذف هذا السائق؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء'
    });
    if (!confirm.isConfirmed) return;

    try {
        await callBackend("deleteDriver", { Driver_ID: driverId });
        Swal.fire({ icon: 'success', title: 'تم الحذف', timer: 1500, showConfirmButton: false });
        loadDriversData(true);
    } catch (err) {
        handleStandardError(err);
    }
};

// ─── 5️⃣-ي: العملاء ───
async function loadClientsData(forceRefresh = false) {
    const tbody = document.getElementById("table-clients-body");
    if (!tbody) return;

    if (!forceRefresh && state.cache.clients) {
        renderClientsTable(state.cache.clients);
        return;
    }

    tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-muted"><i class="fa-solid fa-spinner fa-spin ml-2"></i>جاري التحميل...</td></tr>`;

    try {
        const response = await callBackend("getClients");
        state.cache.clients = response.data || [];
        renderClientsTable(state.cache.clients);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-rose-500">فشل جلب البيانات</td></tr>`;
        console.error("loadClientsData Error:", err);
    }
}

function renderClientsTable(clients) {
    const tbody = document.getElementById("table-clients-body");
    if (!tbody) return;

    const fragment = document.createDocumentFragment();

    if (!clients || clients.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-muted">لا يوجد عملاء</td></tr>`;
        return;
    }

    clients.forEach(c => {
        const row = document.createElement("tr");
        row.className = "table-row hover:bg-hover transition";
        row.innerHTML = `
            <td class="p-4 font-medium">${c.client_name}</td>
            <td class="p-4 text-xs">${c.phone || '--'}</td>
            <td class="p-4 text-xs">${c.address || '--'}</td>
            <td class="p-4 text-center">
                <button onclick="editClient('${c.client_id}')" class="px-2 py-1 text-xs bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition"><i class="fa-solid fa-pen ml-1"></i> تعديل</button>
                <button onclick="deleteClient('${c.client_id}')" class="px-2 py-1 text-xs bg-rose-500/20 text-rose-400 rounded-lg hover:bg-rose-500/30 transition"><i class="fa-solid fa-trash ml-1"></i> حذف</button>
            </td>
        `;
        fragment.appendChild(row);
    });

    tbody.innerHTML = "";
    tbody.appendChild(fragment);
    reapplyTableFilter('table-clients-body');
}

async function handleAddClient() {
    const { value: formValues } = await Swal.fire({
        title: 'إضافة عميل جديد',
        html: `
            <div class="text-right">
                <label class="block text-sm font-medium mb-1">اسم العميل *</label>
                <input id="client-name" class="swal2-input w-full" placeholder="شركة النقل المصرية">
                <label class="block text-sm font-medium mb-1 mt-3">رقم التليفون *</label>
                <input id="client-phone" class="swal2-input w-full" placeholder="01000000000">
                <label class="block text-sm font-medium mb-1 mt-3">العنوان</label>
                <input id="client-address" class="swal2-input w-full" placeholder="العنوان">
                <label class="block text-sm font-medium mb-1 mt-3">الرقم الضريبي</label>
                <input id="client-tax" class="swal2-input w-full" placeholder="الرقم الضريبي">
                <label class="block text-sm font-medium mb-1 mt-3">السجل التجاري</label>
                <input id="client-commercial" class="swal2-input w-full" placeholder="السجل التجاري">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'إضافة',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            return {
                Client_Name: document.getElementById('client-name').value,
                Phone: document.getElementById('client-phone').value,
                Address: document.getElementById('client-address').value,
                Tax_Number: document.getElementById('client-tax').value,
                Commercial_Record: document.getElementById('client-commercial').value
            };
        }
    });

    if (formValues && formValues.Client_Name && formValues.Phone) {
        try {
            await callBackend("createClient", formValues);
            Swal.fire({ icon: 'success', title: 'تمت الإضافة', timer: 1500, showConfirmButton: false });
            loadClientsData(true);
        } catch (err) {
            handleStandardError(err);
        }
    }
}

window.editClient = async function(clientId) {
    const client = (state.cache.clients || []).find(c => c.client_id === clientId);
    if (!client) return;

    const { value: formValues } = await Swal.fire({
        title: 'تعديل العميل',
        html: `
            <div class="text-right">
                <label class="block text-sm font-medium mb-1">اسم العميل</label>
                <input id="edit-client-name" class="swal2-input w-full" value="${client.client_name || ''}">
                <label class="block text-sm font-medium mb-1 mt-3">رقم التليفون</label>
                <input id="edit-client-phone" class="swal2-input w-full" value="${client.phone || ''}">
                <label class="block text-sm font-medium mb-1 mt-3">العنوان</label>
                <input id="edit-client-address" class="swal2-input w-full" value="${client.address || ''}">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'حفظ',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            return {
                Client_ID: clientId,
                Client_Name: document.getElementById('edit-client-name').value,
                Phone: document.getElementById('edit-client-phone').value,
                Address: document.getElementById('edit-client-address').value
            };
        }
    });

    if (formValues) {
        try {
            await callBackend("updateClient", formValues);
            Swal.fire({ icon: 'success', title: 'تم التحديث', timer: 1500, showConfirmButton: false });
            loadClientsData(true);
        } catch (err) {
            handleStandardError(err);
        }
    }
};

window.deleteClient = async function(clientId) {
    const confirm = await Swal.fire({
        title: 'تأكيد الحذف؟',
        text: 'هل أنت متأكد من حذف هذا العميل؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء'
    });
    if (!confirm.isConfirmed) return;

    try {
        await callBackend("deleteClient", { Client_ID: clientId });
        Swal.fire({ icon: 'success', title: 'تم الحذف', timer: 1500, showConfirmButton: false });
        loadClientsData(true);
    } catch (err) {
        handleStandardError(err);
    }
};

// ─── 5️⃣-ك: العهدات ───
async function loadBalanceData(forceRefresh = false) {
    const tbody = document.getElementById("table-balance-body");
    if (!tbody) return;

    const filterUserId = document.getElementById("balance-filter-user")?.value || "";
    const canFilterUsers = ["Admin", "Manager", "Accountant"].includes(state.user.role);

    if (canFilterUsers) {
        await populateBalanceUserFilter();
    }

    if (!forceRefresh && state.cache.balanceTransactions && !filterUserId) {
        renderBalanceTable(state.cache.balanceTransactions);
        return;
    }

    tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-muted"><i class="fa-solid fa-spinner fa-spin ml-2"></i>جاري التحميل...</td></tr>`;

    try {
        if (filterUserId && canFilterUsers) {
            const [userBalanceRes, allTransRes] = await Promise.all([
                callBackend("getUserBalance", { Target_User_ID: filterUserId }),
                callBackend("getAllTransactions", { Limit: 100 })
            ]);

            if (userBalanceRes?.data) {
                animateCounter(document.getElementById("balance-my-balance"), userBalanceRes.data.current_balance || 0, ' ج.م');
            }

            if (allTransRes?.data) {
                const filtered = allTransRes.data.filter(t => t.user_id === filterUserId);
                state.cache.balanceTransactions = filtered;
                renderBalanceTable(filtered);
            }
            return;
        }

        const [myBalanceRes, allTransRes] = await Promise.all([
            callBackend("getMyBalance"),
            canFilterUsers
                ? callBackend("getAllTransactions", { Limit: 50 })
                : callBackend("getMyTransactions", { Limit: 50 })
        ]);

        if (myBalanceRes?.data) {
            animateCounter(document.getElementById("balance-my-balance"), myBalanceRes.data.current_balance || 0, ' ج.م');
        }

        if (allTransRes?.data) {
            state.cache.balanceTransactions = allTransRes.data;
            renderBalanceTable(allTransRes.data);
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-rose-500">فشل جلب البيانات</td></tr>`;
        console.error("loadBalanceData Error:", err);
    }
}

async function populateBalanceUserFilter() {
    const select = document.getElementById("balance-filter-user");
    if (!select || select.dataset.loaded === "true") return;

    try {
        const response = await callBackend("getUsers");
        if (response?.data) {
            select.innerHTML = '<option value="">كل المستخدمين</option>';
            response.data.forEach(user => {
                const opt = document.createElement("option");
                opt.value = user.user_id;
                opt.textContent = user.full_name + " (" + user.username + ")";
                select.appendChild(opt);
            });
            select.dataset.loaded = "true";
        }
    } catch (err) {
        console.error("populateBalanceUserFilter Error:", err);
    }
}

function renderBalanceTable(transactions) {
    const tbody = document.getElementById("table-balance-body");
    if (!tbody) return;

    const fragment = document.createDocumentFragment();

    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-muted">لا توجد حركات</td></tr>`;
        return;
    }

    const typeMap = {
        'ADD': '➕ إيداع',
        'DEDUCT': '➖ صرف',
        'TRANSFER_IN': '📥 تحويل وارد',
        'TRANSFER_OUT': '📤 تحويل صادر',
        'EXPENSE': '💸 مصروف'
    };

    transactions.forEach(t => {
        const row = document.createElement("tr");
        row.className = "table-row hover:bg-hover transition";
        const isPositive = t.amount > 0;
        row.innerHTML = `
            <td class="p-4 text-xs">${t.created_at ? new Date(t.created_at).toLocaleString('ar-EG') : ''}</td>
            <td class="p-4 text-xs font-mono">${t.user_id || '--'}</td>
            <td class="p-4 text-xs">${typeMap[t.transaction_type] || t.transaction_type}</td>
            <td class="p-4 text-xs ${isPositive ? 'text-emerald-400' : 'text-rose-400'}">${t.amount || 0}</td>
            <td class="p-4 text-xs">${t.balance_after || 0}</td>
            <td class="p-4 text-xs text-muted">${t.notes || ''}</td>
        `;
        fragment.appendChild(row);
    });

    tbody.innerHTML = "";
    tbody.appendChild(fragment);
    reapplyTableFilter('table-balance-body');
}

async function handleAddBalance() {
    const { value: formValues } = await Swal.fire({
        title: 'إيداع عهدة',
        html: `
            <div class="text-right">
                <label class="block text-sm font-medium mb-1">المستخدم</label>
                <select id="add-balance-user" class="swal2-input w-full">
                    <option value="">-- اختر المستخدم --</option>
                </select>
                <label class="block text-sm font-medium mb-1 mt-3">المبلغ (ج.م)</label>
                <input id="add-balance-amount" class="swal2-input w-full" type="number" step="0.01" placeholder="0.00">
                <label class="block text-sm font-medium mb-1 mt-3">ملاحظات</label>
                <input id="add-balance-notes" class="swal2-input w-full" placeholder="سبب الإيداع">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'إيداع',
        cancelButtonText: 'إلغاء',
        didOpen: async () => {
            try {
                const response = await callBackend("getUsers");
                if (response && response.data) {
                    const select = document.getElementById("add-balance-user");
                    if (select) {
                        select.innerHTML = '<option value="">-- اختر المستخدم --</option>';
                        response.data.forEach(user => {
                            if (user.user_id !== state.user.id) {
                                const opt = document.createElement("option");
                                opt.value = user.user_id;
                                opt.textContent = user.full_name + " (" + user.username + ")";
                                select.appendChild(opt);
                            }
                        });
                    }
                }
            } catch (err) {
                console.error("فشل تحميل المستخدمين:", err);
            }
        },
        preConfirm: () => {
            const userId = document.getElementById("add-balance-user").value;
            const amount = parseFloat(document.getElementById("add-balance-amount").value);
            const notes = document.getElementById("add-balance-notes").value;
            if (!userId) { Swal.showValidationMessage('يرجى اختيار المستخدم'); return; }
            if (!amount || amount <= 0) { Swal.showValidationMessage('المبلغ يجب أن يكون أكبر من صفر'); return; }
            return { Target_User_ID: userId, Amount: amount, Notes: notes };
        }
    });

    if (formValues) {
        try {
            const response = await callBackend("addBalance", formValues);
            Swal.fire({ icon: 'success', title: 'تم الإيداع', text: response.message, timer: 2000, showConfirmButton: false });
            loadBalanceData(true);
            refreshDashboard();
        } catch (err) {
            handleStandardError(err);
        }
    }
}

async function handleTransferBalance() {
    const { value: formValues } = await Swal.fire({
        title: 'تحويل عهدة',
        html: `
            <div class="text-right">
                <label class="block text-sm font-medium mb-1">من</label>
                <select id="transfer-from-user" class="swal2-input w-full">
                    <option value="">-- اختر المرسل --</option>
                </select>
                <label class="block text-sm font-medium mb-1 mt-3">إلى</label>
                <select id="transfer-to-user" class="swal2-input w-full">
                    <option value="">-- اختر المستقبل --</option>
                </select>
                <label class="block text-sm font-medium mb-1 mt-3">المبلغ (ج.م)</label>
                <input id="transfer-amount" class="swal2-input w-full" type="number" step="0.01" placeholder="0.00">
                <label class="block text-sm font-medium mb-1 mt-3">ملاحظات</label>
                <input id="transfer-notes" class="swal2-input w-full" placeholder="سبب التحويل">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'تحويل',
        cancelButtonText: 'إلغاء',
        didOpen: async () => {
            try {
                const response = await callBackend("getUsers");
                if (response && response.data) {
                    const selectFrom = document.getElementById("transfer-from-user");
                    const selectTo = document.getElementById("transfer-to-user");
                    if (selectFrom && selectTo) {
                        const options = '<option value="">-- اختر --</option>';
                        selectFrom.innerHTML = options;
                        selectTo.innerHTML = options;
                        response.data.forEach(user => {
                            if (user.user_id !== state.user.id) {
                                const opt = document.createElement("option");
                                opt.value = user.user_id;
                                opt.textContent = user.full_name + " (" + user.username + ")";
                                selectFrom.appendChild(opt.cloneNode(true));
                                selectTo.appendChild(opt.cloneNode(true));
                            }
                        });
                    }
                }
            } catch (err) {
                console.error("فشل تحميل المستخدمين:", err);
            }
        },
        preConfirm: () => {
            const fromUser = document.getElementById("transfer-from-user").value;
            const toUser = document.getElementById("transfer-to-user").value;
            const amount = parseFloat(document.getElementById("transfer-amount").value);
            const notes = document.getElementById("transfer-notes").value;
            if (!fromUser) { Swal.showValidationMessage('يرجى اختيار المرسل'); return; }
            if (!toUser) { Swal.showValidationMessage('يرجى اختيار المستقبل'); return; }
            if (fromUser === toUser) { Swal.showValidationMessage('لا يمكن التحويل لنفس المستخدم'); return; }
            if (!amount || amount <= 0) { Swal.showValidationMessage('المبلغ يجب أن يكون أكبر من صفر'); return; }
            return { From_User_ID: fromUser, To_User_ID: toUser, Amount: amount, Notes: notes };
        }
    });

    if (formValues) {
        try {
            const response = await callBackend("transferBalance", formValues);
            Swal.fire({ icon: 'success', title: 'تم التحويل', text: response.message, timer: 2000, showConfirmButton: false });
            loadBalanceData(true);
            refreshDashboard();
        } catch (err) {
            handleStandardError(err);
        }
    }
}

// ─── 5️⃣-ل: التنبيهات ───
async function loadNotificationsData() {
    const container = document.getElementById("notifications-list");
    if (!container) return;
    container.innerHTML = `<p class="p-8 text-center text-muted"><i class="fa-solid fa-spinner fa-spin ml-2"></i>جاري التحميل...</p>`;

    try {
        const response = await callBackend("getNotifications");
        if (response && response.data) {
            state.notifications = response.data.notifications || [];
            renderNotifications(state.notifications);
        }
    } catch (err) {
        container.innerHTML = `<p class="p-8 text-center text-rose-500">فشل جلب البيانات</p>`;
    }
}

function renderNotifications(notifications) {
    const container = document.getElementById("notifications-list");
    if (!container) return;
    container.innerHTML = "";

    if (!notifications || notifications.length === 0) {
        container.innerHTML = `<p class="p-8 text-center text-muted">لا توجد تنبيهات</p>`;
        return;
    }

    const fragment = document.createDocumentFragment();

    notifications.forEach(n => {
        const div = document.createElement("div");
        div.className = `p-4 border-b border-border hover:bg-hover transition ${!n.is_read ? 'bg-amber-500/5' : ''}`;
        div.innerHTML = `
            <div class="flex items-start justify-between gap-4">
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        ${!n.is_read ? '<span class="w-2 h-2 bg-amber-500 rounded-full"></span>' : ''}
                        <h4 class="font-bold text-sm">${n.title}</h4>
                        <span class="text-xs text-muted">${new Date(n.created_at).toLocaleString('ar-EG')}</span>
                    </div>
                    <p class="text-sm text-muted mt-1">${n.message}</p>
                    ${n.related_id ? `<p class="text-xs text-muted mt-1">🔗 ${n.related_id}</p>` : ''}
                </div>
                <div class="flex gap-2">
                    ${!n.is_read ? `<button onclick="markNotificationRead('${n.notification_id}')" class="text-xs text-amber-400 hover:text-amber-300 transition"><i class="fa-solid fa-check"></i></button>` : ''}
                    <button onclick="deleteNotification('${n.notification_id}')" class="text-xs text-rose-400 hover:text-rose-300 transition"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `;
        fragment.appendChild(div);
    });

    container.innerHTML = "";
    container.appendChild(fragment);
}

window.markNotificationRead = async function(notificationId) {
    try {
        await callBackend("markNotificationRead", { Notification_ID: notificationId });
        loadNotificationsData();
        refreshDashboard();
    } catch (err) {
        handleStandardError(err);
    }
};

window.deleteNotification = async function(notificationId) {
    try {
        await callBackend("deleteNotification", { Notification_ID: notificationId });
        loadNotificationsData();
    } catch (err) {
        handleStandardError(err);
    }
};

async function handleMarkAllRead() {
    try {
        await callBackend("markAllNotificationsRead", {});
        loadNotificationsData();
        refreshDashboard();
        Swal.fire({ icon: 'success', title: 'تم تحديد الكل كمقروء', timer: 1500, showConfirmButton: false });
    } catch (err) {
        handleStandardError(err);
    }
}

// ─── 5️⃣-م: إدارة المستخدمين ───
async function loadUsersData(forceRefresh = false) {
    const tbody = document.getElementById("table-users-body");
    if (!tbody) return;

    if (!forceRefresh && state.cache.users) {
        renderUsersTable(state.cache.users);
        return;
    }

    tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-muted"><i class="fa-solid fa-spinner fa-spin ml-2"></i>جاري التحميل...</td></tr>`;

    try {
        const response = await callBackend("getUsers");
        state.cache.users = response.data || [];
        renderUsersTable(state.cache.users);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-rose-500">فشل جلب البيانات</td></tr>`;
        console.error("loadUsersData Error:", err);
    }
}

function renderUsersTable(users) {
    const tbody = document.getElementById("table-users-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!users || users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-muted">لا يوجد مستخدمين</td></tr>`;
        return;
    }

    const fragment = document.createDocumentFragment();

    users.forEach(user => {
        const statusBadge = user.status === "ACTIVE" ?
            '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">نشط</span>' :
            '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">غير نشط</span>';

        const roleBadge = {
            'Admin': '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">مدير</span>',
            'Manager': '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">مدير عام</span>',
            'Operations': '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">عمليات</span>',
            'Accountant': '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">محاسب</span>'
        }[user.role] || user.role;

        const isAdmin = user.username === "admin";
        const actions = isAdmin ?
            `<span class="text-xs text-muted"><i class="fa-solid fa-shield ml-1"></i>محمي</span>` :
            `
                <button onclick="editUserRole('${user.user_id}', '${user.role}')" class="px-2 py-1 text-xs bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition"><i class="fa-solid fa-pen ml-1"></i> دور</button>
                <button onclick="resetUserPassword('${user.user_id}')" class="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition"><i class="fa-solid fa-key ml-1"></i> كلمة سر</button>
                <button onclick="toggleUserStatus('${user.user_id}', '${user.status}')" class="px-2 py-1 text-xs ${user.status === 'ACTIVE' ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'} rounded-lg transition">
                    ${user.status === 'ACTIVE' ? '<i class="fa-solid fa-pause ml-1"></i>تعطيل' : '<i class="fa-solid fa-play ml-1"></i>تفعيل'}
                </button>
                <button onclick="deleteUser('${user.user_id}')" class="px-2 py-1 text-xs bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded-lg transition">
                    <i class="fa-solid fa-trash ml-1"></i>حذف
                </button>
            `;

        const row = document.createElement("tr");
        row.className = "table-row hover:bg-hover transition";
        row.innerHTML = `
            <td class="p-4 font-medium">${user.full_name}</td>
            <td class="p-4 text-xs font-mono text-muted">${user.username}</td>
            <td class="p-4">${roleBadge}</td>
            <td class="p-4">${statusBadge}</td>
            <td class="p-4 text-center">${actions}</td>
        `;
        fragment.appendChild(row);
    });

    tbody.innerHTML = "";
    tbody.appendChild(fragment);
}

window.editUserRole = async function(userId, currentRole) {
    const { value: newRole } = await Swal.fire({
        title: 'تغيير دور المستخدم',
        input: 'select',
        inputOptions: {
            'Operations': 'عمليات',
            'Accountant': 'محاسب',
            'Manager': 'مدير عام',
            'Admin': 'مدير نظام'
        },
        inputValue: currentRole,
        showCancelButton: true,
        confirmButtonText: 'حفظ',
        cancelButtonText: 'إلغاء'
    });

    if (newRole && newRole !== currentRole) {
        try {
            await callBackend("updateUserRole", {
                Target_User_ID: userId,
                New_Role: newRole
            });
            Swal.fire({ icon: 'success', title: 'تم التحديث', timer: 1500, showConfirmButton: false });
            loadUsersData(true);
        } catch (err) {
            handleStandardError(err);
        }
    }
};

window.resetUserPassword = async function(userId) {
    const { value: newPassword } = await Swal.fire({
        title: 'إعادة تعيين كلمة المرور',
        input: 'password',
        inputLabel: 'كلمة المرور الجديدة',
        inputPlaceholder: '•••••••• (6 أحرف على الأقل)',
        showCancelButton: true,
        confirmButtonText: 'حفظ',
        cancelButtonText: 'إلغاء',
        inputValidator: (value) => {
            if (!value || value.length < 6) {
                return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
            }
        }
    });

    if (newPassword) {
        try {
            await callBackend("resetUserPassword", {
                Target_User_ID: userId,
                New_Password: newPassword
            });
            Swal.fire({ icon: 'success', title: 'تم إعادة التعيين', text: 'تم تحديث كلمة المرور بنجاح.', timer: 3000, showConfirmButton: false });
        } catch (err) {
            handleStandardError(err);
        }
    }
};

async function handleCreateUserSubmit(e) {
    e.preventDefault();
    const submitBtn = document.getElementById("btn-user-submit");

    const fullName = document.getElementById("user-full-name")?.value.trim() || "";
    const username = document.getElementById("user-username")?.value.trim() || "";
    const password = document.getElementById("user-password")?.value || "";
    const role = document.getElementById("user-role-select")?.value || "Operations";
    const email = document.getElementById("user-email")?.value.trim() || "";

    if (!fullName || !username || !password) {
        Swal.fire({ icon: 'warning', title: 'بيانات ناقصة', text: 'جميع الحقول مطلوبة.' });
        return;
    }

    if (password.length < 6) {
        Swal.fire({ icon: 'warning', title: 'كلمة مرور ضعيفة', text: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.' });
        return;
    }

    setButtonLoading(submitBtn, true, "جاري الإنشاء...");

    try {
        await callBackend("createUser", {
            Full_Name: fullName,
            New_Username: username,
            New_Password: password,
            Assigned_Role: role,
            Email: email
        });

        Swal.fire({ icon: 'success', title: 'تم الإنشاء', text: `تم إنشاء حساب ${fullName}`, timer: 2000, showConfirmButton: false });
        document.getElementById("form-create-user").reset();
        loadUsersData(true);
    } catch (err) {
        handleStandardError(err);
    } finally {
        setButtonLoading(submitBtn, false, '<i class="fa-solid fa-floppy-disk"></i> حفظ');
    }
}

window.toggleUserStatus = async function(userId, currentStatus) {
    const newStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const action = newStatus === "ACTIVE" ? "تفعيل" : "تعطيل";

    const confirmation = await Swal.fire({
        title: `تأكيد ${action} الحساب؟`,
        text: `هل أنت متأكد من ${action} هذا الحساب؟`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f59e0b',
        cancelButtonColor: '#334155',
        confirmButtonText: `نعم，${action}`,
        cancelButtonText: 'إلغاء'
    });

    if (!confirmation.isConfirmed) return;

    try {
        await callBackend("toggleUserStatus", {
            Target_User_ID: userId,
            New_Status: newStatus
        });
        Swal.fire({ icon: 'success', title: 'تم التحديث', timer: 1500, showConfirmButton: false });
        loadUsersData(true);
    } catch (err) {
        handleStandardError(err);
    }
};

window.deleteUser = async function(userId) {
    const confirmation = await Swal.fire({
        title: 'تأكيد حذف المستخدم؟',
        text: 'هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن استرجاع البيانات بعد الحذف.',
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#334155',
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء'
    });

    if (!confirmation.isConfirmed) return;

    try {
        await callBackend("deleteUser", { Target_User_ID: userId });
        Swal.fire({ icon: 'success', title: 'تم الحذف', timer: 1500, showConfirmButton: false });
        loadUsersData(true);
    } catch (err) {
        handleStandardError(err);
    }
};

// ─── 5️⃣-ن: البحث والفلترة للجداول ───
const _tableFilters = {};

function initTableSearch(searchId, filterId, tableBodyId) {
    const searchInput = document.getElementById(searchId);
    const filterSelect = document.getElementById(filterId);
    const key = tableBodyId;

    const doFilter = () => {
        const tbody = document.getElementById(key);
        if (!tbody) return;
        const q = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const fv = filterSelect ? filterSelect.value : '';
        const rows = tbody.querySelectorAll('tr');
        rows.forEach(row => {
            if (row.querySelector('td[colspan]')) return;
            const text = row.textContent.toLowerCase();
            const matchSearch = !q || text.includes(q);
            const matchFilter = !fv || text.includes(fv.toLowerCase());
            row.style.display = (matchSearch && matchFilter) ? '' : 'none';
        });
    };

    if (searchInput) searchInput.addEventListener('input', doFilter);
    if (filterSelect) filterSelect.addEventListener('change', doFilter);
    _tableFilters[key] = doFilter;
}

function reapplyTableFilter(tableBodyId) {
    const fn = _tableFilters[tableBodyId];
    if (fn) setTimeout(fn, 50);
}

function initAllTableSearch() {
    initTableSearch('search-trips', 'filter-trip-status', 'table-trips-body');
    initTableSearch('search-vehicles', null, 'table-vehicles-body');
    initTableSearch('search-drivers', null, 'table-drivers-body');
    initTableSearch('search-clients', null, 'table-clients-body');
    initTableSearch('search-fuel-page', 'filter-fuel-page-type', 'table-fuel-transactions');
    initTableSearch('search-balance', 'filter-balance-type', 'table-balance-body');
    initTableSearch('search-maintenance', 'filter-maintenance-vehicle', 'table-maintenance-body');
}

// ─── 6️⃣ الدوال المساعدة ───
function lookupDriverName(driverId) {
    if (!driverId) return "بدون";
    const driver = (state.cache.drivers || []).find(d => d.driver_id === driverId);
    return driver ? driver.full_name : driverId;
}

function lookupVehicleLabel(vehicleId) {
    if (!vehicleId) return "بدون";
    const vehicle = (state.cache.vehicles || []).find(v => v.vehicle_id === vehicleId);
    return vehicle ? `${vehicle.plate_number} (${vehicle.model})` : vehicleId;
}

// ─── أدوات مساعدة ───
function debounce(fn, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

function setButtonLoading(buttonElement, isLoading, textContent) {
    if (!buttonElement) return;
    if (isLoading) {
        buttonElement.disabled = true;
        buttonElement.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin ml-2"></i> ${textContent}`;
    } else {
        buttonElement.disabled = false;
        buttonElement.innerHTML = textContent;
    }
}

function setupUserLayout() {
    const greetingTxt = document.getElementById("greeting-text");

    if (greetingTxt) {
        const h = new Date().getHours();
        const name = state.user.name || 'مستخدم';
        let greet = 'مرحباً';
        if (h >= 5 && h < 12) greet = 'صباح الخير';
        else greet = 'مساء الخير';
        greetingTxt.innerText = `${greet} ${name}`;
    }

    const navSettings = document.getElementById("nav-settings");
    if (navSettings) {
        if (state.user.role === "Admin" || state.user.role === "Manager") {
            navSettings.classList.remove("hidden");
            navSettings.style.display = "flex";
        } else {
            navSettings.classList.add("hidden");
            navSettings.style.display = "none";
        }
    }

    // إخفاء العهدات عن الأوبريشن (مش متاحة ليه)
    const navBalance = document.getElementById("nav-balance");
    if (navBalance) {
        if (state.user.role === "Operations") {
            navBalance.classList.add("hidden");
            navBalance.style.display = "none";
        } else {
            navBalance.classList.remove("hidden");
            navBalance.style.display = "flex";
        }
    }

    const adminButtons = ["btn-add-vehicle", "btn-add-driver", "btn-add-client", "btn-update-fuel-price"];
    adminButtons.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            if (state.user.role === "Admin" || state.user.role === "Manager") {
                btn.style.display = "inline-flex";
            } else {
                btn.style.display = "none";
            }
        }
    });

    const balanceButtons = ["btn-add-balance", "btn-transfer-balance"];
    balanceButtons.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            if (state.user.role === "Admin" || state.user.role === "Manager" || state.user.role === "Accountant") {
                btn.style.display = "inline-flex";
            } else {
                btn.style.display = "none";
            }
        }
    });
}

// ─── 7️⃣ الوضع الليلي/النهاري ───
function loadThemePreference() {
    const savedTheme = localStorage.getItem("kyan_theme");
    if (savedTheme === "light") {
        document.documentElement.setAttribute("data-theme", "light");
        updateThemeIcon("light");
    } else {
        document.documentElement.setAttribute("data-theme", "dark");
        updateThemeIcon("dark");
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("kyan_theme", newTheme);
    updateThemeIcon(newTheme);
    document.dispatchEvent(new Event("themeChanged"));
}

function updateThemeIcon(theme) {
    const btn = document.getElementById("btn-theme-toggle");
    if (btn) {
        btn.innerHTML = theme === "dark" 
            ? '<i class="fa-solid fa-sun"></i>' 
            : '<i class="fa-solid fa-moon"></i>';
    }
}

// ─── 8️⃣ تسجيل الخروج ───
async function handleLogout() {
    try {
        if (state.user.token) {
            await callBackend("logout", {});
        }
    } catch (e) {
        console.log("Logout error (ignored):", e);
    } finally {
        clearSession();
        state.user = { id: null, name: null, username: null, role: null, token: null, tokenExpiry: null };
        state.activeTrips = [];
        state.users = [];
        state.vehicles = [];
        state.drivers = [];
        state.clients = [];
        state.notifications = [];
        state.fuelTransactions = [];
        state.balanceTransactions = [];
        state.cache = {
            trips: null,
            vehicles: null,
            drivers: null,
            clients: null,
            fuelTransactions: null,
            balanceTransactions: null,
            notifications: null,
            users: null
        };

        Swal.fire({ icon: 'info', title: 'تم تسجيل الخروج', text: 'جلسة العمل أغلقت بأمان.', timer: 1500, showConfirmButton: false });
        switchView("view-login");

        const usernameInput = document.getElementById("input-username");
        const passwordInput = document.getElementById("input-password");
        if (usernameInput) usernameInput.value = "";
        if (passwordInput) passwordInput.value = "";
    }
}

function clearSession() {
    localStorage.removeItem("kyan_session_token");
    localStorage.removeItem("kyan_user_data");
    localStorage.removeItem("kyan_token_expiry");
}

function handleStandardError(errorInstance) {
    console.error("Error:", errorInstance);
    try {
        const errorObj = JSON.parse(errorInstance.message);
        Swal.fire({
            icon: 'error',
            title: `خطأ [${errorObj.error_code || 'UNKNOWN'}]`,
            text: errorObj.message || "فشلت العملية.",
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'حسناً'
        });
    } catch (e) {
        Swal.fire({
            icon: 'error',
            title: 'فشل تنفيذ المعاملة',
            text: errorInstance.message || "حدث خطأ غير متوقع.",
            confirmButtonColor: '#ef4444'
        });
    }
}