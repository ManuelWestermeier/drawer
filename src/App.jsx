import React, { useEffect, useRef, useState } from "react";

// CleanEditableCanvas.jsx
// Rebuilt from scratch with a cleaner UI and robust pan/zoom/scroll behavior.
// Features:
// - Responsive left inspector / right canvas layout
// - Pointer events with pointer capture for reliable dragging
// - Wheel: scroll (pan) when no modifier, zoom when ctrl/meta is held
// - Spacebar to temporarily enable panning while held
// - Accurate zoom centered at cursor
// - High-DPI canvas handling
// - Add / select / move / delete shapes (box, circle, polygon)
// - Inspector with color & numeric controls

const makeId = (() => {
  let i = 1;
  return () => i++;
})();

const initialComps = [
  { id: makeId(), type: "box", data: { x: 1, y: 1, w: 4, h: 4 }, style: { fill: "#8fbcd4", stroke: "#2b6b8a", strokeWidth: 2 } },
  { id: makeId(), type: "box", data: { x: 6, y: 4, w: 3, h: 4 }, style: { fill: "#d4b28f", stroke: "#8a5a2b", strokeWidth: 2 } },
];

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export default function CleanEditableCanvas() {
  const [comps, setComps] = useState(initialComps);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState("select"); // select | add-box | add-circle | add-poly | pan
  const [panZoom, setPanZoom] = useState({ x: 0, y: 0, zoom: 1 });
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });
  const [showGrid, setShowGrid] = useState(true);

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const draggingRef = useRef(null); // {type:'pan'|'move'|'point', pointerId, ...}
  const spaceDownRef = useRef(false);

  // compute unit (world unit -> pixels)
  function computeUnit(width, height, zoom) {
    const base = Math.min(width, height) / 100; // 100 world units fits in smaller dimension
    return base * zoom;
  }

  function screenToWorld(screenX, screenY) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;
    const unit = computeUnit(cw, ch, panZoom.zoom);
    return { x: (screenX - rect.left - panZoom.x) / unit, y: (screenY - rect.top - panZoom.y) / unit };
  }

  function worldToScreen({ x, y }) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const unit = computeUnit(rect.width, rect.height, panZoom.zoom);
    return { x: x * unit + panZoom.x + rect.left, y: y * unit + panZoom.y + rect.top };
  }

  // responsive sizing
  useEffect(() => {
    function resize() {
      const w = Math.max(480, window.innerWidth - 300);
      const h = window.innerHeight;
      setCanvasSize({ w, h });
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // size for high DPI
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.w * dpr;
    canvas.height = canvasSize.h * dpr;
    canvas.style.width = canvasSize.w + "px";
    canvas.style.height = canvasSize.h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // clear
    ctx.clearRect(0, 0, canvasSize.w, canvasSize.h);

    // background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);

    // grid
    if (showGrid) drawGrid(ctx, canvasSize.w, canvasSize.h, panZoom);

    // comps
    for (const c of comps) drawComp(ctx, c, panZoom, canvasSize, selected === c.id);

    // selection overlay
    const sel = comps.find((s) => s.id === selected);
    if (sel) drawSelection(ctx, sel, panZoom, canvasSize);
  }, [comps, selected, panZoom, canvasSize, showGrid]);

  function drawGrid(ctx, w, h, panZoom) {
    const unit = computeUnit(w, h, panZoom.zoom);
    const stepPx = unit;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#efefef";
    ctx.beginPath();
    // vertical
    const startX = ((panZoom.x % stepPx) - stepPx);
    for (let x = startX; x < w; x += stepPx) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    // horizontal
    const startY = ((panZoom.y % stepPx) - stepPx);
    for (let y = startY; y < h; y += stepPx) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawComp(ctx, c, panZoom, canvasSize, isSelected) {
    ctx.save();
    const rect = canvasRef.current.getBoundingClientRect();
    const unit = computeUnit(rect.width, rect.height, panZoom.zoom);
    const style = Object.assign({ fill: "#ddd", stroke: "#222", strokeWidth: 1 }, c.style || {});
    ctx.fillStyle = style.fill;
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.strokeWidth;

    if (c.type === "box") {
      const x = c.data.x * unit + panZoom.x;
      const y = c.data.y * unit + panZoom.y;
      const w = c.data.w * unit;
      const h = c.data.h * unit;
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();
    } else if (c.type === "circle") {
      const cx = c.data.x * unit + panZoom.x;
      const cy = c.data.y * unit + panZoom.y;
      const r = (c.data.r || 1) * unit;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (c.type === "poly" || c.type === "mesh") {
      if (!Array.isArray(c.data.points) || c.data.points.length === 0) return;
      ctx.beginPath();
      for (let i = 0; i < c.data.points.length; i++) {
        const p = c.data.points[i];
        const sx = p.x * unit + panZoom.x;
        const sy = p.y * unit + panZoom.y;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      if (c.data.closed) ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // subtle selection tint
    if (isSelected) {
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#ffb366";
      if (c.type === "box") {
        const x = c.data.x * unit + panZoom.x;
        const y = c.data.y * unit + panZoom.y;
        const w = c.data.w * unit;
        const h = c.data.h * unit;
        ctx.fillRect(x, y, w, h);
      }
      ctx.restore();
    }

    ctx.restore();
  }

  function drawSelection(ctx, sel, panZoom) {
    ctx.save();
    const rect = canvasRef.current.getBoundingClientRect();
    const unit = computeUnit(rect.width, rect.height, panZoom.zoom);
    ctx.strokeStyle = "#ff8800";
    ctx.lineWidth = 1.5;
    ctx.fillStyle = "#fff";

    if (sel.type === "box") {
      const x = sel.data.x * unit + panZoom.x;
      const y = sel.data.y * unit + panZoom.y;
      const w = sel.data.w * unit;
      const h = sel.data.h * unit;
      ctx.strokeRect(x, y, w, h);
      const hs = 7;
      const handles = [
        [x, y], [x + w / 2, y], [x + w, y],
        [x, y + h / 2], [x + w, y + h / 2],
        [x, y + h], [x + w / 2, y + h], [x + w, y + h]
      ];
      for (const [hx, hy] of handles) {
        ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
        ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
      }
    } else if (sel.type === "circle") {
      const cx = sel.data.x * unit + panZoom.x;
      const cy = sel.data.y * unit + panZoom.y;
      const r = (sel.data.r || 1) * unit;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillRect(cx - 6, cy - 6, 12, 12);
    } else if (sel.type === "poly" || sel.type === "mesh") {
      for (const p of sel.data.points) {
        const sx = p.x * unit + panZoom.x;
        const sy = p.y * unit + panZoom.y;
        ctx.fillRect(sx - 5, sy - 5, 10, 10);
        ctx.strokeRect(sx - 5, sy - 5, 10, 10);
      }
    }

    ctx.restore();
  }

  // hit testing in world coords
  function hitTest(c, world) {
    if (c.type === "box") {
      return world.x >= c.data.x && world.x <= c.data.x + (c.data.w || 0) && world.y >= c.data.y && world.y <= c.data.y + (c.data.h || 0);
    } else if (c.type === "circle") {
      const dx = world.x - c.data.x;
      const dy = world.y - c.data.y;
      const r = c.data.r || 1;
      return dx * dx + dy * dy <= r * r;
    } else if (c.type === "poly" || c.type === "mesh") {
      const pts = c.data.points || [];
      if (pts.length < 3) return false;
      return pointInPolygon(world, pts);
    }
    return false;
  }

  function pointInPolygon(point, vs) {
    let x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i].x, yi = vs[i].y;
      const xj = vs[j].x, yj = vs[j].y;
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // pointer handlers (use pointer events for robust capture)
  function onPointerDown(e) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX;
    const screenY = e.clientY;
    const world = screenToWorld(screenX, screenY);

    // decide action
    let action = null;

    if (e.button === 1 || e.ctrlKey || spaceDownRef.current || mode === "pan") {
      action = { type: 'pan', startX: e.clientX, startY: e.clientY, orig: { ...panZoom } };
    } else if (mode === 'add-box') {
      const newC = { id: makeId(), type: 'box', data: { x: Math.round(world.x), y: Math.round(world.y), w: 2, h: 2 }, style: { fill: '#cfe8d4', stroke: '#2b8a5a', strokeWidth: 2 } };
      setComps(s => [...s, newC]);
      setSelected(newC.id);
      action = { type: 'move', compId: newC.id, startWorld: world, origData: JSON.parse(JSON.stringify(newC.data)) };
    } else if (mode === 'add-circle') {
      const newC = { id: makeId(), type: 'circle', data: { x: world.x, y: world.y, r: 1 }, style: { fill: '#f5d0c5', stroke: '#8a3b2b', strokeWidth: 2 } };
      setComps(s => [...s, newC]);
      setSelected(newC.id);
      action = { type: 'move', compId: newC.id, startWorld: world, origData: JSON.parse(JSON.stringify(newC.data)) };
    } else {
      // hit test top to bottom
      let hit = null;
      for (let i = comps.length - 1; i >= 0; i--) {
        const c = comps[i];
        if (hitTest(c, world)) { hit = c; break; }
      }
      if (hit) {
        setSelected(hit.id);
        action = { type: 'move', compId: hit.id, startWorld: world, origData: JSON.parse(JSON.stringify(hit.data)) };
      } else {
        setSelected(null);
      }
    }

    if (action) {
      draggingRef.current = { ...action, pointerId: e.pointerId };
      (e.target || canvas).setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e) {
    const ds = draggingRef.current;
    if (!ds) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const screenX = e.clientX;
    const screenY = e.clientY;
    const world = screenToWorld(screenX, screenY);

    if (ds.type === 'pan') {
      const dx = e.clientX - ds.startX;
      const dy = e.clientY - ds.startY;
      setPanZoom(p => ({ ...p, x: ds.orig.x + dx, y: ds.orig.y + dy }));
    } else if (ds.type === 'move') {
      setComps((s) => s.map((c) => {
        if (c.id !== ds.compId) return c;
        const nc = { ...c };
        if (c.type === 'box') {
          const dx = world.x - ds.startWorld.x;
          const dy = world.y - ds.startWorld.y;
          nc.data = { ...ds.origData, x: ds.origData.x + dx, y: ds.origData.y + dy };
        } else if (c.type === 'circle') {
          const dx = world.x - ds.startWorld.x;
          const dy = world.y - ds.startWorld.y;
          nc.data = { ...ds.origData, x: ds.origData.x + dx, y: ds.origData.y + dy };
        } else if (c.type === 'poly' || c.type === 'mesh') {
          // move whole poly
          const dx = world.x - ds.startWorld.x;
          const dy = world.y - ds.startWorld.y;
          nc.data = { ...c.data, points: c.data.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
          ds.startWorld = world; // incremental
        }
        return nc;
      }));
    }
  }

  function onPointerUp(e) {
    const canvas = canvasRef.current;
    try { if (canvas) canvas.releasePointerCapture(e.pointerId); } catch (err) { }
    draggingRef.current = null;
  }

  function onWheel(e) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const isOverCanvas = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!isOverCanvas) return; // allow page scroll elsewhere

    e.preventDefault();

    // if ctrl/meta pressed => zoom at cursor
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setPanZoom((p) => {
        const before = screenToWorld(e.clientX, e.clientY);
        const newZoom = clamp(p.zoom * factor, 0.05, 20);
        const unitOld = computeUnit(rect.width, rect.height, p.zoom);
        const unitNew = computeUnit(rect.width, rect.height, newZoom);
        // screen coords of world point before and after
        const sxOld = before.x * unitOld + p.x;
        const syOld = before.y * unitOld + p.y;
        const sxNew = before.x * unitNew + p.x;
        const syNew = before.y * unitNew + p.y;
        const dx = sxOld - sxNew;
        const dy = syOld - syNew;
        return { x: p.x + dx, y: p.y + dy, zoom: newZoom };
      });
    } else {
      // normal wheel -> pan vertically, shift -> pan horizontally
      const dx = e.shiftKey ? -e.deltaY : -e.deltaX;
      const dy = -e.deltaY;
      setPanZoom(p => ({ ...p, x: p.x + dx, y: p.y + dy }));
    }
  }

  // keyboard
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === ' ') { spaceDownRef.current = true; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        setComps(s => s.filter(c => c.id !== selected));
        setSelected(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === '0') {
        // reset view
        setPanZoom({ x: 0, y: 0, zoom: 1 });
      }
    }
    function onKeyUp(e) { if (e.key === ' ') spaceDownRef.current = false; }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, [selected]);

  // helpers for UI
  function addBox() { setMode('add-box'); }
  function addCircle() { setMode('add-circle'); }
  function addPoly() { setMode('add-poly'); }
  function setSelect() { setMode('select'); }
  function resetView() { setPanZoom({ x: 0, y: 0, zoom: 1 }); }

  function updateSelected(partial) {
    if (!selected) return;
    setComps(s => s.map(c => c.id === selected ? { ...c, ...partial, data: { ...c.data, ...(partial.data || {}) }, style: { ...c.style, ...(partial.style || {}) } } : c));
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(comps, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'scene.json'; a.click(); URL.revokeObjectURL(url);
  }

  function importJSON(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!Array.isArray(data)) throw new Error('invalid');
        setComps(data.map(c => ({ ...c, id: c.id || makeId() })));
      } catch (err) {
        alert('Invalid JSON');
      }
    };
    r.readAsText(f);
  }

  return (
    <div style={styles.app}>
      <style>{globalCss}</style>
      <div className="left" style={styles.left}>
        <div style={styles.panelHeader}>
          <strong>Editor</strong>
        </div>
        <div style={styles.toolbar}>
          <button onClick={addBox} className={mode === 'add-box' ? 'active' : ''}>Add Box</button>
          <button onClick={addCircle} className={mode === 'add-circle' ? 'active' : ''}>Add Circle</button>
          <button onClick={addPoly} className={mode === 'add-poly' ? 'active' : ''}>Add Poly</button>
          <button onClick={setSelect} className={mode === 'select' ? 'active' : ''}>Select</button>
        </div>

        <div style={styles.section}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => setShowGrid(s => !s)}>{showGrid ? 'Hide Grid' : 'Show Grid'}</button>
            <button onClick={resetView}>Reset View</button>
          </div>
        </div>

        <div style={styles.section}>
          <h4>Components</h4>
          <div style={styles.list}>
            {comps.map(c => (
              <div key={c.id} style={{ padding: 8, borderRadius: 6, border: c.id === selected ? '1px solid #ff8800' : '1px solid #ddd', marginBottom: 6, background: '#fff', cursor: 'pointer' }} onClick={() => setSelected(c.id)}>
                <div style={{ fontWeight: 600 }}>#{c.id} — {c.type}</div>
                <div style={{ fontSize: 12, color: '#444' }}>{JSON.stringify(c.data)}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.section}>
          <h4>Inspector</h4>
          {!selected ? <div style={{ color: '#666' }}>Select an object</div> : (() => {
            const sel = comps.find(x => x.id === selected);
            if (!sel) return <div style={{ color: '#666' }}>No selection</div>;
            return (
              <div>
                <div style={{ marginBottom: 8 }}>Type: {sel.type}</div>
                <div style={{ marginBottom: 8 }}>
                  <label>Fill</label>
                  <input type="color" value={sel.style?.fill || '#ffffff'} onChange={e => updateSelected({ style: { fill: e.target.value } })} />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label>Stroke</label>
                  <input type="color" value={sel.style?.stroke || '#000000'} onChange={e => updateSelected({ style: { stroke: e.target.value } })} />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label>Stroke width</label>
                  <input type="number" step="0.5" value={sel.style?.strokeWidth || 1} onChange={e => updateSelected({ style: { strokeWidth: parseFloat(e.target.value || '1') } })} />
                </div>
                <div>
                  <label>Raw data (JSON)</label>
                  <textarea rows={5} style={{ width: '100%' }} defaultValue={JSON.stringify(sel.data, null, 2)} onBlur={e => {
                    try { const d = JSON.parse(e.target.value); updateSelected({ data: d }); } catch (err) { /* ignore */ }
                  }} />
                </div>
                <div style={{ marginTop: 8 }}>
                  <button onClick={() => { setComps(s => s.filter(c => c.id !== selected)); setSelected(null); }}>Delete</button>
                </div>
              </div>
            );
          })()}
        </div>

        <div style={styles.section}>
          <h4>Import / Export</h4>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportJSON}>Export JSON</button>
            <label style={{ display: 'inline-block', padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', background: '#fff' }}>
              Import
              <input type="file" accept="application/json" onChange={importJSON} style={{ display: 'none' }} />
            </label>
          </div>
        </div>

        <div style={{ padding: 12, fontSize: 12, color: '#666' }}>
          Shortcuts: Space = pan while held · Mouse wheel = pan · Ctrl + wheel = zoom · Delete = remove selection
        </div>
      </div>

      <div ref={containerRef} className="right" style={styles.right}>
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', background: '#fff' }}
        />
      </div>
    </div>
  );
}

// Embedded CSS (keeps the component self-contained). You can move this into a .css file.
const globalCss = `
*{ margin:0; padding:0; box-sizing:border-box; }
html,body,#root{ height:100%; }
.left{ float:left; width:300px; background:#f5f6f7; height:100dvh; overflow:auto; }
.right{ float:right; width:calc(100dvw - 300px); height:100dvh; }
button{ padding:6px 8px; border-radius:6px; border:1px solid #ddd; background:#fff; cursor:pointer; }
button.active{ background:#ffefdc; border-color:#ffcc99; }
`;

const styles = {
  app: { width: '100vw', height: '100vh', display: 'flex', fontFamily: 'Inter, Arial, sans-serif' },
  left: { width: 300, padding: 12, borderRight: '1px solid #e6e6e6', overflowY: 'auto', background: '#eaeef0' },
  right: { flex: 1, position: 'relative', overflow: 'hidden' },
  panelHeader: { paddingBottom: 8, borderBottom: '1px solid #ddd', marginBottom: 12 },
  toolbar: { display: 'flex', gap: 8, marginBottom: 12 },
  section: { marginTop: 12, padding: 8, background: '#fff', borderRadius: 8, border: '1px solid #eee' },
  list: { maxHeight: 240, overflow: 'auto', padding: 6 },
};
