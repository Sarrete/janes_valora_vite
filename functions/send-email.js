// functions/send-email.js
import nodemailer from 'nodemailer';

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method Not Allowed' })
      };
    }

    // Parsear datos del body
    const { nombre, comentario, rating } = JSON.parse(event.body || '{}');

    if (!nombre || typeof rating === 'undefined') {
      console.warn("⚠️ Datos incompletos recibidos:", { nombre, comentario, rating });
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Faltan datos obligatorios' })
      };
    }

    // Si comentario viene vacío, usar un valor por defecto
    const safeComentario = comentario && comentario.trim() !== '' ? comentario : 'Sin comentario';

    // Leer credenciales de entorno
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, NOTIFY_EMAIL } = process.env;

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !NOTIFY_EMAIL) {
      console.error("❌ Faltan variables de entorno");
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Faltan variables de entorno' })
      };
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });

    await transporter.verify();

    const info = await transporter.sendMail({
      from: `"Valoraciones Web" <${SMTP_USER}>`,
      to: NOTIFY_EMAIL,
      subject: 'Nueva valoración recibida',
      html: `
        <h2>Nueva valoración</h2>
        <p><strong>Nombre:</strong> ${nombre}</p>
        <p><strong>Comentario:</strong> ${safeComentario}</p>
        <p><strong>Rating:</strong> ${rating} ⭐</p>
      `
    });

    console.log("📩 Correo enviado con éxito:", info.messageId);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, id: info.messageId })
    };

  } catch (err) {
    console.error("❌ Error enviando correo:", err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Error interno del servidor' })
    };
  }
}
