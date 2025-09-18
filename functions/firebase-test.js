import admin from 'firebase-admin';

let app;

export const handler = async () => {
  try {
    // Inicializar solo una vez
    if (!app) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);

      app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: `${serviceAccount.project_id}.appspot.com`
      });
    }

    const db = admin.firestore();

    // Ejemplo: leer 1 documento de prueba
    const snapshot = await db.collection('valoraciones').limit(1).get();
    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        projectId: app.options.credential.projectId,
        sample: docs
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
