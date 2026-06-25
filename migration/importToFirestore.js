/**
 * منظومة الكيان v7.0 — استيراد البيانات من JSON Export إلى Firestore
 * 
 * خطوات التشغيل:
 *   1. شغّل exportAllDataToJson من Apps Script Editor
 *   2. نزّل الـ JSON file من Drive
 *   3. ضع الملف في `/migration/export.json`
 *   4. نزّل Service Account Key من Firebase Console
 *   5. ضع المفتاح في `/migration/service-account.json`
 *   6. شغّل: node importToFirestore.js
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// تحميل مفتاح الخدمة
const SA_PATH = resolve(__dirname, 'service-account.json');
if (!existsSync(SA_PATH)) {
  console.error('❌ ملف service-account.json غير موجود.');
  console.error('   اذهب إلى Firebase Console → Project Settings → Service Accounts');
  console.error('   → Generate new private key → ضع الملف هنا كـ service-account.json');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(SA_PATH, 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// تحميل بيانات التصدير
const EXPORT_PATH = resolve(__dirname, 'export.json');
if (!existsSync(EXPORT_PATH)) {
  console.error('❌ ملف export.json غير موجود.');
  console.error('   شغّل exportAllDataToJson من Apps Script Editor أولاً.');
  process.exit(1);
}

const exportData = JSON.parse(readFileSync(EXPORT_PATH, 'utf-8'));

// ====== تعريف الـ Collections ======
const COLLECTION_MAP = {
  'Users': { collection: 'users', idField: 'User_ID' },
  'Trips_Log': { collection: 'trips', idField: 'Trip_ID' },
  'Expenses_Log': { collection: 'expenses', idField: 'Expense_ID' },
  'Vehicles': { collection: 'vehicles', idField: 'Vehicle_ID' },
  'Drivers': { collection: 'drivers', idField: 'Driver_ID' },
  'Clients': { collection: 'clients', idField: 'Client_ID' },
  'Fuel_Balance': { collection: 'fuelBalance', idField: 'Balance_ID' },
  'Fuel_Transactions': { collection: 'fuelTransactions', idField: 'Transaction_ID' },
  'Trip_Advances': { collection: 'tripAdvances', idField: 'Advance_ID' },
  'Notifications': { collection: 'notifications', idField: 'Notification_ID' },
  'System_Settings': { collection: 'settings', idField: 'Setting_Key' },
  'Balance_Transactions': { collection: 'balanceTransactions', idField: 'Transaction_ID' },
  'Maintenance_Log': { collection: 'maintenance', idField: 'Maintenance_ID' },
  'Driver_Advances_Log': { collection: 'driverAdvances', idField: 'Advance_ID' }
};

async function importCollection(sheetName, config) {
  const records = exportData[sheetName];
  if (!records || records.length === 0) {
    console.log(`⏭️  ${sheetName}: لا توجد بيانات`);
    return 0;
  }

  const { collection, idField } = config;
  const colRef = db.collection(collection);
  let imported = 0;
  let errors = 0;

  // استخدم batch لكل 500 document
  let batch = db.batch();
  let count = 0;

  for (const record of records) {
    // تنظيف undefined/reference values
    const clean = {};
    for (const [key, val] of Object.entries(record)) {
      if (val !== undefined && val !== null && String(val) !== '') {
        // تحويل Boolean strings
        if (val === 'TRUE' || val === 'FALSE') {
          clean[key] = val === 'TRUE';
        } else {
          clean[key] = val;
        }
      }
    }

    let docId = String(record[idField] || `${collection}_${Date.now()}_${Math.random()}`);
    const docRef = colRef.doc(docId);
    batch.set(docRef, clean);
    count++;
    imported++;

    if (count >= 500) {
      await batch.commit();
      batch = db.batch();
      count = 0;
      console.log(`  📦 ${collection}: ${imported}/${records.length}`);
    }
  }

  if (count > 0) {
    await batch.commit();
  }

  console.log(`✅ ${sheetName}: ${imported} مستند`);
  return imported;
}

async function main() {
  console.log('🚀 بدء استيراد البيانات إلى Firestore...\n');

  let total = 0;
  for (const [sheetName, config] of Object.entries(COLLECTION_MAP)) {
    const count = await importCollection(sheetName, config);
    total += count;
  }

  console.log(`\n🎉 تم استيراد ${total} مستند بنجاح!`);
}

main().catch(err => {
  console.error('❌ فشل الاستيراد:', err);
  process.exit(1);
});
