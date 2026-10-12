
function initializeResultFaces() {
    const resultImage = document.getElementById("resultCardImage");
    const zoomOverlay = document.getElementById("cardZoomOverlay");
    const zoomBackdrop = document.getElementById("cardZoomBackdrop");
    const zoomImage = document.getElementById("cardZoomImage");
    const faceDataUrl = document.querySelector(".screen-result").dataset.faceUrl;

    let resultMetadata = null;
    let resultFlipButton = null;
    let zoomFlipButton = null;

    function getCardKey() {
        if (!resultImage) {
            return "";
        }

        return (
            resultImage.dataset.cardKey
            || resultImage.closest("[data-card-key]")?.dataset.cardKey
            || ""
        ).trim();
    }

    function updateFlipButtonFace(buttonElement, face) {
        if (!buttonElement) {
            return;
        }

        if (face === "back") {
            buttonElement.classList.add("result-card-flip-button-flipped");
            buttonElement.setAttribute("aria-label", "Show front face");
            buttonElement.title = "Show front face";
        } else {
            buttonElement.classList.remove("result-card-flip-button-flipped");
            buttonElement.setAttribute("aria-label", "Show back face");
            buttonElement.title = "Show back face";
        }
    }

    function applyFaceToImage(imageElement, face) {
        if (!imageElement || !resultMetadata) {
            return;
        }

        if (face === "back") {
            imageElement.src = resultMetadata.back_src || imageElement.src;
            imageElement.alt = resultMetadata.back_alt || imageElement.alt || "";
            imageElement.dataset.face = "back";
        } else {
            imageElement.src = resultMetadata.front_src || imageElement.src;
            imageElement.alt = resultMetadata.front_alt || imageElement.alt || "";
            imageElement.dataset.face = "front";
        }
    }

    function flipImage(imageElement, buttonElement) {
        if (!imageElement || !resultMetadata) {
            return;
        }

        const currentFace = imageElement.dataset.face === "back" ? "back" : "front";
        const nextFace = currentFace === "back" ? "front" : "back";

        applyFaceToImage(imageElement, nextFace);
        updateFlipButtonFace(buttonElement, nextFace);
    }

    function createFlipButton(targetImage, isZoomButton) {
        const buttonElement = document.createElement("button");
        buttonElement.type = "button";
        buttonElement.className = "result-card-flip-button";
        buttonElement.textContent = "↻";
        updateFlipButtonFace(buttonElement, targetImage.dataset.face === "back" ? "back" : "front");

        buttonElement.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();

            flipImage(targetImage, buttonElement);

            if (isZoomButton && resultImage) {
                applyFaceToImage(resultImage, targetImage.dataset.face);
                updateFlipButtonFace(resultFlipButton, targetImage.dataset.face);
            }
        });

        return buttonElement;
    }

    async function loadResultFaceMetadata() {
        const cardKey = getCardKey();

        if (!cardKey) {
            return null;
        }

        const response = await fetch(faceDataUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                card_keys: [cardKey],
            }),
        });

        const payload = await response.json();

        if (!payload || !payload.ok || !payload.cards || !payload.cards[cardKey]) {
            return null;
        }

        const metadata = payload.cards[cardKey];

        if (!metadata.is_dual_faced || !metadata.back_src) {
            return null;
        }

        return metadata;
    }

    function addResultFlipButton() {
        if (!resultImage || !resultMetadata || resultFlipButton) {
            return;
        }

        const cardDisplay = resultImage.closest(".card-display");

        if (!cardDisplay) {
            return;
        }

        resultImage.dataset.face = resultImage.dataset.face || "front";

        resultFlipButton = createFlipButton(resultImage, false);
        cardDisplay.appendChild(resultFlipButton);
    }

    function removeZoomFlipButton() {
        if (zoomFlipButton) {
            zoomFlipButton.remove();
            zoomFlipButton = null;
        }
    }

    function openResultZoom() {
        if (!resultImage || !zoomOverlay || !zoomImage) {
            return;
        }

        zoomImage.src = resultImage.src || "";
        zoomImage.alt = resultImage.alt || "";
        zoomImage.dataset.face = resultImage.dataset.face || "front";

        removeZoomFlipButton();

        if (resultMetadata) {
            zoomFlipButton = createFlipButton(zoomImage, true);
            const zoomContent = zoomImage.closest(".card-zoom-content");

            if (zoomContent) {
                zoomContent.appendChild(zoomFlipButton);
            }
        }

        zoomOverlay.classList.remove("hidden");
        zoomOverlay.setAttribute("aria-hidden", "false");
    }

    function closeResultZoom() {
        if (!zoomOverlay || !zoomImage) {
            return;
        }

        removeZoomFlipButton();

        zoomOverlay.classList.add("hidden");
        zoomOverlay.setAttribute("aria-hidden", "true");
        zoomImage.dataset.face = "front";
    }

    if (resultImage) {
        resultImage.dataset.face = "front";
        resultImage.addEventListener("click", openResultZoom);
        resultImage.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openResultZoom(); }
        });
        resultImage.addEventListener("dblclick", openResultZoom);
    }

    if (zoomBackdrop) {
        zoomBackdrop.addEventListener("click", closeResultZoom);
    }

    if (zoomImage) {
        zoomImage.addEventListener("click", closeResultZoom);
    }

    window.resultFaceCleanup?.();
    const keyController = new AbortController();
    window.resultFaceCleanup = () => keyController.abort();
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            closeResultZoom();
        }
    }, {signal: keyController.signal});

    loadResultFaceMetadata()
        .then(function (metadata) {
            resultMetadata = metadata;
            addResultFlipButton();
        })
        .catch(function () {
            resultMetadata = null;
        });
}
