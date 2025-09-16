import { computeCoveredVideoRect, lerp, clamp } from './util.js';

export class AROverlay {
  constructor({ container, video, overlayEl }) {
    this.host = container;
    this.video = video;
    this.overlay = overlayEl;
    this.currentX = 0.5;
    this.smoothness = 0.15;
  }

  setContent(type) {
    const img = this.overlay.querySelector('#overlay-image');
    const vid = this.overlay.querySelector('#overlay-video');
    if (type === 'image') {
      img.classList.remove('hidden');
      vid.classList.add('hidden');
      try { vid.pause(); } catch {}
    } else {
      vid.classList.remove('hidden');
      img.classList.add('hidden');
      try { vid.play().catch(()=>{}); } catch {}
    }
  }

  updateAnchor(xNorm, immediate = false) {
    xNorm = clamp(xNorm, 0, 1);
    if (immediate) this.currentX = xNorm;
    else this.currentX = lerp(this.currentX, xNorm, this.smoothness);

    const rect = computeCoveredVideoRect(this.video, this.host);
    const xPx = rect.left + rect.width * this.currentX;
    const yPx = this.host.clientHeight * 0.5;

    this.overlay.style.left = `${xPx}px`;
    this.overlay.style.top = `${yPx}px`;
  }
}