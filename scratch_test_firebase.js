const admin = require('firebase-admin');
const dotenv = require('dotenv');
dotenv.config();

console.log("Firebase Project ID:", process.env.FIREBASE_PROJECT_ID);

try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
} catch (e) {
  console.error("Init Error:", e);
}

const db = admin.firestore();

async function run() {
  try {
    const plansSnap = await db.collection('subscription_plans').get();
    console.log("Plans found:", plansSnap.docs.map(doc => doc.id));
    
    // Check platform config
    const configSnap = await db.collection('platform_config').get();
    console.log("Platform config docs:");
    configSnap.docs.forEach(doc => {
      console.log(doc.id, "=>", doc.data());
    });
  } catch (err) {
    console.error("Error running query:", err);
  }
}

run();
