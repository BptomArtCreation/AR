import { HorizontalColorDetector } from './detector.js';
import { AROverlay } from './overlay.js';
import { captureAndSave } from './capture.js';
import { wait } from './util.js';
import { tryInitXR } from './xr.js';

const els = {
  startScreen: document.getElementById('start-screen'),
  cameraScreen: document.getElementById('camera-screen'),
  btnStart: document.getElementById('btn-start'),
  btnCapture: document.getElementById('btn-capture'),
  btnXR: document.getElementById('btn-xr'),
  btnSwitchContent: document.getElementById('btn-switch-content'),
  btnTorch: document.getElementById('btn-torch'),
  btnSettings: document.getElementById('btn-settings'),
  cameraContainer: document.getElementById('camera-container'),
  video: document.getElementById('camera'),
  overlayContainer: document.getElementById('overlay-container'),
  overlayImage: document.getElementById('overlay-image'),
  overlayVideo: document.getElementById('overlay-video'),
  procCanvas: document.getElementById('proc-canvas'),
  captureCanvas: document.getElementById('capture-canvas'),
};

// 狀態
let mediaStream = null;
let detectionOn = true;
let useImage = true; // true: 圖片疊加, false: 影片疊加
let overlayCtrl = null;
let detector = null;
let detectionRAF = 0;
let hasTorch = false;
let torchOn = false;

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

async function startCamera() {
  // 某些 iOS 需要使用者手勢後啟動，且需 https 或 localhost
  const constraints = {
    audio: false,
    video: {
      facingMode: { ideal: 'environment' }, // 後置鏡頭
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (e) {
    // 回退：不強制 environment
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }

  els.video.srcObject = mediaStream;
  await els.video.play().catch(()=>{});

  // Torch 能力檢查（多數 Android 支援，iOS Safari 尚不支援）
  const track = mediaStream.getVideoTracks?.()[0];
  const cap = track?.getCapabilities?.() || {};
  hasTorch = !!cap.torch;
  els.btnTorch.style.opacity = hasTorch ? 1 : 0.35;
  els.btnTorch.title = hasTorch ? '手電筒' : '手電筒（不支援）';
}

function stopCamera() {
  try {
    detectionOn = false;
    cancelAnimationFrame(detectionRAF);
  } catch {}
  try {
    mediaStream?.getTracks().forEach(t => t.stop());
  } catch {}
  mediaStream = null;
}

async function init() {
  // PWA service worker（可選）
  if ('serviceWorker' in navigator) {
    try { navigator.serviceWorker.register('/sw.js'); } catch {}
  }

  overlayCtrl = new AROverlay({
    container: els.cameraContainer,
    video: els.video,
    overlayEl: els.overlayContainer,
  });
  overlayCtrl.setContent('image');

  detector = new HorizontalColorDetector({
    // 你可以在這裡換成想追蹤的顏色（例如紅色 targetH: 0）
    targetH: 190, // 接近青色
    hTol: 18,
    minS: 0.35,
    minV: 0.35,
    rowY: 0.5,
    procW: 240,
    minRun: 8
  });
  detector.attach(els.video, els.procCanvas);

  // UI 綁定
  els.btnStart.addEventListener('click', async () => {
    // iOS 裝置方向權限（如後續要用 DeviceMotion 做擬真穩定）
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try { await DeviceMotionEvent.requestPermission(); } catch {}
    }

    await startCamera();

    hide(els.startScreen);
    show(els.cameraScreen);

    // 某些瀏覽器 videoWidth 需要 canplay 後才有
    await new Promise(r => {
      if (els.video.readyState >= 2) return r();
      els.video.onloadedmetadata = () => r();
      els.video.oncanplay = () => r();
    });

    startDetectionLoop();
  });

  els.btnSwitchContent.addEventListener('click', () => {
    useImage = !useImage;
    overlayCtrl.setContent(useImage ? 'image' : 'video');
    els.btnSwitchContent.textContent = useImage ? '切換疊加（圖/影片）' : '切換疊加（圖/影片）';
  });

  els.btnCapture.addEventListener('click', async () => {
    // 小閃光動畫
    flashScreen();
    await captureAndSave({
      video: els.video,
      overlayContainer: els.overlayContainer,
      cameraContainer: els.cameraContainer,
      captureCanvas: els.captureCanvas
    });
  });

  els.btnXR.addEventListener('click', () => tryInitXR());

  els.btnTorch.addEventListener('click', async () => {
    if (!hasTorch) return;
    torchOn = !torchOn;
    try {
      const track = mediaStream.getVideoTracks()[0];
      await track.applyConstraints({ advanced: [{ torch: torchOn }] });
      els.btnTorch.style.background = torchOn ? 'rgba(255, 255, 150, 0.25)' : '';
    } catch (e) {
      torchOn = false;
      alert('手電筒切換失敗或不支援');
    }
  });

  // 離開頁面時釋放相機
  window.addEventListener('pagehide', stopCamera);
  window.addEventListener('beforeunload', stopCamera);
}

function startDetectionLoop() {
  detectionOn = true;

  const tick = () => {
    if (!detectionOn) return;
    // 使用 requestVideoFrameCallback 可拿到更準確時間點
    runDetectionStep();
    detectionRAF = requestAnimationFrame(tick);
  };

  // 若支援 requestVideoFrameCallback，使用之（更節能且對齊影格）
  const rvfc = els.video.requestVideoFrameCallback?.bind(els.video);
  if (rvfc) {
    const loop = () => {
      if (!detectionOn) return;
      runDetectionStep();
      rvfc(loop);
    };
    rvfc(loop);
  } else {
    tick();
  }
}

function runDetectionStep() {
  const result = detector.detect();
  if (result) {
    overlayCtrl.updateAnchor(result.xNorm, false);
  } else {
    // 找不到則緩慢回中心
    overlayCtrl.updateAnchor(0.5, false);
  }
}

function flashScreen() {
  const el = document.createElement('div');
  el.style.position = 'fixed';
  el.style.inset = '0';
  el.style.background = 'white';
  el.style.opacity = '0';
  el.style.pointerEvents = 'none';
  el.style.transition = 'opacity .15s ease';
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = '0.65';
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 150);
    }, 100);
  });
}

init();