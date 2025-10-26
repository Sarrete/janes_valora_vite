// functions/save-valoracion.js
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Inicializar Firebase Admin solo una vez
const app = initializeApp({
  credential: applicationDefault()
});
const db = getFirestore();

// Ventana de tiempo en ms (ej. 1 minuto)
const TIME_WINDOW = 60 * 1000;

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { uid, place, rating, comentario } = JSON.parse(event.body || "{}");

    // Validar campos obligatorios
    if (!uid || !place || !rating) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Faltan campos obligatorios" })
      };
    }

    // Filtro de tiempo: comprobar si ya valoró en el último minuto
    const snapshot = await db.collection("valoraciones")
      .where("uid", "==", uid)
      .where("place", "==", place)
      .where("timestamp", ">", Date.now() - TIME_WINDOW)
      .get();

    if (!snapshot.empty) {
      return {
        statusCode: 429,
        body: JSON.stringify({ error: "Ya enviaste una valoración hace poco" })
      };
    }

    // Guardar nueva valoración
    const docRef = await db.collection("valoraciones").add({
      uid,
      place,
      rating,
      comentario: comentario || "",
      timestamp: Date.now()
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ id: docRef.id, success: true })
    };

  } catch (err) {
    console.error("Error en save-valoracion:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Error interno" })
    };
  }
}
