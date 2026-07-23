// charts3d.js — Three.js cube explorer. Uses the global THREE loaded from cdnjs
// (three.min.js r128). cdnjs does NOT host OrbitControls, so a small self-contained
// orbit controller is vendored below — the ONLY 3D dependency remains the Three CDN.
import { axisByKey } from "./axes.js";

const T = () => window.THREE; // resolved lazily after the CDN script loads

// ---------------------------------------------------------------------------
// Minimal orbit controller (rotate / pan / zoom + autorotate). Spherical camera.
// ---------------------------------------------------------------------------
class Orbit {
  constructor(camera, dom) {
    this.camera = camera; this.dom = dom;
    this.target = new (T().Vector3)(0, 0, 0);
    this.radius = 420; this.theta = 0.9; this.phi = 1.1; // azimuth / polar
    this.minR = 120; this.maxR = 1200;
    this.rotSpeed = 0.005; this.zoomSpeed = 0.0016; this.autoRotate = false; this.autoSpeed = 0.35;
    this.onChange = null;
    this._drag = null;
    this._bind();
    this.update();
  }
  _bind() {
    const d = this.dom;
    d.style.touchAction = "none";
    d.addEventListener("pointerdown", (e) => {
      d.setPointerCapture(e.pointerId);
      this._drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey };
    });
    d.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("pointermove", (e) => {
      if (!this._drag) return;
      const dx = e.clientX - this._drag.x, dy = e.clientY - this._drag.y;
      this._drag.x = e.clientX; this._drag.y = e.clientY;
      if (this._drag.pan) this._pan(dx, dy);
      else { this.theta -= dx * this.rotSpeed; this.phi -= dy * this.rotSpeed; this._clampPhi(); }
      this.update(); this._emit();
    });
    window.addEventListener("pointerup", () => { this._drag = null; });
    d.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.radius *= (1 + Math.sign(e.deltaY) * Math.abs(e.deltaY) * this.zoomSpeed);
      this.radius = Math.max(this.minR, Math.min(this.maxR, this.radius));
      this.update(); this._emit();
    }, { passive: false });
  }
  _clampPhi() { this.phi = Math.max(0.05, Math.min(Math.PI - 0.05, this.phi)); }
  _pan(dx, dy) {
    const scale = this.radius * 0.0018;
    const te = this.camera.matrix.elements;
    const right = new (T().Vector3)(te[0], te[1], te[2]);
    const up = new (T().Vector3)(te[4], te[5], te[6]);
    this.target.addScaledVector(right, -dx * scale);
    this.target.addScaledVector(up, dy * scale);
  }
  update() {
    const sinPhi = Math.sin(this.phi);
    const x = this.radius * sinPhi * Math.sin(this.theta);
    const y = this.radius * Math.cos(this.phi);
    const z = this.radius * sinPhi * Math.cos(this.theta);
    this.camera.position.set(this.target.x + x, this.target.y + y, this.target.z + z);
    this.camera.lookAt(this.target);
  }
  tick() { if (this.autoRotate && !this._drag) { this.theta += this.autoSpeed * 0.016; this.update(); } }
  _emit() { if (this.onChange) this.onChange(); }
  getState() {
    return { p: [round(this.camera.position.x), round(this.camera.position.y), round(this.camera.position.z)],
             t: [round(this.target.x), round(this.target.y), round(this.target.z)] };
  }
  setState(s) {
    if (!s || !s.p || !s.t) return;
    this.target.set(s.t[0], s.t[1], s.t[2]);
    const off = new (T().Vector3)(s.p[0] - s.t[0], s.p[1] - s.t[1], s.p[2] - s.t[2]);
    this.radius = Math.max(this.minR, Math.min(this.maxR, off.length()));
    this.phi = Math.acos(Math.max(-1, Math.min(1, off.y / (this.radius || 1))));
    this.theta = Math.atan2(off.x, off.z);
    this._clampPhi(); this.update();
  }
}
const round = (n) => Math.round(n);

// ---------------------------------------------------------------------------
// Text sprite (billboarded label)
// ---------------------------------------------------------------------------
function makeLabel(text, color = "#e7edf3", scale = 1) {
  const canvas = document.createElement("canvas");
  const pad = 8, font = 40;
  const ctx = canvas.getContext("2d");
  ctx.font = `bold ${font}px system-ui, sans-serif`;
  const w = ctx.measureText(text).width;
  canvas.width = w + pad * 2; canvas.height = font + pad * 2;
  ctx.font = `bold ${font}px system-ui, sans-serif`;
  ctx.fillStyle = color; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.fillText(text, pad, canvas.height / 2);
  const tex = new (T().CanvasTexture)(canvas);
  tex.minFilter = T().LinearFilter;
  const mat = new (T().SpriteMaterial)({ map: tex, transparent: true, depthTest: false });
  const sp = new (T().Sprite)(mat);
  const aspect = canvas.width / canvas.height;
  const h = 14 * scale;
  sp.scale.set(h * aspect, h, 1);
  sp.userData.isLabel = true;
  return sp;
}

function archColor(i, n) {
  const hue = (i / n) * 360;
  return `hsl(${hue}, 65%, 60%)`;
}

// ---------------------------------------------------------------------------
// Explorer
// ---------------------------------------------------------------------------
export function isWebGLAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch { return false; }
}

