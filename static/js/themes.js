// *** APP THEMES - Apply Colors and Backgrounds ***
/*
 * Appearance foundation:
 * - theme_catalog.js is the palette registry for menus and Settings previews.
 * - Existing components consume the shared --bg/--panel/--text/etc. tokens.
 * - themes.css bridges older fixed-color surfaces without changing Dark.
 * - img/themes/<id>.svg contains a transparent, seamless brand tile.
 * Preferences apply before first paint and intentionally belong to this browser;
 * they do not post the settings form or change shared game/print settings.
 */
(() => {
  "use strict";
  const key = "deckadence.appearance.v1";
  const catalog = window.DeckadenceThemeCatalog;
  const root = document.documentElement;
  const tileBase = document.currentScript.dataset.tileBase;
  const baseStyles = document.getElementById("appBaseStyles");
  let storageAvailable = true;

  function number(value, min, max, fallback) {
    return typeof value === "number" && Number.isFinite(value)
      ? Math.max(min, Math.min(max, value))
      : fallback;
  }

  function normalize(value) {
    return {
      theme: catalog.some((theme) => theme.id === value?.theme)
        ? value.theme
        : value?.theme === "backup"
          ? "dark"
          : "white-mana",
      background:
        typeof value?.background === "boolean" ? value.background : true,
      backgroundType:
        value?.backgroundType === "logo" ? "logo" : "constellation",
      backgroundIntensity: number(value?.backgroundIntensity, 0, 150, 100),
      backgroundSize: number(value?.backgroundSize, 50, 200, 100),
      backgroundAnimations:
        typeof value?.backgroundAnimations === "boolean"
          ? value.backgroundAnimations
          : true,
    };
  }

  function read() {
    try {
      return normalize(JSON.parse(localStorage.getItem(key)));
    } catch (_) {
      return normalize(null);
    }
  }

  let state = read();
  function apply() {
    const theme = catalog.find((item) => item.id === state.theme);
    root.dataset.theme = theme.id;
    root.dataset.themeScheme = theme.scheme;
    root.dataset.themeBackground = String(state.background);
    // Leave original color-scheme behavior untouched for Dark and Backup.
    root.style.colorScheme = ["dark", "backup"].includes(theme.id)
      ? "normal"
      : theme.scheme;
    Object.entries(theme.colors).forEach(([name, value]) =>
      root.style.setProperty(`--${name}`, value),
    );
    root.style.setProperty(
      "--theme-highlight",
      theme.scheme === "light" ? theme.colors.accent : theme.colors.menuborder,
    );
    const constellation = state.backgroundType === "constellation";
    document
      .querySelectorAll("[data-background-animation-control]")
      .forEach((control) => {
        control.hidden = !constellation;
      });
    const asset = constellation
      ? `card-constellation-${theme.scheme}.svg?v=2`
      : `${theme.id}.svg`;
    root.style.setProperty("--theme-tile", `url("${tileBase}${asset}")`);
    root.style.setProperty(
      "--theme-tile-static",
      `url("${tileBase}${constellation ? `card-constellation-${theme.scheme}.svg?v=2` : asset}")`,
    );
    root.style.setProperty(
      "--theme-background-opacity",
      state.backgroundIntensity / 100,
    );
    root.style.setProperty(
      "--theme-background-size",
      `${((constellation ? 2240 : 348) * state.backgroundSize) / 100}px ${((constellation ? 1540 : 232) * state.backgroundSize) / 100}px`,
    );
    document
      .querySelectorAll("[data-background-setting]")
      .forEach((control) => {
        const value = state[control.dataset.backgroundSetting];
        if (control.type === "checkbox") control.checked = value;
        else control.value = value;
      });
    document.querySelectorAll("[data-background-output]").forEach((output) => {
      output.value = `${state[output.dataset.backgroundOutput]}%`;
    });
    if (document.body) window.DeckadenceBackgroundMotion?.update({ ...state });
    const href =
      theme.id === "backup"
        ? baseStyles.dataset.backupHref
        : baseStyles.dataset.defaultHref;
    if (baseStyles.getAttribute("href") !== href)
      baseStyles.setAttribute("href", href);
    document.querySelectorAll("[data-theme-select]").forEach((select) => {
      select.value = theme.id;
    });
    document.querySelectorAll("[data-theme-choice]").forEach((radio) => {
      radio.checked = radio.value === theme.id;
    });
    document.querySelectorAll("[data-theme-background]").forEach((toggle) => {
      toggle.checked = state.background;
    });
  }

  function change(patch) {
    state = normalize({ ...state, ...patch });
    try {
      localStorage.setItem(key, JSON.stringify(state));
      storageAvailable = true;
    } catch (_) {
      storageAvailable = false;
    }
    apply();
    document.querySelectorAll("[data-theme-status]").forEach((status) => {
      const name = catalog.find((item) => item.id === state.theme).name;
      status.textContent = `${name} · Background ${state.background ? "on" : "off"}. ${storageAvailable ? "Saved in this browser." : "Applied for this page; browser storage is unavailable."}`;
    });
  }

  apply();
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-theme-select]").forEach((select) => {
      catalog.forEach((theme) => select.add(new Option(theme.name, theme.id)));
      select.addEventListener("change", () => change({ theme: select.value }));
    });
    document.querySelectorAll("[data-theme-grid]").forEach((grid) => {
      catalog.forEach((theme) => {
        const label = document.createElement("label");
        label.className = "theme-choice";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "appearance-theme";
        radio.value = theme.id;
        radio.dataset.themeChoice = "";
        const preview = document.createElement("span");
        preview.className = "theme-preview";
        preview.setAttribute("aria-hidden", "true");
        preview.style.setProperty("--preview-bg", theme.colors.bg);
        preview.style.setProperty("--preview-panel", theme.colors.panel);
        preview.style.setProperty("--preview-accent", theme.colors.accent);
        preview.style.setProperty("--preview-edge", theme.colors.menuborder);
        const name = document.createElement("strong");
        name.textContent = theme.name;
        const description = document.createElement("span");
        description.className = "theme-choice-description";
        description.textContent = theme.description;
        label.append(radio, preview, name, description);
        grid.append(label);
        radio.addEventListener("change", () => {
          if (radio.checked) change({ theme: radio.value });
        });
      });
    });
    document.querySelectorAll("[data-theme-background]").forEach((toggle) => {
      toggle.addEventListener("change", () =>
        change({ background: toggle.checked }),
      );
    });
    document
      .querySelectorAll("[data-background-setting]")
      .forEach((control) => {
        control.addEventListener(
          control.type === "range" ? "input" : "change",
          () => {
            const value =
              control.type === "checkbox"
                ? control.checked
                : control.type === "range"
                  ? Number(control.value)
                  : control.value;
            change({ [control.dataset.backgroundSetting]: value });
          },
        );
      });
    // Existing Settings deep links and collapse controls own the open state.
    const section = document.getElementById("section_theme");
    if (section) {
      const header = section.querySelector(".collapsible-header");
      const syncExpanded = () =>
        header.setAttribute(
          "aria-expanded",
          String(section.classList.contains("is-open")),
        );
      new MutationObserver(syncExpanded).observe(section, {
        attributes: true,
        attributeFilter: ["class"],
      });
      syncExpanded();
    }
    apply();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) {
      state = read();
      apply();
    }
  });
})();
