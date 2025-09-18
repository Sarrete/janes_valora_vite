document.addEventListener("DOMContentLoaded", function () {
    // --- Elementos comunes ---
    const leftGear = document.querySelector(".gears-left");
    const rightGear = document.querySelector(".gears-right");
    const menuIcon = document.getElementById("menu-icon");
    const menu = document.getElementById("menu");
    const popup = document.getElementById("popup");
    const popupImage = document.getElementById("popup-image");
    const popupCaption = document.getElementById("popup-caption");
    const popupVideo = document.getElementById("popup-video");
    const videoSource = document.getElementById("popup-video-source");
    const videoCaption = document.getElementById("popup-video-caption");
    const prevBtn = document.getElementById("prev");
    const nextBtn = document.getElementById("next");
    const closePopup = document.getElementById("close-popup");
    const languageIcon = document.getElementById('language-icon');
    const languageSelector = document.getElementById('language-selector');
    const elementsToTranslate = document.querySelectorAll('[data-i18n]');

    let currentMediaIndex = 0;
    let currentMedia = [];
    let isVideo = false;

    // --- Función para cargar traducciones ---
    const loadTranslations = (lang) => {
        fetch(`../locales/${lang}.json`)
            .then(response => response.json())
            .then(translations => {
                window.translations = translations;

                // Traducción de textos normales
                elementsToTranslate.forEach(element => {
                    const key = element.getAttribute('data-i18n');
                    if (translations[key]) {
                        element.innerHTML = translations[key];
                    }
                });

                // Traducción de placeholders
                document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                    const key = el.getAttribute('data-i18n-placeholder');
                    if (translations[key]) {
                        el.setAttribute('placeholder', translations[key]);
                    }
                });

                // Avisar a valoraciones.js que ya hay traducciones
                document.dispatchEvent(new Event('translationsLoaded'));
            })
            .catch(error => console.error('Error loading translations:', error));
    };

    // --- Detectar idioma ---
    function detectarIdiomaNavegador() {
        const idioma = navigator.language || navigator.userLanguage;
        return idioma.split('-')[0];
    }

    // --- Cargar idioma inicial ---
    function cargarContenidoPorIdioma() {
        const idioma = detectarIdiomaNavegador();
        document.documentElement.lang = idioma;
        languageSelector.value = idioma;
        loadTranslations(idioma);
    }

    // --- Eventos de idioma ---
    languageIcon.addEventListener('click', () => {
        languageSelector.style.display = 'block';
    });

    languageSelector.addEventListener('change', (event) => {
        languageSelector.style.display = 'none';
        loadTranslations(event.target.value);
    });

    // --- Inicializar idioma ---
    cargarContenidoPorIdioma();

    // --- Piñones ---
    function rotateGears() {
        const rotation = window.scrollY / 5;
        if (leftGear && rightGear) {
            rightGear.style.transform = `rotate(${rotation}deg)`;
            leftGear.style.transform = `rotate(-${rotation}deg)`;
        }
    }
    setTimeout(() => {
        if (leftGear && rightGear) {
            leftGear.classList.add('gear-animate');
            rightGear.classList.add('gear-animate');
        }
    }, 100);
    window.addEventListener("scroll", rotateGears);

    // --- Menú ---
    if (menuIcon && menu) {
        menuIcon.addEventListener("click", () => {
            menu.classList.toggle("show");
        });
        menu.querySelectorAll("a").forEach(link => {
            link.addEventListener("click", (event) => {
                event.preventDefault();
                const targetId = link.getAttribute("href");
                const targetElement = document.querySelector(targetId);
                window.scrollTo({
                    top: targetElement.offsetTop - 80,
                    behavior: "smooth"
                });
                menu.classList.remove("show");
            });
        });
    }

    // --- Miniaturas dinámicas ---
    const miniaturaImagen = document.getElementById("miniatura-imagen");
    const imagenesMiniatura = [
        "images/mecanizados/Acumulador de gots/1.jpg",
        "images/mecanizados/Acumulador de gots/2.jpg",
        "images/mecanizados/Escaire/1.jpg",
        "images/mecanizados/Escaire/2.jpg",
        "images/mecanizados/Escaire/3.jpg",
        "images/mecanizados/Galeria/1.jpg",
        "images/mecanizados/Galeria/2.webp",
        "images/mecanizados/Galeria/3.jpg",
        "images/mecanizados/Galeria/4.webp",
        "images/mecanizados/Galeria/6.webp",
        "images/mecanizados/Galeria/7.jpg",
        "images/mecanizados/Galeria/8.webp",
        "images/mecanizados/Galeria/9.jpg",
        "images/mecanizados/Pasadors encarenats/1.jpg",
        "images/mecanizados/Pasadors encarenats/2.jpg",
    ];
    let indiceMiniatura = 0;
    setInterval(() => {
        indiceMiniatura = (indiceMiniatura + 1) % imagenesMiniatura.length;
        miniaturaImagen.src = imagenesMiniatura[indiceMiniatura];
    }, 3000);

    const miniaturaImagen1 = document.getElementById("miniatura-imagen1");
    const imagenesMiniatura1 = [
        "images/3d/Galeria/1.jpeg",
        "images/3d/Galeria/2.jpeg",
        "images/3d/Galeria/3.jpeg",
        "images/3d/Galeria/4.jpeg",
        "images/3d/Galeria/6.jpeg",
        "images/3d/Galeria/8.jpeg",
        "images/3d/Galeria/9.jpeg",
        "images/3d/Suport_manillar/Sm.jpeg",
        "images/3d/Suport_manillar/Sm_1.jpeg",
        "images/3d/Suport_manillar/Sm_2.jpeg",
        "images/3d/Suport_manillar/Sm_3.jpeg",
        "images/3d/Suport_manillar/Sm_4.jpeg",
    ];
    let indiceMiniatura1 = 0;
    setInterval(() => {
        indiceMiniatura1 = (indiceMiniatura1 + 1) % imagenesMiniatura1.length;
        miniaturaImagen1.src = imagenesMiniatura1[indiceMiniatura1];
    }, 3000);

    // --- Popup ---
    const miniatura = document.querySelector(".miniatura-dinamica");
    if (miniatura) {
        miniatura.addEventListener("click", () => {
            cleanVideo();
            currentMedia = [...imagenesMiniatura];
            currentMediaIndex = 0;
            isVideo = false;
            showMedia(currentMediaIndex, "Galería");
        });
    }
    const miniatura1 = document.querySelector(".miniatura-dinamica1");
    if (miniatura1) {
        miniatura1.addEventListener("click", () => {
            cleanVideo();
            currentMedia = [...imagenesMiniatura1];
            currentMediaIndex = 0;
            isVideo = false;
            showMedia(currentMediaIndex, "Galería");
        });
    }

    document.querySelectorAll('.image-container').forEach(fig => {
    fig.addEventListener('click', () => {
        const images = JSON.parse(fig.dataset.images);
        const video = fig.dataset.video || null;

        cleanVideo();
        currentMedia = images;
        currentMediaIndex = 0;
        isVideo = !!video;

        // Si hay vídeo, lo ponemos como primer elemento
        if (isVideo) {
            currentMedia.unshift(video);
        }

        const caption = fig.querySelector('.image-caption')?.textContent || '';
        showMedia(currentMediaIndex, caption);
    });
});
    
    function showMedia(index, captionText) {
        popupCaption.textContent = captionText;
        cleanVideo();
        popup.style.display = "flex";
        if (index === 0 && isVideo) {
            popupImage.style.display = "none";
            popupVideo.style.display = "block";
            videoSource.src = currentMedia[index];
            popupVideo.load();
            videoCaption.textContent = captionText;
            videoCaption.style.display = 'block';
        } else {
            popupVideo.style.display = "none";
            popupImage.src = currentMedia[index];
            popupImage.style.display = "block";
        }
    }

        function cleanVideo() {
        popupVideo.pause();
        videoSource.src = '';
        popupVideo.style.display = "none";
        videoCaption.style.display = "none";
    }

    // Botón "Anterior"
    prevBtn.addEventListener("click", function () {
        currentMediaIndex = (currentMediaIndex === 0) ? currentMedia.length - 1 : currentMediaIndex - 1;
        showMedia(currentMediaIndex, popupCaption.textContent);
    });

    // Botón "Siguiente"
    nextBtn.addEventListener("click", function () {
        currentMediaIndex = (currentMediaIndex === currentMedia.length - 1) ? 0 : currentMediaIndex + 1;
        showMedia(currentMediaIndex, popupCaption.textContent);
    });

    // Cerrar el popup
    closePopup.addEventListener("click", function () {
        popup.style.display = "none";
        cleanVideo();
    });

    popup.addEventListener("click", function (event) {
        if (event.target === popup) {
            popup.style.display = "none";
            cleanVideo();
        }
    });

    // Scroll para navegación en dispositivos móviles
    let scrollTimeout;
    popup.addEventListener("wheel", function (event) {
        clearTimeout(scrollTimeout);
        // Evitar múltiples eventos seguidos
        scrollTimeout = setTimeout(() => {
            if (event.deltaY > 0) {
                // Scroll hacia abajo, mostrar siguiente media
                currentMediaIndex = (currentMediaIndex === currentMedia.length - 1) ? 0 : currentMediaIndex + 1;
            } else if (event.deltaY < 0) {
                // Scroll hacia arriba, mostrar media anterior
                currentMediaIndex = (currentMediaIndex === 0) ? currentMedia.length - 1 : currentMediaIndex - 1;
            }
            showMedia(currentMediaIndex, popupCaption.textContent);
        }, 100);
        event.preventDefault(); // Evita el scroll de fondo
    });
});


