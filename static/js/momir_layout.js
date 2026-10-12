// Size the active game area below the actual navigation, including collapsed navigation.
class MomirViewportController {
    constructor(screen) {
        this.screen = screen;
        this.update = this.update.bind(this);
        window.addEventListener("resize", this.update);
        window.visualViewport?.addEventListener("resize", this.update);
        this.observer = new ResizeObserver(this.update);
        const navigation = document.querySelector(".app-tabs");
        if (navigation) this.observer.observe(navigation);
        this.update();
    }

    update() {
        const top = this.screen.getBoundingClientRect().top + window.scrollY;
        const height = window.visualViewport?.height || window.innerHeight;
        const shell = this.screen.closest('.app-shell');
        const bottom = shell ? parseFloat(getComputedStyle(shell).paddingBottom) : 12;
        const selector = this.screen.querySelector('.momir-select-top-panel');
        const compact = matchMedia('(max-width: 600px)').matches;
        const frameSpace = compact ? 30 : 48;
        const heading = this.screen.querySelector('.momir-game-heading');
        const headingSpace = heading ? heading.offsetHeight + parseFloat(getComputedStyle(heading).marginBottom) : 0;
        const pageHeading = this.screen.querySelector('.momir-page-heading');
        const pageHeadingSpace = pageHeading ? pageHeading.offsetHeight + 28 : 0;
        const footer = this.screen.querySelector('.momir-status-bar');
        const footerSpace = footer ? footer.offsetHeight + (compact ? 12 : 20) : 0;
        const availableHeight = Math.max(200, height - top - bottom - (selector ? selector.offsetHeight + 8 : 0) - frameSpace - headingSpace - pageHeadingSpace - footerSpace);
        const availableWidth = Math.max(200, this.screen.clientWidth - frameSpace);
        const landscape = matchMedia('(orientation: landscape) and (max-height: 650px)').matches;
        const rows = landscape ? 3 : 9;
        const columns = landscape ? 3 : 1;
        const gap = compact ? 12 : 18;
        const actionSpace = 48 + gap;
        const ratio = 63 / 88; // Fixed card proportions, independent of image/cache state.
        let key = 44;
        let cardHeight;
        let cardWidth;
        // Bound large displays, but use the available space on phones and tablets.
        for (let pass = 0; pass < 3; pass++) {
            const bank = columns * key + (columns - 1) * 4;
            cardWidth = Math.min(480, Math.max(100, availableWidth - 2 * bank - 2 * gap));
            cardHeight = Math.min(cardWidth / ratio, availableHeight - actionSpace);
            cardWidth = cardHeight * ratio;
            key = Math.max(44, Math.min(80, (cardHeight + actionSpace - (rows - 1) * 4) / rows));
        }
        const bank = columns * key + (columns - 1) * 4;
        const boardHeight = Math.max(cardHeight + actionSpace, rows * key + (rows - 1) * 4);
        const values = {
            '--mana-size': key,
            '--mana-bank-width': bank,
            '--momir-card-width': cardWidth,
            '--momir-card-height': cardHeight,
            '--momir-board-height': boardHeight,
            '--momir-board-width': cardWidth + 2 * bank + 2 * gap,
        };
        for (const [name, value] of Object.entries(values)) this.screen.style.setProperty(name, `${value}px`);
    }
}
