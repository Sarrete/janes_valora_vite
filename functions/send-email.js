// functions/send-email.js
const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  try {
    // Solo aceptar POST
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method Not Allowed' })
      };
    }

    // Parsear datos del body
    const { nombre, comentario, rating } = JSON.parse(event.body || '{}');

    if (!nombre || !comentario || !rating) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Faltan datos' })
      };
    }

    // Leer credenciales de entorno
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, NOTIFY_EMAIL } = process.env;

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !NOTIFY_EMAIL) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Faltan variables de entorno' })
      };
    }

    // Configuración del transporte SMTP
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465, // true si es 465
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });

    // Enviar correo
    await transporter.sendMail({
      from: `"Valoraciones Web" <${SMTP_USER}>`,
      to: NOTIFY_EMAIL,
      subject: 'Nueva valoración recibida',
      html: `
        <h2>Nueva valoración</h2>
        <p><strong>Nombre:</strong> ${nombre}</p>
        <p><strong>Comentario:</strong> ${comentario}</p>
        <p><strong>Rating:</strong> ${rating} ⭐</p>
      `
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    console.error('Error enviando correo:', err); // Solo se ve en logs de Netlify
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Error interno del servidor' })
    };
  }
};
