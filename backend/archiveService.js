/**
 * منظومة الكيان v6.0 - طبقة الأرشفة وصيانة الأداء
 * ملف: archiveService.gs (التنظيف والأرشفة التلقائية المجدولة)
 */

/**
 * دالة الأرشفة التلقائية للرحلات المغلقة نهائياً (archiveClosedTrips)
 * يتم ضبطها لتعمل عبر تريجر مجدول (Time-driven Trigger)
 */
function archiveClosedTrips() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  let mainSheet = ss.getSheetByName("Trips_Log");
  let archiveSheet = ss.getSheetByName("Trips_Archive"); // شيت الأرشيف المنفصل
  
  if (!mainSheet || !archiveSheet) {
    logSystemError("ARCHIVE_FAILED", "شيت الرحلات الرئيسي أو شيت الأرشيف غير موجود بالنظام.", "", "SYSTEM_CRON");
    return;
  }
  
  // 1. جلب قيمة حد الأرشفة بالأشهر من شيت الإعدادات أو استخدام القيمة الافتراضية الصارمة (6 أشهر)
  let archiveThresholdMonths = 6; 
  try {
    let settingsSheet = ss.getSheetByName("System_Settings");
    if (settingsSheet) {
      let settingsData = settingsSheet.getDataRange().getValues();
      for (let i = 1; i < settingsData.length; i++) {
        if (settingsData[i][0] === "ARCHIVE_THRESHOLD_MONTHS") {
          archiveThresholdMonths = parseInt(settingsData[i][1]);
          break;
        }
      }
    }
  } catch(e) {
    // في حال فشل جلب الإعدادات، نستمر بالـ Default الآمن (6 أشهر)
  }
  
  let data = mainSheet.getDataRange().getValues();
  let rowsToMove = [];
  let now = new Date();
  
  // حساب الملي ثواني لـ 6 أشهر لحساب الفارق الزمني بدقة
  let thresholdTimeMs = archiveThresholdMonths * 30 * 24 * 60 * 60 * 1000;
  
  // 2. تجميع السطور التي تطابق شروط الأرشفة (تخطي السطر الأول للعناوين)
  // الشرط: الحالة CLOSED + فارق تاريخ التحديث الأخير (Updated_At بالعمود L رقم 12) أكبر من الـ Threshold
  for (let i = 1; i < data.length; i++) {
    let status = data[i][7]; // عمود Trip_Status
    let updatedAtStr = data[i][11]; // عمود Updated_At
    
    if (status === "CLOSED" && updatedAtStr) {
      let updatedAtDate = new Date(updatedAtStr);
      if (now.getTime() - updatedAtDate.getTime() >= thresholdTimeMs) {
        // الاحتفاظ برقم السطر الحقيقي في الـ Sheet والبيانات بالكامل
        rowsToMove.push({
          rowIndex: i + 1,
          rowData: data[i]
        });
      }
    }
  }
  
  if (rowsToMove.length === 0) {
    return; // لا يوجد رحلات مغلقة قديمة تحتاج أرشفة حالياً
  }
  
  // 3. نقل السطور المحددة إلى شيت الأرشيف وحذفها من التشغيلي
  // حاسم جداً: عند الحذف من الشيت الرئيسي، يجب أن نحذف من الأسفل إلى الأعلى (Reverse Order) لتفادي تخريب ترقيم السطور المتبقية!
  let totalArchived = 0;
  
  try {
    for (let k = rowsToMove.length - 1; k >= 0; k--) {
      let targetRow = rowsToMove[k];
      
      // أ) إضافة السطر بالكامل لشيت الأرشيف المخصص للرحلات القديمة
      archiveSheet.appendRow(targetRow.rowData);
      
      // ب) الحذف النهائي للسطر من الجداول التشغيلية لتسريع السيرفر
      mainSheet.deleteRow(targetRow.rowIndex);
      totalArchived++;
    }
    
    // تسجيل العملية بنجاح في سجل المراقبة والأداء
    let perfSheet = getLogsSheet("Performance_Metrics");
    if (perfSheet) {
      perfSheet.appendRow([
        `ARCH-${Date.now()}`,
        new Date().toISOString(),
        "archiveClosedTrips_Cron",
        0,
        "INFO_SUCCESS",
        `تمت أرشفة وتفريغ عدد (${totalArchived}) رحلة قديمة بنجاح تام.`
      ]);
    }
    
  } catch (archiveError) {
    logSystemError("ARCHIVE_EXECUTION_CRITICAL", "انهارت دالة الأرشفة أثناء نقل السطور: " + archiveError.message, archiveError.stack, "SYSTEM_CRON");
  }
}