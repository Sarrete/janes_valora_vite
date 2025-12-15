// functions/upload-image.js
import crypto from "crypto";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Rate limiting simple en memoria (best-effort)
const requestsMap = new Map();
const LIMIT = 5;
const WINDOW_MS = 60 * 1000;

function rateLimit(ip) {
  const now = Date.now();
  const timestamps = requestsMap.get(ip) || [];
  const recent = timestamps.filter(ts => now - ts < WINDOW_MS);
  recent.push(now);
  requestsMap.set(ip, recent);
  return recent.length <= LIMIT;
}

// Headers de seguridad comunes
const securityHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

export async function handler(event) {
  try {
    // Solo POST
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: securityHeaders,
        body: JSON.stringify({ error: "Method Not Allowed" }),
      };
    }

    // CORS controlado (opcional pero recomendado)
    const origin = event.headers.origin || "";
    const allowedOrigins = [
      process.env.ALLOWED_ORIGIN || "https://janesenginyeria.netlify.app",
      "https://clever-malabi-a1eea4.netlify.app",
    ];

    const headers = { ...securityHeaders };
    if (allowedOrigins.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
    }

    const ip =
      event.headers["x-forwarded-for"]?.split(",")[0] || "unknown";

    if (!rateLimit(ip)) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({
          error: "Demasiadas solicitudes, espera un momento",
        }),
      };
    }

    // Variables de entorno Cloudinary
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const folder = "valoraciones";

    if (!cloudName || !apiKey || !apiSecret) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Configuración de Cloudinary incompleta",
        }),
      };
    }

    // Parse body
    let file, token;
    try {
      const body = JSON.parse(event.body || "{}");
      file = body.file;
      token = body["cf-turnstile-response"];
      if (!file) throw new Error();
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Body inválido o archivo no enviado",
        }),
      };
    }

    // CAPTCHA Turnstile (si está configurado)
    if (process.env.TURNSTILE_SECRET_KEY) {
      if (!token) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Falta verificación CAPTCHA" }),
        };
      }

      const verifyRes = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            secret: process.env.TURNSTILE_SECRET_KEY,
            response: token,
            remoteip: ip,
          }),
        }
      );

      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            error: "Verificación CAPTCHA fallida",
          }),
        };
      }
    }

    // Validar formato base64
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(
      file
    );

    if (!match) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Formato de imagen inválido" }),
      };
    }

    const mime = match[1].toLowerCase();
    if (!ALLOWED_MIME.includes(mime)) {
      return {
        statusCode: 415,
        headers,
        body: JSON.stringify({ error: "Tipo de imagen no permitido" }),
      };
    }

    const base64 = match[2].replace(/\s/g, "");
    const estimatedBytes = Math.floor((base64.length * 3) / 4);

    if (estimatedBytes > MAX_BYTES) {
      return {
        statusCode: 413,
        headers,
        body: JSON.stringify({
          error: "Imagen demasiado grande (máx 5MB)",
        }),
      };
    }

    // Firma Cloudinary
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto
      .createHash("sha256")
      .update(paramsToSign)
      .digest("hex");

    const formData = new URLSearchParams();
    formData.append("file", file);
    formData.append("folder", folder);
    formData.append("api_key", apiKey);
    formData.append("timestamp", timestamp);
    formData.append("signature", signature);

    // Subida a Cloudinary
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: "POST",
        body: formData,
      }
    );

    const data = await res.json();

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers,
        body: JSON.stringify({
          error: data.error?.message || "Error en Cloudinary",
        }),
      };
    }

    // (Opcional) Validar dimensiones máximas
    if (data.width > 5000 || data.height > 5000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Dimensiones de imagen no permitidas",
        }),
      };
    }

    // Respuesta final
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        secure_url: data.secure_url,
        public_id: data.public_id,
        width: data.width,
        height: data.height,
        format: data.format,
      }),
    };
  } catch (err) {
    console.error("❌ upload-image error:", err);
    return {
      statusCode: 500,
      headers: securityHeaders,
      body: JSON.stringify({ error: "Error interno del servidor" }),
    };
  }
}
