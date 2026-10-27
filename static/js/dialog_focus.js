// *** DIALOG FOCUS - Keep Keyboard Focus in Open Dialogs ***
/* Shared keyboard lifecycle for existing overlays; page controllers still own closing. */
class DialogFocusController {
  constructor(root = document) {
    this.root = root;
    this.stack = [];
    this.lastOutsideFocus = document.activeElement;
    this.pendingOpeners = new WeakMap();
    this.selector = 'dialog, [role="dialog"][aria-modal="true"], .custom-draft-card-search-window';
    this.navigationOverlaySelector = [
      '.campaign-add-pack-modal', '.card-zoom-overlay',
      '.custom-draft-card-search-overlay', '.custom-draft-card-search-panel-maximized',
      '.custom-draft-set-card-list-panel-maximized', '.app-qr-modal-backdrop',
      '.reminder-modal-backdrop', '.card-back-selector-modal',
      '.print-template-selector-backdrop', '.silhouette-template-library-modal',
      '.imomir-image-compare-overlay', '.imomir-zoom-comparison-overlay',
      '.imomir-batch-upscale-overlay', '.chaos-draft-busy-overlay', '#imomirConfirmOverlay',
    ].join(',');
    this.observer = new MutationObserver(() => this.sync());
  }

  visible(element) {
    return element.isConnected && !element.closest('[hidden], .hidden, [aria-hidden="true"]') &&
      element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
  }

  controls(dialog) {
    return Array.from(dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex]'))
      .filter(element => !element.disabled && element.tabIndex >= 0 && this.visible(element));
  }

  initialize() {
    document.addEventListener('focusin', event => {
      const current = this.stack.at(-1);
      const entered = event.target.closest(this.selector);
      if (entered && !this.stack.some(entry => entry.dialog === entered) && !this.pendingOpeners.has(entered)) {
        this.pendingOpeners.set(entered, this.lastOutsideFocus);
      }
      if (current && !current.dialog.contains(event.target) && this.visible(current.dialog) && !entered) {
        this.focus(current.dialog);
        return;
      }
      this.lastOutsideFocus = event.target;
    });
    document.addEventListener('keydown', event => {
      const current = this.stack.at(-1);
      if (!current || event.key !== 'Tab') return;
      const controls = this.controls(current.dialog);
      const first = controls[0] || current.dialog;
      const last = controls.at(-1) || current.dialog;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }, true);
    this.observer.observe(document.body, {subtree:true, childList:true, attributes:true,
      attributeFilter:['class', 'style', 'aria-hidden', 'hidden', 'open']});
    this.sync();
  }

  focus(dialog) {
    const target = this.controls(dialog)[0] || dialog;
    if (target === dialog) dialog.tabIndex = -1;
    target.focus({preventScroll:true});
  }

  sync() {
    // Check the small set of overlay roots, including hidden ancestors, rather
    // than a body :has(...:not(.hidden *)) rule invalidated by every result row.
    const navigationCovered = Array.from(this.root.querySelectorAll(this.navigationOverlaySelector))
      .some(overlay => this.visible(overlay));
    document.body.classList.toggle('app-has-blocking-overlay', navigationCovered);
    const previous = this.stack.at(-1);
    this.stack = this.stack.filter(entry => this.visible(entry.dialog));
    const additions = Array.from(this.root.querySelectorAll(this.selector))
      .filter(dialog => this.visible(dialog) && !this.stack.some(entry => entry.dialog === dialog));
    for (const dialog of additions) {
      const active = document.activeElement;
      const opener = this.pendingOpeners.get(dialog) || (dialog.contains(active) ? this.lastOutsideFocus : active);
      this.pendingOpeners.delete(dialog);
      this.stack.push({dialog, opener});
      if (!dialog.contains(active)) this.focus(dialog);
    }
    if (previous && !this.stack.includes(previous) && !additions.length) {
      const parent = this.stack.at(-1);
      if (previous.opener?.isConnected && this.visible(previous.opener) &&
          (!parent || parent.dialog.contains(previous.opener))) previous.opener.focus({preventScroll:true});
      else if (parent) this.focus(parent.dialog);
    }
  }
}
document.addEventListener('DOMContentLoaded', () => new DialogFocusController().initialize());
