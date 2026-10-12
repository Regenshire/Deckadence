document.addEventListener("DOMContentLoaded", function () {
    initializeResultFaces();
    initializeMomirSelectResultLinks();
});

function initializeResultCardZoom() {
    const cardImage = document.getElementById("resultCardImage");
    const zoomOverlay = document.getElementById("cardZoomOverlay");
    const zoomBackdrop = document.getElementById("cardZoomBackdrop");

    if (!cardImage || !zoomOverlay || !zoomBackdrop) {
        return;
    }

    function openZoom() {
        zoomOverlay.classList.remove("hidden");
        zoomOverlay.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
    }

    function closeZoom() {
        zoomOverlay.classList.add("hidden");
        zoomOverlay.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
    }

    cardImage.addEventListener("click", function () {
        openZoom();
    });

    cardImage.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openZoom();
        }
    });

    zoomOverlay.addEventListener("click", function () {
        closeZoom();
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && !zoomOverlay.classList.contains("hidden")) {
            closeZoom();
        }
    });
}

function initializeMomirSelectResultLinks() {
    const selectedTypeDropdown = document.getElementById("resultSelectedType");
    const manaLinks = document.querySelectorAll('[data-mana-link="1"]');
    const againButton = document.getElementById("resultAgainButton");

    if (!selectedTypeDropdown) {
        return;
    }

    function updateResultLinks() {
        const selectedTypeValue = (selectedTypeDropdown.value || "").trim();

        manaLinks.forEach(function (link) {
            const manaValue = link.getAttribute("data-mana-value") || "";
            const url = new URL(link.href, window.location.origin);

            url.searchParams.set("mana_value", manaValue);

            if (selectedTypeValue) {
                url.searchParams.set("selected_type", selectedTypeValue);
            } else {
                url.searchParams.delete("selected_type");
            }

            link.href = url.pathname + url.search;
        });

        if (againButton) {
            const againUrl = new URL(againButton.href, window.location.origin);
            const currentManaValue = againUrl.searchParams.get("mana_value") || "";

            againUrl.searchParams.set("mana_value", currentManaValue);

            if (selectedTypeValue) {
                againUrl.searchParams.set("selected_type", selectedTypeValue);
            } else {
                againUrl.searchParams.delete("selected_type");
            }

            againButton.href = againUrl.pathname + againUrl.search;
        }
    }

    selectedTypeDropdown.addEventListener("change", function () {
        updateResultLinks();
    });

    updateResultLinks();
}



class MomirManaDialogController {
    constructor(dialog, trigger) {
        const form = dialog.querySelector('form');
        const input = form.elements.mana_value;
        trigger.addEventListener('click', () => {
            form.elements.selected_type.value = document.getElementById('resultSelectedType')?.value || form.elements.selected_type.defaultValue;
            dialog.showModal();
            input.focus();
            input.select();
        });
        document.getElementById('resultCustomManaCancel').addEventListener('click', () => dialog.close());
        dialog.addEventListener('close', () => trigger.focus({preventScroll: true}));
    }
}
document.addEventListener('DOMContentLoaded', () => {
    const dialog = document.getElementById('resultCustomManaDialog');
    if (dialog) new MomirManaDialogController(dialog, document.getElementById('resultCustomManaButton'));
});

// Keep the page shell and its animated background alive while drawing cards.
document.addEventListener('DOMContentLoaded', () => {
    const screen = document.querySelector('.momir-result');
    if (!screen) return;
    let pending = false;
    async function draw(url) {
        if (pending) return;
        pending = true;
        screen.setAttribute('aria-busy', 'true');
        try {
            const response = await fetch(url, {cache: 'no-store'});
            if (!response.ok) throw new Error('Card could not be loaded.');
            const next = new DOMParser().parseFromString(await response.text(), 'text/html');
            const incoming = next.querySelector('.momir-result');
            if (!incoming) throw new Error('Card could not be loaded.');
            const nextImage = incoming.querySelector('#resultCardImage');
            if (nextImage) {
                const preload = new Image();
                preload.src = nextImage.src;
                await preload.decode().catch(() => {});
            }
            const main = screen.querySelector('.result-main');
            main.replaceChildren(...incoming.querySelector('.result-main').childNodes);
            main.querySelectorAll('script').forEach(script => script.remove());
            const empty = main.querySelector('.momir-message-card');
            if (empty) empty.append(deckadenceMessageCards({
                themed:true, title:['Oh','No!'], subtitle:['No cards have that','mana cost, Sorry!'],
                number:'0404', edition:'SORRY * EN', footer:'Deckadence iMomir Mode',
                baseUrl:'/static/img/inserts/deckadence-gold-no-foil.svg',
                overlayUrl:'/static/img/inserts/deckadence-foil-overlay.svg'
            }));
            const actions = screen.querySelector('.result-actions');
            const nextActions = incoming.querySelector('.result-actions');
            // Preserve the calculator button and its dialog listener.
            actions.querySelectorAll(':scope > :not(#resultCustomManaButton)').forEach(node => node.remove());
            [...nextActions.children].filter(node => node.id !== 'resultCustomManaButton').forEach(node => actions.insertBefore(node, actions.querySelector('#resultCustomManaButton')));
            screen.querySelector('.momir-status-bar').replaceChildren(...incoming.querySelector('.momir-status-bar').childNodes);
            screen.querySelectorAll('[data-mana-link]').forEach((link, i) => {
                const replacement = incoming.querySelectorAll('[data-mana-link]')[i];
                link.href = replacement.href;
                link.className = replacement.className;
            });
            screen.querySelector('#cardZoomOverlay')?.remove();
            const zoom = incoming.querySelector('#cardZoomOverlay');
            if (zoom) screen.querySelector('.result-panel').append(zoom);
            initializeResultFaces();
            history.replaceState(null, '', url);
            window.dispatchEvent(new Event('resize'));
        } catch (error) {
            if (window.iMomirToast) window.iMomirToast.error('Could not draw a card. Please try again.');
        } finally {
            pending = false;
            screen.removeAttribute('aria-busy');
        }
    }
    screen.addEventListener('click', event => {
        const link = event.target.closest('[data-mana-link], #resultAgainButton');
        if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const url = new URL(link.href);
        const type = document.getElementById('resultSelectedType');
        if (type) url.searchParams.set('selected_type', type.value);
        draw(url.href);
    });
    document.getElementById('resultCustomManaForm')?.addEventListener('submit', event => {
        event.preventDefault();
        const url = new URL(event.target.action);
        new FormData(event.target).forEach((value, key) => url.searchParams.set(key, value));
        document.getElementById('resultCustomManaDialog').close();
        draw(url.href);
    });
});
