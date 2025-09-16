import { rgbToHsv, clamp } from './util.js';

/**
 * 輕量水平掃描偵測器：
 * - 將相機影像縮放到小畫布（例如寬 240px）
 * - 在畫面中線（可配置）逐像素取樣，做顏色門檻偵測
 * - 找出連續符合門檻的最大區段，回傳該區段中心的 xNormalized (0..1)
 */
export class HorizontalColorDetector {
  constructor(options = {}) {
    // 目標顏色 HSV 與容忍度（預設找接近青色 #00e5ff）
    this.targetH = options.targetH ?? 190;       // 0..360
    this.hTol    = options.hTol ?? 18;           // 色相容忍度
    this.minS    = options.minS ?? 0.35;         // 最小飽和度
    this.minV    = options.minV ?? 0.35;         // 最小明度
    this.rowY    = options.rowY ?? 0.5;          // 掃描列的相對位置（0..1，0.5為中線）
    this.procW   = options.procW ?? 240;         // 下採樣寬度
    this.minRun  = options.minRun ?? 8;          // 視為有效段的最小連續像素數
    this.enabled = true;

    // 外部注入
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

    // 設定處理畫布尺寸
    if (this.procCanvas.width !== pw || this.procCanvas.height !== ph) {
      this.procCanvas.width = pw;
      this.procCanvas.height = ph;
    }

    // 將當前 frame 畫到小畫布
    this.procCtx.drawImage(this.video, 0, 0, pw, ph);

    // 擷取掃描列
    const y = clamp(Math.round(ph * this.rowY), 0, ph - 1);
    const imageData = this.procCtx.getImageData(0, y, pw, 1);
    const { data } = imageData;

    // 建立二值化遮罩：符合顏色條件 -> 1，否則 0
    const mask = new Uint8Array(pw);
    for (let x = 0; x < pw; x++) {
      const i = x * 4;
      const r = data[i], g = data[i+1], b = data[i+2];
      const { h, s, v } = rgbToHsv(r, g, b);

      // 色相環處理（靠近 0/360 時要考慮環繞）
      const dh = Math.min(Math.abs(h - this.targetH), 360 - Math.abs(h - this.targetH));
      const ok = (dh <= this.hTol) && (s >= this.minS) && (v >= this.minV);
      mask[x] = ok ? 1 : 0;
    }

    // 找最大連續段
    let bestLen = 0, bestStart = -1, currentLen = 0, currentStart = 0;
    for (let x = 0; x < pw; x++) {
      if (mask[x]) {
        if (currentLen === 0) currentStart = x;
        currentLen++;
      } else {
        if (currentLen > bestLen) {
          bestLen = currentLen;
          bestStart = currentStart;
        }
        currentLen = 0;
      }
    }
    // 收尾
    if (currentLen > bestLen) {
      bestLen = currentLen;
      bestStart = currentStart;
    }

    if (bestLen >= this.minRun) {
      const centerX = bestStart + bestLen / 2;
      const xNorm = centerX / pw; // 映射到 0..1
      return { xNorm, strength: bestLen / pw };
    }

    return null;
  }
}