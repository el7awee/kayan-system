/**
 * منظومة الكيان v6.0 - طبقة إدارة التنبيهات
 * ملف: notificationService.gs (إدارة التنبيهات والإشعارات)
 */

/**
 * ─── إنشاء تنبيه جديد ───
 */
function createNotification(userId, type, title, message, relatedId) {
  let ss = getCachedSS();
  let sheet = getCachedSheet("Notifications");
  if (!sheet) {
    sheet = ss.insertSheet("Notifications");
    sheet.getRange(1, 1, 1, 9).setValues([[
      "Notification_ID", "User_ID", "Type", "Title", "Message", 
      "Related_ID", "Is_Read", "Is_Sent_Email", "Created_At"
    ]]);
  }
  
  let notificationId = generateNotificationId(sheet);
  let now = new Date().toISOString();
  
  let targetUsers = [];
  if (userId === "SYSTEM" || userId === "ALL") {
    let usersData = getCachedData("Users");
    if (usersData) {
      for (let i = 1; i < usersData.length; i++) {
        if (usersData[i][5] === "ACTIVE" && usersData[i][11] !== true) {
          targetUsers.push(usersData[i][0]);
        }
      }
    }
  } else {
    targetUsers.push(userId);
  }
  
  for (let uid of targetUsers) {
    sheet.appendRow([
      notificationId + "-" + uid.substring(0, 5),
      uid,
      type,
      title,
      message,
      relatedId || "",
      false,
      false,
      now
    ]);
  }
  
  logApiAudit("SYSTEM", "SYSTEM", "createNotification", 0, "N/A", 200);
  
  return { "success": true, "notification_id": notificationId };
}

/**
 * ─── جلب تنبيهات المستخدم ───
 */
function notificationService_getNotifications(ss, userId) {
  let data = getCachedData("Notifications");
  if (!data) {
    return { "success": false, "message": "شيت Notifications غير موجود." };
  }
  let notifications = [];
  let unreadCount = 0;
  
  for (let i = data.length - 1; i >= 1; i--) {
    let row = data[i];
    
    // فلترة حسب المستخدم
    if (row[1] !== userId) continue;
    
    // تخطي المحذوف (لو مضاف)
    if (row[9] === true || row[9] === "TRUE") continue;
    
    let isRead = row[6] === true || row[6] === "TRUE";
    if (!isRead) unreadCount++;
    
    notifications.push({
      notification_id: row[0],
      type: row[2],
      title: row[3],
      message: row[4],
      related_id: row[5],
      is_read: isRead,
      is_sent_email: row[7] === true || row[7] === "TRUE",
      created_at: row[8]
    });
    
    if (notifications.length >= 50) break;
  }
  
  return {
    "success": true,
    "data": {
      "notifications": notifications,
      "unread_count": unreadCount
    }
  };
}

/**
 * ─── تحديد تنبيه كمقروء ───
 */
function notificationService_markRead(ss, params, userId) {
  let sheet = getCachedSheet("Notifications");
  if (!sheet) {
    return { "success": false, "message": "شيت Notifications غير موجود." };
  }
  
  let notificationId = params.Notification_ID;
  if (!notificationId) {
    return { "success": false, "message": "Notification_ID مطلوب." };
  }
  
  let data = getCachedData("Notifications");
  let found = false;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === notificationId && data[i][1] === userId) {
      sheet.getRange(i + 1, 7).setValue(true);
      found = true;
      break;
    }
  }
  
  if (!found) {
    return { "success": false, "message": "التنبيه غير موجود." };
  }
  
  logApiAudit(userId, "User", "markNotificationRead", 0, "N/A", 200);
  
  return { "success": true, "message": "تم تحديد التنبيه كمقروء." };
}

/**
 * ─── تحديد جميع التنبيهات كمقروءة ───
 */
