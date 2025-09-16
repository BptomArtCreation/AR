// xr.js
// 使用 WebXR 平面偵測（Hit Test）把內容鎖定到實體平面上。
// 支援：Android Chrome。iOS Safari 尚未支援 WebXR（可用 AR.js 當備援，如需我可再補）。

import * as THREE from 'https://unpkg.com/three@0.164.1/build/three.module.js';

export async function isWebXRARSupported() {
  if (!('xr' in navigator)) return false;
  try {
    return await navigator.xr.isSessionSupported('immersive-ar');
  } catch {
    return false;
  }
}

/**
 * 啟動 AR 平面模式
 * @param {Object} opts
 * @param {HTMLElement} opts.root - 放置 renderer 的 DOM 容器（建議傳 #camera-container）
 * @param {string} opts.overlayImageUrl - 要貼到平面上的圖片 URL（預設用 overlay.png）
 * @param {(text: string, type?: 'info'|'success'|'warn'|'error') => void} opts.onStatus
 */
export async function startWebXRAR({ root, overlayImageUrl = 'assets/overlay.png', onStatus = () => {} }) {
  const supported = await isWebXRARSupported();
  if (!supported) throw new Error('WebXR immersive-ar 不支援');

  // 建立 Three.js Renderer
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(root.clientWidth, root.clientHeight);
  renderer.xr.enabled = true;
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.inset = '0';
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, root.clientWidth / root.clientHeight, 0.01, 20);

  // 光線
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight.position.set(1, 2, 1);
  scene.add(dirLight);

  // Reticle（掃描到平面才顯示）
  const reticleGeo = new THREE.RingGeometry(0.07, 0.09, 32);
  reticleGeo.rotateX(-Math.PI / 2);
  const reticleMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, side: THREE.DoubleSide });
  const reticle = new THREE.Mesh(reticleGeo, reticleMat);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // 啟動 WebXR 會話
  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['local-floor', 'dom-overlay', 'anchors'],
    domOverlay: { root: document.body } // 讓 HTML UI 疊在 AR 上
  });
  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(session);

  const refSpace = await session.requestReferenceSpace('local');
  const viewerSpace = await session.requestReferenceSpace('viewer');
  const hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

  // 點擊畫面即放置
  session.addEventListener('select', () => {
    if (!reticle.visible) return;

    const loader = new THREE.TextureLoader();
    loader.load(
      overlayImageUrl,
      (tex) => {
        tex.encoding = THREE.sRGBEncoding;
        const w = 0.32, h = 0.32; // 單位：公尺
        const geo = new THREE.PlaneGeometry(w, h);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
        const plane = new THREE.Mesh(geo, mat);
        plane.matrixAutoUpdate = false;
        plane.matrix.copy(reticle.matrix); // 鎖定到當前平面位置與姿態
        scene.add(plane);
        onStatus('已放置在平面上（再次點擊可放更多）', 'success');
      },
      undefined,
      () => onStatus('貼圖載入失敗', 'error')
    );
  });

  let placedOnce = false;

  const onResize = () => {
    renderer.setSize(root.clientWidth, root.clientHeight);
    camera.aspect = root.clientWidth / root.clientHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);

  renderer.setAnimationLoop((time, frame) => {
    if (!frame) return;

    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length > 0) {
      const hit = hits[0];
      const pose = hit.getPose(refSpace);
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
      if (!placedOnce) onStatus('找到平面，輕點螢幕放置', 'info');
    } else {
      reticle.visible = false;
      if (!placedOnce) onStatus('移動手機以掃描地面或桌面', 'warn');
    }

    renderer.render(scene, camera);
  });

  session.addEventListener('end', () => {
    renderer.setAnimationLoop(null);
    renderer.dispose();
    renderer.domElement.remove();
    window.removeEventListener('resize', onResize);
    onStatus('已退出 AR 平面模式', 'info');
  });

  onStatus('AR 平面模式啟動，移動手機以掃描平面', 'info');

  return {
    end: () => session.end()
  };
}