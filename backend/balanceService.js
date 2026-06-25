/**
 * منظومة الكيان v6.0 - نظام إدارة العهدات
 * ملف: balanceService.gs (إدارة العهدات والحركات المالية)
 */

// ==========================================
// 📊 دوال إدارة العهدات
// ==========================================

/**
 * ─── جلب رصيد مستخدم ───
 */
function balanceService_getBalance(userId) {
  let sheet = getCachedSheet("Users");
  if (!sheet) return 0;
  
  let data = getCachedData("Users");
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId && data[i][11] !== true) {
      return parseFloat(data[i][12]) || 0; // العمود M (13) هو Current_Balance
    }
  }
  return 0;
}

/**
 * ─── تحديث رصيد مستخدم ───
 */
function balanceService_updateBalance(userId, amount, transactionType, relatedUserId, tripId, notes, createdBy) {
  startTimer("balanceService_updateBalance_" + userId);
  
  let sheet = getCachedSheet("Users");
  if (!sheet) return;
  
  let data = getCachedData("Users");
  let found = false;
  let currentBalance = 0;
  let rowIndex = -1;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId && data[i][11] !== true) {
      currentBalance = parseFloat(data[i][12]) || 0;
      rowIndex = i + 1;
      found = true;
      break;
    }
  }
  
  if (!found) return;
  
  let newBalance = currentBalance + amount;
  sheet.getRange(rowIndex, 13).setValue(newBalance); // العمود M (13) Current_Balance
  
  // تسجيل الحركة في سجل العهدات
  balanceService_logTransaction(userId, amount, newBalance, transactionType, relatedUserId, tripId, notes, createdBy);
  
  endTimer("balanceService_updateBalance_" + userId);
  
  return newBalance;
}

/**
 * ─── تسجيل حركة عهدة ───
 */
function balanceService_logTransaction(userId, amount, balanceAfter, transactionType, relatedUserId, tripId, notes, createdBy) {
  let ss = getCachedSS();
  let sheet = getCachedSheet("Balance_Transactions");
  if (!sheet) {
    sheet = ss.insertSheet("Balance_Transactions");
    sheet.getRange(1, 1, 1, 10).setValues([[
      "Transaction_ID", "User_ID", "Related_User_ID", "Trip_ID", 
      "Transaction_Type", "Amount", "Balance_After", "Notes", 
      "Created_By", "Created_At"
    ]]);
  }
  
  let transactionId = "TX-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
  let now = new Date().toISOString();
  
  sheet.appendRow([
    transactionId,
    userId,
    relatedUserId || "",
    tripId || "",
    transactionType,
    amount,
    balanceAfter,
    notes || "",
    createdBy || "SYSTEM",
    now
  ]);
}

/**
 * ─── جلب حركات مستخدم ───
 */
function balanceService_getTransactions(userId, limit) {
  startTimer("balanceService_getTransactions_" + userId);
  
  let sheet = getCachedSheet("Balance_Transactions");
  if (!sheet) return [];
  
  let data = getCachedData("Balance_Transactions");
  let transactions = [];
  let count = 0;
  
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] === userId) {
      transactions.push({
        transaction_id: data[i][0],
        user_id: data[i][1],
        related_user_id: data[i][2],
        trip_id: data[i][3],
        transaction_type: data[i][4],
        amount: parseFloat(data[i][5]) || 0,
        balance_after: parseFloat(data[i][6]) || 0,
        notes: data[i][7],
        created_by: data[i][8],
        created_at: data[i][9]
      });
      count++;
      if (count >= (limit || 50)) break;
    }
  }
  
  endTimer("balanceService_getTransactions_" + userId);
  
  return transactions;
}

/**
 * ─── جلب كل حركات العهدات (للمدير/المحاسب) ───
 */
function balanceService_fetchAllTransactionsList(limit) {
  startTimer("balanceService_fetchAllTransactionsList");
  
  let sheet = getCachedSheet("Balance_Transactions");
  if (!sheet) return [];
  
  let data = getCachedData("Balance_Transactions");
  let transactions = [];
  let count = 0;
  
  for (let i = data.length - 1; i >= 1; i--) {
    transactions.push({
      transaction_id: data[i][0],
      user_id: data[i][1],
      related_user_id: data[i][2],
      trip_id: data[i][3],
      transaction_type: data[i][4],
      amount: parseFloat(data[i][5]) || 0,
      balance_after: parseFloat(data[i][6]) || 0,
      notes: data[i][7],
      created_by: data[i][8],
      created_at: data[i][9]
    });
    count++;
    if (count >= (limit || 100)) break;
  }
  
  endTimer("balanceService_fetchAllTransactionsList");
  
  return transactions;
}

