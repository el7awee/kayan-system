/**
 * منظومة الكيان v6.0 - محرك التقارير
 * ملف: reportService.gs (التجميع والتحليل)
 * [تحديث: إنشاء 7 تقارير تشغيلية]
 */

/**
 * ─── دالة مساعدة: استعلام محدود بنطاق تاريخي ───
 * تقرأ sheet وتصفّي الصفوف حسب نطاق تاريخي (العمود dateColIndex, 1-based)
 * @param {Sheet} sheet - كائن الشيت
 * @param {number} dateColIndex - index العامود (1-based)
 * @param {string} fromDate - بداية النطاق (YYYY-MM-DD)
 * @param {string} toDate - نهاية النطاق (YYYY-MM-DD)
 * @param {number} maxRows - حد أقصى للصفوف (5000 افتراضي)
 * @returns {Array} rows - الصفوف المطابقة (بدون الهيدر)
 */
function queryRange_(sheet, dateColIndex, fromDate, toDate, maxRows) {
  if (!sheet) return [];
  maxRows = maxRows || 5000;
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  var from = fromDate ? new Date(fromDate) : null;
  var to = toDate ? new Date(toDate + "T23:59:59") : null;
  var headers = data[0];
  var result = [];
  
  // تحديد نقطة البداية: من النهاية عشان أحدث البيانات (أسرع لو معملناش sort)
  for (var i = 1; i < data.length; i++) {
    var rowDate = new Date(data[i][dateColIndex - 1]);
    if (isNaN(rowDate.getTime())) continue;
    
    if (from && rowDate < from) continue;
    if (to && rowDate > to) continue;
    
    result.push(data[i]);
    if (result.length >= maxRows) break;
  }
  
  return result;
}

/**
 * ─── 1. تقرير الأرباح والخسائر (P&L) ───
 */
function reportService_getProfitLoss(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var fromDate = params.fromDate || "";
  var toDate = params.toDate || "";
  
  // قراءة الرحلات المغلقة فقط (لأن المفتوحة لسه مش محسوبة)
  var tripsSheet = ss.getSheetByName("Trips_Log");
  var tripsRows = queryRange_(tripsSheet, 2, fromDate, toDate); // col B = tripDate
  
  var totalRevenue = 0;
  var totalExpenses = 0;
  var closedCount = 0;
  var openCount = 0;
  
  for (var i = 0; i < tripsRows.length; i++) {
    // col[7] = status, col[13] = isDeleted
    if (tripsRows[i][13] === true || tripsRows[i][13] === "TRUE") continue;
    var status = (tripsRows[i][7] || "").toString();
    var rev = parseFloat(tripsRows[i][9]) || 0; // col[9] = total_revenue
    var exp = parseFloat(tripsRows[i][10]) || 0; // col[10] = total_expenses
    
    totalRevenue += rev;
    totalExpenses += exp;
    if (status === "CLOSED") closedCount++;
    else openCount++;
  }
  
  // قراءة المصروفات اللي مش مرتبطة برحلة (مباشرة)
  var expSheet = ss.getSheetByName("Expenses_Log");
  var expRows = queryRange_(expSheet, 3, fromDate, toDate); // col C = expense_date
  
  var directExpenses = 0;
  var expenseByCategory = {};
  
  for (var j = 0; j < expRows.length; j++) {
    if (expRows[j][10] === true || expRows[j][10] === "TRUE") continue;
    var amount = parseFloat(expRows[j][5]) || 0; // col[5] = amount
    var category = (expRows[j][4] || "أخرى").toString(); // col[4] = category
    var tripId = (expRows[j][1] || "").toString(); // col[1] = trip_id
    
    if (!tripId || tripId === "") {
      directExpenses += amount;
      expenseByCategory[category] = (expenseByCategory[category] || 0) + amount;
    }
  }
  
  var netProfit = totalRevenue - totalExpenses - directExpenses;
  var totalExpAll = totalExpenses + directExpenses;
  var margin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0;
  
  return {
    success: true,
    data: {
      summary: {
        totalRevenue: Math.round(totalRevenue),
        totalExpenses: Math.round(totalExpAll),
        directExpenses: Math.round(directExpenses),
        netProfit: Math.round(netProfit),
        margin: parseFloat(margin),
        closedTrips: closedCount,
        openTrips: openCount,
        totalTrips: closedCount + openCount
      },
      expenseByCategory: expenseByCategory,
      chart: {
        labels: ["الإيرادات", "المصروفات", "صافي الربح"],
        values: [Math.round(totalRevenue), Math.round(totalExpAll), Math.round(netProfit)]
      }
    }
  };
}

