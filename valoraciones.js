// IMPORTS FIREBASE
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { 
  getFirestore, collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, getDocs 
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// CONFIGURACIÓN FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyDPi4_ychd6n44IEXHqu3iWmiHjmwzyr-M",
  authDomain: "valoraciones-a8350.firebaseapp.com",
  projectId: "valoraciones-a8350",
  storageBucket: "valoraciones-a8350.appspot.com",
  messagingSenderId: "286602851936",
  appId: "1:286602851936:web:e1d4d11bfe1391dd1c7505"
};

// INICIALIZAR APP Y SERVICIOS
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Autenticación anónima inicial
signInAnonymously(auth)
  .then(() => console.log("Usuario anónimo autenticado:", auth.currentUser.uid))
  .catch((error) => console.error("Error en autenticación anónima:", error));

// ELEMENTOS DOM
const form = document.getElementById('ratingForm');
const stars = document.querySelectorAll('#ratingStars .star');
const reviewsContainer = document.getElementById('reviews');
const verTodasBtn = document.getElementById('verTodasBtn');

let currentRating = 0;
let isSubmitting = false;

// MENSAJE INICIAL
reviewsContainer.innerHTML = '<p class="loading">Cargando valoraciones...</p>';

// ESTRELLAS INTERACTIVAS
function updateStars(rating) {
  stars.forEach((star, idx) => star.classList.toggle('selected', idx < rating));
}
stars.forEach((star, idx) => {
  const value = idx + 1;
  star.addEventListener('mouseover', () => updateStars(value));
  star.addEventListener('mouseout', () => updateStars(currentRating));
  star.addEventListener('click', () => {
    currentRating = value;
    updateStars(currentRating);
  });
});

// Sanitizador usando DOMPurify
const sanitizeInput = (input) => {
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
};

// Helper para convertir archivo a base64
const toBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = (error) => reject(error);
});

// Limitación básica en cliente
const LAST_REVIEW_KEY = 'lastReviewTime';
const LIMIT_MINUTES = 5;

// ENVÍO FORMULARIO
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  console.log("Paso 0: Inicio envío");

  // Throttle por navegador
  const lastTime = localStorage.getItem(LAST_REVIEW_KEY);
  const now = Date.now();
  if (lastTime && now - parseInt(lastTime, 10) < LIMIT_MINUTES * 60 * 1000) {
    console.warn("Paso 0.1: Bloqueado por throttle navegador");
    const remaining = Math.ceil((LIMIT_MINUTES * 60 * 1000 - (now - parseInt(lastTime, 10))) / 60000);
    alert(`Solo puedes enviar una valoración cada ${LIMIT_MINUTES} minutos. Vuelve a intentarlo en ~${remaining} minuto(s).`);
    return;
  }
  
// --- Control de depuración ---
// Cambia a true si quieres ver los logs de diagnóstico en consola
const DEBUG = false;
// Si DEBUG es false, silenciamos logs y avisos, pero dejamos los errores visibles
if (!DEBUG) {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
  console.warn = noop;
  // console.error se mantiene para ver errores reales
}

if (isSubmitting) return;
isSubmitting = true;

