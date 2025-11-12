// =============================
// 📦 valoraciones.js — versión segura final
// =============================

// --- IMPORTS FIREBASE (desde npm, no CDN)
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  query,
  where,
  orderBy,
  onSnapshot
} from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

// --- 🔐 Sanitización y validación de texto
const INVISIBLES = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g;
const DANGEROUS = /<\s*\/?\s*(script|img|svg|iframe|object|embed|link|style)\b|on\w+\s*=|javascript:|data:/i;

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

// --- ⚙️ Configuración Firebase usando variables de entorno
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// --- 🔥 Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Autenticación anónima inicial
signInAnonymously(auth).catch((error) =>
  console.error("Error en autenticación anónima:", error)
);

let currentUser = null;
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    console.log("✅ Usuario anónimo listo:", user.uid);
  }
});

// 🔥 Conectar al emulador SOLO en desarrollo
if (import.meta.env.DEV) {
  connectFirestoreEmulator(db, "localhost", 8080);
  console.log("🔥 Conectado al Firestore Emulator en localhost:8080");
}

// --- 🧱 ELEMENTOS DOM
const form = document.getElementById("ratingForm");
const stars = document.querySelectorAll("#ratingStars .star");
const reviewsContainer = document.getElementById("reviews");
const verTodasBtn = document.getElementById("verTodasBtn");

let currentRating = 0;
let isSubmitting = false;

// --- Mensaje inicial
reviewsContainer.innerHTML = '<p class="loading">Cargando valoraciones...</p>';

// --- ⭐ ESTRELLAS INTERACTIVAS
function updateStars(rating) {
  stars.forEach((star, idx) =>
    star.classList.toggle("selected", idx < rating)
  );
}
stars.forEach((star, idx) => {
  const value = idx + 1;
  star.addEventListener("mouseover", () => updateStars(value));
  star.addEventListener("mouseout", () => updateStars(currentRating));
  star.addEventListener("click", () => {
    currentRating = value;
    updateStars(currentRating);
  });
});

// --- 🖼️ Helper para convertir archivo a Base64
const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });

// --- 🔒 Cargar reCAPTCHA v3 de forma segura
(function loadRecaptcha() {
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
  if (!siteKey) {
    console.error("⚠️ Falta VITE_RECAPTCHA_SITE_KEY");
    return;
  }

  const script = document.createElement("script");
  script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
  script.async = true;
  document.head.appendChild(script);

  script.onload = () => {
    window.recaptchaSiteKey = siteKey;
    console.log("✅ reCAPTCHA v3 cargado correctamente");
  };
})();

// --- 📤 Envío del formulario
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isSubmitting) return;
  if (!currentUser) {
    alert("Usuario no autenticado todavía, espera un momento.");
    return;
  }

  isSubmitting = true;
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Enviando...";

  try {
    const rawName = document.getElementById("name").value;
    const rawComment = document.getElementById("comment").value;
    const name = sanitizeText(rawName);
    const comment = sanitizeText(rawComment);
    const photoFile = document.getElementById("photo").files[0];

    if (!name) throw new Error("Por favor, ingresa tu nombre.");
    if (currentRating === 0)
      throw new Error("Por favor, selecciona una valoración.");
    if (!isSafeText(name) || !isSafeText(comment)) {
      throw new Error("El texto contiene contenido potencialmente peligroso.");
    }

    // --- Validación de imagen
    const MAX_BYTES = 5 * 1024 * 1024;
    const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
    let photoURL = null;

    if (photoFile) {
      if (!ALLOWED.includes(photoFile.type))
        throw new Error("Formato no permitido. Usa JPG, PNG o WEBP.");
      if (photoFile.size > MAX_BYTES)
        throw new Error("La imagen es demasiado grande (máx 5MB).");

      const base64File = await toBase64(photoFile);
      const res = await fetch("/.netlify/functions/upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: base64File })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Error subiendo imagen");
      photoURL = json.secure_url;
    }

    // --- 🧠 reCAPTCHA v3: generar token dinámicamente
    const token = await new Promise((resolve, reject) => {
      if (!window.grecaptcha || !window.recaptchaSiteKey)
        return reject(new Error("reCAPTCHA no está listo"));

      grecaptcha.ready(() => {
        grecaptcha
          .execute(window.recaptchaSiteKey, { action: "submit" })
          .then(resolve)
          .catch(reject);
      });
    });

    // --- Guardar valoración en el backend
    const resValoracion = await fetch("/.netlify/functions/save-valoracion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: currentUser.uid,
        place: "default",
        nombre: name,
        comentario: comment || "Sin comentario",
        rating: currentRating,
        photoURL: photoURL || null,
        recaptchaToken: token
      })
    });

    const dataValoracion = await resValoracion.json();
    if (!resValoracion.ok) {
      throw new Error(dataValoracion.error || "Error guardando valoración");
    }

    // --- Email opcional al administrador
    fetch("/.netlify/functions/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: name,
        comentario: comment,
        rating: currentRating
      })
    }).catch((err) => console.error("Error enviando email:", err));

    alert("Valoración enviada. Se revisará antes de publicarse.");
    form.reset();
    currentRating = 0;
    updateStars(0);
  } catch (err) {
    alert(err.message || "Error al enviar la valoración");
  } finally {
    isSubmitting = false;
    submitBtn.disabled = false;
    submitBtn.textContent = "Enviar";
  }
});

