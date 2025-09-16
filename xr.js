/**
 * WebXR AR 擴充（預留）：
 * - 若瀏覽器支援 immersive-ar，初始化 XRSession 與 hit-test 來放置 3D 內容
 * - 回退方案：可集成 AR.js（marker-based）做跨瀏覽器 AR
 * 本檔僅提供檢查與占位，避免阻礙主流程
 */

export async function tryInitXR() {
  if (!('xr' in navigator)) {
    alert('此裝置/瀏覽器尚未支援 WebXR，之後可改用 AR.js 做備援。');
    return;
  }
  const supported = await navigator.xr.isSessionSupported?.('immersive-ar');
  if (!supported) {
    alert('未支援 immersive-ar。可等待瀏覽器更新或啟用實驗旗標。');
    return;
  }
  alert('可在此處初始化 Three.js + WebXR AR（hit-test），本範例暫留接口。');
}