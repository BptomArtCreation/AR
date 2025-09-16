/**
 * 將當前相機畫面 + 疊加內容 合成到 canvas，並以分享或下載的方式保存。
 * 注意：為避免 tainted canvas，請確保疊加圖片/影片與頁面同源或允許 CORS。
 */
import { computeCoveredVideoRect } from './util.js';

export async function captureAndSave({ video, overlayContainer, cameraContainer, captureCanvas }) {
  const cw = cameraContainer.clientWidth;
  const ch = cameraContainer.clientHeight;
  captureCanvas.width = cw;
  captureCanvas.height = ch;
  const ctx = captureCanvas.getContext('2d');

  // 1) 畫相機影像（依照 cover 映射）
  const rect = computeCoveredVideoRect(video, cameraContainer);
  ctx.drawImage(video, rect.left, rect.top, rect.width, rect.height);

  // 2) 畫疊加（若是圖片或影片）
  const img = overlayContainer.querySelector('#overlay-image');
  const vid = overlayContainer.querySelector('#overlay-video');
  const overlayRect = overlayContainer.getBoundingClientRect();
  const containerRect = cameraContainer.getBoundingClientRect();

  // 將 DOM 絕對定位轉換到 canvas 座標（此處 1:1，因 canvas 設為和容器相同大小）
  const ox = overlayRect.left - containerRect.left;
  const oy = overlayRect.top - containerRect.top;
  const ow = overlayRect.width;
  const oh = overlayRect.height;

  if (!img.classList.contains('hidden')) {
    ctx.drawImage(img, ox, oy, ow, oh);
  } else {
    // 畫 overlay 影片當前幀
    try {
      ctx.drawImage(vid, ox, oy, ow, oh);
    } catch (e) {
      // 某些瀏覽器可能阻擋，略過
    }
  }

  // 3) 可選：浮水印
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "12px system-ui, -apple-system, Roboto, sans-serif";
  ctx.fillText("Made with AR Overlay", 10, ch - 12);

  // 4) 導出並保存
  const blob = await new Promise(res => captureCanvas.toBlob(res, 'image/png', 0.92));
  const file = new File([blob], `snapshot-${Date.now()}.png`, { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'AR Overlay Snapshot',
        text: '來自我的 AR 截圖'
      });
      return;
    } catch (e) {
      // 使用者取消或分享失敗，退回下載
    }
  }

  // 回退：自動下載（Android/桌面直接下載；iOS 可能開新頁，再長按保存）
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}