/* Reusable layered message card. Text is assigned as textContent, never HTML. */
function deckadenceMessageCards({
    title = [], subtitle = [], number = '', category = '', edition = '', footer = '',
    baseUrl, overlayUrl, titleSize = 108, subtitleSize = 18, themed = false,
}) {
    const ns = 'http://www.w3.org/2000/svg';
    const element = (name, attributes = {}, text) => {
        const node = document.createElementNS(ns, name);
        for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
        if (text !== undefined) node.textContent = text;
        return node;
    };
    const card = element('svg', {viewBox: '0 0 431 600', width: '100%', height: '100%',
        preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': [...title, ...subtitle].join(' ')});
    const layer = url => element('image', {href: url, width: 431, height: 600});
    const artwork = layer(baseUrl);
    card.append(artwork);
    const headline = element('g', {'font-family': 'Arial Black, Arial, sans-serif',
        'font-weight': 900, 'font-size': titleSize, fill: '#fff4c9', 'text-anchor': 'middle'});
    const lineHeight = titleSize * 1.02;
    const firstBaseline = 258 - ((title.length - 1) * lineHeight) / 2 + titleSize * .34;
    title.forEach((line, index) => headline.append(element('text', {x: 217, y: firstBaseline + index * lineHeight}, line)));
    card.append(headline);
    const subtext = element('g', {'font-family': 'Georgia, serif', 'font-weight': 700,
        'font-size': subtitleSize, fill: '#49412b', 'text-anchor': 'start'});
    const subtitleLineHeight = subtitleSize + 3;
    const subtitleBaseline = 463 - ((subtitle.length - 1) * subtitleLineHeight) / 2 + subtitleSize * .34;
    subtitle.forEach((line, index) => subtext.append(element('text', {x: 126, y: subtitleBaseline + index * subtitleLineHeight}, line)));
    card.append(subtext);
    // Footer typography belongs to the card, not its surrounding button or panel.
    const small = element('g', {'font-family': 'Arial, sans-serif', 'font-size': 10,
        'font-weight': 600, 'font-style': 'normal', 'letter-spacing': 0,
        'text-anchor': 'start', fill: '#242218'});
    small.append(element('text', {x: 22, y: 568}, number),
        element('text', {x: 76, y: 568}, category),
        element('text', {x: 22, y: 579}, edition),
        element('text', {x: 411, y: 579, 'text-anchor': 'end'}, footer));
    card.append(small);
    card.append(layer(overlayUrl));
    if (themed) {
        // Use the authored inserts intact: only choose the artwork and legible ink.
        const inserts = {
            'white-mana': 'white', light: 'white', colorless: 'white',
            'blue-mana': 'blue', 'black-mana': 'black', dark: 'black', backup: 'black',
            'red-mana': 'red', 'green-mana': 'green', 'multi-mana': 'gold',
        };
        const applyTheme = () => {
            const insert = inserts[document.documentElement.dataset.theme] || 'gold';
            artwork.setAttribute('href', new URL(`deckadence-${insert}-no-foil.svg`, new URL(baseUrl, document.baseURI)).href);
            headline.setAttribute('fill', insert === 'gold' ? '#fff4c9' : '#342e22');
            subtext.setAttribute('fill', '#49412b');
            small.setAttribute('fill', ['white', 'gold'].includes(insert) ? '#242218' : '#f2f4f8');
        };
        applyTheme();
        const observer = new MutationObserver(() => {
            if (!card.isConnected) { observer.disconnect(); return; }
            applyTheme();
        });
        observer.observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
    }
    return card;
}