function notificationService_markAllRead(ss, userId) {
  let sheet = getCachedSheet("Notifications");
  if (!sheet) {
    return { "success": false, "message": "شيت Notifications غير موجود." };
  }
  
  let data = getCachedData("Notifications");
  let count = 0;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === userId && (data[i][6] !== true && data[i][6] !== "TRUE")) {
      sheet.getRange(i + 1, 7).setValue(true);
      count++;
    }
  }
  
  logApiAudit(userId, "User", "markAllNotificationsRead", 0, "N/A", 200);
  
  return { 
    "success": true, 
    "message": `تم تحديد ${count} تنبيه كمقروء.` 
  };
}

/**
 * ─── حذف تنبيه (حذف ناعم) ───
 */
function notificationService_deleteNotification(ss, params, userId) {
  let sheet = getCachedSheet("Notifications");
  if (!sheet) {
    return { "success": false, "message": "شيت Notifications غير موجود." };
  }
  
  let notificationId = params.Notification_ID;
  if (!notificationId) {
    return { "success": false, "message": "Notification_ID مطلوب." };
  }
  
  let data = getCachedData("Notifications");
  let found = false;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === notificationId && data[i][1] === userId) {
      // حذف ناعم (إضافة عمود IsDeleted)
      // لو العمود مش موجود، نضيفه
      let headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      let isDeletedCol = headerRow.indexOf("IsDeleted") + 1;
      if (isDeletedCol === 0) {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue("IsDeleted");
        isDeletedCol = sheet.getLastColumn();
      }
      sheet.getRange(i + 1, isDeletedCol).setValue(true);
      found = true;
      break;
    }
  }
  
  if (!found) {
    return { "success": false, "message": "التنبيه غير موجود." };
  }
  
  return { "success": true, "message": "تم حذف التنبيه." };
}

/**
 * ─── توليد معرف فريد للتنبيه (NOT-XXX) ───
 */
function generateNotificationId(sheet) {
  let data = sheet.getDataRange().getValues();
  let maxNum = 0;
  
  for (let i = 1; i < data.length; i++) {
    let id = data[i][0] || "";
    if (id.startsWith("NOT-")) {
      let num = parseInt(id.replace("NOT-", ""));
      if (num > maxNum) maxNum = num;
    }
  }
  
  let nextNum = maxNum + 1;
  return "NOT-" + String(nextNum).padStart(3, '0');
}

/**
 * ─── إرسال تنبيهات عبر الإيميل (تُستدعى من Trigger) ───
 */
function sendEmailNotifications() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Notifications");
  if (!sheet) return;
  
  let data = sheet.getDataRange().getValues();
  let now = new Date();
  
  for (let i = 1; i < data.length; i++) {
    let row = data[i];
    
    // تخطي التنبيهات المرسلة أو المقروءة
    if (row[7] === true || row[7] === "TRUE") continue;
    if (row[6] === true || row[6] === "TRUE") continue;
    
    let userId = row[1];
    let email = getUserEmail(userId);
    let title = row[3];
    let message = row[4];
    let createdAt = new Date(row[8]);
    
    // إرسال إيميل فقط للتنبيهات الجديدة (آخر ساعة)
    let diffMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);
    if (diffMinutes > 60) continue;
    
    if (email) {
      try {
        MailApp.sendEmail({
          to: email,
          subject: `[منظومة الكيان] ${title}`,
          body: `${message}\n\nتم إرسال هذا الإيميل من منظومة الكيان v6.0`
        });
        
        // تحديث حالة الإرسال
        sheet.getRange(i + 1, 8).setValue(true);
      } catch (e) {
        console.log(`فشل إرسال إيميل للمستخدم ${userId}: ${e.message}`);
      }
    }
  }
}

/**
 * ─── جلب إيميل المستخدم ───
 */
function getUserEmail(userId) {
  let data = getCachedData("Users");
  if (!data) return null;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      return data[i][12] || null;
    }
  }
  
  return null;
}