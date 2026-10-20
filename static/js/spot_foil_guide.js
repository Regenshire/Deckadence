(() => {
  "use strict";
  const demo = document.querySelector("[data-foil-density-demo]");
  if (!demo) return;
  const slider = demo.querySelector("input[type=range]");
  const output = demo.querySelector("output");
  const update = () => {
    output.value = `${slider.value}%`;
    demo.style.setProperty("--white-coverage", Number(slider.value) / 100);
  };
  slider.addEventListener("input", update);
  update();
})();
