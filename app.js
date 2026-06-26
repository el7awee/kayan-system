/**
 * منظومة الكيان v6.0 - المحرك التنفيذي للواجهة الأمامية
 * ملف: app.js (إدارة الحالة، التحويل الثنائي، وتأمين الـ Idempotency)
 * [تحديث: إصلاح مشكلة MISSING_ACTION - إرسال action في FormData]
 */

// ─── 1️⃣ الإعدادات والثوابت العالمية ───
const BACKEND_API_URL = "https://script.google.com/macros/s/AKfycbxRpxgBZJWWBU0mLqA-QYFkMeIC3cXjmsTs81ioSxZsYxJpJ_V-4q95dHnIxOp1TcUq/exec";

// حالة التطبيق المحلية
const state = {
    user: {
        id: null,
        name: null,
        username: null,
        role: null,
        token: null,
        tokenExpiry: null,
        csrfToken: null
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
        users: null
    }
};

// متغير للتحميل مرة واحدة
let dropdownsLoaded = false;

// دالة تعقيم HTML (منع XSS)
function esc(str) {
    if (str === null || str === undefined) return "";
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

// ─── 2️⃣ إدارة الأحداث والتشغيل الأولي ───
document.addEventListener("DOMContentLoaded", () => {
    initApp();
    bindUIEvents();
    bindBottomNav();
    loadThemePreference();
});

function initApp() {
    initKeyboardAwareness();
    // تفعيل السحب على كل جداول البطاقات
    const swipeContainers = document.querySelectorAll('.card .overflow-x-auto');
    swipeContainers.forEach(el => initSwipeController(el));
    
    const savedToken = localStorage.getItem("kyan_session_token");
    const savedUser = localStorage.getItem("kyan_user_data");
    const savedExpiry = localStorage.getItem("kyan_token_expiry");
    const savedCsrf = localStorage.getItem("kyan_csrf_token");

    if (savedToken && savedUser && savedExpiry) {
        const expiry = new Date(savedExpiry);
        if (expiry > new Date()) {
            try {
                const parsedUser = JSON.parse(savedUser);
                state.user = {
                    ...parsedUser,
                    token: savedToken,
                    tokenExpiry: savedExpiry,
                    csrfToken: savedCsrf || null
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
    switchView("view-login");
}

function bindUIEvents() {
    // التنقل
    document.getElementById("nav-dashboard")?.addEventListener("click", () => { switchView("view-dashboard"); refreshDashboard(); });
    document.getElementById("nav-trips")?.addEventListener("click", async () => {
        switchView("view-trips");
        await loadDropdowns();
        loadTripsData();
    });
    document.getElementById("nav-expenses")?.addEventListener("click", () => { switchView("view-expenses"); loadExpensesData(); });
    document.getElementById("nav-fuel")?.addEventListener("click", () => { switchView("view-fuel"); loadFuelData(); });
    document.getElementById("nav-vehicles")?.addEventListener("click", () => { switchView("view-vehicles"); loadVehiclesData(); });
    document.getElementById("nav-drivers")?.addEventListener("click", () => { switchView("view-drivers"); loadDriversData(); });
    document.getElementById("nav-clients")?.addEventListener("click", () => { switchView("view-clients"); loadClientsData(); });
    document.getElementById("nav-balance")?.addEventListener("click", () => { switchView("view-balance"); loadBalanceData(); });
    document.getElementById("nav-notifications")?.addEventListener("click", () => { switchView("view-notifications"); loadNotificationsData(); });
    document.getElementById("nav-reports")?.addEventListener("click", () => {
        switchView("view-reports");
        loadReports();
    });
    document.getElementById("nav-settings")?.addEventListener("click", () => {
        if (state.user.role === "Admin" || state.user.role === "Manager") {
            switchView("view-settings");
            loadUsersData();
        } else {
            Swal.fire({ icon: 'error', title: 'صلاحية مرفوضة', text: 'هذه الصفحة متاحة للمديرين فقط.' });
        }
    });

    // أزرار التحديث
    document.getElementById("btn-refresh-trips")?.addEventListener("click", () => loadTripsData(true));
    document.getElementById("btn-refresh-fuel")?.addEventListener("click", loadFuelTransactions);
    document.getElementById("btn-refresh-vehicles")?.addEventListener("click", () => loadVehiclesData(true));
    document.getElementById("btn-refresh-drivers")?.addEventListener("click", () => loadDriversData(true));
    document.getElementById("btn-refresh-clients")?.addEventListener("click", () => loadClientsData(true));
    document.getElementById("btn-refresh-users")?.addEventListener("click", () => loadUsersData(true));
    document.getElementById("btn-load-permissions")?.addEventListener("click", loadPermissionsMatrix);
    document.getElementById("btn-save-permissions")?.addEventListener("click", savePermissionsMatrix);
    document.getElementById("btn-refresh-notifications")?.addEventListener("click", loadNotificationsData);
    document.getElementById("btn-refresh-balance")?.addEventListener("click", () => loadBalanceData(true));

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
    document.getElementById("notification-bar-close")?.addEventListener("click", () => {
        document.getElementById("notification-bar")?.classList.add("hidden");
    });

    // تسجيل الخروج والوضع
    document.getElementById("btn-logout")?.addEventListener("click", handleLogout);
    document.getElementById("btn-theme-toggle")?.addEventListener("click", toggleTheme);
    document.getElementById("dash-btn-theme")?.addEventListener("click", toggleTheme);
    document.getElementById("dash-btn-notifications")?.addEventListener("click", () => switchView("view-notifications"));

    // النماذج
    document.getElementById("form-login")?.addEventListener("submit", handleLoginSubmit);
    document.getElementById("form-create-trip")?.addEventListener("submit", handleCreateTripSubmit);
    document.getElementById("form-create-user")?.addEventListener("submit", handleCreateUserSubmit);

    // مصاريف الشركة
    document.getElementById("btn-add-expense")?.addEventListener("click", () => document.getElementById("form-add-expense")?.scrollIntoView({ behavior: "smooth" }));
    document.getElementById("btn-refresh-expenses")?.addEventListener("click", () => loadExpensesData(true));
    document.getElementById("form-add-expense")?.addEventListener("submit", handleAddExpenseSubmit);
    document.getElementById("btn-expense-cancel-edit")?.addEventListener("click", cancelEditExpense);
    document.getElementById("expense-file-input")?.addEventListener("change", handleFileProcessing);
    document.getElementById("expense-category")?.addEventListener("change", function() {
        const container = document.getElementById("expense-other-category-container");
        if (container) container.classList.toggle("hidden", this.value !== "أخرى");
    });
    document.getElementById("expense-search")?.addEventListener("input", () => { expensesState.page = 1; renderExpensesTable(); });
    document.getElementById("expense-filter-from")?.addEventListener("change", () => { expensesState.page = 1; renderExpensesTable(); });
    document.getElementById("expense-filter-to")?.addEventListener("change", () => { expensesState.page = 1; renderExpensesTable(); });
    document.getElementById("expense-filter-type")?.addEventListener("change", () => { expensesState.page = 1; renderExpensesTable(); });
    document.getElementById("btn-expenses-prev")?.addEventListener("click", () => { if (expensesState.page > 1) { expensesState.page--; renderExpensesTable(); } });
    document.getElementById("btn-expenses-next")?.addEventListener("click", () => { if (expensesState.page < Math.ceil(expensesState.filtered.length / expensesState.pageSize)) { expensesState.page++; renderExpensesTable(); } });
    document.getElementById("btn-export-expenses")?.addEventListener("click", exportExpensesToExcel);
    
    // كروت لوحة التحكم (توجيه)
    document.getElementById("card-active-trips")?.addEventListener("click", () => switchView("view-trips"));
    document.getElementById("card-pending")?.addEventListener("click", () => switchView("view-trips"));
    document.getElementById("card-fuel")?.addEventListener("click", () => switchView("view-fuel"));
    document.getElementById("card-notifications")?.addEventListener("click", () => switchView("view-notifications"));
    document.getElementById("card-balance")?.addEventListener("click", () => switchView("view-balance"));
    document.getElementById("card-expenses")?.addEventListener("click", () => switchView("view-expenses"));
    document.getElementById("card-vehicles")?.addEventListener("click", () => switchView("view-vehicles"));
    document.getElementById("card-drivers")?.addEventListener("click", () => switchView("view-drivers"));

    // 📊 التقارير
    document.getElementById("btn-generate-report")?.addEventListener("click", generateReport);
    document.getElementById("btn-export-report")?.addEventListener("click", exportReportToExcel);
}

// ─── 2️⃣-ب: شريط التنقل السفلي للموبايل ───
function bindBottomNav() {
    const bottomNav = document.getElementById("bottom-nav");
    const overlay = document.getElementById("bnav-more-overlay");

    // تفويض الأحداث على أزرار الشريط السفلي
    bottomNav?.addEventListener("click", (e) => {
        const btn = e.target.closest(".bnav-item");
        if (!btn) return;

        // زر المزيد
        if (btn.id === "bnav-more-btn") {
            if (overlay) overlay.classList.add("open");
            return;
        }

        let viewId = btn.dataset.view;
        if (!viewId) return;

        // خريطة: الأسطول ← البنزينة
        if (viewId === "view-fleet") viewId = "view-fuel";

        switchView(viewId);
        // تفعيل التحميل حسب الشاشة
        const navMap = {
            "view-dashboard": () => refreshDashboard(),
            "view-trips": () => { loadDropdowns(); loadTripsData(); },
            "view-expenses": () => loadExpensesData(),
            "view-fuel": () => loadFuelData(),
            "view-vehicles": () => loadVehiclesData(),
            "view-drivers": () => loadDriversData(),
            "view-clients": () => loadClientsData(),
            "view-balance": () => loadBalanceData(),
            "view-notifications": () => loadNotificationsData(),
            "view-reports": () => loadReports()
        };
        // settings لها شرط صلاحية منفصل — لا يتم تضمينها هنا
        if (viewId === "view-settings") {
            if (state.user.role === "Admin" || state.user.role === "Manager") {
                loadUsersData();
            } else {
                Swal.fire({ icon: 'error', title: 'صلاحية مرفوضة', text: 'هذه الصفحة متاحة للمديرين فقط.' });
            }
            return;
        }
        const loader = navMap[viewId];
        if (loader) loader();
    });

    // قائمة "المزيد" المنبثقة
    overlay?.addEventListener("click", (e) => {
        const item = e.target.closest(".ms-item");
        if (item) {
            let viewId = item.dataset.view;
            if (viewId) switchView(viewId);
            overlay.classList.remove("open");
            // تحميل البيانات
            const moreLoaders = {
                "view-fuel": () => loadFuelData(),
                "view-vehicles": () => loadVehiclesData(),
                "view-drivers": () => loadDriversData(),
                "view-clients": () => loadClientsData(),
                "view-notifications": () => loadNotificationsData(),
                "view-reports": () => loadReports(),
                "view-settings": () => { if (["Admin","Manager"].includes(state.user.role)) loadUsersData(); }
            };
            const loader = moreLoaders[viewId];
            if (loader) loader();
            return;
        }
        // إغلاق عند الضغط خارج القائمة أو على زر الإغلاق
        if (e.target === overlay || e.target.classList.contains("ms-close")) {
            overlay.classList.remove("open");
        }
    });
}

// وظيفة لتحديث الحالة النشطة في الشريط السفلي
function updateBottomNavActiveState(viewId) {
    // ترجمة view-fleet إلى view-fuel (لأنه لا يوجد شاشة view-fleet)
    if (viewId === "view-fleet") viewId = "view-fuel";
    
    document.querySelectorAll("#bottom-nav .bnav-item").forEach(btn => {
        let btnView = btn.dataset.view;
        if (btnView === "view-fleet") btnView = "view-fuel";
        if (btnView === viewId) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
}

// ─── 3️⃣ إدارة التنقل ───
function switchView(viewId) {
    const sections = ["view-login", "view-dashboard", "view-trips", "view-expenses", 
                      "view-fuel", "view-vehicles", "view-drivers", "view-clients",
                      "view-balance", "view-notifications", "view-reports", "view-settings"];
    sections.forEach(id => {
        const sec = document.getElementById(id);
        if (sec) sec.classList.add("hidden");
    });

    const mainLayout = document.getElementById("main-layout");
    if (viewId === "view-login") {
        if (mainLayout) mainLayout.classList.add("hidden");
        document.getElementById("view-login")?.classList.remove("hidden");
    } else {
        if (mainLayout) mainLayout.classList.remove("hidden");
        document.getElementById(viewId)?.classList.remove("hidden");
        updateSidebarActiveState(viewId);
        updateBottomNavActiveState(viewId);
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
        "view-reports": "nav-reports",
        "view-settings": "nav-settings"
    };

    Object.values(navMapping).forEach(navId => {
        const btn = document.getElementById(navId);
        if (btn) btn.classList.remove("bg-slate-900", "text-amber-500", "border-r-2", "border-amber-500");
    });

    const activeNavId = navMapping[viewId];
    const activeBtn = document.getElementById(activeNavId);
    if (activeBtn) {
        activeBtn.classList.add("bg-slate-900", "text-amber-500", "border-r-2", "border-amber-500");
    }
}

// ─── 4️⃣ طبقة الاتصال بالخادم (معدلة) ───
async function callBackend(action, parameters = {}) {
    let url = new URL(BACKEND_API_URL);
    
    // ✅ إزالة action من الـ URL
    // url.searchParams.append("action", action);

    // ✅ إرسال Session Token في الـ URL
    if (action !== "login") {
        url.searchParams.append("Session_Token", state.user.token || "null");
        url.searchParams.append("User_ID", state.user.id || "GUEST");
        url.searchParams.append("User_Role", state.user.role || "Operations");
    }

    // ✅ بناء URLSearchParams (application/x-www-form-urlencoded) لتجنب CORS preflight
    const body = new URLSearchParams();
    body.append("action", action);

    for (const [key, value] of Object.entries(parameters)) {
        if (key === "bodyPayload") {
            if (value && typeof value === 'object') {
                for (const [fileKey, fileValue] of Object.entries(value)) {
                    if (fileValue) body.append(fileKey, fileValue);
                }
            }
        } else {
            body.append(key, value);
        }
    }

    const isWriteAction = ["createTrip", "updateTrip", "settleTripFinancials", "addExpense", "updateExpense", "deleteExpense", "createUser", "toggleUserStatus", "updateUserRole", "deleteUser", "resetUserPassword", "createVehicle", "updateVehicle", "deleteVehicle", "createDriver", "updateDriverData", "deleteDriver", "createClient", "updateClient", "deleteClient", "addFuelBalance", "updateFuelPrice", "markNotificationRead", "markAllNotificationsRead", "deleteNotification", "addBalance", "transferBalance", "savePermissions"].includes(action);
    if (isWriteAction) {
        body.append("Idempotency_Key", `IDMP-${Date.now()}-${Math.floor(Math.random() * 0xffffff).toString(16)}`);
        if (state.user.csrfToken) body.append("CSRF_Token", state.user.csrfToken);
    }

    const fetchOptions = {
        method: "POST",
        mode: "cors",
        redirect: "follow",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
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
        state.user = { id: null, name: null, username: null, role: null, token: null, tokenExpiry: null, csrfToken: null };

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
            if (response.csrf_token) {
                localStorage.setItem("kyan_csrf_token", response.csrf_token);
            }

            state.user = {
                id: response.user_id,
                name: response.full_name,
                username: response.username,
                role: response.role,
                token: response.session_token,
                tokenExpiry: response.token_expiry,
                csrfToken: response.csrf_token || null
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
async function refreshDashboard() {
    try {
        document.getElementById("dash-last-update").textContent = new Date().toLocaleString("ar-EG");

        const dash = await callBackend("getDashboard", { Limit: 20 });
        const d = dash?.data || {};
        const tripsRes = { data: d.trips };
        const fuelRes = { data: d.fuel };
        const balanceRes = { data: d.my_balance };
        const expensesRes = { data: d.monthly_expenses };

        if (tripsRes?.data) {
            const trips = tripsRes.data;
            document.getElementById("stat-active-trips").innerText = trips.filter(t => t[7] === "OPEN").length;
            state.cache.trips = trips;
            state.activeTrips = trips;
        }

        if (fuelRes?.data) {
            const bal = fuelRes.data.current_balance || 0;
            const el = document.getElementById("stat-fuel-balance");
            el.innerText = bal.toFixed(2) + " ج.م";
            el.style.color = bal < 0 ? "#ef4444" : "#22c55e";
        }

        if (balanceRes?.data) {
            const myBalance = balanceRes.data.current_balance || 0;
            document.getElementById("stat-my-balance").innerText = myBalance.toFixed(2) + " ج.م";
            state.myBalance = myBalance;
        }

        if (expensesRes?.data) {
            const monthlyTotal = expensesRes.data.total || 0;
            document.getElementById("stat-total-expenses").innerText = monthlyTotal.toFixed(2) + " ج.م";
        }

        // تحديث إحصائيات السيارات والسائقين من بيانات الرحلات
        const trips = d.trips || [];
        const activeTrips = trips.filter(t => t[7] === "OPEN");
        const vehiclesInTrip = new Set(activeTrips.map(t => t[4]).filter(Boolean));
        const driversInTrip = new Set(activeTrips.map(t => t[3]).filter(Boolean));

        if (state.cache.vehicles) {
            const total = state.cache.vehicles.length;
            const inTrip = vehiclesInTrip.size;
            document.getElementById("stat-vehicles").innerHTML = `<span class="text-emerald-400">${total - inTrip}</span> / <span class="text-rose-400">${inTrip}</span>`;
        }
        if (state.cache.drivers) {
            const total = state.cache.drivers.length;
            const inTrip = driversInTrip.size;
            document.getElementById("stat-drivers").innerHTML = `<span class="text-emerald-400">${total - inTrip}</span> / <span class="text-rose-400">${inTrip}</span>`;
        }

        // التشارتات + تحليل الجاز
        renderExpenseChart();
        renderFuelChart();
        loadFuelAnalytics();

    } catch (err) {
        console.error("فشل تحديث لوحة التحكم:", err);
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

        if (driversRes?.data) {
            state.cache.drivers = driversRes.data;
            const select = document.getElementById("trip-driver-id");
            if (select) {
                select.innerHTML = '<option value="">-- اختر --</option>';
                driversRes.data.forEach(driver => {
                    const opt = document.createElement("option");
                    opt.value = driver.driver_id;
                    opt.textContent = driver.full_name + (driver.current_advance > 0 ? ` (عهدة: ${driver.current_advance})` : "");
                    select.appendChild(opt);
                });
            }
        }

        if (vehiclesRes?.data) {
            state.cache.vehicles = vehiclesRes.data;
            const select = document.getElementById("trip-vehicle-id");
            if (select) {
                select.innerHTML = '<option value="">-- اختر --</option>';
                vehiclesRes.data.forEach(vehicle => {
                    const opt = document.createElement("option");
                    opt.value = vehicle.vehicle_id;
                    opt.textContent = vehicle.plate_number + " (" + vehicle.model + ")";
                    select.appendChild(opt);
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

function lookupClientName(clientId) {
    if (!clientId) return "—";
    const client = (state.cache.clients || []).find(c => c.client_id === clientId);
    return client ? client.client_name : clientId;
}

// ─── 5️⃣-د: الرحلات ───
async function loadTripsData(forceRefresh = false) {
    const tbodyOpen = document.getElementById("table-trips-open");
    const tbodyClosed = document.getElementById("table-trips-closed");
    if (!tbodyOpen || !tbodyClosed) return;

    if (!forceRefresh && state.cache.trips) {
        renderTripsTable(state.cache.trips);
        return;
    }

    tbodyOpen.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-muted text-xs"><i class="fa-solid fa-spinner fa-spin ml-2"></i>جاري التحميل...</td></tr>`;
    tbodyClosed.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-muted text-xs"><i class="fa-solid fa-spinner fa-spin ml-2"></i>جاري التحميل...</td></tr>`;

    try {
        const response = await callBackend("getTrips", { Limit: 50 });
        state.cache.trips = response.data || [];
        state.activeTrips = state.cache.trips;
        renderTripsTable(state.cache.trips);
    } catch (err) {
        tbodyOpen.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-rose-500 text-xs">فشل جلب البيانات</td></tr>`;
        tbodyClosed.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-rose-500 text-xs">فشل جلب البيانات</td></tr>`;
        console.error("loadTripsData Error:", err);
    }
}

function renderTripsTable(trips) {
    const tbodyOpen = document.getElementById("table-trips-open");
    const tbodyClosed = document.getElementById("table-trips-closed");
    if (!tbodyOpen || !tbodyClosed) return;

    const validTrips = trips.filter(t => t[0] && t[0] !== "Trip_ID" && !(t[13] === true || t[13] === "TRUE"));
    const openTrips = validTrips.filter(t => (t[7] || "OPEN") === "OPEN");
    const closedTrips = validTrips.filter(t => (t[7] || "OPEN") === "CLOSED");

    const renderTable = (tbody, tripsList, showActions) => {
        const fragment = document.createDocumentFragment();
        if (tripsList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-muted text-xs">لا يوجد رحلات</td></tr>`;
            return;
        }
        tripsList.forEach(trip => {
            const tripId = trip[0];
            const status = trip[7] || "OPEN";
            const currentVersion = trip[12] || 1;
            const role = state.user.role;

            let badgeClass = "bg-slate-800 text-slate-400";
            let statusLabel = status;
            if (status === "OPEN") { badgeClass = "bg-sky-500/10 text-sky-400 border border-sky-500/20"; statusLabel = "مفتوحة"; }
            if (status === "CLOSED") { badgeClass = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"; statusLabel = "مغلقة"; }

            let actionButtons = "";
            if (showActions && status === "OPEN") {
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
            } else if (!showActions) {
                actionButtons = `<span class="text-xs text-emerald-500 font-semibold"><i class="fa-solid fa-lock ml-1"></i> مغلقة</span>`;
            }

            const row = document.createElement("tr");
            row.className = "table-row hover:bg-hover transition";
            row.innerHTML = `
                <td class="p-2 font-mono text-xs text-muted" data-label="الرحلة">${tripId}</td>
                <td class="p-2 text-xs" data-label="العميل">${lookupClientName(trip[2])}</td>
                <td class="p-2 text-xs font-medium" data-label="السائق">${lookupDriverName(trip[3])}</td>
                <td class="p-2 text-xs" data-label="السيارة">${lookupVehicleLabel(trip[4])}</td>
                <td class="p-2 font-mono text-xs text-amber-400" data-label="الجاز">${parseFloat(trip[14] || 0).toFixed(1)} لتر</td>
                <td class="p-2" data-label="الحالة"><span class="px-2 py-1 rounded-full text-xs font-semibold ${badgeClass}">${statusLabel}</span></td>
                <td class="p-2 text-xs text-muted" data-label="بواسطة">${lookupUserName(trip[9])}</td>
                <td class="p-2 text-center" data-label="">${actionButtons}</td>
            `;
            fragment.appendChild(row);
        });
        tbody.innerHTML = "";
        tbody.appendChild(fragment);
    };

    renderTable(tbodyOpen, openTrips, true);
    renderTable(tbodyClosed, closedTrips, false);
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
const SETTLE_EXPENSE_CATEGORIES = ["بنزين / سولار", "كارتة طرق", "إصلاحات", "إكراميات", "مبيت ومأكل", "أخرى"];
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

    setButtonLoading(submitBtn, true, "جاري البث...");

    const params = {
        Customer_ID: document.getElementById("trip-customer-id")?.value || "",
        Driver_ID: document.getElementById("trip-driver-id")?.value || "",
        Vehicle_ID: document.getElementById("trip-vehicle-id")?.value || "",
        Route: document.getElementById("trip-route")?.value.trim() || "",
        Advance_Cash: document.getElementById("trip-advance-cash")?.value || 0,
        Fuel_Liters: document.getElementById("trip-fuel-liters")?.value || 0,
        Fuel_Price: document.getElementById("trip-fuel-price")?.value || 0
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

// ─── 5️⃣-و: مصاريف الشركة ───
async function handleAddExpenseSubmit(e) {
    e.preventDefault();
    const submitBtn = document.getElementById("btn-expense-submit");
    const editId = document.getElementById("expense-edit-id")?.value || "";
    const isEdit = !!editId;

    setButtonLoading(submitBtn, true, "جاري الحفظ...");

    const base64Payload = document.getElementById("expense-file-base64")?.value || "";
    const fileNamePayload = document.getElementById("expense-file-name")?.value || "";

    const params = {
        Expense_Category: document.getElementById("expense-category")?.value || "",
        Amount: document.getElementById("expense-amount")?.value || 0,
        Description: document.getElementById("expense-description")?.value?.trim() || "",
        bodyPayload: {
            Receipt_File_Base64: base64Payload,
            File_Name: fileNamePayload
        }
    };

    if (params.Expense_Category === "أخرى") {
        const customCat = document.getElementById("expense-other-category")?.value?.trim();
        if (customCat) params.Expense_Category = customCat;
    }

    if (!params.Expense_Category || parseFloat(params.Amount) <= 0) {
        Swal.fire({ icon: 'warning', title: 'بيانات ناقصة', text: 'برجاء اختيار النوع وإدخال المبلغ.' });
        setButtonLoading(submitBtn, false, '<i class="fa-solid fa-cloud-arrow-up ml-1"></i> تسجيل المصروف');
        return;
    }

    try {
        if (isEdit) {
            params.Expense_ID = editId;
            await callBackend("updateExpense", params);
        } else {
            await callBackend("addExpense", params);
        }
        Swal.fire({ icon: 'success', title: isEdit ? 'تم التحديث' : 'تم الحفظ', text: isEdit ? 'تم تعديل المصروف.' : 'تم تسجيل المصروف.', timer: 2000, showConfirmButton: false });
        cancelEditExpense();
        document.getElementById("expense-file-base64").value = "";
        document.getElementById("expense-file-name").value = "";
        loadExpensesData(true);
        refreshDashboard();
    } catch (err) {
        handleStandardError(err);
    } finally {
        setButtonLoading(submitBtn, false, '<i class="fa-solid fa-cloud-arrow-up ml-1"></i> تسجيل المصروف');
    }
}

function cancelEditExpense() {
    document.getElementById("expense-edit-id").value = "";
    document.getElementById("form-add-expense").reset();
    document.getElementById("expense-file-base64").value = "";
    document.getElementById("expense-file-name").value = "";
    document.getElementById("btn-expense-cancel-edit").classList.add("hidden");
    document.getElementById("btn-expense-submit").innerHTML = '<i class="fa-solid fa-cloud-arrow-up ml-1"></i> تسجيل المصروف';
}

function fillExpenseForm(expense) {
    document.getElementById("expense-category").value = expense.category || "";
    document.getElementById("expense-description").value = expense.description || "";
    document.getElementById("expense-amount").value = expense.amount || "";
    document.getElementById("expense-edit-id").value = expense.expense_id || "";
    document.getElementById("btn-expense-cancel-edit").classList.remove("hidden");
    document.getElementById("btn-expense-submit").innerHTML = '<i class="fa-solid fa-pen ml-1"></i> تحديث المصروف';
}

let expensesState = { data: [], filtered: [], page: 1, pageSize: 15 };

async function loadExpensesData(forceRefresh = false) {
    const tbody = document.getElementById("table-expenses-body");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-muted"><i class="fa-solid fa-spinner fa-spin ml-2"></i>جاري التحميل...</td></tr>`;

    try {
        const response = await callBackend("getExpenses", { Type: "COMPANY" });
        expensesState.data = response.data || [];
        expensesState.filtered = [...expensesState.data];
        expensesState.page = 1;
        renderExpensesTable();
        updateExpensesSummary();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-rose-500">فشل جلب البيانات</td></tr>`;
        console.error("loadExpensesData Error:", err);
    }
}

function renderExpensesTable() {
    const tbody = document.getElementById("table-expenses-body");
    if (!tbody) return;

    const filtered = applyExpensesFilters();
    expensesState.filtered = filtered;

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / expensesState.pageSize));
    if (expensesState.page > totalPages) expensesState.page = totalPages;

    const start = (expensesState.page - 1) * expensesState.pageSize;
    const pageItems = filtered.slice(start, start + expensesState.pageSize);

    document.getElementById("exp-table-count").textContent = `${totalItems} مصروف`;
    document.getElementById("expenses-pagination-page").textContent = `صفحة ${expensesState.page} من ${totalPages}`;
    document.getElementById("btn-expenses-prev").classList.toggle("hidden", expensesState.page <= 1);
    document.getElementById("btn-expenses-next").classList.toggle("hidden", expensesState.page >= totalPages);

    if (pageItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-muted">لا توجد مصروفات</td></tr>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    const userCache = state.cache?.users || [];

    pageItems.forEach(ex => {
        const row = document.createElement("tr");
        row.className = "table-row hover:bg-hover transition";
        const dateStr = ex.expense_date ? new Date(ex.expense_date).toLocaleDateString("ar-EG") : "--";
        const userName = ex.created_by ? (userCache.find(u => u.user_id === ex.created_by)?.full_name || ex.created_by) : "--";
        const receiptHtml = ex.receipt_file_id
            ? `<a href="https://drive.google.com/file/d/${ex.receipt_file_id}/view" target="_blank" class="text-amber-400 text-xs"><i class="fa-solid fa-paperclip"></i></a>`
            : `<span class="text-muted text-xs">—</span>`;
        const actionBtns = `
            <button onclick="editExpense('${ex.expense_id}')" class="px-2 py-1 text-xs bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition"><i class="fa-solid fa-pen"></i></button>
            <button onclick="deleteExpense('${ex.expense_id}')" class="px-2 py-1 text-xs bg-rose-500/20 text-rose-400 rounded-lg hover:bg-rose-500/30 transition"><i class="fa-solid fa-trash"></i></button>
        `;
        row.innerHTML = `
            <td class="p-4" data-label="النوع">${esc(ex.category)}</td>
            <td class="p-4 text-xs text-muted" data-label="البيان">${esc(ex.description || '—')}</td>
            <td class="p-4 font-mono font-medium text-rose-400" data-label="القيمة">${(ex.amount || 0).toLocaleString()} ج.م</td>
            <td class="p-4 text-center" data-label="الإيصال">${receiptHtml}</td>
            <td class="p-4 text-xs" data-label="التاريخ">${dateStr}</td>
            <td class="p-4 text-xs text-muted" data-label="بواسطة">${esc(userName)}</td>
            <td class="p-4 text-center" data-label="">${actionBtns}</td>
        `;
        fragment.appendChild(row);
    });

    tbody.innerHTML = "";
    tbody.appendChild(fragment);
}

function applyExpensesFilters() {
    const search = (document.getElementById("expense-search")?.value || "").trim().toLowerCase();
    const fromDate = document.getElementById("expense-filter-from")?.value;
    const toDate = document.getElementById("expense-filter-to")?.value;
    const typeFilter = document.getElementById("expense-filter-type")?.value || "";

    return expensesState.data.filter(ex => {
        if (typeFilter && ex.category !== typeFilter) return false;
        if (search && !(ex.category?.toLowerCase().includes(search) || (ex.description || "").toLowerCase().includes(search))) return false;
        if (fromDate && ex.expense_date && new Date(ex.expense_date) < new Date(fromDate)) return false;
        if (toDate && ex.expense_date) {
            const toEnd = new Date(toDate);
            toEnd.setHours(23, 59, 59, 999);
            if (new Date(ex.expense_date) > toEnd) return false;
        }
        return true;
    });
}

function updateExpensesSummary() {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    let monthTotal = 0;

    (expensesState.data || []).forEach(ex => {
        const d = ex.expense_date ? new Date(ex.expense_date) : null;
        if (d && d.getMonth() === thisMonth && d.getFullYear() === thisYear) {
            monthTotal += ex.amount || 0;
        }
    });

    document.getElementById("expenses-month-total").innerText = monthTotal.toFixed(2) + " ج.م";
}

window.editExpense = async function(expenseId) {
    const ex = expensesState.data.find(e => e.expense_id === expenseId);
    if (!ex) return;
    fillExpenseForm(ex);
    document.getElementById("form-add-expense").scrollIntoView({ behavior: "smooth" });
};

window.deleteExpense = async function(expenseId) {
    const result = await Swal.fire({
        title: 'حذف المصروف؟',
        text: 'هل أنت متأكد من حذف هذا المصروف؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'حذف',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#e11d48'
    });

    if (result.isConfirmed) {
        try {
            await callBackend("deleteExpense", { Expense_ID: expenseId });
            Swal.fire({ icon: 'success', title: 'تم الحذف', timer: 1500, showConfirmButton: false });
            loadExpensesData(true);
            refreshDashboard();
        } catch (err) {
            handleStandardError(err);
        }
    }
};

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
        document.getElementById("expense-file-base64").value = event.target.result.split(',')[1];
        document.getElementById("expense-file-name").value = `Receipt_${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    };
    reader.readAsDataURL(file);
}

function exportExpensesToExcel() {
    const data = expensesState.filtered || [];
    if (data.length === 0) {
        Swal.fire({ icon: 'info', title: 'لا توجد بيانات', text: 'لا توجد مصروفات للتصدير.' });
        return;
    }
    let csv = "النوع,البيان,القيمة,التاريخ,بواسطة\n";
    data.forEach(ex => {
        const dateStr = ex.expense_date ? new Date(ex.expense_date).toLocaleDateString("ar-EG") : "--";
        const desc = (ex.description || "").replace(/,/g, " ");
        csv += `${ex.category},${desc},${ex.amount || 0},${dateStr},${ex.created_by || ""}\n`;
    });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `مصاريف_الشركة_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

let expenseChartInstance = null;
let fuelChartInstance = null;

async function renderExpenseChart() {
    const canvas = document.getElementById("chart-expenses");
    if (!canvas) return;

    try {
        const response = await callBackend("getExpenseBreakdown");
        const data = response?.data;
        if (!data || !data.breakdown) {
            if (expenseChartInstance) { expenseChartInstance.destroy(); expenseChartInstance = null; }
            return;
        }

        if (expenseChartInstance) expenseChartInstance.destroy();

        const labels = Object.keys(data.breakdown);
        const values = labels.map(k => data.breakdown[k]);

        expenseChartInstance = new Chart(canvas, {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: "المبلغ (ج.م)",
                    data: values,
                    backgroundColor: ["#f97316", "#e11d48", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#14b8a6", "#ec4899"],
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#94a3b8" } },
                    x: { grid: { display: false }, ticks: { color: "#94a3b8" } }
                }
            }
        });
    } catch (err) {
        console.error("Expense chart error:", err);
    }
}

async function renderFuelChart() {
    const canvas = document.getElementById("chart-fuel");
    if (!canvas) return;

    try {
        const response = await callBackend("getFuelAnalytics");
        const data = response?.data;
        const items = data?.vehicles;
        if (!items || items.length === 0) {
            if (fuelChartInstance) { fuelChartInstance.destroy(); fuelChartInstance = null; }
            return;
        }

        if (fuelChartInstance) fuelChartInstance.destroy();

        const topItems = items.slice(0, 10);
        const labels = topItems.map(i => lookupVehicleLabel(i.vehicle_id));
        const values = topItems.map(i => parseFloat(i.total_liters) || 0);

        fuelChartInstance = new Chart(canvas, {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: "لترات",
                    data: values,
                    backgroundColor: "#10b981",
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#94a3b8" } },
                    x: { grid: { display: false }, ticks: { color: "#94a3b8" } }
                }
            }
        });
    } catch (err) {
        console.error("Fuel chart error:", err);
    }
}

async function loadFuelAnalytics() {
    const tbody = document.querySelector("#fuel-analytics-table tbody");
    if (!tbody) return;

    try {
        const response = await callBackend("getFuelAnalytics");
        const data = response?.data;
        const items = data?.vehicles;
        if (!items || items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">لا توجد بيانات</td></tr>';
            document.getElementById("fuel-analytics-total").textContent = "0";
            return;
        }

        let grandTotal = 0;
        const fragment = document.createDocumentFragment();

        items.forEach(item => {
            const liters = parseFloat(item.total_liters) || 0;
            const cost = parseFloat(item.total_cost) || 0;
            const trips = parseInt(item.trip_count) || 0;
            grandTotal += liters;

            const row = document.createElement("tr");
            row.className = "border-b border-border hover:bg-hover/50 transition";
            row.innerHTML = `
                <td class="py-2 px-2">${lookupVehicleLabel(item.vehicle_id)}</td>
                <td class="py-2 px-2 font-mono">${liters.toFixed(1)}</td>
                <td class="py-2 px-2 font-mono">${cost.toFixed(2)}</td>
                <td class="py-2 px-2">${trips}</td>
            `;
            fragment.appendChild(row);
        });

        document.getElementById("fuel-analytics-total").textContent = grandTotal.toFixed(1);
        tbody.innerHTML = "";
        tbody.appendChild(fragment);

    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-rose-500">فشل التحميل</td></tr>';
        console.error("Fuel analytics error:", err);
    }
}

function lookupUserName(userId) {
    if (!userId) return "—";
    const user = (state.cache.users || []).find(u => u.user_id === userId);
    return user ? (user.full_name || user.name || userId) : userId;
}

// ─── 5️⃣-ز: البنزينة ───
async function loadFuelData() {
    try {
        const response = await callBackend("getFuelBalance");
        if (response && response.data) {
            const balance = response.data.current_balance || 0;
            const price = response.data.fuel_price_per_liter || 0;
            const totalLiters = price > 0 ? (balance / price) : 0;
            document.getElementById("fuel-current-balance").innerText = balance.toFixed(2) + " ج.م";
            document.getElementById("fuel-total-liters").innerText = totalLiters.toFixed(1) + " لتر";
        }
        await loadFuelTransactions();
    } catch (err) {
        handleStandardError(err);
    }
}

async function loadFuelTransactions() {
    const tbody = document.getElementById("table-fuel-transactions") || document.getElementById("table-fuel-body");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-muted"><i class="fa-solid fa-spinner fa-spin ml-2"></i>جاري التحميل...</td></tr>`;

    try {
        const response = await callBackend("getFuelTransactions", { Limit: 20 });
        if (response && response.data) {
            state.fuelTransactions = response.data;
            renderFuelTransactions(response.data);
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-rose-500">فشل جلب البيانات</td></tr>`;
    }
}

function renderFuelTransactions(transactions) {
    const tbody = document.getElementById("table-fuel-transactions") || document.getElementById("table-fuel-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-muted">لا توجد حركات</td></tr>`;
        return;
    }

    const fragment = document.createDocumentFragment();

    const sourceMap = {
        'INITIAL': 'داخلي - بداية رحلة',
        'ROAD': 'خارجي - أثناء الرحلة',
        'ADD': 'إضافة رصيد'
    };

    transactions.forEach(t => {
        const row = document.createElement("tr");
        row.className = "table-row hover:bg-hover transition";
        const typeMap = {
            'ADD': '➕ إضافة',
            'INITIAL': '⛽ بداية رحلة',
            'ROAD': '🛣️ جاز طريق'
        };
        row.innerHTML = `
            <td class="p-4 text-xs" data-label="التاريخ">${t.created_at ? new Date(t.created_at).toLocaleString('ar-EG') : ''}</td>
            <td class="p-4 text-xs" data-label="السيارة">${lookupVehicleLabel(t.vehicle_id)}</td>
            <td class="p-4 text-xs" data-label="النوع">${typeMap[t.transaction_type] || t.transaction_type}</td>
            <td class="p-4 text-xs" data-label="اللترات">${t.amount_liters || 0}</td>
            <td class="p-4 text-xs ${t.amount_egp < 0 ? 'text-rose-400' : 'text-emerald-400'}" data-label="القيمة">${t.amount_egp || 0}</td>
            <td class="p-4 text-xs" data-label="المصدر">${sourceMap[t.transaction_type] || t.source || '--'}</td>
            <td class="p-4 text-xs" data-label="بواسطة">${lookupUserName(t.created_by)}</td>
        `;
        fragment.appendChild(row);
    });

    tbody.innerHTML = "";
    tbody.appendChild(fragment);
}

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

// ─── 5️⃣-ح: السيارات ───
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
        const actionBtns = `
            <button onclick="editVehicle('${v.vehicle_id}')" class="px-2 py-1 text-xs bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition"><i class="fa-solid fa-pen ml-1"></i> تعديل</button>
            <button onclick="deleteVehicle('${v.vehicle_id}')" class="px-2 py-1 text-xs bg-rose-500/20 text-rose-400 rounded-lg hover:bg-rose-500/30 transition"><i class="fa-solid fa-trash ml-1"></i> حذف</button>
        `;
        row.innerHTML = `
            <td class="p-4 text-xs font-mono" data-label="الرقم">${v.vehicle_id}</td>
            <td class="p-4 font-medium" data-label="اللوحة">${v.plate_number}</td>
            <td class="p-4 text-xs" data-label="الموديل">${v.model}</td>
            <td class="p-4 text-xs" data-label="النوع">${v.type || '--'}</td>
            <td class="p-4 text-xs ${isExpired ? 'text-rose-400' : 'text-emerald-400'}" data-label="الرخصة">${v.license_expiry || '--'}</td>
            <td class="p-4 text-center" data-label="">${actionBtns}</td>
        `;
        fragment.appendChild(row);
    });

    tbody.innerHTML = "";
    tbody.appendChild(fragment);
}

async function handleAddVehicle() {
    const { value: formValues } = await Swal.fire({
        title: 'إضافة سيارة جديدة',
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
        title: 'تعديل السيارة',
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
        text: 'هل أنت متأكد من حذف هذه السيارة؟',
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
        const actionBtns = `
            <button onclick="editDriver('${d.driver_id}')" class="px-2 py-1 text-xs bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition"><i class="fa-solid fa-pen ml-1"></i> تعديل</button>
            <button onclick="deleteDriver('${d.driver_id}')" class="px-2 py-1 text-xs bg-rose-500/20 text-rose-400 rounded-lg hover:bg-rose-500/30 transition"><i class="fa-solid fa-trash ml-1"></i> حذف</button>
        `;
        row.innerHTML = `
            <td class="p-4 font-medium" data-label="الاسم">${d.full_name}</td>
            <td class="p-4 text-xs" data-label="التليفون">${d.phone || '--'}</td>
            <td class="p-4 text-xs" data-label="الرخصة">${d.license_number || '--'}</td>
            <td class="p-4 text-xs ${d.current_advance > 0 ? 'text-amber-400' : 'text-emerald-400'}" data-label="العهدة">${d.current_advance || 0}</td>
            <td class="p-4 text-center" data-label="">${actionBtns}</td>
        `;
        fragment.appendChild(row);
    });

    tbody.innerHTML = "";
    tbody.appendChild(fragment);
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
        const actionBtns = `
            <button onclick="editClient('${c.client_id}')" class="px-2 py-1 text-xs bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition"><i class="fa-solid fa-pen ml-1"></i> تعديل</button>
            <button onclick="deleteClient('${c.client_id}')" class="px-2 py-1 text-xs bg-rose-500/20 text-rose-400 rounded-lg hover:bg-rose-500/30 transition"><i class="fa-solid fa-trash ml-1"></i> حذف</button>
        `;
        row.innerHTML = `
            <td class="p-4 font-medium" data-label="الاسم">${c.client_name}</td>
            <td class="p-4 text-xs" data-label="التليفون">${c.phone || '--'}</td>
            <td class="p-4 text-xs" data-label="العنوان">${c.address || '--'}</td>
            <td class="p-4 text-center" data-label="">${actionBtns}</td>
        `;
        fragment.appendChild(row);
    });

    tbody.innerHTML = "";
    tbody.appendChild(fragment);
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
                document.getElementById("balance-my-balance").innerText = (userBalanceRes.data.current_balance || 0).toFixed(2) + " ج.م";
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
            document.getElementById("balance-my-balance").innerText = (myBalanceRes.data.current_balance || 0).toFixed(2) + " ج.م";
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
            <td class="p-4 text-xs" data-label="التاريخ">${t.created_at ? new Date(t.created_at).toLocaleString('ar-EG') : ''}</td>
            <td class="p-4 text-xs font-mono" data-label="المستخدم">${t.user_id || '--'}</td>
            <td class="p-4 text-xs" data-label="النوع">${typeMap[t.transaction_type] || t.transaction_type}</td>
            <td class="p-4 text-xs ${isPositive ? 'text-emerald-400' : 'text-rose-400'}" data-label="المبلغ">${t.amount || 0}</td>
            <td class="p-4 text-xs" data-label="الرصيد بعد">${t.balance_after || 0}</td>
            <td class="p-4 text-xs text-muted" data-label="ملاحظات">${t.notes || ''}</td>
        `;
        fragment.appendChild(row);
    });

    tbody.innerHTML = "";
    tbody.appendChild(fragment);
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
            <td class="p-4 font-medium" data-label="الموظف">${user.full_name}</td>
            <td class="p-4 text-xs font-mono text-muted" data-label="المستخدم">${user.username}</td>
            <td class="p-4" data-label="الدور">${roleBadge}</td>
            <td class="p-4" data-label="الحالة">${statusBadge}</td>
            <td class="p-4 text-center" data-label="">${actions}</td>
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

// ─── 5️⃣-ن: الصلاحيات ───
let permissionsData = null;

async function loadPermissionsMatrix() {
    const container = document.getElementById('permissions-matrix');
    const saveBtn = document.getElementById('btn-save-permissions');
    if (!container) return;

    container.innerHTML = '<p class="text-sm text-muted p-4 text-center"><i class="fa-solid fa-spinner fa-spin ml-2"></i>جاري التحميل...</p>';

    try {
        const res = await callBackend('getPermissions', {});
        if (!res.success) {
            container.innerHTML = `<p class="text-sm text-rose-500 p-4 text-center">فشل تحميل الصلاحيات: ${res.message}</p>`;
            return;
        }

        permissionsData = res.data;
        renderPermissionsMatrix(container, permissionsData);
        saveBtn.classList.remove('hidden');
    } catch (err) {
        container.innerHTML = `<p class="text-sm text-rose-500 p-4 text-center">خطأ: ${err.message}</p>`;
    }
}

function renderPermissionsMatrix(container, data) {
    const roles = Object.keys(data.roles);
    const allActions = data.allActions || [];

    const categories = {
        'الرحلات': ['getTrips', 'getDrivers', 'createTrip', 'updateTripStatus', 'updateTrip', 'settleTripFinancials', 'getTripExpenses'],
        'المصروفات': ['addExpense', 'updateExpense', 'deleteExpense', 'getExpenses', 'getMonthlyExpenses'],
        'المستخدمين': ['createUser', 'getUsers', 'toggleUserStatus', 'updateUserRole', 'deleteUser', 'resetUserPassword'],
        'السيارات': ['getVehicles', 'createVehicle', 'updateVehicle', 'deleteVehicle'],
        'السائقين': ['getDriversList', 'createDriver', 'updateDriverData', 'deleteDriver'],
        'العملاء': ['getClients', 'createClient', 'updateClient', 'deleteClient'],
        'البنزينة': ['getFuelBalance', 'addFuelBalance', 'getFuelTransactions', 'getFuelAnalytics', 'updateFuelPrice'],
        'التنبيهات': ['getNotifications', 'markNotificationRead', 'markAllNotificationsRead', 'deleteNotification'],
        'الصيانة': ['getMaintenance', 'getVehicleMaintenance', 'getTripMaintenance', 'updateMaintenance', 'deleteMaintenance'],
        'العهدات': ['getMyBalance', 'getUserBalance', 'getMyTransactions', 'getAllTransactions', 'addBalance', 'deductBalance', 'transferBalance'],
        'أخرى': ['getDashboard', 'getLookups', 'logout', 'viewAuditLog']
    };

    const roleLabels = { 'Admin': 'مدير نظام', 'Manager': 'مدير عام', 'Operations': 'عمليات', 'Accountant': 'محاسب' };
    const actionLabels = {
        'getTrips': 'عرض الرحلات', 'getDrivers': 'عرض السائقين', 'createTrip': 'إنشاء رحلة',
        'updateTripStatus': 'تحديث حالة الرحلة', 'updateTrip': 'تعديل الرحلة',
        'settleTripFinancials': 'تصفية الرحلة', 'getTripExpenses': 'مصروفات الرحلة',
        'addExpense': 'إضافة مصروف', 'updateExpense': 'تعديل مصروف', 'deleteExpense': 'حذف مصروف',
        'getExpenses': 'عرض المصروفات', 'getMonthlyExpenses': 'مصروفات الشهر',
        'createUser': 'إنشاء مستخدم', 'getUsers': 'عرض المستخدمين', 'toggleUserStatus': 'تعطيل/تفعيل مستخدم',
        'updateUserRole': 'تغيير دور', 'deleteUser': 'حذف مستخدم', 'resetUserPassword': 'إعادة كلمة السر',
        'getVehicles': 'عرض السيارات', 'createVehicle': 'إضافة سيارة', 'updateVehicle': 'تعديل سيارة', 'deleteVehicle': 'حذف سيارة',
        'getDriversList': 'عرض السائقين', 'createDriver': 'إضافة سائق', 'updateDriverData': 'تعديل سائق', 'deleteDriver': 'حذف سائق',
        'getClients': 'عرض العملاء', 'createClient': 'إضافة عميل', 'updateClient': 'تعديل عميل', 'deleteClient': 'حذف عميل',
        'getFuelBalance': 'رصيد البنزينة', 'addFuelBalance': 'إضافة رصيد بنزينة',
        'getFuelTransactions': 'حركة البنزينة', 'getFuelAnalytics': 'تحليل البنزينة', 'updateFuelPrice': 'تحديث سعر السولار',
        'getNotifications': 'عرض التنبيهات', 'markNotificationRead': 'تحديد مقروء', 'markAllNotificationsRead': 'تحديد الكل مقروء',
        'deleteNotification': 'حذف تنبيه',
        'getMaintenance': 'عرض الصيانة', 'getVehicleMaintenance': 'صيانة سيارة', 'getTripMaintenance': 'صيانة رحلة',
        'updateMaintenance': 'تحديث صيانة', 'deleteMaintenance': 'حذف صيانة',
        'getMyBalance': 'رصيدي', 'getUserBalance': 'رصيد مستخدم', 'getMyTransactions': 'حركتي',
        'getAllTransactions': 'كل الحركة', 'addBalance': 'إضافة عهدة', 'deductBalance': 'خصم عهدة', 'transferBalance': 'تحويل عهدة',
        'getDashboard': 'لوحة التحكم', 'getLookups': 'قوائم', 'logout': 'تسجيل خروج', 'viewAuditLog': 'سجل التدقيق'
    };

    let html = '<table class="w-full text-right border-collapse text-xs"><thead><tr><th class="p-2 text-muted border-b border-border">الإجراء</th>';
    roles.forEach(role => {
        html += `<th class="p-2 text-center border-b border-border">${roleLabels[role] || role}</th>`;
    });
    html += '</tr></thead><tbody>';

    Object.entries(categories).forEach(([category, actions]) => {
        html += `<tr class="bg-secondary/40"><td colspan="${roles.length + 1}" class="p-2 text-xs font-bold text-muted">${category}</td></tr>`;
        actions.forEach(action => {
            html += `<tr class="hover:bg-hover/50 transition"><td class="p-1.5 pr-3 text-muted">${actionLabels[action] || action}</td>`;
            roles.forEach(role => {
                const checked = (data.roles[role] || []).includes(action);
                html += `<td class="p-1.5 text-center"><input type="checkbox" data-role="${role}" data-action="${action}" ${checked ? 'checked' : ''} class="w-4 h-4 accent-amber-500 cursor-pointer"></td>`;
            });
            html += '</tr>';
        });
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

async function savePermissionsMatrix() {
    if (!permissionsData) return;

    const container = document.getElementById('permissions-matrix');
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');

    const newRoles = {};
    checkboxes.forEach(cb => {
        const role = cb.dataset.role;
        const action = cb.dataset.action;
        if (!newRoles[role]) newRoles[role] = [];
        if (cb.checked) newRoles[role].push(action);
    });

    Object.keys(permissionsData.roles).forEach(role => {
        if (!newRoles[role]) newRoles[role] = [];
    });

    try {
        const res = await callBackend('savePermissions', {
            bodyPayload: JSON.stringify(newRoles)
        });

        if (res.success) {
            Swal.fire({ icon: 'success', title: 'تم حفظ الصلاحيات', timer: 1500, showConfirmButton: false });
            permissionsData.roles = newRoles;
        } else {
            Swal.fire({ icon: 'error', title: 'فشل الحفظ', text: res.message });
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'خطأ', text: err.message });
    }
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

// ─── 6️⃣-ب: SwipeController للموبايل ───
// يكتشف السحب الأفقي على العناصر المميزة بـ data-swipeable
const SWIPE_THRESHOLD = 60;
let swipeState = { el: null, startX: 0, currentX: 0, isDragging: false };

function initSwipeController(container) {
    if (!('ontouchstart' in window)) return;
    if (!container) container = document;
    // فقط على الشاشات الصغيرة
    if (window.innerWidth > 768) return;

    container.addEventListener('touchstart', (e) => {
        // استهداف أي tr داخل الجدول
        const target = e.target.closest('.card .overflow-x-auto tr');
        if (!target) return;
        // لا تسحب if فيه زر محدد (onclick)
        if (e.target.closest('button, a, input')) return;
        swipeState.el = target;
        swipeState.startX = e.touches[0].clientX;
        swipeState.currentX = swipeState.startX;
        swipeState.isDragging = true;
        target.style.transition = 'none';
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
        if (!swipeState.isDragging || !swipeState.el) return;
        swipeState.currentX = e.touches[0].clientX;
        const diff = swipeState.startX - swipeState.currentX;
        if (diff > 0) {
            swipeState.el.style.transform = `translateX(${-Math.min(diff, 80)}px)`;
        } else {
            swipeState.el.style.transform = `translateX(${Math.min(-diff, 20)}px)`;
        }
    }, { passive: true });

    container.addEventListener('touchend', () => {
        if (!swipeState.isDragging || !swipeState.el) return;
        swipeState.isDragging = false;
        const diff = swipeState.startX - swipeState.currentX;
        const el = swipeState.el;
        el.style.transition = 'transform 0.2s ease';

        if (diff > SWIPE_THRESHOLD) {
            // سحب لليسار — كشف الأزرار
            el.style.transform = 'translateX(-70px)';
            el.dataset.swiped = 'true';
        } else {
            // إعادة للموضع الأصلي
            el.style.transform = 'translateX(0)';
            el.dataset.swiped = '';
        }

        // نقرة أو سحب خفيف لليمين يعيد للموضع
        if (diff < -20) {
            el.style.transform = 'translateX(0)';
            el.dataset.swiped = '';
        }

        swipeState.el = null;
    }, { passive: true });
}

// إعادة تعيين السحب عند النقر في أي مكان
document.addEventListener('click', () => {
    if (swipeState.el) return;
    document.querySelectorAll('[data-swiped="true"]').forEach(el => {
        el.style.transform = 'translateX(0)';
        el.dataset.swiped = '';
    });
});

// ─── 6️⃣-ج: Keyboard Awareness للموبايل ───
function initKeyboardAwareness() {
    if (!('ontouchstart' in window)) return;
    document.addEventListener('focusin', (e) => {
        const tag = e.target?.tagName?.toLowerCase();
        if (!['input', 'select', 'textarea'].includes(tag)) return;
        // تأخير صغير لانتظار فتح لوحة المفاتيح
        setTimeout(() => {
            e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 350);
    });
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
    const greeting = document.getElementById("sidebar-greeting");
    const dashGreeting = document.getElementById("dash-greeting");

    const userName = state.user.name || "مستخدم";
    const hour = new Date().getHours();
    let timeGreeting = "مرحبًا";
    if (hour >= 5 && hour < 12) timeGreeting = "صباح الخير";
    else if (hour >= 12 && hour < 18) timeGreeting = "مساء الخير";
    else timeGreeting = "مساء الخير";
    const greetingText = `${timeGreeting}، ${userName}`;
    if (greeting) greeting.innerText = greetingText;
    if (dashGreeting) dashGreeting.innerText = `التقرير اللحظي للأسطول`;

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
}

function updateThemeIcon(theme) {
    const icon = theme === "dark" ? "sun" : "moon";
    const btn = document.getElementById("btn-theme-toggle");
    if (btn) btn.innerHTML = `<i class="fa-solid fa-${icon}"></i>`;
    const dashBtn = document.getElementById("dash-theme-icon");
    if (dashBtn) dashBtn.className = `fa-solid fa-${icon} text-muted`;
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
        state.user = { id: null, name: null, username: null, role: null, token: null, tokenExpiry: null, csrfToken: null };
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

// ─── 📊 محرك التقارير ───

let reportChartInstance = null;

function populateReportYearSelect() {
    const sel = document.getElementById("report-year");
    if (!sel || sel.options.length > 0) return;
    const y = new Date().getFullYear();
    for (let i = y; i >= y - 5; i--) {
        const opt = document.createElement("option");
        opt.value = i; opt.textContent = i;
        sel.appendChild(opt);
    }
}

function loadReports() {
    document.getElementById("report-summary")?.classList.add("hidden");
    document.getElementById("report-chart-container")?.classList.add("hidden");
    document.getElementById("btn-export-report-chart")?.classList.add("hidden");
    const tbody = document.getElementById("report-table-body");
    if (tbody) tbody.innerHTML = '<tr><td colspan="2" class="p-8 text-center text-muted">اختر التقرير واضغط "توليد التقرير"</td></tr>';
    populateReportYearSelect();
}

async function generateReport() {
    const type = document.getElementById("report-type")?.value;
    const fromDate = document.getElementById("report-from-date")?.value || "";
    const toDate = document.getElementById("report-to-date")?.value || "";
    const yearToggle = document.getElementById("report-year-toggle")?.checked;
    const year = document.getElementById("report-year")?.value || new Date().getFullYear();
    
    const btn = document.getElementById("btn-generate-report");
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin ml-1"></i> جاري التوليد...'; }
    
    try {
        let params = {};
        if (fromDate) params.fromDate = fromDate;
        if (toDate) params.toDate = toDate;
        
        const actionMap = {
            expenseBreakdown: "getExpenseBreakdown",
            fuelSummary: "getFuelSummary",
            driverPerformance: "getDriverPerformance",
            clientActivity: "getClientActivity",
            vehicleUtilization: "getVehicleUtilization"
        };
        
        const action = actionMap[type];
        if (!action) { Swal.fire({ icon: 'error', title: 'تقرير غير معروف' }); return; }
        
        const result = await callBackend(action, params);
        if (!result || !result.success) {
            Swal.fire({ icon: 'error', title: 'فشل التقرير', text: result?.message || 'خطأ غير معروف' });
            return;
        }
        
        renderReport(type, result.data);
    } catch (err) {
        handleStandardError(err);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-chart-line ml-1"></i> توليد التقرير'; }
    }
}

function renderReport(type, data) {
    renderReportSummary(type, data);
    renderReportChart(type, data);
    renderReportTable(type, data);
    document.getElementById("btn-export-report")?.classList.remove("hidden");
}

function renderReportSummary(type, data) {
    const container = document.getElementById("report-summary");
    if (!container) return;
    
    let labels = ["الإيرادات", "المصروفات", "صافي الربح", "الهامش"];
    let values = ["0 ج.م", "0 ج.م", "0 ج.م", "0%"];
    
    if (data.summary) {
        const s = data.summary;
        if (type === "fuelSummary") {
            labels = ["إجمالي التكلفة", "إجمالي اللترات", "العمليات", "متوسط السعر"];
            values = [
                (s.totalCost || 0).toLocaleString() + " ج.م",
                (s.totalLiters || 0).toLocaleString() + " لتر",
                (s.transactions || 0).toLocaleString(),
                (s.avgPrice || 0).toFixed(2) + " ج.م/لتر"
            ];
        } else if (type === "driverPerformance") {
            labels = ["إجمالي الإيرادات", "عدد الرحلات", "عدد السائقين", "متوسط الرحلة"];
            values = [
                (s.totalRevenue || 0).toLocaleString() + " ج.م",
                (s.totalTrips || 0).toLocaleString(),
                (s.driverCount || 0).toLocaleString(),
                s.totalTrips > 0 ? Math.round(s.totalRevenue / s.totalTrips).toLocaleString() + " ج.م" : "0 ج.م"
            ];
        } else if (type === "clientActivity") {
            labels = ["إجمالي الإيرادات", "عدد الرحلات", "عدد العملاء", "متوسط الرحلة"];
            values = [
                (s.totalRevenue || 0).toLocaleString() + " ج.م",
                (s.totalTrips || 0).toLocaleString(),
                (s.clientCount || 0).toLocaleString(),
                s.totalTrips > 0 ? Math.round(s.totalRevenue / s.totalTrips).toLocaleString() + " ج.م" : "0 ج.م"
            ];
        } else if (type === "expenseBreakdown") {
            labels = ["إجمالي المصروفات", "عدد المعاملات", "", ""];
            values = [(data.total || 0).toLocaleString() + " ج.م", (data.count || 0).toLocaleString(), "", ""];
        } else if (type === "vehicleUtilization") {
            labels = ["إجمالي الإيرادات", "عدد الرحلات", "عدد السيارات", ""];
            values = [
                (s.totalTrips ? data.breakdown.reduce((a,b) => a + (b.revenue||0), 0) : 0).toLocaleString() + " ج.م",
                (s.totalTrips || 0).toLocaleString(),
                (data.totalVehicles || 0).toLocaleString(),
                ""
            ];
        }
    }
    
    const ids = ["r-summary-1-value", "r-summary-2-value", "r-summary-3-value", "r-summary-4-value"];
    const labelIds = ["r-summary-1-label", "r-summary-2-label", "r-summary-3-label", "r-summary-4-label"];
    
    for (let i = 0; i < 4; i++) {
        const el = document.getElementById(ids[i]);
        if (el) el.textContent = values[i] || "—";
        const lbl = document.getElementById(labelIds[i]);
        if (lbl) lbl.textContent = labels[i] || "";
    }
    
    container.classList.remove("hidden");
}

function renderReportChart(type, data) {
    const container = document.getElementById("report-chart-container");
    if (!container) return;
    
    const canvas = document.getElementById("report-chart");
    if (!canvas) return;
    
    if (reportChartInstance) reportChartInstance.destroy();
    
    let labels = [], datasets = [];

    if (type === "expenseBreakdown" && data.breakdown) {
        const cats = Object.keys(data.breakdown);
        if (cats.length > 0) {
            const colors = ["#f59e0b", "#ef4444", "#3b82f6", "#22c55e", "#8b5cf6", "#ec4899", "#14b8a6"];
            labels = cats;
            datasets = [{
                label: "القيمة (ج.م)",
                data: cats.map(c => data.breakdown[c]),
                backgroundColor: cats.map((_, i) => colors[i % colors.length]),
                borderRadius: 0
            }];
        }
    } else if (type === "fuelSummary" && data.chart) {
        labels = data.chart.labels || [];
        datasets = [{
            label: "تكلفة الوقود (ج.م)",
            data: data.chart.values || [],
            backgroundColor: "#3b82f6",
            borderRadius: 6
        }];
    } else if (type === "driverPerformance" && data.chart) {
        labels = data.chart.labels || [];
        datasets = [{
            label: "الإيرادات (ج.م)",
            data: data.chart.values || [],
            backgroundColor: "#22c55e",
            borderRadius: 6
        }];
    } else if (type === "clientActivity" && data.chart) {
        labels = data.chart.labels || [];
        datasets = [{
            label: "الإيرادات (ج.م)",
            data: data.chart.values || [],
            backgroundColor: "#8b5cf6",
            borderRadius: 6
        }];
    } else if (type === "vehicleUtilization" && data.chart) {
        labels = data.chart.labels || [];
        datasets = [{
            label: "الإيرادات (ج.م)",
            data: data.chart.values || [],
            backgroundColor: "#f59e0b",
            borderRadius: 6
        }];
    }
    
    if (labels.length === 0) { container.classList.add("hidden"); return; }
    
    const ctx = canvas.getContext("2d");
    reportChartInstance = new Chart(ctx, {
        type: type === "expenseBreakdown" ? "pie" : type === "profitLoss" ? "bar" : "bar",
        data: { labels, datasets },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    labels: { color: "#94a3b8", font: { family: "Tajawal" } }
                }
            },
            scales: type !== "expenseBreakdown" ? {
                y: { beginAtZero: true, ticks: { color: "#64748b", font: { family: "Tajawal" } }, grid: { color: "#334155" } },
                x: { ticks: { color: "#94a3b8", font: { family: "Tajawal" } }, grid: { display: false } }
            } : undefined
        }
    });
    
    container.classList.remove("hidden");
    document.getElementById("btn-export-report-chart")?.classList.remove("hidden");
}

function renderReportTable(type, data) {
    const thead = document.getElementById("report-table-head");
    const tbody = document.getElementById("report-table-body");
    const title = document.getElementById("report-table-title");
    if (!thead || !tbody) return;
    
    if (type === "expenseBreakdown" && data.breakdown) {
        title.textContent = "تحليل المصروفات";
        thead.innerHTML = '<tr><th class="p-4">التصنيف</th><th class="p-4">القيمة</th><th class="p-4">النسبة</th></tr>';
        const cats = Object.keys(data.breakdown);
        if (cats.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="p-8 text-center text-muted">لا توجد بيانات</td></tr>';
            return;
        }
        const total = data.total || cats.reduce((s, c) => s + (data.breakdown[c] || 0), 0);
        let html = "";
        cats.forEach(c => {
            const val = data.breakdown[c] || 0;
            const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
            html += `<tr><td class="p-4" data-label="التصنيف">${esc(c)}</td><td class="p-4 font-mono" data-label="القيمة">${val.toLocaleString()} ج.م</td><td class="p-4 font-mono" data-label="النسبة">${pct}%</td></tr>`;
        });
        tbody.innerHTML = html;
        
    } else if (type === "fuelSummary" && data.breakdown) {
        title.textContent = "تقرير البنزينة حسب السيارة";
        thead.innerHTML = '<tr><th class="p-4">السيارة</th><th class="p-4">اللترات</th><th class="p-4">التكلفة</th><th class="p-4">العمليات</th><th class="p-4">متوسط السعر</th></tr>';
        const rows = data.breakdown;
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-muted">لا توجد بيانات</td></tr>';
            return;
        }
        let html = "";
        rows.forEach(r => {
            html += `<tr><td class="p-4" data-label="السيارة">${esc(r.vehicle)}</td><td class="p-4 font-mono" data-label="اللترات">${r.liters.toLocaleString()}</td><td class="p-4 font-mono" data-label="التكلفة">${r.cost.toLocaleString()} ج.م</td><td class="p-4" data-label="العمليات">${r.count}</td><td class="p-4 font-mono" data-label="متوسط السعر">${r.avgPrice} ج.م</td></tr>`;
        });
        tbody.innerHTML = html;
        
    } else if (type === "driverPerformance" && data.breakdown) {
        title.textContent = "أداء السائقين";
        thead.innerHTML = '<tr><th class="p-4">السائق</th><th class="p-4">الرحلات</th><th class="p-4">المغلقة</th><th class="p-4">الإيرادات</th><th class="p-4">متوسط الرحلة</th><th class="p-4">السلفة</th></tr>';
        const rows = data.breakdown;
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-muted">لا توجد بيانات</td></tr>';
            return;
        }
        let html = "";
        rows.forEach(r => {
            html += `<tr><td class="p-4" data-label="السائق">${esc(r.driverName)}</td><td class="p-4" data-label="الرحلات">${r.trips}</td><td class="p-4" data-label="المغلقة">${r.closedTrips}</td><td class="p-4 font-mono" data-label="الإيرادات">${r.revenue.toLocaleString()} ج.م</td><td class="p-4 font-mono" data-label="متوسط الرحلة">${r.avgPerTrip.toLocaleString()} ج.م</td><td class="p-4 font-mono" data-label="السلفة">${r.currentAdvance.toLocaleString()} ج.م</td></tr>`;
        });
        tbody.innerHTML = html;
        
    } else if (type === "clientActivity" && data.breakdown) {
        title.textContent = "نشاط العملاء";
        thead.innerHTML = '<tr><th class="p-4">العميل</th><th class="p-4">الرحلات</th><th class="p-4">المغلقة</th><th class="p-4">الإيرادات</th><th class="p-4">متوسط الرحلة</th></tr>';
        const rows = data.breakdown;
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-muted">لا توجد بيانات</td></tr>';
            return;
        }
        let html = "";
        rows.forEach(r => {
            html += `<tr><td class="p-4" data-label="العميل">${esc(r.clientName)}</td><td class="p-4" data-label="الرحلات">${r.trips}</td><td class="p-4" data-label="المغلقة">${r.closedTrips}</td><td class="p-4 font-mono" data-label="الإيرادات">${r.revenue.toLocaleString()} ج.م</td><td class="p-4 font-mono" data-label="متوسط الرحلة">${r.avgPerTrip.toLocaleString()} ج.م</td></tr>`;
        });
        tbody.innerHTML = html;
        
    } else if (type === "vehicleUtilization" && data.breakdown) {
        title.textContent = "استغلال السيارات";
        thead.innerHTML = '<tr><th class="p-4">السيارة</th><th class="p-4">الرحلات</th><th class="p-4">المغلقة</th><th class="p-4">الإيرادات</th><th class="p-4">تكلفة الوقود</th><th class="p-4">صافي الربح</th><th class="p-4">متوسط الرحلة</th></tr>';
        const rows = data.breakdown;
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-muted">لا توجد بيانات</td></tr>';
            return;
        }
        let html = "";
        rows.forEach(r => {
            const netClass = r.net >= 0 ? "text-green-400" : "text-rose-400";
            html += `<tr><td class="p-4" data-label="السيارة">${esc(r.vehicleName)}</td><td class="p-4" data-label="الرحلات">${r.trips}</td><td class="p-4" data-label="المغلقة">${r.closedTrips}</td><td class="p-4 font-mono" data-label="الإيرادات">${r.revenue.toLocaleString()} ج.م</td><td class="p-4 font-mono" data-label="تكلفة الوقود">${r.fuelCost.toLocaleString()} ج.م</td><td class="p-4 font-mono ${netClass}" data-label="صافي الربح">${r.net.toLocaleString()} ج.م</td><td class="p-4 font-mono" data-label="متوسط الرحلة">${r.avgPerTrip.toLocaleString()} ج.م</td></tr>`;
        });
        tbody.innerHTML = html;
    }
}

function exportReportToExcel() {
    const type = document.getElementById("report-type")?.value;
    const tbody = document.getElementById("report-table-body");
    if (!tbody) return;
    
    const rows = tbody.querySelectorAll("tr");
    if (rows.length <= 1) { Swal.fire({ icon: 'warning', title: 'لا توجد بيانات للتصدير' }); return; }
    
    const thead = document.getElementById("report-table-head");
    const headers = [];
    if (thead) {
        thead.querySelectorAll("th").forEach(th => headers.push(th.textContent.trim()));
    }
    
    const data = [];
    rows.forEach(tr => {
        const cells = tr.querySelectorAll("td");
        if (cells.length === 0) return;
        const row = [];
        cells.forEach(td => row.push(td.textContent.trim()));
        data.push(row);
    });
    
    const reportNames = {
        expenseBreakdown: "تحليل_المصروفات",
        fuelSummary: "تقرير_البنزينة",
        driverPerformance: "اداء_السائقين",
        clientActivity: "نشاط_العملاء",
        vehicleUtilization: "استغلال_السيارات"
    };
    
    const filename = reportNames[type] || "تقرير";
    exportToExcel(data, headers, filename);
}

function clearSession() {
    localStorage.removeItem("kyan_session_token");
    localStorage.removeItem("kyan_user_data");
    localStorage.removeItem("kyan_token_expiry");
    localStorage.removeItem("kyan_csrf_token");
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