/**
 * ─── 2. تحليل المصروفات حسب التصنيف ───
 */
function reportService_getExpenseBreakdown(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var fromDate = params.fromDate || "";
  var toDate = params.toDate || "";
  
  var sheet = ss.getSheetByName("Expenses_Log");
  var rows = queryRange_(sheet, 3, fromDate, toDate);
  
  var categories = {};
  var total = 0;
  
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][10] === true || rows[i][10] === "TRUE") continue;
    var cat = (rows[i][4] || "أخرى").toString();
    var amt = parseFloat(rows[i][5]) || 0;
    categories[cat] = (categories[cat] || 0) + amt;
    total += amt;
  }
  
  var breakdown = [];
  var catKeys = Object.keys(categories).sort();
  for (var j = 0; j < catKeys.length; j++) {
    breakdown.push({
      category: catKeys[j],
      amount: Math.round(categories[catKeys[j]]),
      percentage: total > 0 ? parseFloat(((categories[catKeys[j]] / total) * 100).toFixed(1)) : 0
    });
  }
  
  return {
    success: true,
    data: {
      total: Math.round(total),
      count: rows.length,
      breakdown: breakdown,
      chart: {
        labels: breakdown.map(function(r) { return r.category; }),
        values: breakdown.map(function(r) { return r.amount; })
      }
    }
  };
}

/**
 * ─── 3. تقرير البنزينة (استهلاك لكل عربية) ───
 */
function reportService_getFuelSummary(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var fromDate = params.fromDate || "";
  var toDate = params.toDate || "";
  
  var sheet = ss.getSheetByName("Fuel_Transactions");
  var rows = queryRange_(sheet, 1, fromDate, toDate); // col A = transaction_date
  
  var byVehicle = {};
  var totalLiters = 0;
  var totalCost = 0;
  
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][5] === true || rows[i][5] === "TRUE") continue;
    var vehicle = (rows[i][1] || "غير محدد").toString(); // col[1] = vehicle
    var liters = parseFloat(rows[i][3]) || 0; // col[3] = liters
    var cost = parseFloat(rows[i][4]) || 0; // col[4] = cost
    
    if (!byVehicle[vehicle]) byVehicle[vehicle] = { liters: 0, cost: 0, count: 0 };
    byVehicle[vehicle].liters += liters;
    byVehicle[vehicle].cost += cost;
    byVehicle[vehicle].count++;
    totalLiters += liters;
    totalCost += cost;
  }
  
  var breakdown = [];
  var vKeys = Object.keys(byVehicle).sort();
  for (var j = 0; j < vKeys.length; j++) {
    breakdown.push({
      vehicle: vKeys[j],
      liters: parseFloat(byVehicle[vKeys[j]].liters.toFixed(1)),
      cost: Math.round(byVehicle[vKeys[j]].cost),
      count: byVehicle[vKeys[j]].count,
      avgPrice: byVehicle[vKeys[j]].liters > 0 ? parseFloat((byVehicle[vKeys[j]].cost / byVehicle[vKeys[j]].liters).toFixed(2)) : 0
    });
  }
  
  var avgPriceOverall = totalLiters > 0 ? parseFloat((totalCost / totalLiters).toFixed(2)) : 0;
  
  return {
    success: true,
    data: {
      summary: {
        totalLiters: parseFloat(totalLiters.toFixed(1)),
        totalCost: Math.round(totalCost),
        avgPrice: avgPriceOverall,
        transactions: rows.length
      },
      breakdown: breakdown,
      chart: {
        labels: breakdown.map(function(r) { return r.vehicle; }),
        values: breakdown.map(function(r) { return r.cost; })
      }
    }
  };
}