const submitBtn = form.querySelector('button[type="submit"]');
submitBtn.disabled = true;
submitBtn.textContent = 'Enviando...';

  try {
    console.log("Paso 1: Recogiendo datos");
    let name = sanitizeInput(document.getElementById('name').value);
    let comment = sanitizeInput(document.getElementById('comment').value);
    const photoFile = document.getElementById('photo').files[0];

    if (!name) throw new Error('Tu nombre está vacío o contiene contenido no permitido.');
    if (!comment) throw new Error('Tu comentario está vacío o contiene contenido no permitido.');
    if (currentRating === 0) throw new Error('Por favor, selecciona una valoración.');

    const ratingInt = parseInt(currentRating, 10);
    console.log("Paso 2: Tipo de rating:", typeof ratingInt, ratingInt);

    const MAX_BYTES = 5 * 1024 * 1024;
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
    if (photoFile) {
      console.log("Paso 3: Validando imagen");
      if (!ALLOWED.includes(photoFile.type)) throw new Error('Formato no permitido. Usa JPG, PNG o WEBP.');
      if (photoFile.size > MAX_BYTES) throw new Error('La imagen es demasiado grande (máx 5MB).');
    }

    let photoURL;
    if (photoFile) {
      console.log("Paso 4: Subiendo imagen a Cloudinary");
      const base64File = await toBase64(photoFile);
      const res = await fetch('/.netlify/functions/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: base64File })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Error subiendo imagen (HTTP ${res.status})`);
      if (/^https:\/\/res\.cloudinary\.com\/\S+$/.test(json.secure_url)) {
        photoURL = json.secure_url;
        console.log("Paso 4.1: Imagen subida OK:", photoURL);
      } else {
        throw new Error('La URL de la imagen no cumple el patrón permitido.');
      }
    }

    console.log("Paso 5: Asegurando UID");
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }
    console.log("Paso 5.1: UID listo:", auth.currentUser ? auth.currentUser.uid : null);

    console.log("Paso 6: Chequeo de duplicados");
    const cincoMinutosAtras = new Date(Date.now() - LIMIT_MINUTES * 60 * 1000);
    const qCheck = query(
      collection(db, 'valoraciones'),
      where('uid', '==', auth.currentUser.uid),
      where('timestamp', '>', cincoMinutosAtras)
    );
    const snapshot = await getDocs(qCheck);
    console.log("Paso 6.1: snapshot.size =", snapshot.size);
    if (!snapshot.empty) {
      alert(`Ya has enviado una valoración en los últimos ${LIMIT_MINUTES} minutos.`);
      throw new Error('Valoración duplicada en poco tiempo');
    }

    console.log("Paso 7: Preparando datos para Firestore");
    const data = {
      uid: auth.currentUser.uid,
      nombre: name,
      comentario: comment,
      rating: ratingInt,
      ...(photoURL ? { photoURL } : {}),
      timestamp: serverTimestamp(),
      aprobado: false
    };
    console.log("Paso 7.1: Datos a enviar:", data, {
      tipos: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v]))
    });

    console.log("Paso 8: Guardando en Firestore");
    await addDoc(collection(db, 'valoraciones'), data);

    localStorage.setItem(LAST_REVIEW_KEY, String(Date.now()));

    console.log("Paso 9: Enviando email");
    fetch('/.netlify/functions/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: name,
        comentario: comment,
        rating: ratingInt
      })
    }).catch(err => console.error('Error enviando email:', err));

    alert('Valoración enviada. Se revisará antes de publicarse.');
    form.reset();
    currentRating = 0;
    updateStars(0);

  } catch (err) {
    console.error("ERROR DETECTADO:", err);
    if (err && err.message) alert(err.message);
  } finally {
    isSubmitting = false;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Enviar';
  }
});

// ESCUCHA EN TIEMPO REAL (solo aprobadas)
const q = query(
  collection(db, 'valoraciones'),
  where('aprobado', '==', true),
  orderBy('timestamp', 'desc')
);

let todasLasReseñas = [];
let mostrandoTodas = false;

onSnapshot(q, (snapshot) => {
  const nuevas = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (!data?.nombre || typeof data.rating !== 'number') return;
    nuevas.push({
      nombre: data.nombre,
      comentario: data.comentario || 'Sin comentario',
      rating: data.rating,
      photoURL: data.photoURL || null,
      expanded: false
    });
  });
  todasLasReseñas = nuevas;
  renderReviews();
});

// Función de traducción usando window.translations
function tr(key) {
  if (window.translations && window.translations[key]) {
    return window.translations[key];
  }
  return key;
}

// Escuchar cuando script.js cargue las traducciones
document.addEventListener('translationsLoaded', () => {
  renderReviews();
});

// RENDER DE RESEÑAS
function renderReviews() {
  reviewsContainer.innerHTML = "";
  const lista = mostrandoTodas ? todasLasReseñas : todasLasReseñas.slice(0, 3);

  lista.forEach((r) => {
    const div = document.createElement("div");
    div.classList.add("review-card");

    const comentarioSeguro = String(r.comentario || tr('reviews.noComment'));
    const textoCorto = comentarioSeguro.length > 120 ? comentarioSeguro.slice(0, 120) + "..." : comentarioSeguro;

    const h3 = document.createElement("h3");
    h3.textContent = r.nombre;
    div.appendChild(h3);

    const starsP = document.createElement("p");
    starsP.classList.add("stars-display");
    starsP.textContent = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);
    div.appendChild(starsP);

    const p = document.createElement("p");
    p.classList.add("review-text");
    p.textContent = r.expanded ? comentarioSeguro : textoCorto;
    div.appendChild(p);

    if (comentarioSeguro.length > 120) {
      const btnVerMas = document.createElement("button");
      btnVerMas.classList.add("ver-mas");
      btnVerMas.type = "button";
      btnVerMas.innerText = r.expanded ? tr('reviews.viewLess') : tr('reviews.viewMore');
      btnVerMas.addEventListener("click", () => {
        r.expanded = !r.expanded;
        renderReviews();
      });
      div.appendChild(btnVerMas);
    }

    if (r.photoURL) {
      const img = document.createElement("img");
      img.src = r.photoURL;
      img.alt = tr('reviews.photoAlt');
      img.loading = "lazy";
      div.appendChild(img);
    }

    reviewsContainer.appendChild(div);
  });

  // Botón global
  if (verTodasBtn) {
    verTodasBtn.textContent = mostrandoTodas ? tr('reviews.viewAllLess') : tr('reviews.viewAll');
  }
}

// BOTÓN GLOBAL "VER TODAS"
if (verTodasBtn) {
  verTodasBtn.addEventListener("click", () => {
    mostrandoTodas = !mostrandoTodas;
    renderReviews();
  });
}
 
