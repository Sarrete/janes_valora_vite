// functions/save-valoracion.js
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

let db;

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({
    credential: cert(serviceAccount)
  });
  db = getFirestore();
} else {
  db = getFirestore();
}

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { uid, place, rating, comentario, nombre, photoURL } = JSON.parse(event.body || "{}");

    if (!uid || !place || !rating || !nombre) {
      return { statusCode: 400, body: JSON.stringify({ error: "Faltan campos obligatorios" }) };
    }

    // Filtro de tiempo: 1 valoración por minuto
    const snapshot = await db.collection("valoraciones")
      .where("uid", "==", uid)
      .where("place", "==", place)
      .where("timestamp", ">", Date.now() - 60 * 1000)
      .get();

    if (!snapshot.empty) {
      return { statusCode: 429, body: JSON.stringify({ error: "Ya enviaste una valoración hace poco" }) };
    }

    const docRef = await db.collection("valoraciones").add({
      uid,
      place,
      nombre,
      comentario: comentario || "Sin comentario",
      rating,
      photoURL: photoURL || null,
      timestamp: Date.now(),
      aprobado: false
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ id: docRef.id, success: true })
    };

  } catch (err) {
    console.error("Error en save-valoracion:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