/**
 * ─── 4. أداء السائقين ───
 */
function reportService_getDriverPerformance(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var fromDate = params.fromDate || "";
  var toDate = params.toDate || "";
  
  var tripsSheet = ss.getSheetByName("Trips_Log");
  var tripsRows = queryRange_(tripsSheet, 2, fromDate, toDate);
  
  var byDriver = {};
  var totalRevenue = 0;
  
  for (var i = 0; i < tripsRows.length; i++) {
    if (tripsRows[i][13] === true || tripsRows[i][13] === "TRUE") continue;
    var driverId = (tripsRows[i][3] || "غير معروف").toString(); // col[3] = driver_id
    var rev = parseFloat(tripsRows[i][9]) || 0; // col[9] = total_revenue
    var status = (tripsRows[i][7] || "").toString();
    
    if (!byDriver[driverId]) byDriver[driverId] = { trips: 0, revenue: 0, closedTrips: 0 };
    byDriver[driverId].trips++;
    byDriver[driverId].revenue += rev;
    if (status === "CLOSED") byDriver[driverId].closedTrips++;
    totalRevenue += rev;
  }
  
  // قراءة أسماء السائقين + السلف
  var driversSheet = ss.getSheetByName("Drivers");
  var driverNames = {};
  var driverAdvances = {};
  if (driversSheet) {
    var dData = driversSheet.getDataRange().getValues();
    for (var j = 1; j < dData.length; j++) {
      if (dData[j][6] === true || dData[j][6] === "TRUE") continue;
      var dId = (dData[j][0] || "").toString();
      driverNames[dId] = (dData[j][1] || dId).toString(); // col[1] = name
      driverAdvances[dId] = parseFloat(dData[j][4]) || 0; // col[4] = advance
    }
  }
  
  var breakdown = [];
  var dKeys = Object.keys(byDriver).sort();
  for (var k = 0; k < dKeys.length; k++) {
    var did = dKeys[k];
    breakdown.push({
      driverId: did,
      driverName: driverNames[did] || did,
      trips: byDriver[did].trips,
      closedTrips: byDriver[did].closedTrips,
      revenue: Math.round(byDriver[did].revenue),
      avgPerTrip: byDriver[did].trips > 0 ? Math.round(byDriver[did].revenue / byDriver[did].trips) : 0,
      currentAdvance: Math.round(driverAdvances[did] || 0)
    });
  }
  breakdown.sort(function(a, b) { return b.revenue - a.revenue; });
  
  return {
    success: true,
    data: {
      totalTrips: tripsRows.length,
      totalRevenue: Math.round(totalRevenue),
      driverCount: breakdown.length,
      breakdown: breakdown,
      chart: {
        labels: breakdown.map(function(r) { return r.driverName; }),
        values: breakdown.map(function(r) { return r.revenue; })
      }
    }
  };
}

/**
 * ─── 5. نشاط العملاء ───
 */
