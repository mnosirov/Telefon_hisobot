/**
 * Firebase Admin Setup Script
 * Run this once to create the first admin user in Firestore.
 *
 * Usage:
 * 1. Install firebase-admin: npm install firebase-admin --save-dev
 * 2. Download serviceAccountKey.json from Firebase Console
 *    → Project Settings → Service Accounts → Generate new private key
 * 3. Place serviceAccountKey.json in the project root
 * 4. Run: node scripts/createAdmin.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const auth = admin.auth();
const db = admin.firestore();

async function createAdmin() {
  const email = process.argv[2] || 'admin@telefon.uz';
  const password = process.argv[3] || 'Admin@123456';
  const displayName = process.argv[4] || 'Admin';

  try {
    // Create Firebase Auth user
    const userRecord = await auth.createUser({
      email,
      password,
      displayName,
    });

    // Create Firestore profile with admin role
    await db.collection('users').doc(userRecord.uid).set({
      email,
      displayName,
      role: 'admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ Admin user created:`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   UID: ${userRecord.uid}`);
    console.log(`\n⚠️  Please change the password after first login!`);
  } catch (err) {
    console.error('❌ Error creating admin:', err.message);
  } finally {
    process.exit();
  }
}

createAdmin();