// --- 🔄 Escucha en tiempo real de reseñas aprobadas
const q = query(
  collection(db, "valoraciones"),
  where("aprobado", "==", true),
  orderBy("timestamp", "desc")
);

let todasLasReseñas = [];
let mostrandoTodas = false;

onSnapshot(q, (snapshot) => {
  const nuevas = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (!data?.nombre || typeof data.rating !== "number") return;
    nuevas.push({
      nombre: data.nombre,
      comentario: data.comentario || "Sin comentario",
      rating: data.rating,
      photoURL: data.photoURL || null,
      expanded: false
    });
  });
  todasLasReseñas = nuevas;
  renderReviews();
});

// --- 🧩 Renderizar reseñas en pantalla
function renderReviews() {
  reviewsContainer.innerHTML = "";
  const lista = mostrandoTodas ? todasLasReseñas : todasLasReseñas.slice(0, 3);

  lista.forEach((r) => {
    const div = document.createElement("div");
    div.classList.add("review-card");

    const h3 = document.createElement("h3");
    h3.textContent = sanitizeText(r.nombre);
    div.appendChild(h3);

    const starsP = document.createElement("p");
    starsP.classList.add("stars-display");
    starsP.textContent = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);
    div.appendChild(starsP);

    const p = document.createElement("p");
    p.classList.add("review-text");
    const comentarioSeguro = sanitizeText(String(r.comentario));
    const textoCorto =
      comentarioSeguro.length > 120
        ? comentarioSeguro.slice(0, 120) + "..."
        : comentarioSeguro;
    p.textContent = r.expanded ? comentarioSeguro : textoCorto;
    div.appendChild(p);

    if (comentarioSeguro.length > 120) {
      const btnVerMas = document.createElement("button");
      btnVerMas.classList.add("ver-mas");
      btnVerMas.type = "button";
      btnVerMas.innerText = r.expanded ? "Ver menos" : "Ver más";
      btnVerMas.addEventListener("click", () => {
        r.expanded = !r.expanded;
        renderReviews();
      });
      div.appendChild(btnVerMas);
    }

    if (r.photoURL) {
      const img = document.createElement("img");
      img.src = r.photoURL;
      img.alt = "Foto de la valoración";
      img.loading = "lazy";
      div.appendChild(img);
    }

    reviewsContainer.appendChild(div);
  });

  if (verTodasBtn) {
    verTodasBtn.textContent = mostrandoTodas ? "Ver menos" : "Ver todas";
  }
}

// --- 🎛️ Botón global "Ver todas"
if (verTodasBtn) {
  verTodasBtn.addEventListener("click", () => {
    mostrandoTodas = !mostrandoTodas;
    renderReviews();
  });
}