function reportService_getClientActivity(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var fromDate = params.fromDate || "";
  var toDate = params.toDate || "";
  
  var tripsSheet = ss.getSheetByName("Trips_Log");
  var tripsRows = queryRange_(tripsSheet, 2, fromDate, toDate);
  
  var byClient = {};
  var totalRevenue = 0;
  
  for (var i = 0; i < tripsRows.length; i++) {
    if (tripsRows[i][13] === true || tripsRows[i][13] === "TRUE") continue;
    var clientId = (tripsRows[i][5] || "غير معروف").toString(); // col[5] = client_id
    var rev = parseFloat(tripsRows[i][9]) || 0;
    var status = (tripsRows[i][7] || "").toString();
    
    if (!byClient[clientId]) byClient[clientId] = { trips: 0, revenue: 0, closedTrips: 0 };
    byClient[clientId].trips++;
    byClient[clientId].revenue += rev;
    if (status === "CLOSED") byClient[clientId].closedTrips++;
    totalRevenue += rev;
  }
  
  // قراءة أسماء العملاء
  var clientsSheet = ss.getSheetByName("Clients");
  var clientNames = {};
  if (clientsSheet) {
    var cData = clientsSheet.getDataRange().getValues();
    for (var j = 1; j < cData.length; j++) {
      if (cData[j][4] === true || cData[j][4] === "TRUE") continue;
      var cId = (cData[j][0] || "").toString();
      clientNames[cId] = (cData[j][1] || cId).toString();
    }
  }
  
  var breakdown = [];
  var cKeys = Object.keys(byClient).sort();
  for (var k = 0; k < cKeys.length; k++) {
    var cid = cKeys[k];
    breakdown.push({
      clientId: cid,
      clientName: clientNames[cid] || cid,
      trips: byClient[cid].trips,
      closedTrips: byClient[cid].closedTrips,
      revenue: Math.round(byClient[cid].revenue),
      avgPerTrip: byClient[cid].trips > 0 ? Math.round(byClient[cid].revenue / byClient[cid].trips) : 0
    });
  }
  breakdown.sort(function(a, b) { return b.revenue - a.revenue; });
  
  return {
    success: true,
    data: {
      totalTrips: tripsRows.length,
      totalRevenue: Math.round(totalRevenue),
      clientCount: breakdown.length,
      breakdown: breakdown,
      chart: {
        labels: breakdown.map(function(r) { return r.clientName; }),
        values: breakdown.map(function(r) { return r.revenue; })
      }
    }
  };
}

/**
 * ─── 6. الاتجاهات الشهرية ───
 */
function reportService_getMonthlyTrends(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var year = parseInt(params.year) || new Date().getFullYear();
  
  var months = [];
  for (var m = 0; m < 12; m++) {
    months.push({ month: m + 1, revenue: 0, expense: 0, count: 0 });
  }
  
  var arabicMonths = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
  ];
  
  // الرحلات
  var tripsSheet = ss.getSheetByName("Trips_Log");
  if (tripsSheet) {
    var tData = tripsSheet.getDataRange().getValues();
    for (var i = 1; i < tData.length; i++) {
      if (tData[i][13] === true || tData[i][13] === "TRUE") continue;
      var d = new Date(tData[i][1]); // col[1] = tripDate
      if (isNaN(d.getTime())) continue;
      if (d.getFullYear() !== year) continue;
      var monthIdx = d.getMonth(); // 0-based
      months[monthIdx].revenue += parseFloat(tData[i][9]) || 0;
      months[monthIdx].expense += parseFloat(tData[i][10]) || 0;
      months[monthIdx].count++;
    }
  }
  
  // المصروفات المباشرة
  var expSheet = ss.getSheetByName("Expenses_Log");
  if (expSheet) {
    var eData = expSheet.getDataRange().getValues();
    for (var j = 1; j < eData.length; j++) {
      if (eData[j][10] === true || eData[j][10] === "TRUE") continue;
      var ed = new Date(eData[j][2]); // col[2] = expense_date
      if (isNaN(ed.getTime())) continue;
      if (ed.getFullYear() !== year) continue;
      var emIdx = ed.getMonth();
      months[emIdx].expense += parseFloat(eData[j][5]) || 0;
    }
  }
  
  var breakdown = [];
  for (var k = 0; k < months.length; k++) {
    breakdown.push({
      month: months[k].month,
      monthName: arabicMonths[k],
      revenue: Math.round(months[k].revenue),
      expense: Math.round(months[k].expense),
      net: Math.round(months[k].revenue - months[k].expense),
      count: months[k].count
    });
  }
  
  var totalRevenue = 0, totalExpense = 0;
  for (var n = 0; n < breakdown.length; n++) {
    totalRevenue += breakdown[n].revenue;
    totalExpense += breakdown[n].expense;
  }
  
  return {
    success: true,
    data: {
      year: year,
      summary: {
        totalRevenue: Math.round(totalRevenue),
        totalExpense: Math.round(totalExpense),
        net: Math.round(totalRevenue - totalExpense),
        activeMonths: breakdown.filter(function(mm) { return mm.count > 0; }).length
      },
      breakdown: breakdown,
      chart: {
        labels: breakdown.map(function(r) { return r.monthName; }),
        revenue: breakdown.map(function(r) { return r.revenue; }),
        expense: breakdown.map(function(r) { return r.expense; }),
        net: breakdown.map(function(r) { return r.net; })
      }
    }
  };
}

