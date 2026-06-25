import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('./service-account.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const data = JSON.parse(readFileSync('C:\\Users\\3laa\\AppData\\Local\\Temp\\kayan_fresh_export.json', 'utf8'));

const MAP = {
  Users: 'users', Trips_Log: 'trips', Expenses_Log: 'expenses',
  Vehicles: 'vehicles', Drivers: 'drivers', Clients: 'clients',
  Fuel_Balance: 'fuelBalance', Fuel_Transactions: 'fuelTransactions',
  Trip_Advances: 'tripAdvances', Notifications: 'notifications',
  System_Settings: 'settings', Balance_Transactions: 'balanceTransactions',
  Maintenance_Log: 'maintenance', Driver_Advances_Log: 'driverAdvances'
};

// Delete ALL existing data first
console.log('🗑️ Clearing existing data...');
for (const col of Object.values(MAP)) {
  const snap = await db.collection(col).get();
  if (snap.empty) continue;
  let batch = db.batch();
  let count = 0;
  snap.forEach(d => { batch.delete(d.ref); count++; });
  await batch.commit();
  console.log(`  🗑️ ${col}: ${count} deleted`);
}

// Import fresh data
let total = 0;
for (const [sheet, collection] of Object.entries(MAP)) {
  const records = data[sheet];
  if (!records || records.length === 0) { console.log(`⏭️ ${sheet}: 0`); continue; }

  const colRef = db.collection(collection);
  let batch = db.batch();
  let count = 0;

  for (const record of records) {
    const clean = {};
    for (const [key, val] of Object.entries(record)) {
      if (key && val !== undefined && val !== null && String(val) !== '') {
        clean[key] = (val === 'TRUE' || val === 'FALSE') ? val === 'TRUE' : val;
      }
    }

    // Use auto-generated document ID (avoids duplicate ID overwrites)
    const docRef = colRef.doc();
    batch.set(docRef, clean);
    count++;

    if (count >= 500) { await batch.commit(); batch = db.batch(); count = 0; }
  }

  if (count > 0) await batch.commit();
  console.log(`✅ ${sheet}: ${records.length} → ${collection}`);
  total += records.length;
}

console.log(`\n🎉 تم استيراد ${total} مستند بنجاح!`);
admin.app().delete();
