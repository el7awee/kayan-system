import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const auth = admin.auth();

const snap = await db.collection('users').get();
let count = 0;

for (const doc of snap.docs) {
  const d = doc.data();
  if (!d.auth_uid) {
    console.log(`⏭️ ${d.User_ID || doc.id}: no auth_uid, skipping`);
    continue;
  }
  try {
    await auth.setCustomUserClaims(d.auth_uid, {
      role: d.Role,
      user_id: d.User_ID,
      username: d.Username
    });
    console.log(`✅ ${d.Username} (${d.auth_uid}) → role=${d.Role}`);
    count++;
  } catch (e) {
    console.error(`❌ ${d.Username}: ${e.message}`);
  }
}

console.log(`\nتم تعيين custom claims لـ ${count} مستخدم`);
admin.app().delete();
