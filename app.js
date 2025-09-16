import { HorizontalColorDetector } from './detector.js';
import { AROverlay } from './overlay.js';
import { captureAndSave } from './capture.js';
import { wait } from './util.js';
import { isWebXRARSupported, startWebXRAR } from './xr.js';

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
  // 新增：狀態提示
  statusTip: document.getElementById('status-tip'),
  statusText: document.getElementById('status-text'),
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

// 新增：偵測狀態機
let detState = 'searching'; // 'searching' | 'locked' | 'lost'
let lostCount = 0;

// 新增：XR 會話控制
let xrSessionEnd = null;

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

// 新增：提示列
function setStatus(text, type = 'info') {
  if (!els.statusTip) return;
  els.statusText.textContent = text;
  els.statusTip.classList.remove('hidden', 'info', 'success', 'warn', 'error');
  els.statusTip.classList.add(type);
}

async function startCamera() {
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

    setStatus('左右移動手機，尋找指定顏色的水平位置', 'info');
    startDetectionLoop();
  });

  els.btnSwitchContent.addEventListener('click', () => {
    useImage = !useImage;
    overlayCtrl.setContent(useImage ? 'image' : 'video');
    // 保持相同按鈕文案即可
  });

  els.btnCapture.addEventListener('click', async () => {
    flashScreen();
    await captureAndSave({
      video: els.video,
      overlayContainer: els.overlayContainer,
      cameraContainer: els.cameraContainer,
      captureCanvas: els.captureCanvas
    });
    setStatus('已保存或已開啟分享面板', 'success');
  });

  // 新增：XR 平面鎖定模式
  els.btnXR.addEventListener('click', async () => {
    // 若已在 XR 模式 → 退出
    if (xrSessionEnd) {
      try { xrSessionEnd(); } catch {}
      xrSessionEnd = null;
      els.btnXR.textContent = 'XR(測試)';

      // 顯示一般模式 UI
      show(els.overlayContainer);
      show(document.getElementById('scan-line'));

      // 回復一般相機模式
      await startCamera();
      await new Promise(r => {
        if (els.video.readyState >= 2) return r();
        els.video.onloadedmetadata = () => r();
        els.video.oncanplay = () => r();
      });
      setStatus('返回一般模式，繼續顏色/水平位置偵測', 'info');
      startDetectionLoop();
      return;
    }

    // 啟動 XR 前先關閉一般相機，避免衝突
    stopCamera();

    // 檢查支援
    if (!(await isWebXRARSupported())) {
      setStatus('此裝置/瀏覽器未支援 WebXR AR（建議 Android Chrome）', 'error');
      return;
    }

    try {
      // 進 XR 前隱藏 2D 覆蓋物與掃描線
      hide(els.overlayContainer);
      hide(document.getElementById('scan-line'));

      const { end } = await startWebXRAR({
        root: els.cameraContainer,
        overlayImageUrl: 'assets/overlay.png',
        onStatus: (t, type) => setStatus(t, type)
      });
      xrSessionEnd = end;
      els.btnXR.textContent = '退出AR';
    } catch (e) {
      console.error(e);
      setStatus('啟動 AR 平面模式失敗', 'error');
      // 回復一般相機
      await startCamera();
      startDetectionLoop();
    }
  });

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
    runDetectionStep();
    detectionRAF = requestAnimationFrame(tick);
  };

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

    if (detState !== 'locked') {
      setStatus('已偵測到目標，微調手機以穩定對齊', 'success');
      detState = 'locked';
    }
    lostCount = 0;
  } else {
    overlayCtrl.updateAnchor(0.5, false);

    if (detState === 'locked') {
      lostCount++;
      if (lostCount > 10) {
        setStatus('目標暫時丟失，請略為左右移動', 'warn');
        detState = 'lost';
      }
    } else if (detState !== 'searching') {
      setStatus('左右移動手機，尋找指定顏色的水平位置', 'info');
      detState = 'searching';
    }
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