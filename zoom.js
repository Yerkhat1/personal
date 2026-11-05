// Pinch / ctrl+wheel zoom: re-flows the page instead of the browser's stuck pan-zoom.
(function () {
  const KEY = 'set3.zoom';
  let z = 1, start = 1, btn;
  try { z = +localStorage.getItem(KEY) || 1; } catch (e) {}
  function apply() {
    z = Math.min(2, Math.max(0.6, Math.round(z * 100) / 100));
    if (Math.abs(z - 1) < 0.03) z = 1;
    document.documentElement.style.zoom = z;
    try { localStorage.setItem(KEY, z); } catch (e) {}
    if (!btn && document.body) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.title = 'Reset zoom';
      btn.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:50;font:13px system-ui,sans-serif;padding:5px 10px;border:1px solid #8f959e;border-radius:4px;background:#fff;color:#1d2125;cursor:pointer';
      btn.onclick = () => { z = 1; apply(); };
      document.body.appendChild(btn);
    }
    if (btn) { btn.textContent = Math.round(z * 100) + '% · reset'; btn.style.display = z === 1 ? 'none' : 'block'; btn.style.zoom = 1 / z; }
  }
  addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); z *= Math.exp(-e.deltaY * 0.01); apply(); }, { passive: false });
  addEventListener('gesturestart', e => { e.preventDefault(); start = z; });
  addEventListener('gesturechange', e => { e.preventDefault(); z = start * e.scale; apply(); });
  addEventListener('gestureend', e => e.preventDefault());
  addEventListener('keydown', e => { if (e.key === 'Escape' && z !== 1) { z = 1; apply(); } });
  if (document.body) apply(); else addEventListener('DOMContentLoaded', apply);
})();
