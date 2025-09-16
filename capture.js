import { computeCoveredVideoRect } from './util.js';

/**
 * 合成相機畫面與疊加元素到 canvas，並保存/分享
 * 注意：疊加圖片/影片需同源或允許 CORS，避免 tainted canvas
 */
export async function captureAndSave({ video, overlayContainer, cameraContainer, captureCanvas }) {
  const cw = cameraContainer.clientWidth;
  const ch = cameraContainer.clientHeight;
  captureCanvas.width = cw;
  captureCanvas.height = ch;
  const ctx = captureCanvas.getContext('2d');

  // 1) 畫相機影像（依 cover 映射）
  const rect = computeCoveredVideoRect(video, cameraContainer);
  ctx.drawImage(video, rect.left, rect.top, rect.width, rect.height);

  // 2) 畫疊加
  const img = overlayContainer.querySelector('#overlay-image');
  const vid = overlayContainer.querySelector('#overlay-video');
  const overlayRect = overlayContainer.getBoundingClientRect();
  const containerRect = cameraContainer.getBoundingClientRect();
  const ox = overlayRect.left - containerRect.left;
  const oy = overlayRect.top - containerRect.top;
  const ow = overlayRect.width;
  const oh = overlayRect.height;

  if (!img.classList.contains('hidden')) {
    ctx.drawImage(img, ox, oy, ow, oh);
  } else {
    try { ctx.drawImage(vid, ox, oy, ow, oh); } catch {}
  }

  // 3) 浮水印
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "12px system-ui, -apple-system, Roboto, sans-serif";
  ctx.fillText("Made with AR Overlay", 10, ch - 12);

  // 4) 輸出
  const blob = await new Promise(res => captureCanvas.toBlob(res, 'image/png', 0.92));
  const file = new File([blob], `snapshot-${Date.now()}.png`, { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'AR Overlay Snapshot', text: '來自我的 AR 截圖' });
      return;
    } catch {}
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}