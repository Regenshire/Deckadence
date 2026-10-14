// *** SEALED PRODUCT EFFECTS - Animate Product Results ***
/* Optional presentation only. Saved pack contents never depend on animation. */
(() => {
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const element = (tag, cls) => {
    const n = document.createElement(tag);
    n.className = cls;
    return n;
  };
  function attach(host) {
    if (!host || host.dataset.sealedEffects) return;
    host.dataset.sealedEffects = "1";
    let frame = 0,
      point = null;
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      point = null;
      host.style.removeProperty("--pack-x");
      host.style.removeProperty("--pack-y");
      host.classList.remove("is-hovered");
    };
    host.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse" || reduced() || host.disabled) return;
      point = [event.clientX, event.clientY];
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = host.getBoundingClientRect();
        host.style.setProperty(
          "--pack-x",
          ((point[0] - r.left) / r.width - 0.5) * 7 + "deg",
        );
        host.style.setProperty(
          "--pack-y",
          -((point[1] - r.top) / r.height - 0.5) * 5 + "deg",
        );
        host.classList.add("is-hovered");
      });
    });
    host.addEventListener("pointerleave", reset);
    host.addEventListener("blur", reset);
  }
  function boxNode(image, name, count, collector = false, play = false, productType = "", releaseDate = "") {
    const bundle = productType.includes("bundle");
    if (productType) {
      collector = productType === "collector_box";
      play = !collector;
    }
    const productLabel = ({
      play_box: "Play Booster Box", collector_box: "Collector Booster Box",
      draft_box: "Draft Booster Box", set_box: "Set Booster Box",
      bundle: "Bundle", gift_bundle: "Gift Bundle", holiday_bundle: "Holiday Bundle",
      commander_bundle: "Commander Bundle", secret_lair_bundle: "Secret Lair Bundle",
    })[productType] || (collector ? "Collector Booster Box" : play ? "Play Booster Box" : "Booster Box");
    const box = element("div", "sealed-box");
    box.classList.toggle("sealed-box-bundle", bundle);
    box.classList.toggle("sealed-box-collector", collector);
    box.classList.toggle("sealed-box-carton", collector || play);
    box.classList.toggle("sealed-box-play", play);
    const back = element("div", "sealed-box-back");
    box.append(back);
    const packs = element("div", "sealed-box-packs");
    for (let i = 0; i < 5; i++) {
      const pack = element("img", "sealed-box-pack");
      pack.src = image;
      pack.alt = "";
      pack.style.setProperty("--i", i);
      packs.append(pack);
    }
    box.append(packs);
    for (const side of ["left", "right", "lid", "front"]) {
      const face = element("div", "sealed-box-" + side);
      if (side === "front") {
        const logo = element("img", "sealed-box-magic-logo");
        const year = Number(String(releaseDate).slice(0, 4));
        logo.src = "/static/img/Logos/" + (year > 0 && year < 2017 ? "mtg_1993.png" : "mtg_current.png");
        logo.alt = "Magic: The Gathering";
        face.append(logo);
      }
      if (side === "front" || side === "lid") {
        if (!collector && !play) {
          const img = element("img", "sealed-box-art");
          img.src = image;
          img.alt = "";
          face.append(img);
        }
        if (side === "front") {
          const label = element("div", "sealed-box-label");
          label.textContent = name;
          const small = document.createElement("small");
          small.textContent = count + " packs";
          label.append(small);
          face.append(label);
          if (collector || play) {
            const bar = element("div", "sealed-box-collector-bar");
            bar.textContent = productLabel;
            face.append(bar);
          }
        } else if (collector || play) {
          const title = element("span", "sealed-box-top-name");
          title.textContent = name;
          face.append(title);
        }
      }
      box.append(face);
    }
    box.setAttribute("aria-hidden", "true");
    return box;
  }
  function setBox(host, enabled, name, count, collector = false, play = false, productImage = null, productType = "", releaseDate = "") {
    host.querySelector(".sealed-box")?.remove();
    host.classList.toggle("is-box", enabled);
    host.classList.toggle("has-product-art", Boolean(enabled && productImage));
    if (enabled && !productImage)
      host.prepend(
        boxNode(host.querySelector("img").src, name, count, collector, play, productType, releaseDate),
      );
  }

  async function open({
    grid,
    image,
    sourceImage,
    sourcePanel,
    prepareGrid,
    box = false,
    boxImage,
    productImage,
    boxName = "",
    productType = "",
    releaseDate = "",
    collector = false,
    play = false,
    count = 1,
    signal,
  }) {
    if (!grid) return;
    if (
      reduced() ||
      signal?.aborted ||
      typeof Element.prototype.animate !== "function"
    ) {
      if (sourcePanel) sourcePanel.hidden = true;
      grid.style.visibility = "";
      return;
    }
    const overlay = element("div", "sealed-opening-overlay"),
      stage = element("div", "sealed-opening-stage"),
      animations = [];
    overlay.setAttribute("aria-hidden", "true");
    overlay.append(stage);
    const animate = (el, frames, opts) => {
      const animation = el.animate(frames, opts);
      animations.push(animation);
      return animation;
    };
    const cancel = () => animations.forEach((a) => a.cancel());
    const finished = (a) => a.finished.catch(() => {});
    signal?.addEventListener("abort", cancel, { once: true });
    const rect = sourceImage?.getBoundingClientRect();
    const fromPack =
      !box &&
      sourceImage?.isConnected &&
      !sourcePanel?.hidden &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.top < innerHeight;
    let restoreSource = () => {},
      x,
      y,
      wrapper,
      cap,
      body,
      size,
      scale = 1;
    const src =
      image?.src || "/static/img/pack_art/_fallback/booster_default.png";
    try {
      if (fromPack) {
        // Move the actual displayed image into the animation, preserving its
        // screen position and layout space. It never fades out or respawns.
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
        size = { width: rect.width, height: rect.height };
        const placeholder = element("span", "sealed-source-placeholder"),
          host = sourceImage.parentElement,
          visibility = host.style.visibility,
          imageClass = sourceImage.className,
          imageStyle = sourceImage.getAttribute("style"),
          radius = getComputedStyle(sourceImage).borderRadius;
        placeholder.style.cssText = `display:block;width:${sourceImage.offsetWidth}px;height:${sourceImage.offsetHeight}px;flex:none;`;
        sourceImage.before(placeholder);
        host.style.visibility = "hidden";
        body = sourceImage;
        body.className = "sealed-tear-body";
        body.removeAttribute("style");
        body.style.borderRadius = radius;
        restoreSource = () => {
          body.className = imageClass;
          if (imageStyle === null) body.removeAttribute("style");
          else body.setAttribute("style", imageStyle);
          placeholder.replaceWith(body);
          host.style.visibility = visibility;
        };
      } else {
        await prepareGrid?.();
        if (signal?.aborted) return;
        const bounds = grid.getBoundingClientRect();
        x = bounds.left + bounds.width / 2;
        y = Math.min(innerHeight * 0.43, bounds.top + 180);
        size =
          innerWidth <= 760
            ? { width: 190, height: 310 }
            : { width: 240, height: 380 };
        body = element("img", "sealed-tear-body");
        body.src = src;
        body.alt = "";
      }
      stage.style.left = x + "px";
      stage.style.top = y + "px";
      document.body.append(overlay);
      let delay = 0;
      if (box && productImage) {
        const photo = element("img", "sealed-product-opening");
        photo.src = productImage;
        photo.alt = "";
        stage.append(photo);
        animate(photo, [
          { opacity: 0, transform: "translate(-50%, -50%) scale(.85)" },
          { opacity: 1, transform: "translate(-50%, -50%) scale(1)", offset: 0.25 },
          { opacity: 1, offset: 0.65 },
          { opacity: 0, transform: "translate(-50%, -65%) scale(1.08)" },
        ], { duration: 1100, fill: "both" });
        delay = 800;
      } else if (box) {
        const carton = boxNode(
          boxImage || src,
          boxName,
          count,
          collector,
          play,
          productType,
          releaseDate,
        );
        carton.classList.add("sealed-box-opening");
        stage.append(carton);
        animate(
          carton,
          [
            { opacity: 0, transform: "translateY(30px) scale(.85)" },
            { opacity: 1, transform: "translateY(0) scale(1)", offset: 0.3 },
            { opacity: 1, offset: 0.8 },
            { opacity: 0, transform: "translateY(90px) scale(.94)" },
          ],
          { duration: 1250, fill: "both" },
        );
        animate(
          carton.querySelector(".sealed-box-lid"),
          [
            {
              transform:
                (collector || play || productType) ? "skewX(-36deg) rotateX(0)" : "rotateX(0)",
            },
            {
              transform:
                (collector || play || productType)
                  ? "skewX(-36deg) rotateX(-125deg)"
                  : "rotateX(-125deg)",
            },
          ],
          {
            delay: 280,
            duration: 650,
            fill: "both",
            easing: "cubic-bezier(.2,.7,.2,1)",
          },
        );
        for (const side of ["left", "right"])
          animate(
            carton.querySelector(".sealed-box-" + side),
            [
              { filter: "brightness(1)" },
              {
                filter: "brightness(1.3)",
                transform: `rotateY(${side === "left" ? "-" : "+"}30deg)`,
              },
            ],
            { delay: 430, duration: 450, fill: "both" },
          );
        animate(
          carton.querySelector(".sealed-box-packs"),
          [{ transform: "translateY(0)" }, { transform: "translateY(-90px)" }],
          { delay: 500, duration: 650, fill: "both", easing: "ease-out" },
        );
        delay = 950;
      }
      wrapper = element("div", "sealed-tear-wrapper");
      wrapper.style.cssText = `width:${size.width}px;height:${size.height}px;left:${-size.width / 2}px;top:${-size.height / 2}px;`;
      cap = element("img", "sealed-tear-top");
      cap.src = body.currentSrc || body.src;
      cap.alt = "";
      cap.style.borderRadius = body.style.borderRadius;
      wrapper.append(body, cap);
      stage.append(wrapper);
      if (fromPack) {
        scale = Math.min(
          1.24,
          (innerWidth - 28) / size.width,
          (innerHeight - 32) / size.height,
        );
        await finished(
          animate(
            wrapper,
            [
              { transform: "scale(1)", opacity: 1 },
              { transform: `scale(${scale})`, opacity: 1 },
            ],
            {
              duration: 440,
              fill: "both",
              easing: "cubic-bezier(.2,.7,.25,1)",
            },
          ),
        );
      } else {
        await finished(
          animate(
            wrapper,
            [
              { opacity: 0, transform: "translateY(15px) scale(.94)" },
              { opacity: 1, transform: "translateY(0) scale(1)" },
            ],
            { delay, duration: 440, fill: "both", easing: "ease-out" },
          ),
        );
      }
      if (signal?.aborted) return;
      // A small pull opens a shallow diagonal slit; the strip bends away,
      // instead of the entire wrapper rocking from side to side.
      const tear = animate(
        cap,
        [
          { transform: "translate(0,0) rotate(0)", opacity: 1 },
          {
            transform: "translate(3px,-3px) rotate(-2deg)",
            opacity: 1,
            offset: 0.18,
          },
          {
            transform: "translate(22px,-22px) rotate(-7deg) rotateX(12deg)",
            opacity: 1,
            offset: 0.5,
          },
          {
            transform: "translate(62px,-65px) rotate(-16deg) rotateX(28deg)",
            opacity: 0.9,
            offset: 0.82,
          },
          {
            transform: "translate(94px,-92px) rotate(-23deg) rotateX(38deg)",
            opacity: 0,
          },
        ],
        { duration: 610, fill: "both", easing: "cubic-bezier(.3,0,.25,1)" },
      );
      await finished(tear);
      if (signal?.aborted) return;
      if (fromPack) {
        await prepareGrid?.();
        if (signal?.aborted) return;
      }
      animate(
        body,
        [
          { transform: "translateY(0)", opacity: 1 },
          {
            transform: "translateY(65px) rotate(-3deg) scale(.97)",
            opacity: 0,
          },
        ],
        { delay: 100, duration: 540, fill: "both", easing: "ease-in" },
      );
      const spillY = y - size.height * scale * 0.27;
      for (const [i, card] of [...grid.children].entries()) {
        const r = card.getBoundingClientRect(),
          dx = x - r.left - r.width / 2,
          dy = spillY - r.top - r.height / 2;
        animate(
          card,
          [
            { transform: `translate(${dx}px,${dy}px) scale(.18)`, opacity: 0 },
            {
              transform: `translate(${dx * 0.55}px,${dy - 65}px) scale(.5)`,
              opacity: 1,
              offset: 0.35,
            },
            { transform: "translate(0,0) scale(1)", opacity: 1 },
          ],
          {
            delay: Math.min(i, 10) * 45,
            duration: 750,
            fill: "both",
            easing: "cubic-bezier(.2,.7,.25,1)",
          },
        );
      }
      grid.style.visibility = "";
      await Promise.allSettled(animations.map((a) => a.finished));
    } finally {
      signal?.removeEventListener("abort", cancel);
      cancel();
      if (sourcePanel) sourcePanel.hidden = true;
      restoreSource();
      overlay.remove();
      grid.style.visibility = "";
    }
  }
  window.DeckadenceSealedEffects = { attach, setBox, open };
})();
