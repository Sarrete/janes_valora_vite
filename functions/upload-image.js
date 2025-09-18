// functions/upload-image.js
import crypto from 'crypto';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Rate limiting simple en memoria
const requestsMap = new Map();
const LIMIT = 5; // máx peticiones
const WINDOW_MS = 60 * 1000; // 1 minuto

function rateLimit(ip) {
  const now = Date.now();
  const timestamps = requestsMap.get(ip) || [];
  const recent = timestamps.filter(ts => now - ts < WINDOW_MS);
  recent.push(now);
  requestsMap.set(ip, recent);
  return recent.length <= LIMIT;
}

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const ip = event.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    if (!rateLimit(ip)) {
      return { statusCode: 429, body: JSON.stringify({ error: 'Demasiadas solicitudes, espera un momento.' }) };
    }

    // Validar variables de entorno
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const folder = 'valoraciones';

    if (!cloudName || !apiKey || !apiSecret) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Faltan variables de entorno de Cloudinary' })
      };
    }

    // Parsear body
    let file, token;
    try {
      const body = JSON.parse(event.body);
      file = body.file;
      token = body['cf-turnstile-response']; // token CAPTCHA opcional
      if (!file) throw new Error('No se recibió el archivo');
    } catch (err) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Body inválido o archivo no enviado' })
      };
    }

    // Validar CAPTCHA si lo usas
    if (process.env.TURNSTILE_SECRET_KEY) {
      if (!token) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Falta verificación CAPTCHA' }) };
      }
      const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: process.env.TURNSTILE_SECRET_KEY,
          response: token,
          remoteip: ip
        })
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Verificación CAPTCHA fallida' }) };
      }
    }

    // Validar formato y tamaño de imagen
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(file);
    if (!m) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Formato de imagen inválido' }) };
    }
    const mime = m[1].toLowerCase();
    if (!ALLOWED_MIME.includes(mime)) {
      return { statusCode: 415, body: JSON.stringify({ error: 'Tipo de imagen no permitido' }) };
    }
    const base64 = m[2].replace(/\s/g, '');
    const estimatedBytes = Math.floor((base64.length * 3) / 4);
    if (estimatedBytes > MAX_BYTES) {
      return { statusCode: 413, body: JSON.stringify({ error: 'Imagen demasiado grande (máx 5MB)' }) };
    }

    // Generar firma
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(paramsToSign).digest('hex');

    // Preparar datos para Cloudinary
    const formData = new URLSearchParams();
    formData.append('file', file);
    formData.append('folder', folder);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);

    // Subir a Cloudinary
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        statusCode: res.status,
        body: JSON.stringify({ error: data.error?.message || 'Error en Cloudinary' })
      };
    }

    // Devolver solo lo necesario
    return {
      statusCode: 200,
      body: JSON.stringify({
        secure_url: data.secure_url,
        public_id: data.public_id,
        width: data.width,
        height: data.height,
        format: data.format
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Error interno' })
    };
  }
}
