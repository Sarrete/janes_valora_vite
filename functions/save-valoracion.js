// =============================
// 📦 save-valoracion.js — Netlify Function segura
// =============================
import fetch from "node-fetch";
import admin from "firebase-admin";

// --- 🔐 Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}
const db = admin.firestore();

// --- Función principal
export async function handler(event, context) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido" }) };
    }

    const { nombre, comentario, rating, photoURL, recaptchaToken } = JSON.parse(event.body || "{}");

    if (!nombre || !rating || !recaptchaToken) {
      return { statusCode: 400, body: JSON.stringify({ error: "Faltan campos obligatorios" }) };
    }

    // --- 🔒 Verificar reCAPTCHA
    const secret = process.env.RECAPTCHA_SECRET_KEY;
    const recaptchaRes = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${secret}&response=${recaptchaToken}`
    });
    const recaptchaJson = await recaptchaRes.json();
    if (!recaptchaJson.success || recaptchaJson.score < 0.5) {
      return { statusCode: 403, body: JSON.stringify({ error: "reCAPTCHA inválido o sospechoso" }) };
    }

    // --- Guardar en Firestore
    const docRef = await db.collection("valoraciones").add({
      nombre: nombre,
      comentario: comentario || "Sin comentario",
      rating: Number(rating),
      photoURL: photoURL || null,
      aprobado: false, // ✅ Se aprueba manualmente
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Valoración enviada correctamente", id: docRef.id })
    };
  } catch (err) {
    console.error("Error en save-valoracion:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Error interno del servidor" }) };
  }
}
