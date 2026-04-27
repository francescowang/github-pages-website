'use strict';

// Lightweight <ion-icon> custom element that loads SVGs from the local
// assets/icons/ directory instead of the Ionicons CDN.
// Drop-in replacement for the ionicons@5 script tags.

(function () {
  // Resolve base path relative to this script's location so it works from
  // both the root (index.html) and subdirectories (blog/view.html).
  const scripts = document.querySelectorAll('script[src]');
  let basePath = '/assets/icons/';
  for (const s of scripts) {
    const src = s.getAttribute('src');
    if (src && src.includes('ionicons-local')) {
      // Walk up from the script's directory to the repo root.
      basePath = src.replace(/assets\/js\/vendor\/ionicons-local\.js$/, '') + 'assets/icons/';
      break;
    }
  }

  class IonIcon extends HTMLElement {
    connectedCallback() {
      this._render();
    }

    static get observedAttributes() { return ['name']; }

    attributeChangedCallback() {
      if (this.isConnected) this._render();
    }

    _render() {
      const name = this.getAttribute('name');
      if (!name) return;

      const url = basePath + name + '.svg';
      fetch(url)
        .then(r => {
          if (!r.ok) throw new Error('icon not found: ' + name);
          return r.text();
        })
        .then(svg => {
          this.innerHTML = svg;
          const svgEl = this.querySelector('svg');
          if (svgEl) {
            svgEl.setAttribute('aria-hidden', 'true');
            svgEl.style.width  = '1em';
            svgEl.style.height = '1em';
            svgEl.style.fill   = 'currentColor';
          }
        })
        .catch(() => {
          // Silently fail — icon just won't render.
        });
    }
  }

  if (!customElements.get('ion-icon')) {
    customElements.define('ion-icon', IonIcon);
  }
}());
