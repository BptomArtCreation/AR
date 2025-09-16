// 一些小工具函式

export const wait = (ms) => new Promise(r => setTimeout(r, ms));

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// 色彩轉換：RGB -> HSV (0..360, 0..1, 0..1)
export function rgbToHsv(r, g, b) {
  r/=255; g/=255; b/=255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, v = max;
  const d = max - min;
  s = max === 0 ? 0 : d / max;
  if (max === min) {
    h = 0;
  } else {
    switch(max){
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s, v };
}

// 取得容器內 video 以 object-fit: cover 顯示時的實際顯示矩形（用於映射座標）
export function computeCoveredVideoRect(video, container) {
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  const scale = Math.max(cw / vw, ch / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const left = (cw - dw) / 2;
  const top  = (ch - dh) / 2;
  return { left, top, width: dw, height: dh };
}