// functions/save-valoracion.js
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

// --- Sanitización y validación ---
const INVISIBLES = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g;
const DANGEROUS = /<\s*\/?\s*(script|img|svg|iframe|object|embed|link|style)\b|on\w+\s*=|javascript:|data:/i;

function sanitizeText(input) {
  if (!input) return "";
  return String(input)
    .replace(INVISIBLES, "")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function isSafeText(input) {
  return !DANGEROUS.test(input);
}

function isValidURL(str) {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

// --- Inicialización Firebase Admin ---
let db;
if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({ credential: cert(serviceAccount) });
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

    // Validaciones obligatorias
    if (!uid || !place || typeof rating === "undefined" || !nombre) {
      return { statusCode: 400, body: JSON.stringify({ error: "Faltan campos obligatorios" }) };
    }

    // Validación de rating
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return { statusCode: 400, body: JSON.stringify({ error: "Rating inválido" }) };
    }

    // Sanitización de nombre y comentario
    const safeNombre = sanitizeText(nombre);
    const safeComentario = sanitizeText(comentario || "Sin comentario");

    if (!isSafeText(safeNombre) || !isSafeText(safeComentario)) {
      return { statusCode: 400, body: JSON.stringify({ error: "Texto contiene contenido peligroso" }) };
    }

    if (safeNombre.length > 100) {
      return { statusCode: 400, body: JSON.stringify({ error: "Nombre demasiado largo" }) };
    }
    if (safeComentario.length > 1000) {
      return { statusCode: 400, body: JSON.stringify({ error: "Comentario demasiado largo" }) };
    }

    // Validación de photoURL
    let safePhotoURL = null;
    if (photoURL && typeof photoURL === "string") {
      if (!isValidURL(photoURL)) {
        return { statusCode: 400, body: JSON.stringify({ error: "URL de imagen inválida" }) };
      }
      safePhotoURL = photoURL;
    }

    // Filtro de tiempo: 1 valoración por minuto
    const haceUnMinuto = Timestamp.fromMillis(Date.now() - 60 * 1000);
    const snapshot = await db.collection("valoraciones")
      .where("uid", "==", uid)
      .where("place", "==", place)
      .where("timestamp", ">", haceUnMinuto)
      .get();

    if (!snapshot.empty) {
      return {
        statusCode: 429,
        body: JSON.stringify({ error: "Ya enviaste una valoración hace poco" })
      };
    }

    // Guardar en Firestore
    const docRef = await db.collection("valoraciones").add({
      uid,
      place,
      nombre: safeNombre,
      comentario: safeComentario,
      rating: ratingNum,
      photoURL: safePhotoURL,
      timestamp: FieldValue.serverTimestamp(),
      aprobado: false // 🔒 siempre forzado
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ id: docRef.id, success: true })
    };

  } catch (err) {
    console.error("Error en save-valoracion:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}
