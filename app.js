import { HorizontalColorDetector } from './detector.js';
import { AROverlay } from './overlay.js';
import { captureAndSave } from './capture.js';

const els = {
  startScreen: document.getElementById('start-screen'),
  cameraScreen: document.getElementById('camera-screen'),
  btnStart: document.getElementById('btn-start'),
  btnCapture: document.getElementById('btn-capture'),
  btnArjs: document.getElementById('btn-arjs'),
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
  statusTip: document.getElementById('status-tip'),
  statusText: document.getElementById('status-text'),
};

let mediaStream = null;
let detectionOn = true;
let useImage = true;
let overlayCtrl = null;
let detector = null;
let detectionRAF = 0;
let hasTorch = false;
let torchOn = false;

let detState = 'searching';
let lostCount = 0;

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function setStatus(text, type = 'info') {
  if (!els.statusTip) return;
  els.statusText.textContent = text;
  els.statusTip.classList.remove('hidden', 'info', 'success', 'warn', 'error');
  els.statusTip.classList.add(type);
}

async function startCamera() {
  // 關閉舊串流
  try { mediaStream?.getTracks().forEach(t => t.stop()); } catch {}

  // 1) 優先強制後置鏡頭
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { exact: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
  } catch (e1) {
    // 2) 先拿權限 → enumerate 找後置鏡頭
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter(d => d.kind === 'videoinput');
      const back = cams.find(d => /back|rear|environment/i.test(d.label)) || cams[cams.length - 1];
      if (back) {
        tmp.getTracks().forEach(t => t.stop());
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { deviceId: { exact: back.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
      } else {
        mediaStream = tmp;
      }
    } catch (e2) {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
  }

  els.video.srcObject = mediaStream;
  await els.video.play().catch(()=>{});
  els.video.style.transform = 'none'; // 確保無鏡像

  // Torch 能力檢查
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
  // PWA service worker（相對路徑，適配 GitHub Pages）
  if ('serviceWorker' in navigator) {
    try { navigator.serviceWorker.register('./sw.js', { scope: './' }); } catch {}
  }

  overlayCtrl = new AROverlay({
    container: els.cameraContainer,
    video: els.video,
    overlayEl: els.overlayContainer,
  });
  overlayCtrl.setContent('image');

  detector = new HorizontalColorDetector({
    targetH: 190, hTol: 18, minS: 0.35, minV: 0.35,
    rowY: 0.5, procW: 240, minRun: 8
  });
  detector.attach(els.video, els.procCanvas);

  els.btnStart.addEventListener('click', async () => {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try { await DeviceMotionEvent.requestPermission(); } catch {}
    }
    await startCamera();

    hide(els.startScreen);
    show(els.cameraScreen);

    await new Promise(r => {
      if (els.video.readyState >= 2) return r();
      els.video.onloadedmetadata = () => r();
      els.video.oncanplay = () => r();
    });

    setStatus('左右移動手機，尋找指定顏色的水平位置（或改用下方 AR.js 模式）', 'info');
    startDetectionLoop();
  });

  els.btnSwitchContent.addEventListener('click', () => {
    useImage = !useImage;
    overlayCtrl.setContent(useImage ? 'image' : 'video');
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

  if (els.btnArjs) {
    els.btnArjs.addEventListener('click', () => {
      window.location.href = 'arjs.html';
    });
  }

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
      setStatus('已偵測到目標，微調手機以穩定對齊（或改用 AR.js 模式）', 'success');
      detState = 'locked';
    }
    lostCount = 0;
  } else {
    overlayCtrl.updateAnchor(0.5, false);
    if (detState === 'locked') {
      lostCount++;
      if (lostCount > 10) {
        setStatus('目標暫時丟失，請略為左右移動；建議改用 AR.js 模式更穩', 'warn');
        detState = 'lost';
      }
    } else if (detState !== 'searching') {
      setStatus('左右移動手機，尋找指定顏色的水平位置（或改用 AR.js 模式）', 'info');
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