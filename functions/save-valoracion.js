// functions/save-valoracion.js
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

// --- Sanitización y validación ---
const INVISIBLES = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g;
// 🔒 ampliamos para bloquear <script>, svg, iframe, JS inline, onload, etc.
const DANGEROUS =
  /<\s*\/?\s*(script|img|svg|iframe|object|embed|link|style|meta|base|form|input)\b|on\w+\s*=|javascript:|data:|vbscript:|file:|expression\(|srcdoc=/i;

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

// 🔒 Cabeceras comunes de seguridad
const securityHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

export async function handler(event) {
  try {
    // 🔒 Limitar tamaño máximo del body (evita DoS)
    if (event.body && event.body.length > 10000) {
      return {
        statusCode: 413,
        headers: securityHeaders,
        body: JSON.stringify({ error: "Solicitud demasiado grande" }),
      };
    }

    // 🔒 Solo POST
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: securityHeaders, body: "Method Not Allowed" };
    }

    // 🔒 Validar origen (CORS controlado)
    const origin = event.headers.origin || "";
    const allowedOrigins = [
      process.env.ALLOWED_ORIGIN || "https://janesenginyeria.netlify.app",
      "https://clever-malabi-a1eea4.netlify.app", // dominio de pruebas
    ];

    const headers = {
      ...securityHeaders,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (allowedOrigins.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
    }

    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 200, headers, body: "" };
    }

    // Parse body
    let payload = {};
    try {
      payload = JSON.parse(event.body || "{}");
    } catch (err) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) };
    }

    const { uid, place, rating, comentario, nombre, photoURL, recaptchaToken } = payload;

    console.log("📦 Body recibido:", { uid, place, rating, comentario, nombre, photoURL });

    // --- reCAPTCHA v3: validación SERVIDOR ---
    if (!recaptchaToken) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Token reCAPTCHA faltante" }) };
    }

    const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;
    if (!RECAPTCHA_SECRET_KEY) {
      console.error("❌ RECAPTCHA_SECRET_KEY no definida en el entorno");
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Configuración de seguridad incompleta" }) };
    }

    // Verificar con Google
    try {
      const params = new URLSearchParams({ secret: RECAPTCHA_SECRET_KEY, response: recaptchaToken });
      const resp = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const recaptchaData = await resp.json();

      // Logs útiles en servidor (pero no exponer al cliente)
      console.log("🔍 reCAPTCHA response:", {
        success: recaptchaData.success,
        score: recaptchaData.score,
        action: recaptchaData.action,
        hostname: recaptchaData.hostname,
      });

      // Comprobaciones mínimas: success true y score razonable
      const MIN_SCORE = 0.45; // puedes ajustar entre 0.3-0.7 según tolerancia
      if (!recaptchaData.success || (typeof recaptchaData.score === "number" && recaptchaData.score < MIN_SCORE)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: "reCAPTCHA inválido" }) };
      }

      // (Opcional) comprobar action si lo deseas
      if (recaptchaData.action && recaptchaData.action !== "submit") {
        // si la acción devuelta no coincide, lo marcamos como sospechoso
        return { statusCode: 403, headers, body: JSON.stringify({ error: "Acción reCAPTCHA inesperada" }) };
      }
    } catch (err) {
      console.error("❌ Error verificando reCAPTCHA:", err);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Error validando reCAPTCHA" }) };
    }

    // --- Validaciones obligatorias (resto del flujo) ---
    if (!uid || !place || typeof rating === "undefined" || !nombre) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Faltan campos obligatorios" }),
      };
    }

    // --- Validación de rating ---
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Rating inválido" }),
      };
    }

    // --- Sanitización de nombre y comentario ---
    const safeNombre = sanitizeText(nombre);
    const safeComentario = sanitizeText(comentario || "Sin comentario");

    if (!isSafeText(safeNombre) || !isSafeText(safeComentario)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Texto contiene contenido peligroso",
        }),
      };
    }

    // --- Longitud máxima ---
    if (safeNombre.length > 50) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Nombre demasiado largo" }),
      };
    }
    if (safeComentario.length > 1000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Comentario demasiado largo" }),
      };
    }

    // --- Regex de caracteres permitidos en nombre ---
    const nombreRegex = /^[a-zA-ZÀ-ÿ0-9\s.,'´`-]+$/u;
    if (!nombreRegex.test(safeNombre)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Nombre contiene caracteres no permitidos",
        }),
      };
    }

    // --- Lista negra de palabras en comentario ---
    const palabrasProhibidas = ["spam", "xxx", "http://", "https://"];
    const lowerComentario = safeComentario.toLowerCase();
    if (palabrasProhibidas.some((p) => lowerComentario.includes(p))) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Comentario contiene contenido prohibido",
        }),
      };
    }

    // --- Validación de photoURL (solo Cloudinary autorizado) ---
    let safePhotoURL = null;
    if (photoURL && typeof photoURL === "string") {
      try {
        const url = new URL(photoURL);
        console.log("🔗 Pathname:", url.pathname);

        // 1. HTTPS obligatorio
        if (url.protocol !== "https:") {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: "La URL debe ser HTTPS" }),
          };
        }

        // 2. Cloudinary obligatorio
        if (url.hostname !== "res.cloudinary.com") {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: "Solo se permiten imágenes de Cloudinary" }),
          };
        }

        // 3. Validar cloud y carpeta
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        if (!cloudName) {
          console.error("❌ CLOUDINARY_CLOUD_NAME no está definido en el entorno");
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Configuración de Cloudinary incompleta" }),
          };
        }

        const escapedCloud = cloudName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`^/${escapedCloud}/image/upload/(v\\d+/)?valoraciones(_janes)?/`);
        if (!regex.test(url.pathname)) {
          console.error("❌ URL no coincide con regex:", url.pathname);
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: "La imagen no proviene del preset autorizado" }),
          };
        }

        // 🔒 Validar extensión de imagen (extra)
        if (!url.pathname.match(/\.(jpg|jpeg|png|webp)$/i)) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: "Formato de imagen no permitido" }),
          };
        }

        safePhotoURL = photoURL;
      } catch (err) {
        console.error("❌ Error parseando URL:", err);
        return {
          statusCode: 400,
          headers,
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
        headers,
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
      aprobado: false, // 🔒 forzado
    });

    console.log("✅ Documento guardado con ID:", docRef.id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ id: docRef.id, success: true }),
    };
  } catch (err) {
    console.error("❌ Error en save-valoracion:", err);
    // 🔒 No exponemos detalles internos del servidor al cliente
    return {
      statusCode: 500,
      headers: securityHeaders,
      body: JSON.stringify({ error: "Error interno del servidor" }),
    };
  }
}
