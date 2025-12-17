import './style.css'
import javascriptLogo from './javascript.svg'
import viteLogo from '/vite.svg'
import { setupCounter } from './counter.js'

document.querySelector('#app').innerHTML = `
  <div>
    <a href="https://vite.dev" target="_blank">
      <img src="${viteLogo}" class="logo" alt="Vite logo" />
    </a>
    <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript" target="_blank">
      <img src="${javascriptLogo}" class="logo vanilla" alt="JavaScript logo" />
    </a>
    <h1>Hello Vite!</h1>

    <!-- SIMULACIÓN de la sección de valoración -->
    <section id="valoracion" style="margin-top: 120vh;">
      <h2>Valoración</h2>
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

document.addEventListener("DOMContentLoaded", () => {
  const valoracionSection = document.getElementById("valoraciones")
  if (!valoracionSection) return

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          document.body.classList.add("grecaptcha-visible")
        } else {
          document.body.classList.remove("grecaptcha-visible")
        }
      })
    },
    { threshold: 0.3 }
  )

  observer.observe(valoracionSection)
})
