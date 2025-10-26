// functions/env-check.js
export async function handler() {
  return {
    statusCode: 200,
    body: JSON.stringify({
      CLOUDINARY_CLOUD_NAME: !!process.env.CLOUDINARY_CLOUD_NAME,
      CLOUDINARY_API_KEY: !!process.env.CLOUDINARY_API_KEY,
      CLOUDINARY_API_SECRET: !!process.env.CLOUDINARY_API_SECRET,
      TURNSTILE_SECRET_KEY: !!process.env.TURNSTILE_SECRET_KEY
    })
  };
}
