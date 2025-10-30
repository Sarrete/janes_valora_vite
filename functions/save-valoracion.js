// functions/save-valoracion.js
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

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

    const { uid, place, rating, comentario, nombre, photoURL } = JSON.parse(
      event.body || "{}"
    );

    console.log("📦 Body recibido:", { uid, place, rating, comentario, nombre, photoURL });

    // --- Validaciones obligatorias ---
    if (!uid || !place || typeof rating === "undefined" || !nombre) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Faltan campos obligatorios" }),
      };
    }

    // --- Validación de rating ---
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Rating inválido" }),
      };
    }

    // --- Sanitización de nombre y comentario ---
    const safeNombre = sanitizeText(nombre);
    const safeComentario = sanitizeText(comentario || "Sin comentario");

    if (!isSafeText(safeNombre) || !isSafeText(safeComentario)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Texto contiene contenido peligroso",
        }),
      };
    }

    // --- Longitud máxima ---
    if (safeNombre.length > 50) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Nombre demasiado largo" }),
      };
    }
    if (safeComentario.length > 1000) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Comentario demasiado largo" }),
      };
    }

    // --- Regex de caracteres permitidos en nombre ---
    const nombreRegex = /^[a-zA-ZÀ-ÿ0-9\s.,'-]+$/u;
    if (!nombreRegex.test(safeNombre)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Nombre contiene caracteres no permitidos",
        }),
      };
    }

    // --- Lista negra de palabras en comentario ---
    const palabrasProhibidas = ["spam", "xxx"];
    const lowerComentario = safeComentario.toLowerCase();
    if (palabrasProhibidas.some((p) => lowerComentario.includes(p))) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Comentario contiene contenido prohibido",
        }),
      };
    }

    // --- Validación de photoURL (solo Cloudinary con preset valoraciones/valoraciones_janes) ---
    let safePhotoURL = null;
    if (photoURL && typeof photoURL === "string") {
      try {
        const url = new URL(photoURL);
        console.log("🔗 Pathname:", url.pathname);

        // 1. Debe ser HTTPS
        if (url.protocol !== "https:") {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: "La URL debe ser HTTPS" }),
          };
        }

        // 2. Debe ser de Cloudinary
        if (url.hostname !== "res.cloudinary.com") {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: "Solo se permiten imágenes de Cloudinary" }),
          };
        }

        // 3. Debe ser tu cloud y carpeta "valoraciones" o "valoraciones_janes"
        const regex = /^\/image\/upload\/(v\d+\/)?valoraciones(_janes)?\//;
        if (!regex.test(url.pathname)) {
          console.error("❌ URL no coincide con regex:", url.pathname);
          return {
            statusCode: 400,
            body: JSON.stringify({ error: "La imagen no proviene del preset autorizado" }),
          };
        }

        // ✅ Si pasa todas las validaciones, asignamos
        safePhotoURL = photoURL;
      } catch (err) {
        console.error("❌ Error parseando URL:", err);
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "URL de imagen inválida" }),
        };
      }
    }

    // --- Rate limiting: 1 valoración por minuto ---
    const haceUnMinuto = Timestamp.fromMillis(Date.now() - 60 * 1000);
    const snapshot = await db
      .collection("valoraciones")
      .where("uid", "==", uid)
      .where("place", "==", place)
      .where("timestamp", ">", haceUnMinuto)
      .get();

    if (!snapshot.empty) {
      return {
        statusCode: 429,
        body: JSON.stringify({
          error: "Ya enviaste una valoración hace poco",
        }),
      };
    }

    // --- Guardar en Firestore ---
    const docRef = await db.collection("valoraciones").add({
      uid,
      place,
      nombre: safeNombre,
      comentario: safeComentario,
      rating: ratingNum,
      photoURL: safePhotoURL,
      timestamp: FieldValue.serverTimestamp(),
      aprobado: false, // 🔒 siempre forzado
    });

    console.log("✅ Documento guardado con ID:", docRef.id);

    return {
      statusCode: 200,
      body: JSON.stringify({ id: docRef.id, success: true }),
    };
  } catch (err) {
    console.error("❌ Error en save-valoracion:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
