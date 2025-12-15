// functions/send-email.js
import nodemailer from "nodemailer";

// Rate limit en memoria (best-effort)
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

// Escape HTML para evitar inyección
function escapeHTML(str = "") {
  return str.replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

const securityHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: securityHeaders,
        body: JSON.stringify({ error: "Method Not Allowed" }),
      };
    }

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

    // Parse body
    let nombre, comentario, rating;
    try {
      const body = JSON.parse(event.body || "{}");
      nombre = body.nombre;
      comentario = body.comentario;
      rating = body.rating;
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Body inválido" }),
      };
    }

    // Validaciones estrictas
    if (
      typeof nombre !== "string" ||
      nombre.trim().length === 0 ||
      nombre.length > 60 ||
      typeof rating !== "number" ||
      rating < 1 ||
      rating > 5 ||
      (comentario && typeof comentario !== "string") ||
      (comentario && comentario.length > 1000)
    ) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Datos no válidos" }),
      };
    }

    const safeNombre = escapeHTML(nombre.trim());
    const safeComentario =
      comentario && comentario.trim() !== ""
        ? escapeHTML(comentario.trim())
        : "Sin comentario";

    // Variables SMTP
    const {
      SMTP_HOST,
      SMTP_PORT,
      SMTP_USER,
      SMTP_PASS,
      NOTIFY_EMAIL,
    } = process.env;

    if (
      !SMTP_HOST ||
      !SMTP_PORT ||
      !SMTP_USER ||
      !SMTP_PASS ||
      !NOTIFY_EMAIL
    ) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Configuración SMTP incompleta",
        }),
      };
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Valoraciones Web" <${SMTP_USER}>`,
      to: NOTIFY_EMAIL,
      subject: "Nueva valoración recibida",
      html: `
        <h2>Nueva valoración</h2>
        <p><strong>Nombre:</strong> ${safeNombre}</p>
        <p><strong>Comentario:</strong> ${safeComentario}</p>
        <p><strong>Rating:</strong> ${rating} ⭐</p>
      `,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error("❌ send-email error:", err);
    return {
      statusCode: 500,
      headers: securityHeaders,
      body: JSON.stringify({ error: "Error interno del servidor" }),
    };
  }
}
