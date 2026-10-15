(() => {
  "use strict";
  const page = document.getElementById("homeScreen");
  const root = document.getElementById("homeShowcase");
  if (!page || !root) return;
  const byId = (id) => document.getElementById(id);
  const initial = JSON.parse(byId("homeInitialState").textContent);
  const setup = byId("homeSetup");
  const statusPanel = byId("homeDatabaseStatus");
  const install = byId("homeInstall");
  const retry = byId("homeRetry");
  const check = byId("homeCheckStatus");
  const dismiss = byId("homeDismissStatus");
  const motion = byId("homeMotion");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let state = initial;
  let pollTimer;
  let pollPending = null;
  let starting = false;
  let statusKnown = true;
  let dismissed = false;
  let assets;
  let assetsPromise;
  let feature = 0;
  let animations = [];
  let version = 0;
  let selectionVersion = 0;
  let showcaseStarted = false;
  let motionEnabled = true;
  let visible = true;
  let rotationTimer;
  let rotationPaused = false;
  let sceneSettled = false;
  let hovered = false;
  let focused = false;
  const rotation = byId("homeRotation");
  try { rotationPaused = localStorage.getItem("deckadence.home.rotationPaused") === "true"; } catch (_) {}
  try { motionEnabled = localStorage.getItem("deckadence.home.motion") !== "off"; } catch (_) {}
  motion.checked = motionEnabled;
  const descriptions = [
    "A carousel of boosters selects a pack and opens it into three cards.",
    "A land is discarded and a creature is revealed.",
    "Three custom cards spread into a fan.",
    "Generated deck artwork spins under a pointer and settles on a deck.",
    "A booster opens and reveals four different cards.",
    "Distinct Second Darkness alternate cards form a deck in overlapping columns."
  ];
  const tabs = [...root.querySelectorAll("[data-feature]")].map((link, i) => {
    const data = { title: link.textContent.trim(), href: link.href, ...link.dataset };
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = data.title;
    button.dataset.feature = i;
    button.setAttribute("aria-pressed", String(i === 0));
    button.setAttribute("aria-controls", "homeFeatureTitle");
    button.addEventListener("click", () => selectFeature(i));
    link.replaceWith(button);
    return { button, ...data };
  });
  motion.closest("label").hidden = false;
  rotation.closest(".home-carousel-controls").hidden = false;

  function scheduleRotation() {
    clearTimeout(rotationTimer);
    const unavailable = !motionEnabled || reduced.matches;
    rotation.disabled = unavailable;
    const label = unavailable ? "Automatic rotation disabled" : rotationPaused ? "Resume automatic rotation" : "Pause automatic rotation";
    rotation.setAttribute("aria-label", label);
    rotation.title = label;
    rotation.firstElementChild.className = `fa-solid ${rotationPaused || unavailable ? "fa-play" : "fa-pause"}`;
    if (unavailable || rotationPaused || !sceneSettled || root.hidden || document.hidden || !visible || hovered || focused) return;
    // Leave the completed preview visible for eight seconds before advancing.
    rotationTimer = setTimeout(() => selectFeature((feature + 1) % tabs.length), 8000);
  }
  byId("homePrevious").addEventListener("click", () => selectFeature((feature + tabs.length - 1) % tabs.length));
  byId("homeNext").addEventListener("click", () => selectFeature((feature + 1) % tabs.length));
  rotation.addEventListener("click", () => {
    rotationPaused = !rotationPaused;
    try { localStorage.setItem("deckadence.home.rotationPaused", String(rotationPaused)); } catch (_) {}
    scheduleRotation();
  });
  root.addEventListener("pointerenter", (event) => { if (event.pointerType === "mouse") { hovered = true; scheduleRotation(); } });
  root.addEventListener("pointerleave", () => { hovered = false; scheduleRotation(); });
  root.addEventListener("focusin", () => { focused = true; scheduleRotation(); });
  root.addEventListener("focusout", (event) => { focused = root.contains(event.relatedTarget); scheduleRotation(); });

  function stop() {
    version++;
    animations.forEach((animation) => animation.cancel());
    animations = [];
  }

  async function loadAssets() {
    if (assets) return;
    if (!assetsPromise) {
      const url = new URL(root.dataset.assetsUrl, location.href);
      assetsPromise = fetch(url, { cache: "force-cache", signal: AbortSignal.timeout(10000) })
        .then((response) => {
          if (!response.ok) throw new Error("Artwork unavailable");
          return response.json();
        })
        .then((manifest) => {
          const resolve = (value) => {
            if (Array.isArray(value)) return value.map(resolve);
            if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolve(item)]));
            return typeof value === "string" && /^[a-f0-9]+\.(webp|png)$/.test(value) ? new URL(value, url).href : value;
          };
          assets = resolve(manifest);
        })
        .catch((error) => { assetsPromise = null; throw error; });
    }
    await assetsPromise;
  }

  async function selectFeature(index, play = true) {
    clearTimeout(rotationTimer);
    sceneSettled = false;
    feature = index;
    const selection = ++selectionVersion;
    stop();
    const item = tabs[index];
    tabs.forEach(({ button }, i) => button.setAttribute("aria-pressed", String(i === index)));
    byId("homeFeatureTitle").textContent = item.title;
    byId("homeFeatureEyebrow").textContent = item.eyebrow;
    byId("homeFeatureDescription").textContent = item.description;
    byId("homeFeatureLink").textContent = item.actionLabel;
    byId("homeFeatureLink").href = item.href;
    root.querySelector(".showcase-scene").setAttribute("aria-label", descriptions[index]);
    byId("homeMotionStatus").textContent = "";
    try {
      await loadAssets();
      if (selection !== selectionVersion || root.hidden) return;
      await animate(play);
    } catch (_) {
      if (selection !== selectionVersion) return;
      root.querySelector(".showcase-scene").replaceChildren();
      byId("homeMotionStatus").textContent = "Artwork unavailable. You can still open this feature.";
    } finally {
      if (selection === selectionVersion) {
        sceneSettled = true;
        scheduleRotation();
      }
    }
  }

  function setText(id, text) {
    const element = byId(id);
    if (element.textContent !== String(text)) element.textContent = text;
  }

  function applyStatus(next) {
    state = next;
    statusKnown = true;
    const ready = Boolean(next.database_ready);
    const running = Boolean(next.is_running);
    const failed = next.stage === "Failed" || next.stage === "Interrupted";
    setup.hidden = ready;
    root.hidden = !ready;
    statusPanel.hidden = dismissed && !running || (!running && !failed && next.stage !== "Complete");
    install.disabled = starting || running;
    install.textContent = running ? "Installingâ€¦" : failed ? "Retry download" : "Download card database";
    retry.hidden = !failed || !ready;
    retry.disabled = starting || running;
    check.hidden = true;
    dismiss.hidden = running || !ready;
    setText("homeDatabaseStage", next.stage === "Complete" ? "Card database installed" : next.stage || "Installation status");
    setText("homeDatabaseMessage", next.message || "");
    setText("homeDatabaseError", next.error || "");
    byId("homeDatabaseError").hidden = !next.error;
    setText("homeDatabaseConnection", "");
    const total = Math.max(0, Number(next.progress_total) || 0);
    const current = Math.min(total, Math.max(0, Number(next.progress_current) || 0));
    const progress = byId("homeDatabaseProgress");
    progress.hidden = !running || total <= 0;
    progress.max = total || 1;
    progress.value = current;
    setText("homeDatabaseProgressText", running && total > 0
      ? `${current.toLocaleString()} of ${total.toLocaleString()} ${next.progress_unit || "items"} (${Math.floor(current / total * 100)}%)`
      : "");
    setText("homeImportedCards", Number(next.cards_imported || 0).toLocaleString());
    setText("homeImportedSets", Number(next.sets_represented || 0).toLocaleString());
    setText("homeDatabaseFinished", next.finished_at || "â€”");
    setText("homeDatabaseLog", Array.isArray(next.detail_lines) ? next.detail_lines.join("\n") : "");
    const now = Date.now() / 1000;
    const elapsed = Math.max(0, Math.floor((running ? now : next.updated_epoch || now) - (next.started_epoch || now)));
    const age = Math.max(0, Math.floor(now - (next.updated_epoch || now)));
    setText("homeDatabaseTiming", next.started_epoch
      ? `Elapsed: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s${running ? ` Â· Last progress update ${age}s ago` : ""}` : "");
    if (ready && !showcaseStarted) {
      showcaseStarted = true;
      selectFeature(feature);
    } else if (!ready && showcaseStarted) {
      showcaseStarted = false;
      stop();
    }
    scheduleRotation();
  }

  async function pollStatus() {
    if (pollPending) return pollPending;
    clearTimeout(pollTimer);
    pollPending = (async () => {
      try {
        const response = await fetch(initial.status_url, {
          cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error("Status unavailable");
        const next = await response.json();
        if (!next || typeof next.is_running !== "boolean" || typeof next.database_ready !== "boolean") {
          throw new Error("Invalid installation status");
        }
        applyStatus(next);
      } catch (_) {
        statusKnown = false;
        statusPanel.hidden = false;
        install.disabled = true;
        retry.disabled = true;
        check.hidden = false;
        setText("homeDatabaseConnection", "Cannot reach the server. Reconnecting to check installation status; the download may still be running.");
      } finally {
        pollPending = null;
        if (!document.hidden && (!statusKnown || state.is_running || !state.database_ready)) {
          pollTimer = setTimeout(pollStatus, !statusKnown ? 5000 : state.is_running ? 2000 : 15000);
        }
      }
    })();
    return pollPending;
  }

  async function startInstall() {
    if (starting || !statusKnown || state.is_running) return;
    starting = true;
    dismissed = false;
    install.disabled = retry.disabled = true;
    statusPanel.hidden = false;
    setText("homeDatabaseConnection", "Starting database downloadâ€¦");
    try {
      // Finish an older status request before dispatching, so its stale idle
      // response cannot re-enable the installer after this POST starts a job.
      if (pollPending) await pollPending;
      if (!statusKnown || state.is_running) return;
      const response = await fetch(initial.start_url, {
        method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ force_download: false }), signal: AbortSignal.timeout(15000)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        await pollStatus();
        if (!state.is_running) {
          statusPanel.hidden = false;
          setText("homeDatabaseError", result.message || "Could not start the download.");
          byId("homeDatabaseError").hidden = false;
        }
        return;
      }
      await pollStatus();
    } catch (_) {
      // A lost POST response does not mean the server failed to start the job.
      statusKnown = false;
      await pollStatus();
    } finally {
      starting = false;
      install.disabled = retry.disabled = !statusKnown || Boolean(state.is_running);
    }
  }

  install.addEventListener("click", startInstall);
  retry.addEventListener("click", startInstall);
  check.addEventListener("click", pollStatus);
  dismiss.addEventListener("click", () => { dismissed = true; statusPanel.hidden = true; });
  motion.addEventListener("change", () => {
    motionEnabled = motion.checked;
    try { localStorage.setItem("deckadence.home.motion", motionEnabled ? "on" : "off"); } catch (_) {}
    if (!root.hidden) selectFeature(feature, false);
  });
  reduced.addEventListener("change", () => { if (!root.hidden) selectFeature(feature, false); });
  function pauseOffscreen() {
    for (const animation of animations) {
      if (animation.effect.getTiming().duration === 0) continue;
      if (animation.playState === "finished" || animation.playState === "idle") continue;
      if (document.hidden || !visible) animation.pause();
      else animation.play();
    }
  }
  const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; pauseOffscreen(); scheduleRotation(); });
  visibility.observe(root.querySelector(".showcase-scene"));
  document.addEventListener("visibilitychange", () => {
    pauseOffscreen();
    scheduleRotation();
    clearTimeout(pollTimer);
    if (!document.hidden) pollStatus();
  });
  window.addEventListener("pageshow", (event) => { if (event.persisted) pollStatus(); });
  window.addEventListener("focus", () => { if (!document.hidden) pollStatus(); });
  let lastWidth = 0;
  const resize = new ResizeObserver(([entry]) => {
    const width = Math.round(entry.contentRect.width);
    if (width && lastWidth && width !== lastWidth && assets && !root.hidden) selectFeature(feature, false);
    lastWidth = width;
  });
  resize.observe(root);

  function attribute(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function card(name, classes = '', style = '') {
    return `<div class="showcase-paper showcase-art-card ${classes}" style="${style}">
      <img src="${assets.magic[name]}" decoding="async" width="106" height="149" alt="${attribute(name)}">
    </div>`;
  }

  function pack(classes = '', style = '') {
    const face = '<strong>DECKADENCE</strong><span>PLAY BOOSTER</span>';
    return `<div class="showcase-booster ${classes}" style="${style}">
      <div class="showcase-wrap showcase-body">${face}</div>
      <div class="showcase-wrap showcase-cap">${face}</div>
    </div>`;
  }

  function scene() {
    switch (feature) {
      case 0:
      case 4: {
        const draft = feature === 0;
        const packs = draft
          ? Array.from({ length: 9 }, (_, i) => pack(
              `showcase-draft-pack ${i === 4 ? 'showcase-center' : ''}`,
              `transform:translateX(${(i - 4) * 145}px);z-index:${i === 4 ? 3 : 1}`
            )).join('')
          : pack('showcase-side', '--shift:-88px;--tilt:-12deg')
            + pack('showcase-side', '--shift:88px;--tilt:12deg') + pack('showcase-center');
        const names = draft
          ? ['Llanowar Elves', 'Lightning Bolt', 'Dark Ritual']
          : ['Counterspell', 'Serra Angel', 'Sol Ring', 'Swords to Plowshares'];
        return packs + names.map((name, i) => card(name,
          `showcase-reveal ${draft ? 'showcase-draft-reveal' : ''} ${draft && i === 1 ? 'showcase-front-card' : ''}`
        )).join('');
      }
      case 1:
        return card('Forest', 'showcase-land', 'transform:translateX(-55px) rotate(-8deg)')
          + card('Primeval Titan', 'showcase-creature', 'transform:translateX(65px) rotateY(90deg);opacity:0');
      case 2:
        return assets.custom.map((src, i) => `<img src="${src}" decoding="async" width="160" height="224"
          class="showcase-custom" alt="Custom card ${i + 1}"
          style="transform:translate(${(i - 1) * 20}px,${i * 7}px) rotate(${(i - 1) * 8}deg)">`).join('');
      case 3:
        return `<div class="showcase-roulette-window">
          <img class="showcase-roulette-pointer" src="${assets.roulettePointer}" alt="">
          <div class="showcase-roulette-track">${Array.from({ length: 20 }, (_, i) => {
            const deck = assets.decks[i % assets.decks.length];
            return `<div class="showcase-roulette-item"><img class="showcase-deck-cover"
              src="${deck.src}" alt="${attribute(deck.name)}" decoding="async"></div>`;
          }).join('')}</div></div><div class="showcase-roulette-result">Let the wheel decide.</div>`;
      case 5: {
        const labels = ['Cmdr', '1', '2', '3', '4', '5', '6+', 'Lands'];
        return `<div class="showcase-deck-layout">${labels.map((label, col) => `
          <div class="showcase-deck-column"><span>${label}</span>${assets.builderColumns[col].map((item, row) => `
            <img class="showcase-deck-card showcase-build" src="${item.src}" alt="${attribute(item.name)}"
              decoding="async" style="--row:${row}">`).join('')}
          </div>`).join('')}</div>`;
      }
      default:
        return '';
    }
  }

  async function animate(play = true) {
    stop();
    const token = version;
    const sceneEl = root.querySelector('.showcase-scene');
    sceneEl.innerHTML = scene();
    // Decode only this pane's thumbnails. Other panes make no image requests;
    // repeated reel frames share URLs and the browser's decoded image cache.
    await Promise.all([...sceneEl.querySelectorAll('img')].map(img => img.decode().catch(() => {})));
    if (token !== version) return;
    const active = play && motionEnabled && !reduced.matches && !document.hidden && visible;
    const finished = [];
    function move(element, frames, delay = 0, duration = 650, easing = 'cubic-bezier(.2,.7,.25,1)') {
      const animation = element.animate(frames, {
        duration: active ? duration : 0, delay: active ? delay : 0, easing, fill: 'forwards'
      });
      animations.push(animation);
      pauseOffscreen();
      const done = animation.finished.catch(() => {});
      finished.push(done);
      return done;
    }

    if (feature === 0 || feature === 4) {
      const draft = feature === 0;
      const lead = draft ? 2100 : 0;
      const cards = [...sceneEl.querySelectorAll('.showcase-reveal')];
      if (draft) {
        sceneEl.querySelectorAll('.showcase-draft-pack').forEach((element, i) => {
          move(element, [
            { transform: `translateX(${(i - 4) * 145 + 650}px)` },
            { transform: `translateX(${(i - 4) * 145}px)` }
          ], 0, 1850);
          if (i !== 4) move(element, [{ opacity: 1 }, { opacity: .15 }], 1950, 300);
        });
      }
      move(sceneEl.querySelector('.showcase-center .showcase-cap'), [
        { transform: 'translate(0,0)', opacity: 1 },
        { transform: 'translate(65px,-65px) rotate(-20deg)', opacity: 0 }
      ], lead + 100, 550);
      move(sceneEl.querySelector('.showcase-center .showcase-body'), [
        { transform: 'translateY(0)', opacity: 1 },
        { transform: 'translateY(165px) rotate(8deg)', opacity: 0 }
      ], lead + 600, 550).then(() => {
        if (token === version) sceneEl.querySelector('.showcase-center').hidden = true;
      });
      const spacing = draft ? Math.min(125, sceneEl.clientWidth * .17)
        : Math.min(105, Math.max(0, (sceneEl.clientWidth - 122) / (cards.length - 1)));
      cards.forEach((element, i) => move(element, [
        { opacity: 0, transform: 'translateY(60px) scale(.8)' },
        { opacity: 1, transform: `translate(${(i - (cards.length - 1) / 2) * spacing}px,${draft ? (i === 1 ? 0 : 10) : i * 8}px) rotate(${draft ? (i - 1) * 7 : 0}deg)` }
      ], lead + (draft ? 760 : 760 + i * 340), 650));
    }
    if (feature === 1) {
      move(sceneEl.querySelector('.showcase-land'), [
        { transform: 'translateX(-55px) rotate(-8deg)' },
        { transform: 'translate(-95px,55px) rotate(-85deg)', opacity: .4 }
      ], 100);
      move(sceneEl.querySelector('.showcase-creature'), [
        { opacity: 0, transform: 'translateX(45px) rotateY(90deg)' },
        { opacity: 1, transform: 'translateX(45px) rotateY(0deg)' }
      ], 650, 750);
    }
    if (feature === 2) {
      const cardWidth = sceneEl.querySelector('.showcase-custom').offsetWidth;
      const spacing = Math.min(168, Math.max(0, (sceneEl.clientWidth - cardWidth - 20) / 2));
      sceneEl.querySelectorAll('.showcase-custom').forEach((element, i) => move(element, [
        { transform: `translate(${(i - 1) * 20}px,${i * 7}px) rotate(${(i - 1) * 8}deg)` },
        { transform: `translate(${(i - 1) * spacing}px,0) rotate(0)` }
      ], i * 140, 850));
    }
    if (feature === 3) {
      const track = sceneEl.querySelector('.showcase-roulette-track');
      const winnerIndex = 15;
      const winner = track.children[winnerIndex];
      const center = sceneEl.querySelector('.showcase-roulette-window').clientWidth / 2;
      const first = track.children[1];
      const start = center - first.offsetLeft - first.offsetWidth / 2;
      const end = center - winner.offsetLeft - winner.offsetWidth / 2;
      const approach = end + 16;
      // Same cubic deceleration and short center snap as Deck Roulette.
      await move(track, [{ transform: `translateX(${start}px)` }, { transform: `translateX(${approach}px)` }],
        0, 3200, 'cubic-bezier(.333333,1,.666667,1)');
      if (token !== version) return;
      await move(track, [{ transform: `translateX(${approach}px)` }, { transform: `translateX(${end}px)` }],
        0, 180, 'ease-out');
      if (token !== version) return;
      winner.classList.add('is-winner');
      sceneEl.querySelector('.showcase-roulette-result').textContent = assets.decks[winnerIndex % assets.decks.length].name;
    }
    if (feature === 5) {
      sceneEl.querySelectorAll('.showcase-build').forEach((element, i) => move(element, [
        { transform: 'translate(35px,65px) rotate(7deg)', opacity: 0 },
        { transform: 'translate(0,0) rotate(0)', opacity: 1 }
      ], i * 45, 700));
    }
    await Promise.all(finished);
  }

  applyStatus(initial);
  pollStatus();
})();
