import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const auth = admin.auth();

const DEFAULT_PASSWORD = 'Kayan@2026';

const snap = await db.collection('users').get();

for (const doc of snap.docs) {
  const d = doc.data();
  const email = `${d.Username}@kayan.system`;

  try {
    const userRecord = await auth.createUser({
      email,
      password: DEFAULT_PASSWORD,
      displayName: d.Full_Name,
      disabled: d.Status !== 'ACTIVE'
    });

    await db.collection('users').doc(doc.id).update({
      auth_uid: userRecord.uid,
      auth_email: email
    });

    console.log(`✅ ${d.User_ID} ${d.Username} → ${userRecord.uid} (${email})`);
  } catch (e) {
    if (e.code === 'auth/email-already-exists') {
      console.log(`⏭️ ${d.Username} already exists`);
    } else {
      console.error(`❌ ${d.Username}:`, e.message);
    }
  }
}

console.log('\nتم الانتهاء. كل المستخدمين:\n');
const all = await auth.listUsers();
all.users.forEach(u => {
  console.log(`  ${u.email} | ${u.displayName} | ${u.disabled ? 'disabled' : 'active'}`);
});

admin.app().delete();
