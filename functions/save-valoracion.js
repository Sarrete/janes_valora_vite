// functions/save-valoracion.js
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import fetch from "node-fetch";

// --- Sanitización y validación ---
const INVISIBLES = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g;
const DANGEROUS =
  /<\s*\/?\s*(script|img|svg|iframe|object|embed|link|style)\b|on\w+\s*=|javascript:|data:/i;

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

// --- Inicialización Firebase Admin ---
let db;
if (!getApps().length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
    db = getFirestore();
  } else {
    throw new Error("FIREBASE_SERVICE_ACCOUNT no está definido");
  }
} else {
  db = getFirestore();
}

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { uid, place, rating, comentario, nombre, photoURL, recaptchaToken } =
      JSON.parse(event.body || "{}");

    // --- Validar token reCAPTCHA ---
    if (!recaptchaToken) {
      return { statusCode: 400, body: JSON.stringify({ error: "Token reCAPTCHA faltante" }) };
    }

    const secret = process.env.RECAPTCHA_SECRET_KEY; // ✅ solo backend
    if (!secret) {
      return { statusCode: 500, body: JSON.stringify({ error: "RECAPTCHA_SECRET_KEY no definido" }) };
    }

    const verifyRes = await fetch(
      `https://www.google.com/recaptcha/api/siteverify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(recaptchaToken)}`
      }
    );
    const verifyData = await verifyRes.json();
    if (!verifyData.success || (verifyData.score !== undefined && verifyData.score < 0.5)) {
      return { statusCode: 403, body: JSON.stringify({ error: "reCAPTCHA inválido" }) };
    }

    // --- Validaciones ---
    if (!uid || !place || typeof rating === "undefined" || !nombre) {
      return { statusCode: 400, body: JSON.stringify({ error: "Faltan campos obligatorios" }) };
    }

    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return { statusCode: 400, body: JSON.stringify({ error: "Rating inválido" }) };
    }

    const safeNombre = sanitizeText(nombre);
    const safeComentario = sanitizeText(comentario || "Sin comentario");

    if (!isSafeText(safeNombre) || !isSafeText(safeComentario)) {
      return { statusCode: 400, body: JSON.stringify({ error: "Texto contiene contenido peligroso" }) };
    }

    if (safeNombre.length > 50) return { statusCode: 400, body: JSON.stringify({ error: "Nombre demasiado largo" }) };
    if (safeComentario.length > 1000) return { statusCode: 400, body: JSON.stringify({ error: "Comentario demasiado largo" }) };

    const nombreRegex = /^[a-zA-ZÀ-ÿ0-9\s.,'-]+$/u;
    if (!nombreRegex.test(safeNombre)) {
      return { statusCode: 400, body: JSON.stringify({ error: "Nombre contiene caracteres no permitidos" }) };
    }

    const palabrasProhibidas = ["spam", "xxx"];
    if (palabrasProhibidas.some(p => safeComentario.toLowerCase().includes(p))) {
      return { statusCode: 400, body: JSON.stringify({ error: "Comentario contiene contenido prohibido" }) };
    }

    // --- Validación de photoURL ---
    let safePhotoURL = null;
    if (photoURL) {
      try {
        const url = new URL(photoURL);
        if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com") {
          return { statusCode: 400, body: JSON.stringify({ error: "Imagen no permitida" }) };
        }
        safePhotoURL = photoURL;
      } catch (err) {
        return { statusCode: 400, body: JSON.stringify({ error: "URL de imagen inválida" }) };
      }
    }

    // --- Rate limiting: 1 valoración por minuto ---
    const haceUnMinuto = Timestamp.fromMillis(Date.now() - 60 * 1000);
    const snapshot = await db.collection("valoraciones")
      .where("uid", "==", uid)
      .where("place", "==", place)
      .where("timestamp", ">", haceUnMinuto)
      .get();
    if (!snapshot.empty) return { statusCode: 429, body: JSON.stringify({ error: "Ya enviaste una valoración hace poco" }) };

    // --- Guardar en Firestore ---
    const docRef = await db.collection("valoraciones").add({
      uid,
      place,
      nombre: safeNombre,
      comentario: safeComentario,
      rating: ratingNum,
      photoURL: safePhotoURL,
      timestamp: FieldValue.serverTimestamp(),
      aprobado: false,
    });

    return { statusCode: 200, body: JSON.stringify({ id: docRef.id, success: true }) };
  } catch (err) {
    console.error("❌ Error en save-valoracion:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
