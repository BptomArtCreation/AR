import { rgbToHsv, clamp } from './util.js';

/**
 * 輕量水平掃描偵測器（顏色條件）：
 * - 將相機縮放到小畫布
 * - 掃描一條水平列，找出符合顏色門檻的最大連續段，回傳其中心 xNormalized
 */
export class HorizontalColorDetector {
  constructor(options = {}) {
    this.targetH = options.targetH ?? 190;   // 目標色相 0..360
    this.hTol    = options.hTol ?? 18;       // 色相容忍度
    this.minS    = options.minS ?? 0.35;     // 最小飽和度
    this.minV    = options.minV ?? 0.35;     // 最小明度
    this.rowY    = options.rowY ?? 0.5;      // 掃描列相對高度 0..1
    this.procW   = options.procW ?? 240;     // 下採樣寬度
    this.minRun  = options.minRun ?? 8;      // 最小連續像素數
    this.enabled = true;

    this.video = null;
    this.procCanvas = null;
    this.procCtx = null;
  }

  attach(video, procCanvas) {
    this.video = video;
    this.procCanvas = procCanvas;
    this.procCtx = procCanvas.getContext('2d', { willReadFrequently: true });
  }

  detect() {
    if (!this.enabled || !this.video || !this.video.videoWidth) return null;

    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const scale = this.procW / vw;
    const pw = Math.max(60, Math.round(vw * scale));
    const ph = Math.max(60, Math.round(vh * scale));

    if (this.procCanvas.width !== pw || this.procCanvas.height !== ph) {
      this.procCanvas.width = pw;
      this.procCanvas.height = ph;
    }

    this.procCtx.drawImage(this.video, 0, 0, pw, ph);

    const y = clamp(Math.round(ph * this.rowY), 0, ph - 1);
    const imageData = this.procCtx.getImageData(0, y, pw, 1);
    const { data } = imageData;

    const mask = new Uint8Array(pw);
    for (let x = 0; x < pw; x++) {
      const i = x * 4;
      const r = data[i], g = data[i+1], b = data[i+2];
      const { h, s, v } = rgbToHsv(r, g, b);
      const dh = Math.min(Math.abs(h - this.targetH), 360 - Math.abs(h - this.targetH));
      mask[x] = (dh <= this.hTol && s >= this.minS && v >= this.minV) ? 1 : 0;
    }

    let bestLen = 0, bestStart = -1, currentLen = 0, currentStart = 0;
    for (let x = 0; x < pw; x++) {
      if (mask[x]) {
        if (currentLen === 0) currentStart = x;
        currentLen++;
      } else {
        if (currentLen > bestLen) { bestLen = currentLen; bestStart = currentStart; }
        currentLen = 0;
      }
    }
    if (currentLen > bestLen) { bestLen = currentLen; bestStart = currentStart; }

    if (bestLen >= this.minRun) {
      const centerX = bestStart + bestLen / 2;
      const xNorm = centerX / pw;
      return { xNorm, strength: bestLen / pw };
    }
    return null;
  }
}