/**
 * ─── إيداع عهدة لمستخدم (من المدير/المحاسب) ───
 */
function balanceService_addBalance(userId, amount, notes, createdBy) {
  startTimer("balanceService_addBalance_" + userId);
  
  if (amount <= 0) {
    return { success: false, message: "المبلغ يجب أن يكون أكبر من صفر." };
  }
  
  let currentBalance = balanceService_getBalance(userId);
  let newBalance = balanceService_updateBalance(userId, amount, 'ADD', '', '', notes, createdBy);
  
  endTimer("balanceService_addBalance_" + userId);
  
  return {
    success: true,
    message: `تم إيداع ${amount} ج.م في عهدة المستخدم.`,
    data: {
      user_id: userId,
      previous_balance: currentBalance,
      added_amount: amount,
      new_balance: newBalance
    }
  };
}

/**
 * ─── صرف عهدة من مستخدم (للمدير فقط) ───
 */
function balanceService_deductBalance(userId, amount, notes, createdBy) {
  startTimer("balanceService_deductBalance_" + userId);
  
  if (amount <= 0) {
    return { success: false, message: "المبلغ يجب أن يكون أكبر من صفر." };
  }
  
  let currentBalance = balanceService_getBalance(userId);
  if (currentBalance < amount) {
    return { success: false, message: "الرصيد غير كافٍ. الرصيد الحالي: " + currentBalance };
  }
  
  let newBalance = balanceService_updateBalance(userId, -amount, 'DEDUCT', '', '', notes, createdBy);
  
  endTimer("balanceService_deductBalance_" + userId);
  
  return {
    success: true,
    message: `تم صرف ${amount} ج.م من عهدة المستخدم.`,
    data: {
      user_id: userId,
      previous_balance: currentBalance,
      deducted_amount: amount,
      new_balance: newBalance
    }
  };
}

/**
 * ─── تحويل عهدة بين مستخدمين ───
 */
function balanceService_transferBalance(fromUserId, toUserId, amount, notes, createdBy) {
  startTimer("balanceService_transferBalance_" + fromUserId + "_to_" + toUserId);
  
  if (amount <= 0) {
    return { success: false, message: "المبلغ يجب أن يكون أكبر من صفر." };
  }
  
  let fromBalance = balanceService_getBalance(fromUserId);
  if (fromBalance < amount) {
    return { success: false, message: "رصيد المرسل غير كافٍ. الرصيد الحالي: " + fromBalance };
  }
  
  // خصم من المرسل
  let newFromBalance = balanceService_updateBalance(fromUserId, -amount, 'TRANSFER_OUT', toUserId, '', notes, createdBy);
  
  // إضافة للمستقبل — مع التراجع (rollback) لو فشلت العملية عشان منفقدش فلوس
  let newToBalance;
  try {
    newToBalance = balanceService_updateBalance(toUserId, amount, 'TRANSFER_IN', fromUserId, '', notes, createdBy);
    if (newToBalance === undefined) {
      throw new Error("المستخدم المستقبل غير موجود.");
    }
  } catch (transferError) {
    // تراجع: نرجّع المبلغ للمرسل تاني
    balanceService_updateBalance(fromUserId, amount, 'TRANSFER_ROLLBACK', toUserId, '', `تراجع تحويل فاشل: ${notes || ''}`, createdBy);
    endTimer("balanceService_transferBalance_" + fromUserId + "_to_" + toUserId);
    clearExecutionCache();
    return { success: false, message: "فشل التحويل وتم إرجاع المبلغ للمرسل: " + transferError.message };
  }
  
  endTimer("balanceService_transferBalance_" + fromUserId + "_to_" + toUserId);
  
  return {
    success: true,
    message: `تم تحويل ${amount} ج.م من ${fromUserId} إلى ${toUserId}.`,
    data: {
      from_user_id: fromUserId,
      from_new_balance: newFromBalance,
      to_user_id: toUserId,
      to_new_balance: newToBalance
    }
  };
}