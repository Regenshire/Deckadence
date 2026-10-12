window.iMomirImageUrl = function (rawUrl) {
  if (!rawUrl) return "";

  const url = new URL(rawUrl, window.location.href);
  const owner = document.getElementById("alternateImageOverlay");

  if (
    url.origin === window.location.origin &&
    /^\/chaos-card-image(?:-preview)?\//.test(url.pathname) &&
    !url.searchParams.has("image_scope_id") &&
    !url.searchParams.has("image_owner_kind") &&
    owner?.dataset.imageOwnerKind
  ) {
    url.searchParams.set("image_owner_kind", owner.dataset.imageOwnerKind);
    url.searchParams.set("image_owner_id", owner.dataset.imageOwnerId);
  }

  return url.toString();
};

for (const button of document.querySelectorAll(
  "[data-image-isolation-toggle]",
)) {
  button.addEventListener("click", async function () {
    if (button.disabled) return;

    const turnOn = button.getAttribute("aria-checked") !== "true";
    const label = button.querySelector("[data-isolation-label]");
    const previousLabel = label.textContent;
    let saved = false;
    button.disabled = true;

    const message = turnOn
      ? "Do you want to turn on Image Isolation?  This action will copy this collection's current alternate image settings into " +
        "an independent library and future edits will be isolated to this collect. Cards added later " +
        "will not inherit global alternates. Standard Scryfall and accepted-upscale " +
        "fallback remain shared. You can turn isolation off later, which discards " +
        "the isolated settings. Do you want to proceed?"
      : "Do you want to turn Image Isolation off and discard this collection's isolated images? " +
        "The deck will revert to using the global images again for each selected printing if you turn Image Isolation Off.";

    try {
      const confirmed = window.iMomirConfirm?.show
        ? await window.iMomirConfirm.show({
            title: turnOn
              ? "Turn Image Isolation On?"
              : "Turn Image Isolation Off?",
            message: message,
            confirmText: turnOn ? "Turn On" : "Turn Off and Discard Settings",
            cancelText: "Cancel",
            danger: !turnOn,
          })
        : window.confirm(message);

      if (!confirmed) return;

      label.textContent = turnOn ? "Copying images…" : "Clearing settings…";
      button.setAttribute("aria-busy", "true");

      const response = await fetch(
        turnOn ? button.dataset.enableUrl : button.dataset.disableUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({
            confirm: true,
            expected_scope: button.dataset.scopeToken,
            expected_epoch: Number(button.dataset.isolationEpoch),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "Image isolation could not be changed.",
        );
      }

      button.setAttribute(
        "aria-checked",
        result.image_scope_id ? "true" : "false",
      );
      button.dataset.scopeToken = result.image_scope_id || "global";
      label.textContent = result.image_scope_id
        ? "Isolation On"
        : "Isolation Off";
      saved = true;
      if (result.cleanup?.error || result.cleanup?.pending_files) {
        window.alert(
          "Isolation changed successfully. Some unused image files could not " +
            "be deleted yet. Cleanup will retry during normal app activity; " +
            "details are in the application log.",
        );
      }
      window.location.reload();
    } catch (error) {
      window.alert(error.message || String(error));
    } finally {
      button.removeAttribute("aria-busy");
      if (!saved) {
        button.disabled = false;
        label.textContent = previousLabel;
        button.focus();
      }
    }
  });
}
(function () {
  const alternateOverlay = document.getElementById("alternateImageOverlay");
  const alternateBackdrop = document.getElementById("alternateImageBackdrop");
  const alternateCloseButton = document.getElementById(
    "alternateImageCloseButton",
  );
  const alternateButtons = Array.from(
    document.querySelectorAll(".alternate-image-button"),
  );
  const alternateForm = document.getElementById("alternateImageForm");
  const alternateCardUuidInput = document.getElementById(
    "alternateImageCardUuid",
  );
  const alternateCardName = document.getElementById("alternateImageCardName");
  const alternateIsolationBadge = document.getElementById(
    "alternateImageIsolationBadge",
  );
  const alternateMessage = document.getElementById("alternateImageMessage");
  const alternatePreviewImage = document.getElementById(
    "alternateImagePreview",
  );
  const alternatePreviewEmpty = document.getElementById(
    "alternateImagePreviewEmpty",
  );
  const alternatePreviewCaption = document.getElementById(
    "alternateImagePreviewCaption",
  );
  const alternateActiveSource = document.getElementById(
    "alternateImageActiveSource",
  );
  const alternateSourceList = document.getElementById(
    "alternateImageSourceList",
  );
  const alternateSourceComposer = document.getElementById(
    "alternateImageSourceComposer",
  );
  const alternateExportFrameTemplate = document.getElementById(
    "alternateImageExportFrameTemplate",
  );
  const alternateSaveFrameButton = document.getElementById(
    "alternateImageSaveFrameButton",
  );
  const alternateAddButton = document.getElementById("alternateImageAddButton");
  const alternateFaceKind = document.getElementById("alternateImageFaceKind");
  const alternateFaceKindRow = document.getElementById(
    "alternateImageFaceKindRow",
  );
  const alternateFaceKindSingleOption = document.getElementById(
    "alternateImageFaceKindSingleOption",
  );
  const alternateFaceKindFrontOption = document.getElementById(
    "alternateImageFaceKindFrontOption",
  );
  const alternateFaceKindBackOption = document.getElementById(
    "alternateImageFaceKindBackOption",
  );
  const alternateFileInput = document.getElementById("alternateImageFile");
  const alternateLocalPathInput = document.getElementById(
    "alternateImageLocalPath",
  );
  const alternateNotesInput = document.getElementById("alternateImageNotes");
  const alternateRemoveBleedInput = document.getElementById(
    "alternateImageRemoveBleed",
  );
  const alternateFoilRow = document.getElementById("alternateImageFoilRow");
  const alternateFoilInput = document.getElementById("alternateImageFoil");

  let currentActiveAlternateSourceId = null;

  const alternateSourceType = document.getElementById(
    "alternateImageSourceType",
  );
  const alternateSourceNameInput = document.getElementById(
    "alternateImageSourceName",
  );
  const alternateExternalUrlInput = document.getElementById(
    "alternateImageExternalUrl",
  );

  const alternateExternalUrlFields = Array.from(
    document.querySelectorAll(".alternate-source-field-external-url"),
  );
  const alternateUploadFileFields = Array.from(
    document.querySelectorAll(".alternate-source-field-upload-file"),
  );
  const alternateLocalFileFields = Array.from(
    document.querySelectorAll(".alternate-source-field-local-file"),
  );

  const alternateRemoveBleedPreferenceKey =
    "deckadence.alternateImage.removeBleed";

  let currentAlternateCardUuid = "";
  let currentAlternateCardName = "";
  let currentFoilUpdateUrl = "";
  let currentAlternatePreviewObjectUrl = "";
  let alternateExternalPreviewTimer = null;

  let currentImageScopeToken = null;
  let currentImagePreviewUrl = "";
  let currentImagePreviewVersion = "";
  let alternateModalVersion = 0;
  let alternateMutationPending = false;

  function alternateRequestUrl(path, writing) {
    const url = new URL(path, window.location.href);
    const ownerKind = alternateOverlay.dataset.imageOwnerKind || "";
    const ownerId = alternateOverlay.dataset.imageOwnerId || "";
    if (ownerKind || ownerId) {
      url.searchParams.set("image_owner_kind", ownerKind);
      url.searchParams.set("image_owner_id", ownerId);
    }
    url.searchParams.set("card_uuid", currentAlternateCardUuid);
    if (writing) {
      if (!currentImageScopeToken)
        throw new Error("Wait for the image library to load before saving.");
      url.searchParams.set("expected_scope", currentImageScopeToken);
    }
    return url.toString();
  }

  function updateAlternateIndicators(cardUuid, state) {
    const selector =
      '.alternate-image-button[data-card-uuid="' + CSS.escape(cardUuid) + '"]';
    document.querySelectorAll(selector).forEach(function (button) {
      button.classList.toggle(
        "custom-draft-alternate-image-active",
        Boolean(state.hasAlternateSource),
      );
      button.dataset.hasAlternateSource = state.hasAlternateSource ? "1" : "0";
    });
  }

  async function saveAlternateChange(path, options) {
    if (alternateMutationPending) return null;
    const cardUuid = currentAlternateCardUuid;
    const version = alternateModalVersion;
    try {
      const requestUrl = alternateRequestUrl(path, true);
      alternateMutationPending = true;
      alternateOverlay.setAttribute("aria-busy", "true");
      const response = await fetch(requestUrl, {
        ...options,
        method: "POST",
        headers: { Accept: "application/json", ...(options.headers || {}) },
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok)
        throw new Error(
          payload.message || "Could not save alternate image settings.",
        );
      if (
        version !== alternateModalVersion ||
        cardUuid !== currentAlternateCardUuid
      )
        return null;
      renderAlternateSources(payload);
      const state = getAlternateStateFromPayload(payload);
      updateAlternateIndicators(cardUuid, state);
      refreshTrackedCardImages(cardUuid, "alternate-source", state);
      showAlternateMessage(
        payload.message || "Alternate image settings saved.",
        false,
      );
      return payload;
    } catch (error) {
      showAlternateMessage(error.message || String(error), true);
      return null;
    } finally {
      alternateMutationPending = false;
      alternateOverlay.removeAttribute("aria-busy");
    }
  }

  function getDomainFromUrl(rawUrl) {
    try {
      const parsedUrl = new URL(rawUrl);
      return parsedUrl.hostname.replace(/^www\./i, "") || "";
    } catch (error) {
      return "";
    }
  }

  function getAlternateFaceTitle(faceKind, card) {
    const cleanFaceKind = String(faceKind || "single")
      .trim()
      .toLowerCase();
    const frontFaceName =
      card && card.front_face_name ? String(card.front_face_name) : "";

    const backFaceName =
      card && card.back_face_name ? String(card.back_face_name) : "";

    if (cleanFaceKind === "front") {
      return frontFaceName || currentAlternateCardName || "Front";
    }

    if (cleanFaceKind === "back") {
      return backFaceName || currentAlternateCardName || "Back";
    }

    return currentAlternateCardName || frontFaceName || "Card";
  }

  function getAlternateFaceLabel(faceKind) {
    const cleanFaceKind = String(faceKind || "single")
      .trim()
      .toLowerCase();

    if (cleanFaceKind === "front") {
      return "Front";
    }

    if (cleanFaceKind === "back") {
      return "Back";
    }

    return "";
  }

  function getAlternateBleedLabel(source) {
    if (!source || !source.remove_bleed) {
      return "";
    }

    let label = "Full Bleed";

    if (
      source.bleed_size_mm !== null &&
      source.bleed_size_mm !== undefined &&
      String(source.bleed_size_mm).trim() !== ""
    ) {
      const bleedSize = String(source.bleed_size_mm)
        .replace(/\.0+$/, "")
        .trim();

      if (bleedSize) {
        label += " " + bleedSize + "mm";
      }
    }

    return label;
  }

  function getAlternateSourceMeta(source) {
    const parts = [];
    const faceLabel = getAlternateFaceLabel(
      source ? source.face_kind : "single",
    );

    const bleedLabel = getAlternateBleedLabel(source);

    if (faceLabel) {
      parts.push(faceLabel);
    }

    if (bleedLabel) {
      parts.push(bleedLabel);
    }

    return parts.join(" • ") || "Alternate Image";
  }

  function renderActiveAlternateSources(sources, card) {
    if (!alternateActiveSource) {
      return;
    }

    const activeSources = (sources || []).filter(function (source) {
      return Boolean(source.is_enabled);
    });

    alternateActiveSource.innerHTML = "";

    if (!activeSources.length) {
      const emptyTitle = document.createElement("div");

      emptyTitle.className = "alternate-active-source-title";

      emptyTitle.textContent = "Scryfall / Default Image";

      alternateActiveSource.appendChild(emptyTitle);

      return;
    }

    activeSources.forEach(function (source) {
      const item = document.createElement("div");
      item.className = "alternate-active-source-item";

      const title = document.createElement("div");
      title.className = "alternate-active-source-title";

      title.textContent = getAlternateFaceTitle(source.face_kind, card);

      const meta = document.createElement("div");
      meta.className = "alternate-active-source-meta";
      meta.textContent = getAlternateSourceMeta(source);

      item.appendChild(title);
      item.appendChild(meta);

      alternateActiveSource.appendChild(item);
    });
  }

  function getRememberedAlternateRemoveBleed() {
    try {
      return (
        window.localStorage.getItem(alternateRemoveBleedPreferenceKey) === "1"
      );
    } catch (error) {
      return false;
    }
  }

  function rememberAlternateRemoveBleed(isEnabled) {
    try {
      window.localStorage.setItem(
        alternateRemoveBleedPreferenceKey,
        isEnabled ? "1" : "0",
      );
    } catch (error) {
      // Browser storage may be unavailable or blocked.
    }
  }

  function applyRememberedAlternateRemoveBleed() {
    if (alternateRemoveBleedInput) {
      alternateRemoveBleedInput.checked = getRememberedAlternateRemoveBleed();
    }
  }

  function releaseAlternatePreviewObjectUrl() {
    if (!currentAlternatePreviewObjectUrl) {
      return;
    }

    URL.revokeObjectURL(currentAlternatePreviewObjectUrl);

    currentAlternatePreviewObjectUrl = "";
  }

  function showAlternatePreviewPlaceholder(message, caption) {
    if (alternatePreviewImage) {
      alternatePreviewImage.classList.add("hidden");
      alternatePreviewImage.removeAttribute("src");
      alternatePreviewImage.alt = "";
    }

    if (alternatePreviewEmpty) {
      alternatePreviewEmpty.textContent = message || "No preview available.";

      alternatePreviewEmpty.classList.remove("hidden");
    }

    if (alternatePreviewCaption) {
      alternatePreviewCaption.textContent = caption || "";
    }
  }

  function showAlternatePreviewImage(rawUrl, caption) {
    const cleanUrl = String(rawUrl || "").trim();

    if (!cleanUrl) {
      showAlternatePreviewPlaceholder("No preview available.", caption || "");

      return;
    }

    if (alternatePreviewEmpty) {
      alternatePreviewEmpty.classList.add("hidden");
    }

    if (alternatePreviewImage) {
      alternatePreviewImage.alt = currentAlternateCardName
        ? currentAlternateCardName + " image preview"
        : "Alternate image preview";

      alternatePreviewImage.src = cleanUrl;
      alternatePreviewImage.classList.remove("hidden");
    }

    if (alternatePreviewCaption) {
      alternatePreviewCaption.textContent = caption || "Image preview";
    }
  }

  function getCurrentAlternatePreviewUrl() {
    const cleanUrl = String(currentImagePreviewUrl || "").trim();

    if (!cleanUrl) {
      return "";
    }

    const scopedUrl = window.iMomirImageUrl(cleanUrl);
    const previewUrl = new URL(scopedUrl, window.location.href);

    const faceKind = alternateFaceKind
      ? String(alternateFaceKind.value || "")
          .trim()
          .toLowerCase()
      : "";

    if (faceKind === "front" || faceKind === "back") {
      previewUrl.searchParams.set("face", faceKind);
    }

    previewUrl.searchParams.set(
      "v",
      currentImagePreviewVersion || String(Date.now()),
    );

    return previewUrl.toString();
  }

  function updateAlternateImagePreview() {
    const sourceType = alternateSourceType
      ? alternateSourceType.value
      : "uploaded_file";

    if (sourceType === "uploaded_file") {
      const selectedFile =
        alternateFileInput &&
        alternateFileInput.files &&
        alternateFileInput.files.length
          ? alternateFileInput.files[0]
          : null;

      if (selectedFile) {
        releaseAlternatePreviewObjectUrl();

        currentAlternatePreviewObjectUrl = URL.createObjectURL(selectedFile);

        showAlternatePreviewImage(
          currentAlternatePreviewObjectUrl,
          selectedFile.name || "Selected upload",
        );

        return;
      }
    }

    if (sourceType === "external_url") {
      const externalUrl = String(
        alternateExternalUrlInput ? alternateExternalUrlInput.value : "",
      ).trim();

      if (externalUrl) {
        releaseAlternatePreviewObjectUrl();

        showAlternatePreviewImage(externalUrl, "External URL preview");

        return;
      }
    }

    releaseAlternatePreviewObjectUrl();

    const currentPreviewUrl = getCurrentAlternatePreviewUrl();

    if (currentPreviewUrl) {
      showAlternatePreviewImage(
        currentPreviewUrl,
        sourceType === "local_file"
          ? "Current image — local file preview updates after saving"
          : "Current active image",
      );

      return;
    }

    showAlternatePreviewPlaceholder("Loading current image...", "");
  }

  function scheduleAlternateExternalPreview() {
    if (alternateExternalPreviewTimer !== null) {
      window.clearTimeout(alternateExternalPreviewTimer);
    }

    alternateExternalPreviewTimer = window.setTimeout(function () {
      alternateExternalPreviewTimer = null;
      updateAlternateImagePreview();
    }, 250);
  }

  function refreshAlternateImageHelpTargets() {
    if (
      window.DeckadenceHelp &&
      typeof window.DeckadenceHelp.refreshContextTargets === "function"
    ) {
      window.DeckadenceHelp.refreshContextTargets();
    }
  }

  function configureAlternateImageFaceKindOptions(card) {
    const isDualFaced = Boolean(card && card.is_dual_faced);

    const frontFaceName =
      card && card.front_face_name ? String(card.front_face_name) : "Front";

    const backFaceName =
      card && card.back_face_name ? String(card.back_face_name) : "Back";

    if (alternateFaceKindRow) {
      alternateFaceKindRow.classList.toggle(
        "alternate-image-field-hidden",
        !isDualFaced,
      );
    }

    if (alternateFaceKindSingleOption) {
      alternateFaceKindSingleOption.textContent = "Single";

      alternateFaceKindSingleOption.disabled = isDualFaced;

      alternateFaceKindSingleOption.hidden = isDualFaced;
    }

    if (alternateFaceKindFrontOption) {
      alternateFaceKindFrontOption.textContent = "Front - " + frontFaceName;

      alternateFaceKindFrontOption.disabled = !isDualFaced;

      alternateFaceKindFrontOption.hidden = !isDualFaced;
    }

    if (alternateFaceKindBackOption) {
      alternateFaceKindBackOption.textContent = "Back - " + backFaceName;

      alternateFaceKindBackOption.disabled = !isDualFaced;

      alternateFaceKindBackOption.hidden = !isDualFaced;
    }

    if (alternateFaceKind) {
      alternateFaceKind.value = isDualFaced ? "front" : "single";
    }
  }

  function updateAlternateSourceFieldVisibility() {
    const sourceType = alternateSourceType
      ? alternateSourceType.value
      : "uploaded_file";

    alternateExternalUrlFields.forEach(function (field) {
      field.classList.toggle(
        "alternate-image-field-hidden",
        sourceType !== "external_url",
      );
    });

    alternateUploadFileFields.forEach(function (field) {
      field.classList.toggle(
        "alternate-image-field-hidden",
        sourceType !== "uploaded_file",
      );
    });

    alternateLocalFileFields.forEach(function (field) {
      field.classList.toggle(
        "alternate-image-field-hidden",
        sourceType !== "local_file",
      );
    });
  }

  function applyDefaultAlternateSourceNameIfBlank() {
    if (!alternateSourceNameInput || alternateSourceNameInput.value.trim()) {
      return;
    }

    const sourceType = alternateSourceType
      ? alternateSourceType.value
      : "uploaded_file";

    if (sourceType === "uploaded_file") {
      alternateSourceNameInput.value = "Upload File";
      return;
    }

    if (sourceType === "external_url") {
      const domainName = getDomainFromUrl(
        alternateExternalUrlInput ? alternateExternalUrlInput.value : "",
      );
      alternateSourceNameInput.value = domainName || "External URL";
      return;
    }

    if (sourceType === "local_file") {
      alternateSourceNameInput.value = "Local File";
    }
  }

  function setAlternateInputLocked(isLocked) {
    [
      alternateSourceType,
      alternateSourceNameInput,
      alternateFaceKind,
      alternateExternalUrlInput,
      alternateFileInput,
      alternateLocalPathInput,
      alternateNotesInput,
      alternateRemoveBleedInput,
    ].forEach(function (field) {
      if (field) {
        field.disabled = isLocked;
        field.readOnly = isLocked;
      }
    });

    if (alternateAddButton) {
      alternateAddButton.classList.toggle("hidden", isLocked);
    }

    if (alternateSaveFrameButton) {
      alternateSaveFrameButton.classList.toggle("hidden", !isLocked);
    }

    if (alternateFoilInput) {
      alternateFoilInput.disabled = !currentFoilUpdateUrl;
      alternateFoilInput.readOnly = false;
    }
  }

  function populateFrameTemplateOptions(options, selectedValue) {
    if (!alternateExportFrameTemplate) {
      return;
    }

    alternateExportFrameTemplate.innerHTML = "";

    (options || []).forEach(function (option) {
      const optionElement = document.createElement("option");
      optionElement.value = option.value || "auto";
      optionElement.textContent = option.label || option.value || "Automatic";
      alternateExportFrameTemplate.appendChild(optionElement);
    });

    alternateExportFrameTemplate.value = selectedValue || "auto";
  }

  function showAlternateMessage(message, isError) {
    if (!alternateMessage) {
      return;
    }

    alternateMessage.textContent = message || "";
    alternateMessage.classList.toggle("hidden", !message);
    alternateMessage.style.background = isError ? "#4b1f1f" : "";
  }

  function getAlternateStateFromPayload(payload) {
    const sources =
      payload && Array.isArray(payload.alternate_sources)
        ? payload.alternate_sources
        : [];

    const enabledSources = sources.filter(function (source) {
      return Boolean(source.is_enabled);
    });

    return {
      hasAlternateSource: enabledSources.length > 0,
      removeBleed: enabledSources.some(function (source) {
        return Boolean(source.remove_bleed);
      }),
    };
  }

  function refreshCardImages(cardUuid, alternateState) {
    if (!cardUuid) return;
    const url = new URL(
      currentImagePreviewUrl ||
        "/chaos-card-image/" + encodeURIComponent(cardUuid),
      window.location.href,
    );
    url.searchParams.set("v", String(Date.now()));
    url.searchParams.set("face", "front");
    const cacheBustedUrl = url.toString();
    document
      .querySelectorAll('[data-card-uuid="' + CSS.escape(cardUuid) + '"] img')
      .forEach(function (imageElement) {
        if (window.iMomirCardFlip)
          window.iMomirCardFlip.resetImageBinding(imageElement);
        imageElement.src = cacheBustedUrl;
        if (imageElement.hasAttribute("data-card-image-src"))
          imageElement.dataset.cardImageSrc = cacheBustedUrl;
        if (imageElement.hasAttribute("data-zoom-src"))
          imageElement.dataset.zoomSrc = cacheBustedUrl;
      });
    document.dispatchEvent(
      new CustomEvent("imomir:card-image-refreshed", {
        detail: {
          cardUuid: cardUuid,
          imageUrl: cacheBustedUrl,
          hasAlternateSource: alternateState
            ? Boolean(alternateState.hasAlternateSource)
            : null,
          removeBleed: alternateState
            ? Boolean(alternateState.removeBleed)
            : null,
        },
      }),
    );
    if (window.iMomirCardFlip) window.iMomirCardFlip.enhance(document);
  }

  function refreshTrackedCardImages(cardUuid, reason, alternateState) {
    if (!cardUuid) {
      return;
    }

    const signature = [
      cardUuid,
      reason || "card-image",
      alternateState ? String(Boolean(alternateState.hasAlternateSource)) : "",
      alternateState ? String(Boolean(alternateState.removeBleed)) : "",
      Date.now(),
    ].join("|");

    if (
      window.iMomirRefresh &&
      typeof window.iMomirRefresh.changed === "function"
    ) {
      window.iMomirRefresh.changed(
        "chaos-card-image:" + cardUuid,
        signature,
        function () {
          refreshCardImages(cardUuid, alternateState);
        },
      );
      return;
    }

    refreshCardImages(cardUuid, alternateState);
  }

  function setAlternateFoilContext(options) {
    const contextOptions = options || {};

    currentFoilUpdateUrl = contextOptions.foilUpdateUrl || "";

    if (alternateFoilRow) {
      alternateFoilRow.classList.toggle("hidden", !currentFoilUpdateUrl);
    }

    if (alternateFoilInput) {
      alternateFoilInput.checked = String(contextOptions.isFoil || "0") === "1";
      alternateFoilInput.disabled = !currentFoilUpdateUrl;
    }
  }

  async function saveAlternateFoilState() {
    if (!alternateFoilInput || !currentFoilUpdateUrl) {
      return;
    }

    const requestedFoilState = alternateFoilInput.checked;

    alternateFoilInput.disabled = true;

    try {
      const response = await fetch(currentFoilUpdateUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          is_foil: requestedFoilState,
        }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "Could not update foil status.");
      }

      document.dispatchEvent(
        new CustomEvent("imomir:card-image-refreshed", {
          detail: {
            cardUuid: currentAlternateCardUuid,
            imageUrl: "",
            hasAlternateSource: null,
            removeBleed: null,
            isFoil: requestedFoilState,
          },
        }),
      );

      showAlternateMessage(payload.message || "Foil status updated.", false);
    } catch (error) {
      alternateFoilInput.checked = !requestedFoilState;
      showAlternateMessage(error.message || String(error), true);
    } finally {
      alternateFoilInput.disabled = false;
    }
  }

  function openAlternateModal(cardUuid, cardName, options) {
    if (alternateMutationPending) return;
    alternateModalVersion += 1;
    currentImageScopeToken = null;
    currentImagePreviewUrl = "";
    currentImagePreviewVersion = "";
    currentAlternateCardUuid = cardUuid || "";

    if (alternateIsolationBadge) {
      alternateIsolationBadge.classList.add("hidden");
    }

    showAlternatePreviewPlaceholder("Loading current image...", "");
    currentAlternateCardName = cardName || currentAlternateCardUuid;

    if (!currentAlternateCardUuid || !alternateOverlay) {
      return;
    }

    if (alternateCardUuidInput) {
      alternateCardUuidInput.value = currentAlternateCardUuid;
    }

    if (alternateCardName) {
      alternateCardName.textContent = currentAlternateCardName;
    }

    if (alternateForm) {
      alternateForm.reset();
      applyRememberedAlternateRemoveBleed();
    }

    if (alternateSourceType) {
      alternateSourceType.value = "uploaded_file";
    }

    if (alternateSourceNameInput) {
      alternateSourceNameInput.value = "";
    }

    showAlternateMessage("", false);
    currentActiveAlternateSourceId = null;
    setAlternateFoilContext(options);
    setAlternateInputLocked(false);

    if (alternateSourceComposer) {
      alternateSourceComposer.classList.remove("hidden");
    }

    updateAlternateSourceFieldVisibility();
    updateAlternateImagePreview();

    alternateOverlay.classList.remove("hidden");
    alternateOverlay.setAttribute("aria-hidden", "false");

    loadAlternateSources();
  }

  function closeAlternateModal() {
    if (alternateMutationPending) return;
    alternateModalVersion += 1;
    currentImageScopeToken = null;
    if (!alternateOverlay) {
      return;
    }

    alternateOverlay.classList.add("hidden");
    alternateOverlay.setAttribute("aria-hidden", "true");

    if (alternateExternalPreviewTimer !== null) {
      window.clearTimeout(alternateExternalPreviewTimer);

      alternateExternalPreviewTimer = null;
    }

    releaseAlternatePreviewObjectUrl();

    currentAlternateCardUuid = "";
    currentAlternateCardName = "";
    currentFoilUpdateUrl = "";
  }

  function renderAlternateSources(payload) {
    currentImageScopeToken = payload.image_scope.token;
    currentImagePreviewUrl = payload.image_url;
    currentImagePreviewVersion = String(Date.now());

    if (alternateIsolationBadge) {
      alternateIsolationBadge.classList.toggle(
        "hidden",
        !Boolean(payload.image_scope.is_isolated),
      );
    }

    const sources = payload.alternate_sources || [];
    const activeSource = payload.active_source;
    const card = payload.card || {};
    const isDualFaced = Boolean(card.is_dual_faced);

    configureAlternateImageFaceKindOptions(card);

    currentActiveAlternateSourceId = activeSource
      ? activeSource.alternate_source_id
      : null;

    populateFrameTemplateOptions(
      payload.frame_template_options || [],
      activeSource ? activeSource.export_frame_template || "auto" : "auto",
    );

    const hideSourceComposer = sources.length > 0 && !isDualFaced;

    if (alternateSourceComposer) {
      alternateSourceComposer.classList.toggle("hidden", hideSourceComposer);
    }

    setAlternateInputLocked(Boolean(activeSource) && !isDualFaced);

    if (alternateAddButton && hideSourceComposer) {
      alternateAddButton.classList.add("hidden");
    }

    renderActiveAlternateSources(sources, card);

    updateAlternateImagePreview();

    if (!alternateSourceList) {
      return;
    }

    alternateSourceList.innerHTML = "";

    if (!sources.length) {
      const emptyRow = document.createElement("div");
      emptyRow.className = "alternate-source-empty";

      const emptyTitle = document.createElement("strong");
      emptyTitle.textContent = "No alternate sources yet";

      const emptyText = document.createElement("span");
      emptyText.textContent =
        "Deckadence is currently using a Scryfall base or upscaled image.";

      emptyRow.appendChild(emptyTitle);
      emptyRow.appendChild(emptyText);

      alternateSourceList.appendChild(emptyRow);
      refreshAlternateImageHelpTargets();
      return;
    }

    sources.forEach(function (source) {
      const row = document.createElement("div");

      row.className = "metadata-row alternate-source-row";

      row.dataset.helpId = "alternate-image-source-entry";

      const copy = document.createElement("div");
      copy.className = "alternate-source-copy";

      const title = document.createElement("div");
      title.className = "alternate-source-title";

      title.textContent = getAlternateFaceTitle(
        source.face_kind,
        payload.card || {},
      );

      const meta = document.createElement("div");
      meta.className = "alternate-source-meta";
      meta.textContent = getAlternateSourceMeta(source);

      copy.appendChild(title);
      copy.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "alternate-source-actions";

      const enabledButton = document.createElement("button");

      enabledButton.type = "button";
      enabledButton.className = "alternate-source-action-button";

      enabledButton.dataset.helpId = "alternate-image-source-toggle";

      const enabledIcon = document.createElement("i");

      enabledIcon.className = source.is_enabled
        ? "fa-solid fa-eye-slash"
        : "fa-solid fa-eye";

      enabledIcon.setAttribute("aria-hidden", "true");

      const enabledLabel = document.createElement("span");

      enabledLabel.textContent = source.is_enabled ? "Disable" : "Enable";

      enabledButton.appendChild(enabledIcon);
      enabledButton.appendChild(enabledLabel);

      enabledButton.addEventListener("click", function () {
        toggleAlternateSource(source.alternate_source_id, !source.is_enabled);
      });

      const deleteButton = document.createElement("button");

      deleteButton.type = "button";

      deleteButton.className =
        "alternate-source-action-button " + "alternate-source-delete-button";

      deleteButton.dataset.helpId = "alternate-image-source-delete";

      const deleteIcon = document.createElement("i");

      deleteIcon.className = "fa-solid fa-trash";

      deleteIcon.setAttribute("aria-hidden", "true");

      const deleteLabel = document.createElement("span");

      deleteLabel.textContent = "Delete";

      deleteButton.appendChild(deleteIcon);
      deleteButton.appendChild(deleteLabel);

      deleteButton.addEventListener("click", function () {
        deleteAlternateSource(source.alternate_source_id);
      });

      actions.appendChild(enabledButton);
      actions.appendChild(deleteButton);

      row.appendChild(copy);
      row.appendChild(actions);

      alternateSourceList.appendChild(row);
    });

    refreshAlternateImageHelpTargets();
  }

  async function loadAlternateSources() {
    if (!currentAlternateCardUuid) return null;
    const cardUuid = currentAlternateCardUuid;
    const version = alternateModalVersion;
    currentImageScopeToken = null;
    if (alternateActiveSource) alternateActiveSource.textContent = "Loading...";
    if (alternateSourceList) alternateSourceList.innerHTML = "";
    try {
      const response = await fetch(
        alternateRequestUrl(
          "/chaos/cards/" + encodeURIComponent(cardUuid) + "/alternate-sources",
        ),
        { headers: { Accept: "application/json" }, cache: "no-store" },
      );
      const payload = await response.json();
      if (
        version !== alternateModalVersion ||
        cardUuid !== currentAlternateCardUuid
      )
        return null;
      if (!response.ok || !payload.ok)
        throw new Error(payload.message || "Could not load alternate sources.");
      renderAlternateSources(payload);
      updateAlternateIndicators(
        cardUuid,
        getAlternateStateFromPayload(payload),
      );
      return payload;
    } catch (error) {
      if (version === alternateModalVersion)
        showAlternateMessage(error.message || String(error), true);
      return null;
    }
  }

  async function toggleAlternateSource(alternateSourceId, enabled) {
    await saveAlternateChange(
      "/chaos/alternate-sources/" + alternateSourceId + "/toggle",
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: enabled }),
      },
    );
  }

  async function deleteAlternateSource(alternateSourceId) {
    if (alternateMutationPending) return;
    const version = alternateModalVersion;
    const confirmed =
      window.iMomirConfirm && typeof window.iMomirConfirm.show === "function"
        ? await window.iMomirConfirm.show({
            title: "Delete Alternate Source",
            message:
              "Delete this source from the image library shown above? This cannot be undone.",
            confirmText: "Delete Source",
            cancelText: "Cancel",
            danger: true,
          })
        : window.confirm(
            "Delete this source from the image library shown above?",
          );
    if (!confirmed || version !== alternateModalVersion) return;
    await saveAlternateChange(
      "/chaos/alternate-sources/" + alternateSourceId + "/delete",
      {},
    );
  }

  async function saveAlternateFrameTemplate() {
    if (!currentActiveAlternateSourceId || !alternateExportFrameTemplate)
      return;
    const payload = await saveAlternateChange(
      "/chaos/alternate-sources/" +
        currentActiveAlternateSourceId +
        "/frame-template",
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          export_frame_template: alternateExportFrameTemplate.value || "auto",
        }),
      },
    );
    if (payload) closeAlternateModal();
  }

  if (alternateFoilInput) {
    alternateFoilInput.addEventListener("change", saveAlternateFoilState);
  }

  if (alternateSaveFrameButton) {
    alternateSaveFrameButton.addEventListener(
      "click",
      saveAlternateFrameTemplate,
    );
  }

  alternateButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      openAlternateModal(
        button.getAttribute("data-card-uuid") || "",
        button.getAttribute("data-card-name") || "",
        {
          foilUpdateUrl: button.getAttribute("data-foil-update-url") || "",
          isFoil: button.getAttribute("data-is-foil") || "0",
        },
      );
    });
  });

  window.iMomirAlternateImage = window.iMomirAlternateImage || {};

  window.iMomirAlternateImage.open = function (cardUuid, cardName, options) {
    openAlternateModal(cardUuid || "", cardName || "", options || {});
  };

  if (alternateBackdrop) {
    alternateBackdrop.addEventListener("click", closeAlternateModal);
  }

  if (alternateCloseButton) {
    alternateCloseButton.addEventListener("click", closeAlternateModal);
  }

  if (alternateForm) {
    alternateForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!currentAlternateCardUuid || alternateMutationPending) return;
      applyDefaultAlternateSourceNameIfBlank();
      const payload = await saveAlternateChange(
        "/chaos/cards/" +
          encodeURIComponent(currentAlternateCardUuid) +
          "/alternate-sources/add",
        { body: new FormData(alternateForm) },
      );
      if (!payload) return;
      alternateForm.reset();
      applyRememberedAlternateRemoveBleed();

      if (alternateSourceType) {
        alternateSourceType.value = "uploaded_file";
      }

      if (alternateSourceNameInput) {
        alternateSourceNameInput.value = "";
      }

      updateAlternateSourceFieldVisibility();
      renderAlternateSources(payload);
      updateAlternateImagePreview();

      if (!payload.card.is_dual_faced) {
        closeAlternateModal();
      }
    });
  }

  if (alternateSourceType) {
    alternateSourceType.addEventListener("change", function () {
      updateAlternateSourceFieldVisibility();
      updateAlternateImagePreview();
    });

    updateAlternateSourceFieldVisibility();
  }

  if (alternateFileInput) {
    alternateFileInput.addEventListener("change", updateAlternateImagePreview);
  }

  if (alternateExternalUrlInput) {
    alternateExternalUrlInput.addEventListener(
      "input",
      scheduleAlternateExternalPreview,
    );
  }

  if (alternateLocalPathInput) {
    alternateLocalPathInput.addEventListener(
      "input",
      updateAlternateImagePreview,
    );
  }

  if (alternateFaceKind) {
    alternateFaceKind.addEventListener("change", updateAlternateImagePreview);
  }

  if (alternatePreviewImage) {
    alternatePreviewImage.addEventListener("load", function () {
      alternatePreviewImage.classList.remove("hidden");

      if (alternatePreviewEmpty) {
        alternatePreviewEmpty.classList.add("hidden");
      }
    });

    alternatePreviewImage.addEventListener("error", function () {
      alternatePreviewImage.classList.add("hidden");

      if (alternatePreviewEmpty) {
        alternatePreviewEmpty.textContent =
          "The selected image could not be previewed.";

        alternatePreviewEmpty.classList.remove("hidden");
      }
    });
  }

  if (alternateRemoveBleedInput) {
    alternateRemoveBleedInput.addEventListener("change", function () {
      rememberAlternateRemoveBleed(alternateRemoveBleedInput.checked);
    });
  }

  document.addEventListener("keydown", function (event) {
    if (
      event.key === "Escape" &&
      alternateOverlay &&
      !alternateOverlay.classList.contains("hidden")
    ) {
      closeAlternateModal();
    }
  });
})();
