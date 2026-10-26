// Upload a custom card using the Alternate Image Settings layout.
(function () {
  const byId = (id) => document.getElementById(id);
  const overlay = byId("customCardOverlay");
  const form = byId("customCardForm");
  if (!overlay || !form) return;
  const sourceType = byId("customCardSourceType");
  const preview = byId("customCardPreview");
  const empty = byId("customCardPreviewEmpty");
  const message = byId("customCardMessage");
  const save = byId("customCardSaveButton");
  const search = byId("customDraftCardSearchOverlay");
  let objectUrl = "", requestId = "", createdCard = null;
  let pendingBody = null, busy = false, onAdd = null, opener = null, previewTimer = null;

  function status(text, error) {
    message.textContent = text || "";
    message.classList.toggle("hidden", !text);
    message.classList.toggle("error", Boolean(error));
  }

  function updatePreview() {
    clearTimeout(previewTimer);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = "";
    preview.removeAttribute("src");
    preview.classList.add("hidden");
    empty.classList.remove("hidden");
    empty.textContent = "Choose an image to preview.";
    let src = "";
    if (sourceType.value === "uploaded_file") {
      const file = byId("customCardFile").files[0];
      if (file) src = objectUrl = URL.createObjectURL(file);
    } else if (sourceType.value === "external_url") {
      try {
        const url = new URL(byId("customCardExternalUrl").value);
        if (["http:", "https:"].includes(url.protocol)) src = url.href;
      } catch (_) { /* An incomplete URL has no preview yet. */ }
    } else {
      empty.textContent = "Local images are checked and copied when you upload the card.";
    }
    if (src) {
      preview.src = src;
      preview.classList.remove("hidden");
      empty.classList.add("hidden");
    }
  }

  function setFields() {
    const locked = busy || Boolean(createdCard) || Boolean(pendingBody);
    form.querySelectorAll("input, select").forEach((field) => { field.disabled = locked; });
    form.querySelectorAll("[data-custom-source]").forEach((label) => {
      const active = label.dataset.customSource === sourceType.value;
      label.classList.toggle("hidden", !active);
      const input = label.querySelector("input");
      input.disabled = locked || !active;
      input.required = active;
    });
    save.disabled = busy;
    byId("customCardCloseButton").disabled = busy;
    byId("customCardCancelButton").disabled = busy;
    form.setAttribute("aria-busy", String(busy));
  }

  function close() {
    if (busy) return;
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    if (search) search.inert = false;
    clearTimeout(previewTimer);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = "";
    preview.removeAttribute("src");
    form.reset();
    pendingBody = createdCard = null;
    opener?.focus();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!createdCard && !pendingBody && !form.reportValidity()) return;
    if (!createdCard && !pendingBody) {
      pendingBody = new FormData(form);
      pendingBody.set("request_id", requestId);
    }
    busy = true;
    setFields();
    status(createdCard ? "Adding card…" : "Uploading card…");
    save.textContent = createdCard ? "Adding…" : "Uploading…";
    try {
      if (!createdCard) {
        const response = await fetch(form.action, { method: "POST", body: pendingBody, headers: { Accept: "application/json" } });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          pendingBody = null;
          throw new Error(payload.message || "The custom card could not be uploaded.");
        }
        createdCard = payload;
        pendingBody = null;
      }
      if (!await onAdd(createdCard.card, byId("customCardFoil").checked)) {
        throw new Error("The card is saved in your library, but could not be added here. Retry Add, or find it later by name in Add Cards.");
      }
      busy = false;
      close();
    } catch (error) {
      status(error.message || "The custom card could not be uploaded.", true);
    } finally {
      busy = false;
      save.textContent = createdCard ? "Retry Add" : pendingBody ? "Retry Upload" : "Upload and Add Card";
      setFields();
    }
  });

  sourceType.addEventListener("change", () => { setFields(); updatePreview(); });
  byId("customCardFile").addEventListener("change", updatePreview);
  byId("customCardExternalUrl").addEventListener("input", () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 300);
  });
  preview.addEventListener("error", () => {
    preview.classList.add("hidden");
    empty.classList.remove("hidden");
    empty.textContent = "Preview unavailable. The image will be validated when you upload the card.";
  });
  ["customCardCloseButton", "customCardCancelButton", "customCardBackdrop"].forEach((id) => byId(id).addEventListener("click", close));
  document.addEventListener("keydown", (event) => {
    if (overlay.classList.contains("hidden")) return;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopImmediatePropagation(); close();
    } else if (event.key === "Tab") {
      const fields = [...overlay.querySelectorAll("button, input, select, [tabindex='0']")].filter((field) => !field.disabled && field.getClientRects().length);
      const first = fields[0], last = fields[fields.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }, true);
  window.iMomirCustomCardModal = {
    open: function (addCard) {
      if (busy) return;
      onAdd = addCard;
      opener = document.activeElement;
      form.reset();
      createdCard = pendingBody = null;
      // getRandomValues also works when Deckadence is opened over LAN HTTP.
      requestId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() :
        "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
          (Number(c) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(c) / 4).toString(16));
      status("");
      save.textContent = "Upload and Add Card";
      setFields(); updatePreview();
      if (search) search.inert = true;
      overlay.classList.remove("hidden");
      overlay.setAttribute("aria-hidden", "false");
      byId("customCardName").focus();
    },
  };
})();
