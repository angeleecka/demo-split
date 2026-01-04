// script.js
document.addEventListener("DOMContentLoaded", () => {
  /* ==================================
     1) Карусель на главной (index.html)
     ================================== */
  const slides = document.querySelectorAll(".carousel-slide");
  if (slides.length) {
    let currentSlide = 0;
    const showSlide = (n) => {
      slides.forEach((s) => s.classList.remove("active"));
      slides[n]?.classList.add("active");
    };
    showSlide(currentSlide);
    setInterval(() => {
      currentSlide = (currentSlide + 1) % slides.length;
      showSlide(currentSlide);
    }, 5000);
  }

  /* ==================================
     2) Карусель услуг (services.html)
     ================================== */
  const servicesSlider = document.querySelector(".services-list");
  const servicesPrevArrow = document.querySelector(".prev-arrow");
  const servicesNextArrow = document.querySelector(".next-arrow");
  const dotsContainer = document.querySelector(".slider-dots");
  const serviceCards = document.querySelectorAll(".service-card");

  if (servicesSlider && dotsContainer && serviceCards.length) {
    let idx = 0;
    const total = serviceCards.length;

    // точки
    const dots = Array.from({ length: total }, (_, i) => {
      const dot = document.createElement("div");
      dot.className = "slider-dot" + (i === 0 ? " active" : "");
      dot.addEventListener("click", () => goTo(i));
      dotsContainer.appendChild(dot);
      return dot;
    });
    const updateDots = () =>
      dots.forEach((d, i) => d.classList.toggle("active", i === idx));

    const goTo = (i) => {
      idx = (i + total) % total;
      servicesSlider.style.transform = `translateX(${-idx * 100}%)`;
      updateDots();
    };

    servicesPrevArrow?.addEventListener("click", () => goTo(idx - 1));
    servicesNextArrow?.addEventListener("click", () => goTo(idx + 1));
  }
});