/**
 * ─── 7. استغلال العربيات ───
 */
function reportService_getVehicleUtilization(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var fromDate = params.fromDate || "";
  var toDate = params.toDate || "";
  
  var tripsSheet = ss.getSheetByName("Trips_Log");
  var tripsRows = queryRange_(tripsSheet, 2, fromDate, toDate);
  
  var byVehicle = {};
  
  for (var i = 0; i < tripsRows.length; i++) {
    if (tripsRows[i][13] === true || tripsRows[i][13] === "TRUE") continue;
    var vehicleId = (tripsRows[i][4] || "غير معروف").toString(); // col[4] = vehicle_id
    var rev = parseFloat(tripsRows[i][9]) || 0;
    var status = (tripsRows[i][7] || "").toString();
    
    if (!byVehicle[vehicleId]) byVehicle[vehicleId] = { trips: 0, revenue: 0, closedTrips: 0 };
    byVehicle[vehicleId].trips++;
    byVehicle[vehicleId].revenue += rev;
    if (status === "CLOSED") byVehicle[vehicleId].closedTrips++;
  }
  
  // Fuel costs per vehicle from Fuel_Transactions
  var fuelSheet = ss.getSheetByName("Fuel_Transactions");
  if (fuelSheet) {
    var fRows = queryRange_(fuelSheet, 1, fromDate, toDate);
    for (var k = 0; k < fRows.length; k++) {
      if (fRows[k][5] === true || fRows[k][5] === "TRUE") continue;
      var fv = (fRows[k][1] || "").toString();
      if (byVehicle[fv]) {
        byVehicle[fv].fuelCost = (byVehicle[fv].fuelCost || 0) + (parseFloat(fRows[k][4]) || 0);
      }
    }
  }
  
  // Arabic names
  var vehSheet = ss.getSheetByName("Vehicles");
  var vehicleNames = {};
  if (vehSheet) {
    var vData = vehSheet.getDataRange().getValues();
    for (var j = 1; j < vData.length; j++) {
      if (vData[j][5] === true || vData[j][5] === "TRUE") continue;
      var vid = (vData[j][0] || "").toString();
      vehicleNames[vid] = (vData[j][1] || vid).toString(); // col[1] = plate
    }
  }
  
  var breakdown = [];
  var vKeys = Object.keys(byVehicle).sort();
  for (var n = 0; n < vKeys.length; n++) {
    var vid2 = vKeys[n];
    var fuelC = byVehicle[vid2].fuelCost || 0;
    breakdown.push({
      vehicleId: vid2,
      vehicleName: vehicleNames[vid2] || vid2,
      trips: byVehicle[vid2].trips,
      closedTrips: byVehicle[vid2].closedTrips,
      revenue: Math.round(byVehicle[vid2].revenue),
      fuelCost: Math.round(fuelC),
      net: Math.round(byVehicle[vid2].revenue - fuelC),
      avgPerTrip: byVehicle[vid2].trips > 0 ? Math.round(byVehicle[vid2].revenue / byVehicle[vid2].trips) : 0
    });
  }
  breakdown.sort(function(a, b) { return b.revenue - a.revenue; });
  
  return {
    success: true,
    data: {
      totalTrips: tripsRows.length,
      totalVehicles: breakdown.length,
      breakdown: breakdown,
      chart: {
        labels: breakdown.map(function(r) { return r.vehicleName; }),
        values: breakdown.map(function(r) { return r.revenue; })
      }
    }
  };
}
