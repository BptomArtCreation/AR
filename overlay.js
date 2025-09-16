import { computeCoveredVideoRect, lerp, clamp } from './util.js';

/**
 * 控制疊加內容（圖片/影片）的定位與顯示：
 * - 依偵測到的 xNormalized，計算在視圖中的精準像素位置（考慮 cover 裁切）
 * - 用平滑插值降低抖動
 */
export class AROverlay {
  constructor({ container, video, overlayEl }) {
    this.host = container;      // #camera-container
    this.video = video;         // <video id="camera">
    this.overlay = overlayEl;   // #overlay-container
    this.currentX = 0.5;        // 目前 xNormalized
    this.smoothness = 0.15;     // 平滑係數（越小越平穩）
  }

  setContent(type) {
    const img = this.overlay.querySelector('#overlay-image');
    const vid = this.overlay.querySelector('#overlay-video');
    if (type === 'image') {
      img.classList.remove('hidden');
      vid.classList.add('hidden');
      try { vid.pause(); } catch (e) {}
    } else {
      vid.classList.remove('hidden');
      img.classList.add('hidden');
      try { vid.play().catch(()=>{}); } catch (e) {}
    }
  }

  updateAnchor(xNorm, immediate = false) {
    xNorm = clamp(xNorm, 0, 1);
    if (immediate) this.currentX = xNorm;
    else this.currentX = lerp(this.currentX, xNorm, this.smoothness);

    // 計算 video 在容器中的顯示矩形（object-fit: cover）
    const rect = computeCoveredVideoRect(this.video, this.host);
    const xPx = rect.left + rect.width * this.currentX;

    // 垂直固定在視圖中線（也可改成偵測或裝置姿態驅動）
    const yPx = this.host.clientHeight * 0.5;

    // 透過 translate(-50%,-50%) 已將 overlay 原點置中，這裡只需設定 left/top
    this.overlay.style.left = `${xPx}px`;
    this.overlay.style.top = `${yPx}px`;
  }
}