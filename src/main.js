import './style.css'
import javascriptLogo from './javascript.svg'
import viteLogo from '/vite.svg'
import { setupCounter } from './counter.js'

/* ================================
   RENDER APP
================================ */

document.querySelector('#app').innerHTML = `
  <div>
    <a href="https://vite.dev" target="_blank">
      <img src="${viteLogo}" class="logo" alt="Vite logo" />
    </a>

    <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript" target="_blank">
      <img src="${javascriptLogo}" class="logo vanilla" alt="JavaScript logo" />
    </a>

    <h1>Hello Vite!</h1>

    <!-- SIMULACIÓN sección valoraciones -->
    <section id="valoraciones" style="margin-top: 120vh; padding: 50px; border: 2px dashed red;">
      <h2>Valoraciones</h2>
      <p>Aquí va el formulario protegido por reCAPTCHA</p>
    </section>

    <div class="card">
      <button id="counter" type="button"></button>
    </div>

    <p class="read-the-docs">
      Click on the Vite logo to learn more
    </p>
  </div>
`

setupCounter(document.querySelector('#counter'))

/* ================================
   CONTROL VISIBILIDAD reCAPTCHA
================================ */

const valoracionSection = document.getElementById("valoraciones")

if (!valoracionSection) {
  console.warn("❌ No se encontró la sección #valoraciones")
} else {
  console.log("✅ Sección #valoraciones detectada")

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          document.body.classList.add("grecaptcha-visible")
          console.log("🟢 reCAPTCHA VISIBLE")
        } else {
          document.body.classList.remove("grecaptcha-visible")
          console.log("🔴 reCAPTCHA OCULTO")
        }
      })
    },
    {
      threshold: 0.3
    }
  )

  observer.observe(valoracionSection)
}
