// *** MOMIR - Select Game Options and Draw Cards ***
document.addEventListener("DOMContentLoaded", function () {
    initializeManaKeypad();
    initializeMomirPrinting();
});

function initializeManaKeypad() {
    const manaInput = document.getElementById("manaValue");
    const manaForm = document.getElementById("manaForm");
    const keypadButtons = document.querySelectorAll(".keypad-btn[data-key]");
    const clearButton = document.getElementById("clearBtn");
    const backspaceButton = document.getElementById("backspaceBtn");

    if (!manaInput || !manaForm) {
        return;
    }

    function appendDigit(digit) {
        if (manaInput.value.length >= 2) {
            return;
        }

        if (!/^\d$/.test(digit)) {
            return;
        }

        manaInput.value += digit;
    }

    function clearValue() {
        manaInput.value = "";
    }

    function backspaceValue() {
        manaInput.value = manaInput.value.slice(0, -1);
    }

    keypadButtons.forEach(function (button) {
        button.addEventListener("click", function () {
            const digit = button.getAttribute("data-key");
            appendDigit(digit);
        });
    });

    if (clearButton) {
        clearButton.addEventListener("click", function () {
            clearValue();
        });
    }

    if (backspaceButton) {
        backspaceButton.addEventListener("click", function () {
            backspaceValue();
        });
    }

    manaForm.addEventListener("submit", function (event) {
        const value = manaInput.value.trim();

        if (value === "") {
            event.preventDefault();
            manaInput.reportValidity();
        }
    });
}

