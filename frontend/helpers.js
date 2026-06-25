function esc(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str ?? ''));
    return div.innerHTML;
}

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

function lookupDriverName(driverId) {
    if (!driverId) return "بدون";
    const driver = (state.cache.drivers || []).find(d => d.driver_id === driverId || d.Driver_ID === driverId);
    return driver ? (driver.full_name || driver.Full_Name) : driverId;
}

function lookupVehicleLabel(vehicleId) {
    if (!vehicleId) return "بدون";
    const vehicle = (state.cache.vehicles || []).find(v => v.vehicle_id === vehicleId || v.Vehicle_ID === vehicleId);
    return vehicle ? `${vehicle.plate_number || vehicle.Plate_Number} (${vehicle.model || vehicle.Model})` : vehicleId;
}

function lookupUserName(userId) {
    if (!userId) return "—";
    const user = (state.cache.users || []).find(u => u.User_ID === userId || u.user_id === userId);
    return user ? (user.Full_Name || user.full_name) : userId;
}

function lookupClientName(clientId) {
    if (!clientId) return "—";
    const client = (state.cache.clients || []).find(c => c.client_id === clientId || c.Client_ID === clientId);
    return client ? (client.client_name || client.Client_Name) : clientId;
}

function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

function getPaginatedData(dataKey, filterFn = null) {
    const cfg = PAGINATION[dataKey];
    if (!cfg) return { rows: [], total: 0, page: 1, pages: 1 };
    let all = state.cache[dataKey] || [];
    if (filterFn) all = all.filter(filterFn);
    const total = all.length;
    const pages = Math.max(1, Math.ceil(total / cfg.size));
    if (cfg.page > pages) cfg.page = pages;
    const start = (cfg.page - 1) * cfg.size;
    const rows = all.slice(start, start + cfg.size);
    return { rows, total, page: cfg.page, pages, size: cfg.size };
}

function renderPagination(dataKey, containerId, renderFn) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const info = getPaginatedData(dataKey);
    if (info.pages <= 1) {
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');
    container.querySelector('.pag-info').textContent = `الصفحة ${info.page} من ${info.pages} (${info.total})`;
    container.querySelector('.pag-prev').onclick = () => {
        if (PAGINATION[dataKey].page > 1) {
            PAGINATION[dataKey].page--;
            renderFn();
        }
    };
    container.querySelector('.pag-next').onclick = () => {
        if (PAGINATION[dataKey].page < info.pages) {
            PAGINATION[dataKey].page++;
            renderFn();
        }
    };
}
