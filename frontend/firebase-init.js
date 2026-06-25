// 🟢 Firebase Initialization — منظومة الكيان v7.0
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCyQQiA4amVXPzPPtY74n_RsVKq0tk4GQ8",
  authDomain: "kayan-system-f494f.firebaseapp.com",
  projectId: "kayan-system-f494f",
  storageBucket: "kayan-system-f494f.firebasestorage.app",
  messagingSenderId: "177890097793",
  appId: "1:177890097793:web:1ac9759ec9c44d14f76b80",
  measurementId: "G-GW5EMT62XH"
};

let fbAuth = null, fbDb = null, fbStorage = null;

if (typeof firebase !== 'undefined') {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    fbAuth = firebase.auth();
    fbDb = firebase.firestore();
    fbStorage = firebase.storage();
    fbDb.settings({ merge: true });
  } catch (e) {
    console.warn('Firebase init failed:', e);
  }
}

window.fbAuth = fbAuth;
window.fbDb = fbDb;
window.fbStorage = fbStorage;