export function createExplorer(mount, opts) {
  const THREE = T();
  const vector = opts.vector || {};
  const archetypes = opts.archetypes || [];
  let trio = opts.trio.slice();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(getCssColor("--bg-elev", "#171c22"));
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 5000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  mount.innerHTML = "";
  mount.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(200, 300, 250); scene.add(dir);

  // cube wireframe -100..100
  const box = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(200, 200, 200)),
    new THREE.LineBasicMaterial({ color: 0x4da3ff, transparent: true, opacity: 0.35 }));
  scene.add(box);

  // grids on the three mid-planes
  const gridColor = new THREE.Color(getCssColor("--border", "#2a333d"));
  const mkGrid = () => {
    const g = new THREE.GridHelper(200, 8, gridColor, gridColor);
    g.material.transparent = true; g.material.opacity = 0.25;
    return g;
  };
  const gXZ = mkGrid();
  const gXY = mkGrid(); gXY.rotation.x = Math.PI / 2;
  const gYZ = mkGrid(); gYZ.rotation.z = Math.PI / 2;
  scene.add(gXZ, gXY, gYZ);

  // axis lines through origin
  const axisGroup = new THREE.Group(); scene.add(axisGroup);
  const AX_COLORS = [0xff8a5c, 0x5ad19a, 0x7c5cff];
  function mkAxisLine(color) {
    return new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-110, 0, 0), new THREE.Vector3(110, 0, 0)]),
      new THREE.LineBasicMaterial({ color }));
  }
  const axisLines = [mkAxisLine(AX_COLORS[0]), mkAxisLine(AX_COLORS[1]), mkAxisLine(AX_COLORS[2])];
  axisLines[1].rotation.z = Math.PI / 2;
  axisLines[2].rotation.y = Math.PI / 2;
  axisLines.forEach((l) => axisGroup.add(l));

  // pole labels (rebuilt on trio change)
  let labelGroup = new THREE.Group(); scene.add(labelGroup);
  function rebuildLabels() {
    scene.remove(labelGroup);
    labelGroup = new THREE.Group();
    const dirs = [
      [new THREE.Vector3(1, 0, 0), "#ff8a5c"],
      [new THREE.Vector3(0, 1, 0), "#5ad19a"],
      [new THREE.Vector3(0, 0, 1), "#7c5cff"],
    ];
    trio.forEach((key, i) => {
      const a = axisByKey(key);
      const [d, col] = dirs[i];
      const pos = makeLabel(`${a.label}: ${a.posLabel}`, col, 1.1);
      pos.position.copy(d.clone().multiplyScalar(120));
      const neg = makeLabel(a.negLabel, col, 1.0);
      neg.position.copy(d.clone().multiplyScalar(-120));
      labelGroup.add(pos, neg);
    });
    scene.add(labelGroup);
  }

  // user marker (glowing)
  const you = new THREE.Group();
  const youCore = new THREE.Mesh(
    new THREE.SphereGeometry(7, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0x4da3ff, emissive: 0x2f7fdc, emissiveIntensity: 0.9 }));
  const youHalo = new THREE.Mesh(
    new THREE.SphereGeometry(12, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0x4da3ff, transparent: true, opacity: 0.22 }));
  you.add(youHalo, youCore);
  const youLabel = makeLabel("You", "#e7edf3", 1.2); youLabel.position.set(0, 16, 0);
  you.add(youLabel);
  scene.add(you);

  // archetype markers
  const archObjs = archetypes.map((a, i) => {
    const color = new THREE.Color(archColor(i, archetypes.length));
    const g = new THREE.Group();
    const dot = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 16),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 }));
    const label = makeLabel(a.name, "#" + color.getHexString(), 0.8);
    label.position.set(0, 9, 0);
    g.add(dot, label);
    scene.add(g);
    return { name: a.name, v: a.v, group: g, colorCss: color.getStyle(), visible: true };
  });

  function positionMarkers() {
    const [x, y, z] = trio;
    you.position.set(vector[x] || 0, vector[y] || 0, vector[z] || 0);
    archObjs.forEach((o) => o.group.position.set(o.v[x] || 0, o.v[y] || 0, o.v[z] || 0));
  }

  const controls = new Orbit(camera, renderer.domElement);
  if (opts.camera) controls.setState(opts.camera);

  rebuildLabels();
  positionMarkers();

  let raf = 0, running = true;
  function frame() {
    if (!running) return;
    controls.tick();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  function resize() {
    const w = mount.clientWidth || 600, h = mount.clientHeight || 420;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(mount);
  resize(); frame();

  return {
    controls,
    setTrio(newTrio) { trio = newTrio.slice(); rebuildLabels(); positionMarkers(); },
    setArchVisible(name, vis) {
      const o = archObjs.find((x) => x.name === name);
      if (o) { o.visible = vis; o.group.visible = vis; }
    },
    setAllArch(vis) { archObjs.forEach((o) => { o.visible = vis; o.group.visible = vis; }); },
    setAutorotate(v) { controls.autoRotate = v; },
    onCameraChange(cb) { controls.onChange = cb; },
    getCameraState() { return controls.getState(); },
    setCameraState(s) { controls.setState(s); },
    legend() { return archObjs.map((o) => ({ name: o.name, color: o.colorCss, visible: o.visible })); },
    resize,
    dispose() { running = false; cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); mount.innerHTML = ""; },
  };
}

function getCssColor(varName, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return v || fallback;
  } catch { return fallback; }
}