// Momir alone owns this print lifecycle. Legacy print pages and other modes do
// not load this controller with either of the activation markers below.
function initializeMomirPrinting() {
    const pdfLauncher = document.querySelector('[data-momir-pdf-url]');
    if (pdfLauncher) {
        // First open an ordinary HTML tab from the user's link, then hand that
        // existing tab to the native PDF viewer. No delayed popup or iframe.
        window.location.replace(pdfLauncher.dataset.momirPdfUrl);
        return;
    }
    const printDocument = document.querySelector('[data-momir-print-document]');
    const screen = document.querySelector('.momir-result');
    if (!printDocument && !screen) return;

    function waitForStyles() {
        const link = document.querySelector('[data-momir-print-styles]');
        if (!link) return Promise.reject(new Error('Print layout is missing.'));
        if (link?.sheet) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const finish = error => {
                clearTimeout(timer);
                link?.removeEventListener('load', loaded);
                link?.removeEventListener('error', failed);
                error ? reject(error) : resolve();
            };
            const loaded = () => finish();
            const failed = () => finish(new Error('Print layout could not load.'));
            const timer = setTimeout(failed, 20000);
            link?.addEventListener('load', loaded, {once: true});
            link?.addEventListener('error', failed, {once: true});
        });
    }

    async function waitForImages(root) {
        let timer;
        try {
            await Promise.race([
                Promise.all([...root.querySelectorAll('img')].map(async image => {
                    if (image.decode) await image.decode();
                    else if (!image.complete) await new Promise((resolve, reject) => {
                        image.addEventListener('load', resolve, {once: true});
                        image.addEventListener('error', reject, {once: true});
                    });
                    if (!image.naturalWidth) throw new Error('Card image could not be loaded.');
                })),
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error('Card image timed out.')), 20000);
                }),
            ]);
        } finally {
            clearTimeout(timer);
        }
    }

    if (printDocument) {
        const button = document.querySelector('[data-momir-print-now]');
        const status = document.querySelector('[data-momir-print-status]');
        const print = () => {
            try { window.print(); }
            catch (_) { status.textContent = 'Printing could not open. Tap Print Card to try again.'; }
        };
        button.addEventListener('click', print);
        document.querySelector('[data-momir-print-close]').addEventListener('click', () => {
            window.close();
            setTimeout(() => { status.textContent = 'Use your browser to close this print tab or return to your game.'; }, 150);
        });
        Promise.all([waitForImages(document.getElementById('momirPrintSheet')), waitForStyles()]).then(() => {
            button.disabled = false;
            button.textContent = 'Print Card';
            if (printDocument.dataset.autoPrint === '1') requestAnimationFrame(print);
        }).catch(() => {
            button.textContent = 'Print preview unavailable';
            status.textContent = 'The card or print layout could not load. Reload this print page to try again.';
        });
        return;
    }

    const root = document.createElement('div');
    root.id = 'momirPrintRoot';
    document.body.append(root);
    document.body.classList.add('momir-card-print');
    const feedback = document.createElement('p');
    feedback.className = 'momir-print-feedback';
    feedback.setAttribute('role', 'status');
    feedback.hidden = true;
    screen.querySelector('.result-panel').append(feedback);
    let generation = 0;
    let ready = false;
    let failed = false;
    let controller;
    let options;
    let preparedUrl = '';

    function message(text) {
        feedback.textContent = text;
        feedback.hidden = !text;
    }

    function isPdfLink(link) {
        return ['pdf', 'open-pdf'].includes(new URL(link.href, window.location.href).searchParams.get('format'));
    }

    async function prepare() {
        const ticket = ++generation;
        controller?.abort();
        controller = new AbortController();
        const currentController = controller;
        const link = screen.querySelector('[data-momir-print-preview]');
        ready = false;
        failed = false;
        options = null;
        if (!link || link.dataset.momirPrintPreview !== preparedUrl) {
            root.textContent = 'The card is not ready to print. Close print preview and try again.';
            document.getElementById('momirPrintGeometry')?.remove();
        }
        message('');
        if (!link) return;
        if (isPdfLink(link)) link.removeAttribute('aria-disabled');
        else link.setAttribute('aria-disabled', 'true');
        const timeout = setTimeout(() => currentController.abort(), 20000);
        try {
            const response = await fetch(link.dataset.momirPrintPreview, {
                cache: 'no-store', signal: currentController.signal,
            });
            if (!response.ok) throw new Error('Print document unavailable.');
            const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
            if (ticket !== generation) return;
            const sheet = parsed.getElementById('momirPrintSheet');
            const geometry = parsed.querySelector('[data-momir-print-geometry]');
            const printBody = parsed.querySelector('[data-momir-print-document]');
            if (!sheet || !geometry || !printBody) throw new Error('Print document unavailable.');
            options = {pdf: printBody.dataset.usePdf === '1', newTab: printBody.dataset.newTab === '1'};
            link.href = printBody.dataset.printHref;
            link.target = options.newTab ? '_blank' : '_self';
            link.rel = 'noopener';
            if (options.pdf) {
                // The PDF is a normal link. It does not depend on preparing an
                // HTML print sheet, decoding its image, or calling print().
                preparedUrl = link.dataset.momirPrintPreview;
                ready = true;
                link.removeAttribute('aria-disabled');
                return;
            }
            const printable = document.importNode(sheet, true);
            await Promise.all([waitForImages(printable), waitForStyles()]);
            if (ticket !== generation) return;
            const style = document.importNode(geometry, true);
            style.id = 'momirPrintGeometry';
            document.getElementById('momirPrintGeometry')?.remove();
            document.head.append(style);
            root.replaceChildren(printable);
            preparedUrl = link.dataset.momirPrintPreview;
            ready = true;
            link.removeAttribute('aria-disabled');
            if (feedback.textContent) message('Ready. Tap Print to continue.');
        } catch (_) {
            if (ticket !== generation) return;
            failed = true;
            root.textContent = 'The card could not be prepared. Close print preview and use the Momir Print button to retry.';
            link.removeAttribute('aria-disabled');
            message('Could not prepare printing here. Tap Print to open the printable document.');
        } finally {
            clearTimeout(timeout);
        }
    }

    screen.addEventListener('click', event => {
        const link = event.target.closest('[data-momir-print-preview]');
        if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        if (screen.getAttribute('aria-busy') === 'true') {
            event.preventDefault();
            message('Wait for the new card to finish loading before printing.');
        } else if (!ready && !failed && !isPdfLink(link)) {
            event.preventDefault();
            message('Preparing the card. Tap Print again when it is ready.');
        } else if (ready && !options.pdf && !options.newTab) {
            event.preventDefault();
            // The card is already decoded, so this runs inside the user's tap.
            // Print CSS includes only the dedicated card sheet, never the game UI.
            try { window.print(); }
            catch (_) { message('Printing could not open. Tap Print to try again.'); }
        }
        // PDF and new-tab links remain user-activated navigations. Do not
        // fetch a blob then window.open(): Safari may block that delayed popup.
    });
    screen.addEventListener('momir:card-changed', prepare);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') prepare();
    });
    window.addEventListener('focus', () => {
        if (document.visibilityState === 'visible') prepare();
    });
    window.addEventListener('pageshow', event => { if (event.persisted) prepare(); });
    const restoreLayout = () => requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    window.addEventListener('afterprint', restoreLayout);
    window.matchMedia('print').addEventListener?.('change', event => {
        if (!event.matches) restoreLayout();
    });
    prepare();
}
