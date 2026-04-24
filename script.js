/*
  墨象 · Ink Cosmos — Star Maker reimagined as a Chinese ink-wash scroll.
  Physics: Keplerian (central star), exact-Kepler (universal-variable),
           Newtonian N-body (adaptive velocity-Verlet).
  Render:  xuan-paper ground, sumi ink blots, tapered brush trails,
           wavy ink selection, vermillion seal for focus.
  Audio:   per-body oscillators quantized to Chinese pentatonic scales
           (宫商角徵羽) or Western modes, with reverb, metronome, guqin pluck.
*/

// ============================================================================
// Constants & global state
// ============================================================================

const PhysicsModel = {
  Keplerian: 'keplerian',
  KeplerExact: 'kepler_exact',
  NBody: 'nbody',
};

const InkPalette = {
  paperWarm: [245, 235, 210],
  paperDeep: [222, 200, 158],
  inkBlack: [19, 16, 13],
  inkWarm:  [42, 33, 27],
  inkGray:  [122, 108, 88],
  inkWash:  [168, 153, 119],
  vermillion: [184, 52, 42],
  indigo:   [40, 68, 94],
  ochre:    [164, 115, 56],
  moss:     [107, 125, 85],
  celadon:  [136, 163, 150],
};

// Classical palette for pre-named bodies (ink tones, not cartoon saturation)
const BodyInkPalette = [
  '#28445e', // indigo
  '#a47338', // ochre
  '#6b7d55', // moss
  '#88a396', // celadon
  '#7a4c3c', // earth brown
  '#3c5a6b', // dusk blue
  '#8e6a3a', // ginger
  '#4a3f32', // dry ink
];

class Vector2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  add(v) { this.x += v.x; this.y += v.y; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; return this; }
  mult(s) { this.x *= s; this.y *= s; return this; }
  clone() { return new Vector2(this.x, this.y); }
  static dot(a, b) { return a.x * b.x + a.y * b.y; }
  static length(a) { return Math.hypot(a.x, a.y); }
  static sub(a, b) { return new Vector2(a.x - b.x, a.y - b.y); }
  static add(a, b) { return new Vector2(a.x + b.x, a.y + b.y); }
  static dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
}

class CelestialBody {
  constructor({ id, name, mass, radius, color, position, velocity,
                fixed = false, timbre = 'sine', muted = false, solo = false,
                seed = null }) {
    this.id = id;
    this.name = name;
    this.mass = mass;
    this.radius = radius;
    this.color = color;
    this.position = position;
    this.velocity = velocity;
    this.acceleration = new Vector2();
    this.fixed = fixed;
    this.trail = [];
    this.timbre = timbre;
    this.audio = null;           // { osc, gain, pan }
    this.muted = muted;
    this.solo = solo;
    // Visual seed — gives each blot its own asymmetric bleed shape
    this.seed = seed ?? Math.floor(Math.random() * 100000);
    // For guqin pluck rhythm: track last angle so we can detect boundary crossings
    this.lastAngle = 0;
  }

  updateTrail(maxLength) {
    this.trail.push({ x: this.position.x, y: this.position.y });
    if (this.trail.length > maxLength) this.trail.shift();
  }
}

class SimulationState {
  constructor() {
    this.bodies = [];
    this.nextId = 1;
    this.isRunning = false;
    this.timeScale = 0.5;
    this.gravityConstant = 2.0;
    this.trailLength = 180;
    this.model = PhysicsModel.Keplerian;
    this.canvasCenter = new Vector2(0, 0);
    this.zoom = 1.0;
    this.pan = new Vector2(0, 0);
    this.softening2 = 4;
    this.simTime = 0;
    this.collide = false;
    this.showGhostOrbit = true;
    this.showGrid = false;
    this.showLabels = true;
  }
}

const state = new SimulationState();

// ============================================================================
// DOM refs (bound in initUI)
// ============================================================================

let btnToggle, btnStep, btnReset, selectModel;
let rangeDt, labelDt, rangeG, labelG, rangeTrail, labelTrail, rangeSoft, labelSoft;
let formAdd, inputs;
let bodiesList;
let statusPlay, statusModel, statusBodies, statusEnergy;
let btnCollapsePanel, btnExpandPanel, appRoot, controlPanelEl;
let audioCheckbox, checkboxReverb, checkboxPhaseOrbit;
let checkboxCollide, checkboxGhostOrbit, checkboxGrid, checkboxLabels;
let rhythmModeSelect, rangeMasterVol, labelMasterVol, rangeBpm, labelBpm;
let selectScale, selectRoot, selectSubdiv;
let btnCenter, btnFit, btnSave, btnLoad, fileInput;
let presetSolarBtn, presetBinaryBtn, presetRingBtn, presetRandomBtn, presetTrojanBtn, presetFigure8Btn;
let inspectorCard, formInspector, insName, insColor, insMass, insRadius, insVelX, insVelY;
let insDeselect, insRemove, readOrbit, readPeriod, readSpeed;

let audioCtx = null;
let masterGainNode = null;
let reverbNode = null;
let reverbDryGain = null;
let reverbWetGain = null;
let lastTickTime = 0;
let metronomeBpm = 90;
let selectedBodyId = null;

// p5 globals
let sketchWidth = 0;
let sketchHeight = 0;
let starBody = null;
let canvasEl = null;
let paperGfx = null;         // pre-rendered paper background
let paperStampSeed = 2847;   // deterministic stamp positions

// Mouse state
let isPlacingPlanet = false;
let placeStart = null;
let placeCurrent = null;
const dragMinThresholdPx = 3;
const velocityScale = 0.02;

let isPanning = false;
let panStartScreen = null;
let panStartPan = null;

// ============================================================================
// Setup
// ============================================================================

function setup() {
  const container = document.getElementById('canvas-holder');
  sketchWidth = container.clientWidth;
  sketchHeight = container.clientHeight;
  const cnv = createCanvas(sketchWidth, sketchHeight);
  cnv.parent('canvas-holder');
  canvasEl = cnv.elt || cnv.canvas || document.querySelector('#canvas-holder canvas');
  frameRate(60);
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));

  state.canvasCenter = new Vector2(width / 2, height / 2);
  rebuildPaperGraphics();

  initUI();

  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.target.id === 'canvas-holder') {
        const w = Math.max(1, Math.floor(entry.contentRect.width));
        const h = Math.max(1, Math.floor(entry.contentRect.height));
        if (w !== width || h !== height) {
          resizeCanvas(w, h);
          state.canvasCenter = new Vector2(width / 2, height / 2);
          rebuildPaperGraphics();
        }
      }
    }
  });
  resizeObserver.observe(container);

  // Central star 日
  starBody = addBody({
    name: '日 · Sol',
    mass: 1000,
    radius: 18,
    color: '#a47338',
    position: state.canvasCenter.clone(),
    velocity: new Vector2(0, 0),
    fixed: true,
    timbre: 'organ',
  });

  // Default companion planet 地
  addBody({
    name: '地 · Earth',
    mass: 5,
    radius: 6,
    color: '#28445e',
    position: Vector2.add(state.canvasCenter, new Vector2(160, 0)),
    velocity: new Vector2(0, 1.6),
    timbre: 'bell',
  });
}

function windowResized() {
  const container = document.getElementById('canvas-holder');
  resizeCanvas(container.clientWidth, container.clientHeight);
  state.canvasCenter = new Vector2(width / 2, height / 2);
  rebuildPaperGraphics();
}

// ============================================================================
// Paper background (pre-rendered once per resize)
// ============================================================================

function rebuildPaperGraphics() {
  paperGfx = createGraphics(width, height);
  const g = paperGfx;
  g.noStroke();

  // Radial warm gradient from upper-left
  for (let r = 0; r < 60; r++) {
    const t = r / 60;
    const cr = lerp(InkPalette.paperWarm[0], InkPalette.paperDeep[0], t);
    const cg = lerp(InkPalette.paperWarm[1], InkPalette.paperDeep[1], t);
    const cb = lerp(InkPalette.paperWarm[2], InkPalette.paperDeep[2], t);
    g.fill(cr, cg, cb, 255);
    if (r === 0) g.rect(0, 0, width, height);
    // center-biased vignette overlays
    const vx = width * 0.35;
    const vy = height * 0.25;
    g.fill(cr, cg, cb, 3);
    g.ellipse(vx, vy, width * 1.6 * (1 - t), height * 1.6 * (1 - t));
  }

  // Subtle horizontal wash streaks (mimicking uneven inking)
  g.noFill();
  for (let i = 0; i < 14; i++) {
    const y = (i / 14) * height + (Math.random() - 0.5) * 40;
    const alpha = 8 + Math.random() * 10;
    g.stroke(110, 85, 55, alpha);
    g.strokeWeight(40 + Math.random() * 80);
    g.beginShape();
    g.noFill();
    const steps = 14;
    for (let s = 0; s <= steps; s++) {
      const x = (s / steps) * width;
      const yy = y + (Math.random() - 0.5) * 10;
      g.vertex(x, yy);
    }
    g.endShape();
  }

  // Paper fibers (short dark streaks)
  g.strokeWeight(0.7);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const len = 3 + Math.random() * 10;
    const ang = Math.random() * Math.PI * 2;
    const alpha = 10 + Math.random() * 30;
    g.stroke(60, 45, 25, alpha);
    g.line(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
  }

  // Faint specks (like paper impurities)
  g.noStroke();
  for (let i = 0; i < 280; i++) {
    g.fill(60, 45, 25, 10 + Math.random() * 30);
    g.circle(Math.random() * width, Math.random() * height, 0.6 + Math.random() * 1.4);
  }

  // Distant "stars" — tiny gray ink droplets
  const starSeed = 1337;
  for (let i = 0; i < 90; i++) {
    const s = (i * 9301 + 49297) % 233280;
    const u = s / 233280;
    const x = ((i * 73 + starSeed) * 97) % width;
    const y = ((i * 131 + starSeed) * 53) % height;
    const size = 1 + u * 2.4;
    const alpha = 28 + u * 50;
    g.fill(40, 30, 20, alpha);
    g.circle(x, y, size);
    // slight wet halo
    g.fill(40, 30, 20, alpha * 0.25);
    g.circle(x, y, size * 2.2);
  }

  // Large very-faint ink wash blob (top-right) for compositional depth
  const bx = width * 0.82, by = height * 0.18, br = Math.min(width, height) * 0.55;
  for (let r = 0; r < 20; r++) {
    const t = r / 20;
    g.fill(30, 22, 14, 2.5 * (1 - t));
    g.ellipse(bx + (Math.random() - 0.5) * 4, by + (Math.random() - 0.5) * 4,
              br * (0.4 + t * 0.9), br * (0.35 + t * 0.8));
  }

  // Bottom-left ink wash
  const ax = width * 0.12, ay = height * 0.88, ar = Math.min(width, height) * 0.45;
  for (let r = 0; r < 16; r++) {
    const t = r / 16;
    g.fill(30, 22, 14, 2.2 * (1 - t));
    g.ellipse(ax + (Math.random() - 0.5) * 4, ay + (Math.random() - 0.5) * 4,
              ar * (0.3 + t * 0.7), ar * (0.25 + t * 0.6));
  }
}

// ============================================================================
// Draw loop
// ============================================================================

function draw() {
  drawBackground();
  if (state.isRunning) stepSimulation();
  renderSimulation();
  drawPlacementPreview();
  updateReadouts();
  updateAudioForBodies();
}

function drawBackground() {
  if (paperGfx) image(paperGfx, 0, 0);
  else background(245, 235, 210);

  if (state.showGrid) drawGrid();
}

function drawGrid() {
  push();
  translate(width / 2, height / 2);
  translate(state.pan.x, state.pan.y);
  scale(state.zoom);
  translate(-width / 2, -height / 2);
  stroke(30, 22, 14, 22);
  strokeWeight(0.6 / state.zoom);
  noFill();
  const step = 80;
  const extra = 1.4;
  const halfW = width * extra / state.zoom;
  const halfH = height * extra / state.zoom;
  const cx = width / 2;
  const cy = height / 2;
  for (let x = -Math.ceil(halfW / step) * step; x <= halfW; x += step) {
    line(cx + x, cy - halfH, cx + x, cy + halfH);
  }
  for (let y = -Math.ceil(halfH / step) * step; y <= halfH; y += step) {
    line(cx - halfW, cy + y, cx + halfW, cy + y);
  }
  pop();
}

// ============================================================================
// Physics — models & integration
// ============================================================================

// --- Yoshida-4 symplectic coefficients (4th-order composition of leapfrog) ---
const _CBRT2 = Math.cbrt(2);
const YOSHIDA_W1 = 1 / (2 - _CBRT2);
const YOSHIDA_W0 = 1 - 2 * YOSHIDA_W1;

// --- Typed-array physics buffers (cache-friendly hot loop) -------------------
// Bodies live as objects (Vector2 etc.) for clean editing. The integrator hot
// path operates on parallel Float64Arrays packed once per force evaluation —
// V8 can SIMD-unroll and avoid object dereferencing.
const _phys = {
  posX: new Float64Array(0),
  posY: new Float64Array(0),
  velX: new Float64Array(0),  // unused for force-only path; kept for future use
  velY: new Float64Array(0),
  accX: new Float64Array(0),
  accY: new Float64Array(0),
  mass: new Float64Array(0),
  fixed: new Uint8Array(0),
  capacity: 0,
};
let _minSepSq = Infinity;       // updated by every force calc; informs substep adaptivity

function ensurePhysCapacity(n) {
  if (_phys.capacity >= n) return;
  const cap = Math.max(n * 2, 32);
  _phys.posX = new Float64Array(cap);
  _phys.posY = new Float64Array(cap);
  _phys.velX = new Float64Array(cap);
  _phys.velY = new Float64Array(cap);
  _phys.accX = new Float64Array(cap);
  _phys.accY = new Float64Array(cap);
  _phys.mass = new Float64Array(cap);
  _phys.fixed = new Uint8Array(cap);
  _phys.capacity = cap;
}

function packPhys() {
  const bodies = state.bodies;
  const n = bodies.length;
  ensurePhysCapacity(n);
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    _phys.posX[i] = b.position.x;
    _phys.posY[i] = b.position.y;
    _phys.mass[i] = b.mass;
    _phys.fixed[i] = b.fixed ? 1 : 0;
    _phys.accX[i] = 0;
    _phys.accY[i] = 0;
  }
  return n;
}

function unpackAccs() {
  const bodies = state.bodies;
  const n = bodies.length;
  let maxAcc = 0;
  for (let i = 0; i < n; i++) {
    bodies[i].acceleration.x = _phys.accX[i];
    bodies[i].acceleration.y = _phys.accY[i];
    if (!_phys.fixed[i]) {
      const am = Math.hypot(_phys.accX[i], _phys.accY[i]);
      if (am > maxAcc) maxAcc = am;
    }
  }
  return maxAcc;
}

function stepSimulation() {
  const dt = state.timeScale;
  const G = state.gravityConstant;
  const eps2 = state.softening2;

  // --- Kepler-exact (f-g/universal variable) per-body: exact for central 2-body ---
  if (state.model === PhysicsModel.KeplerExact && starBody) {
    for (const body of state.bodies) {
      if (body.fixed || body === starBody) continue;
      keplerExactStep(body, starBody, G, dt);
      body.updateTrail(state.trailLength);
    }
    state.simTime += dt;
    if (state.collide) handleCollisions();
    return;
  }

  // --- Compute initial forces; this also tracks the closest pair separation ---
  const maxAcc = computeForces(G, eps2);

  // Adaptive substep count combines two heuristics:
  //   1) max|a|: keeps |Δv| per substep below velChangeLimit
  //   2) min separation: bumps substep count when bodies pass close to each
  //      other, since |a| ~ 1/r² means even a small dt sees huge force gradients
  const velChangeLimit = 0.2;
  const stepFromAcc = maxAcc > 0
    ? Math.min(0.25, Math.max(0.02, velChangeLimit / maxAcc))
    : 0.25;
  // Encounter heuristic: dt < sqrt(r³/(G·m_max)) ≈ Kepler crossing time at r
  const minSep = Math.sqrt(Math.max(_minSepSq, 1));
  const massMax = state.bodies.reduce((m, b) => Math.max(m, b.mass), 1);
  const stepFromEncounter = 0.1 * Math.sqrt(minSep * minSep * minSep / Math.max(1e-9, G * massMax));
  const maxStep = Math.min(stepFromAcc, stepFromEncounter, 0.25);
  const steps = Math.max(1, Math.min(200, Math.ceil(dt / maxStep)));
  const h = dt / steps;

  // Choose integrator:
  //   - Keplerian (star-only): KDK leapfrog (2nd-order symplectic, 1 force/step)
  //   - N-Body w/ dominant star: Wisdom-Holman split — drift each body along
  //     its Kepler arc around the central mass, kick by mutual perturbations.
  //     Captures the 1/r² long-range potential exactly while treating the
  //     small mutual interactions as a perturbation.
  //   - N-Body otherwise: Yoshida-4 (4th-order symplectic, 3 forces/step)
  const haveDominant = starBody && _isDominantStar();

  if (state.model === PhysicsModel.NBody && haveDominant) {
    for (let s = 0; s < steps; s++) wisdomHolmanStep(h, G, eps2);
  } else if (state.model === PhysicsModel.NBody) {
    for (let s = 0; s < steps; s++) yoshida4Step(h, G, eps2);
  } else {
    for (let s = 0; s < steps; s++) leapfrogStep(h, G, eps2);
  }

  for (const body of state.bodies) {
    if (!body.fixed) body.updateTrail(state.trailLength);
  }
  state.simTime += dt;
  if (state.collide) handleCollisions();
}

// True when one body's mass exceeds 50× the sum of all others — the regime where
// the Wisdom-Holman split is exact-ish and dramatically more accurate than
// Yoshida-4 (per-body Kepler arcs vs. polynomial position updates).
function _isDominantStar() {
  if (!starBody) return false;
  let other = 0;
  for (const b of state.bodies) if (b !== starBody) other += b.mass;
  return starBody.mass >= 50 * other;
}

// Wisdom-Holman democratic-heliocentric split:
//   1) Drift: advance each body along its exact Kepler orbit around starBody for h/2
//   2) Kick:  apply mutual (planet-planet) accelerations for h
//   3) Drift: another exact Kepler half-step
// Far better long-term accuracy than Yoshida-4 when one mass dominates.
function wisdomHolmanStep(h, G, eps2) {
  const bodies = state.bodies;
  const halfH = h * 0.5;
  // Drift 1
  for (const b of bodies) {
    if (b.fixed || b === starBody) continue;
    keplerExactStep(b, starBody, G, halfH);
  }
  // Kick: mutual perturbations only (subtract the central force we already
  // accounted for analytically). Easier: compute full N-body forces, then
  // remove the star's contribution per body.
  computeForces(G, eps2);
  if (starBody) {
    const sX = starBody.position.x, sY = starBody.position.y, sM = starBody.mass;
    for (const b of bodies) {
      if (b.fixed || b === starBody) continue;
      const dx = sX - b.position.x;
      const dy = sY - b.position.y;
      const r2 = dx * dx + dy * dy;
      const invR = 1 / Math.sqrt(r2);
      const Gr3 = G * sM * invR * invR * invR;
      b.acceleration.x -= Gr3 * dx;
      b.acceleration.y -= Gr3 * dy;
      b.velocity.x += h * b.acceleration.x;
      b.velocity.y += h * b.acceleration.y;
    }
  }
  // Drift 2
  for (const b of bodies) {
    if (b.fixed || b === starBody) continue;
    keplerExactStep(b, starBody, G, halfH);
  }
}

// Threshold above which Barnes-Hut beats direct O(n²). Below this the BH
// constant factor (tree build + tree walk) outweighs its asymptotic edge.
const BARNES_HUT_THRESHOLD = 48;
const BARNES_HUT_THETA = 0.6;     // s/d acceptance ratio (smaller = more accurate, slower)

// Force entry point. Routes between fast Keplerian O(n), direct symmetric
// O(n²), and Barnes-Hut O(n log n) based on the model and body count.
// Returns max|a| so the caller can size adaptive substeps without a second pass.
function computeForces(G, eps2) {
  const n = packPhys();
  _minSepSq = Infinity;

  if (state.model === PhysicsModel.Keplerian && starBody) {
    forcesKeplerian_buf(G, n);
  } else {
    if (n >= BARNES_HUT_THRESHOLD) forcesBarnesHut_buf(G, eps2, n);
    else forcesDirect_buf(G, eps2, n);
  }
  return unpackAccs();
}

// O(n) star-only Keplerian force (eps² omitted: closed conic orbits stay closed).
function forcesKeplerian_buf(G, n) {
  const sIdx = state.bodies.indexOf(starBody);
  if (sIdx < 0) return;
  const posX = _phys.posX, posY = _phys.posY, accX = _phys.accX, accY = _phys.accY;
  const sX = posX[sIdx], sY = posY[sIdx], sM = _phys.mass[sIdx];
  for (let i = 0; i < n; i++) {
    if (_phys.fixed[i] || i === sIdx) continue;
    const dx = sX - posX[i];
    const dy = sY - posY[i];
    const r2 = dx * dx + dy * dy;
    if (r2 < _minSepSq) _minSepSq = r2;
    const invR = 1 / Math.sqrt(r2);
    const Gr3 = G * sM * invR * invR * invR;
    accX[i] = Gr3 * dx;
    accY[i] = Gr3 * dy;
  }
}

// O(n²) direct symmetric pair sum on packed buffers.
function forcesDirect_buf(G, eps2, n) {
  const posX = _phys.posX, posY = _phys.posY, mass = _phys.mass;
  const accX = _phys.accX, accY = _phys.accY, fixed = _phys.fixed;
  let minSepSq = _minSepSq;
  for (let i = 0; i < n; i++) {
    const aFixed = fixed[i];
    const aX = posX[i], aY = posY[i], mi = mass[i];
    for (let j = i + 1; j < n; j++) {
      const dx = posX[j] - aX;
      const dy = posY[j] - aY;
      const r2raw = dx * dx + dy * dy;
      if (r2raw < minSepSq) minSepSq = r2raw;
      const r2 = r2raw + eps2;
      const invR = 1 / Math.sqrt(r2);
      const Gr3 = G * invR * invR * invR;
      const fx = Gr3 * dx, fy = Gr3 * dy;
      const mj = mass[j];
      if (!aFixed)   { accX[i] += fx * mj; accY[i] += fy * mj; }
      if (!fixed[j]) { accX[j] -= fx * mi; accY[j] -= fy * mi; }
    }
  }
  _minSepSq = minSepSq;
}

// ---------- Barnes-Hut quadtree (allocated arrays, no per-node objects) ------
// Flat-array tree. Each node uses 11 Float64 slots:
//   [cx, cy, half, totalMass, comX, comY, c0, c1, c2, c3, bodyIdx]
// Children are node indices into the same buffer (-1 for empty).
// bodyIdx is -1 for internal nodes and ≥ 0 for single-body leaves.
const BH_NODE_STRIDE = 11;
let _bhBuf = new Float64Array(0);
let _bhTop = 0;

function _bhEnsure(capNodes) {
  const need = capNodes * BH_NODE_STRIDE;
  if (_bhBuf.length < need) _bhBuf = new Float64Array(Math.max(need, 256 * BH_NODE_STRIDE));
}
function _bhAlloc(cx, cy, half) {
  const idx = _bhTop++;
  const o = idx * BH_NODE_STRIDE;
  _bhBuf[o]   = cx;
  _bhBuf[o+1] = cy;
  _bhBuf[o+2] = half;
  _bhBuf[o+3] = 0;          // totalMass
  _bhBuf[o+4] = 0;          // comX
  _bhBuf[o+5] = 0;          // comY
  _bhBuf[o+6] = -1;         // children NW
  _bhBuf[o+7] = -1;         // NE
  _bhBuf[o+8] = -1;         // SW
  _bhBuf[o+9] = -1;         // SE
  _bhBuf[o+10] = -1;        // bodyIdx
  return idx;
}

function _bhInsert(rootIdx, bodyIdx) {
  const posX = _phys.posX, posY = _phys.posY, mass = _phys.mass;
  let nodeIdx = rootIdx;
  while (true) {
    const o = nodeIdx * BH_NODE_STRIDE;
    const totalM = _bhBuf[o + 3];
    const existingBody = _bhBuf[o + 10];

    if (totalM === 0 && existingBody === -1) {
      // empty leaf — store this body
      _bhBuf[o + 3] = mass[bodyIdx];
      _bhBuf[o + 4] = posX[bodyIdx];
      _bhBuf[o + 5] = posY[bodyIdx];
      _bhBuf[o + 10] = bodyIdx;
      return;
    }

    if (existingBody !== -1) {
      // leaf with one body already — subdivide and re-insert that body
      _bhBuf[o + 10] = -1;
      const cx = _bhBuf[o], cy = _bhBuf[o + 1], halfChild = _bhBuf[o + 2] * 0.5;
      _bhBuf[o + 6] = _bhAlloc(cx - halfChild, cy - halfChild, halfChild);
      _bhBuf[o + 7] = _bhAlloc(cx + halfChild, cy - halfChild, halfChild);
      _bhBuf[o + 8] = _bhAlloc(cx - halfChild, cy + halfChild, halfChild);
      _bhBuf[o + 9] = _bhAlloc(cx + halfChild, cy + halfChild, halfChild);
      // re-place existing body into appropriate child (no aggregation yet — let
      // the next pass through the loop handle it)
      const ex = posX[existingBody] >= cx;
      const ey = posY[existingBody] >= cy;
      const childOff = (ey ? 8 : 6) + (ex ? 1 : 0);
      const childIdx = _bhBuf[o + childOff];
      const co = childIdx * BH_NODE_STRIDE;
      _bhBuf[co + 3]  = mass[existingBody];
      _bhBuf[co + 4]  = posX[existingBody];
      _bhBuf[co + 5]  = posY[existingBody];
      _bhBuf[co + 10] = existingBody;
      // reset this node's COM so we re-aggregate including new body next iter
      _bhBuf[o + 3] = mass[existingBody];
      _bhBuf[o + 4] = posX[existingBody];
      _bhBuf[o + 5] = posY[existingBody];
    }

    // Aggregate: COM = (oldM*oldCom + m*pos) / (oldM + m)
    const m = mass[bodyIdx];
    const oldM = _bhBuf[o + 3];
    const newM = oldM + m;
    _bhBuf[o + 4] = (_bhBuf[o + 4] * oldM + posX[bodyIdx] * m) / newM;
    _bhBuf[o + 5] = (_bhBuf[o + 5] * oldM + posY[bodyIdx] * m) / newM;
    _bhBuf[o + 3] = newM;
    // Descend into the right child for this body
    const cx = _bhBuf[o], cy = _bhBuf[o + 1];
    const ex = posX[bodyIdx] >= cx;
    const ey = posY[bodyIdx] >= cy;
    const childOff = (ey ? 8 : 6) + (ex ? 1 : 0);
    nodeIdx = _bhBuf[o + childOff];
  }
}

function _bhBuild(n) {
  // bounds
  let minX = _phys.posX[0], minY = _phys.posY[0];
  let maxX = minX, maxY = minY;
  for (let i = 1; i < n; i++) {
    if (_phys.posX[i] < minX) minX = _phys.posX[i];
    else if (_phys.posX[i] > maxX) maxX = _phys.posX[i];
    if (_phys.posY[i] < minY) minY = _phys.posY[i];
    else if (_phys.posY[i] > maxY) maxY = _phys.posY[i];
  }
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const half = Math.max(maxX - minX, maxY - minY) * 0.5 + 1;
  // pre-size: worst case ~ n * log4(n) internal nodes; use 5n + 1 as safe upper bound
  _bhEnsure(5 * n + 8);
  _bhTop = 0;
  const root = _bhAlloc(cx, cy, half);
  for (let i = 0; i < n; i++) _bhInsert(root, i);
  return root;
}

function _bhAccumForce(rootIdx, bodyIdx, theta2, G, eps2, accAccum) {
  // Iterative tree walk using a stack to avoid deep recursion costs.
  let stackTop = 0;
  _bhStack[stackTop++] = rootIdx;
  const posX = _phys.posX[bodyIdx], posY = _phys.posY[bodyIdx];
  while (stackTop > 0) {
    const nodeIdx = _bhStack[--stackTop];
    const o = nodeIdx * BH_NODE_STRIDE;
    const m = _bhBuf[o + 3];
    if (m === 0) continue;
    const eb = _bhBuf[o + 10];
    if (eb === bodyIdx) continue;             // skip self-leaf
    const dx = _bhBuf[o + 4] - posX;
    const dy = _bhBuf[o + 5] - posY;
    const r2raw = dx * dx + dy * dy;
    if (r2raw < _minSepSq && eb !== -1) _minSepSq = r2raw;
    const s = _bhBuf[o + 2] * 2;              // node size (full edge)
    if (eb !== -1 || s * s < theta2 * r2raw) {
      // Use this node as a single mass
      const r2 = r2raw + eps2;
      const invR = 1 / Math.sqrt(r2);
      const Gr3 = G * m * invR * invR * invR;
      accAccum[0] += Gr3 * dx;
      accAccum[1] += Gr3 * dy;
    } else {
      const c0 = _bhBuf[o + 6], c1 = _bhBuf[o + 7], c2 = _bhBuf[o + 8], c3 = _bhBuf[o + 9];
      if (c0 !== -1) _bhStack[stackTop++] = c0;
      if (c1 !== -1) _bhStack[stackTop++] = c1;
      if (c2 !== -1) _bhStack[stackTop++] = c2;
      if (c3 !== -1) _bhStack[stackTop++] = c3;
    }
  }
}
const _bhStack = new Int32Array(4096);
const _bhAcc = [0, 0];

function forcesBarnesHut_buf(G, eps2, n) {
  const root = _bhBuild(n);
  const theta2 = BARNES_HUT_THETA * BARNES_HUT_THETA;
  const fixed = _phys.fixed;
  const accX = _phys.accX, accY = _phys.accY;
  for (let i = 0; i < n; i++) {
    if (fixed[i]) continue;
    _bhAcc[0] = 0; _bhAcc[1] = 0;
    _bhAccumForce(root, i, theta2, G, eps2, _bhAcc);
    accX[i] = _bhAcc[0];
    accY[i] = _bhAcc[1];
  }
}

// Kick-Drift-Kick leapfrog (equivalent to velocity-Verlet but only needs 1
// force evaluation per step after the initial one; still 2nd-order symplectic).
function leapfrogStep(h, G, eps2) {
  const bodies = state.bodies;
  const halfH = 0.5 * h;
  // half-kick with current acceleration
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (b.fixed) continue;
    b.velocity.x += halfH * b.acceleration.x;
    b.velocity.y += halfH * b.acceleration.y;
  }
  // drift
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (b.fixed) continue;
    b.position.x += h * b.velocity.x;
    b.position.y += h * b.velocity.y;
  }
  // recompute forces at new positions
  computeForces(G, eps2);
  // half-kick with new acceleration
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (b.fixed) continue;
    b.velocity.x += halfH * b.acceleration.x;
    b.velocity.y += halfH * b.acceleration.y;
  }
}

// Yoshida 4th-order symplectic composition (Yoshida 1990):
// dramatically better long-term energy conservation for chaotic N-body systems
// like the Chenciner–Montgomery figure-8 or Trojan co-orbital configurations.
// 3 force evaluations per step (vs 1 for leapfrog) for 4th-order accuracy.
function yoshida4Step(h, G, eps2) {
  leapfrogStep(YOSHIDA_W1 * h, G, eps2);
  leapfrogStep(YOSHIDA_W0 * h, G, eps2);
  leapfrogStep(YOSHIDA_W1 * h, G, eps2);
}

function stumpffC(z) {
  if (z > 1e-6) { const s = Math.sqrt(z); return (1 - Math.cos(s)) / z; }
  if (z < -1e-6) { const s = Math.sqrt(-z); return (1 - Math.cosh(s)) / z; }
  return 0.5 - z / 24 + z * z / 720;
}
function stumpffS(z) {
  if (z > 1e-6) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s * z); }
  if (z < -1e-6) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * -z); }
  return 1 / 6 - z / 120 + z * z / 5040;
}

function keplerExactStep(body, star, G, dt) {
  const mu = G * star.mass;
  if (!(mu > 0) || !isFinite(mu)) return;
  const rx = body.position.x - star.position.x;
  const ry = body.position.y - star.position.y;
  const vx = body.velocity.x;
  const vy = body.velocity.y;
  const r0 = Math.hypot(rx, ry);
  if (!(r0 > 1e-6)) return;                  // overlapping — skip; collision will merge
  const v02 = vx * vx + vy * vy;
  const vr0 = (rx * vx + ry * vy) / r0;
  const alpha = 2 / r0 - v02 / mu;           // 1/a; sign encodes orbit type
  const sqrtMu = Math.sqrt(mu);

  // Initial guess for χ. Danby (1988) style: closed-form good guesses per orbit
  // type make Newton-Raphson converge in ~5 iterations.
  let chi;
  if (alpha > 1e-10) {
    // Elliptic: χ ≈ √μ · α · Δt
    chi = sqrtMu * alpha * dt;
  } else if (alpha < -1e-10) {
    // Hyperbolic: Danby's estimate using asymptotic expansion
    const a = 1 / alpha;                     // a < 0
    const sign = dt >= 0 ? 1 : -1;
    const arg = (-2 * mu * alpha * dt) / (r0 * vr0 + sign * Math.sqrt(-mu * a) * (1 - r0 * alpha));
    chi = sign * Math.sqrt(-a) * Math.log(Math.max(1e-12, arg));
    if (!isFinite(chi)) chi = sqrtMu * dt / r0;
  } else {
    // Parabolic-ish: rough guess
    chi = sqrtMu * dt / Math.max(r0, 1);
  }

  // Newton-Raphson with bisection fallback on numeric trouble
  const maxIter = 30;
  const tol = 1e-9;
  let converged = false;
  for (let k = 0; k < maxIter; k++) {
    const z = alpha * chi * chi;
    const C = stumpffC(z);
    const S = stumpffS(z);
    const r = chi * chi * C + (vr0 / sqrtMu) * chi * (1 - z * S) + r0 * (1 - z * C);
    const F = (r0 * vr0 / sqrtMu) * chi * chi * C
            + (1 - alpha * r0) * chi * chi * chi * S
            + r0 * chi - sqrtMu * dt;
    const dF = r;                            // dF/dχ is the radial distance
    if (!isFinite(F) || !isFinite(dF) || Math.abs(dF) < 1e-14) break;
    const dChi = F / dF;
    chi -= dChi;
    if (!isFinite(chi)) break;
    if (Math.abs(dChi) < tol * Math.max(1, Math.abs(chi))) { converged = true; break; }
  }
  if (!converged && !isFinite(chi)) return;  // give up cleanly; keep last good state

  const z = alpha * chi * chi;
  const C = stumpffC(z);
  const S = stumpffS(z);
  const f = 1 - (chi * chi / r0) * C;
  const g = dt - (1 / sqrtMu) * chi * chi * chi * S;
  const rNewX = f * rx + g * vx;
  const rNewY = f * ry + g * vy;
  const rNew = Math.hypot(rNewX, rNewY);
  if (!(rNew > 1e-9) || !isFinite(rNew)) return;
  const fdot = (sqrtMu / (r0 * rNew)) * (z * S - 1) * chi;
  const gdot = 1 - (chi * chi / rNew) * C;
  const vNewX = fdot * rx + gdot * vx;
  const vNewY = fdot * ry + gdot * vy;
  if (!(isFinite(rNewX) && isFinite(rNewY) && isFinite(vNewX) && isFinite(vNewY))) return;

  body.position.x = star.position.x + rNewX;
  body.position.y = star.position.y + rNewY;
  body.velocity.x = vNewX;
  body.velocity.y = vNewY;
}

// --- Collision / merge (momentum-conserving) ---
function handleCollisions() {
  outer:
  for (let i = 0; i < state.bodies.length; i++) {
    const a = state.bodies[i];
    for (let j = i + 1; j < state.bodies.length; j++) {
      const b = state.bodies[j];
      const d = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
      if (d < a.radius + b.radius) {
        const keep = a.mass >= b.mass ? a : b;
        const gone = keep === a ? b : a;
        const M = keep.mass + gone.mass;
        keep.position.x = (keep.position.x * keep.mass + gone.position.x * gone.mass) / M;
        keep.position.y = (keep.position.y * keep.mass + gone.position.y * gone.mass) / M;
        if (!keep.fixed) {
          keep.velocity.x = (keep.velocity.x * keep.mass + gone.velocity.x * gone.mass) / M;
          keep.velocity.y = (keep.velocity.y * keep.mass + gone.velocity.y * gone.mass) / M;
        }
        keep.mass = M;
        keep.radius = Math.sqrt(keep.radius * keep.radius + gone.radius * gone.radius);
        stopBodyAudio(gone);
        state.bodies.splice(state.bodies.indexOf(gone), 1);
        if (gone.id === selectedBodyId) { selectedBodyId = null; if (inspectorCard) inspectorCard.hidden = true; }
        refreshBodiesUI();
        break outer;
      }
    }
  }
}

// --- Energy (for status readout) ---
function totalEnergy() {
  const G = state.gravityConstant;
  let kin = 0, pot = 0;
  for (const b of state.bodies) {
    if (!b.fixed) kin += 0.5 * b.mass * (b.velocity.x * b.velocity.x + b.velocity.y * b.velocity.y);
  }
  for (let i = 0; i < state.bodies.length; i++) {
    for (let j = i + 1; j < state.bodies.length; j++) {
      const a = state.bodies[i];
      const b = state.bodies[j];
      const r = Math.max(1, Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y));
      pot -= G * a.mass * b.mass / r;
    }
  }
  return kin + pot;
}

// --- Orbital elements for inspector (relative to star) ---
function orbitalElements(body) {
  if (!starBody || body.fixed || body === starBody) return null;
  const G = state.gravityConstant;
  const mu = G * starBody.mass;
  const rx = body.position.x - starBody.position.x;
  const ry = body.position.y - starBody.position.y;
  const vx = body.velocity.x - (starBody.fixed ? 0 : starBody.velocity.x);
  const vy = body.velocity.y - (starBody.fixed ? 0 : starBody.velocity.y);
  const r = Math.hypot(rx, ry);
  const v2 = vx * vx + vy * vy;
  const h = rx * vy - ry * vx;              // specific angular momentum
  const energy = 0.5 * v2 - mu / r;
  const a = -mu / (2 * energy);             // semi-major axis (negative for bound)
  const eVecX = (v2 * rx) / mu - (rx * vx + ry * vy) * vx / mu - rx / r;
  const eVecY = (v2 * ry) / mu - (rx * vx + ry * vy) * vy / mu - ry / r;
  const e = Math.hypot(eVecX, eVecY);
  const bound = energy < 0 && a > 0 && e < 1;
  const period = bound ? 2 * Math.PI * Math.sqrt(a * a * a / mu) : Infinity;
  return { a, e, period, bound, r, v: Math.sqrt(v2) };
}

// ============================================================================
// Rendering — ink, blots, brush trails
// ============================================================================

function renderSimulation() {
  push();
  translate(width / 2, height / 2);
  translate(state.pan.x, state.pan.y);
  scale(state.zoom);
  translate(-width / 2, -height / 2);

  const ctx = drawingContext;

  // Brush trails first (so bodies sit on top)
  for (const body of state.bodies) drawBrushTrail(ctx, body);

  // Predictive ghost orbit
  if (state.showGhostOrbit && isPlacingPlanet && placeStart && placeCurrent
      && starBody && state.model !== PhysicsModel.NBody) {
    drawGhostOrbit(ctx);
  }

  // Bodies
  for (const body of state.bodies) drawInkBody(ctx, body);

  // Selection overlay
  if (selectedBodyId != null) {
    const sel = state.bodies.find((b) => b.id === selectedBodyId);
    if (sel) drawSelectionRing(ctx, sel);
  }

  pop();

  // HUD-style labels (after pop, in screen space) — names & small info
  if (state.showLabels) drawNameLabels();
}

function drawInkBody(ctx, body) {
  const { x, y } = body.position;
  const r = body.radius;
  const isStar = body === starBody || body.fixed;

  ctx.save();
  // Outer bleed — wet edge
  const bleedR = r * 3.2;
  const blg = ctx.createRadialGradient(x, y, 0, x, y, bleedR);
  blg.addColorStop(0.00, hexA(body.color, 0.35));
  blg.addColorStop(0.35, hexA(body.color, 0.18));
  blg.addColorStop(0.75, hexA(body.color, 0.06));
  blg.addColorStop(1.00, hexA(body.color, 0));
  ctx.fillStyle = blg;
  ctx.beginPath(); ctx.arc(x, y, bleedR, 0, Math.PI * 2); ctx.fill();

  // Second asymmetric bleed offset by body's seed (organic irregularity)
  const ang = (body.seed % 360) * Math.PI / 180;
  const ox = Math.cos(ang) * r * 0.4;
  const oy = Math.sin(ang) * r * 0.4;
  const ag = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, bleedR * 0.7);
  ag.addColorStop(0, hexA(body.color, 0.25));
  ag.addColorStop(1, hexA(body.color, 0));
  ctx.fillStyle = ag;
  ctx.beginPath(); ctx.arc(x + ox, y + oy, bleedR * 0.7, 0, Math.PI * 2); ctx.fill();

  // Core — dense ink with mild highlight on top-left
  const core = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r * 1.15);
  core.addColorStop(0.00, hexA(lighten(body.color, 0.15), 0.95));
  core.addColorStop(0.55, hexA(body.color, 0.98));
  core.addColorStop(1.00, hexA(darken(body.color, 0.25), 0.95));
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(x, y, r * 1.05, 0, Math.PI * 2); ctx.fill();

  // Star: add ochre glow + a faint radiance brush outward
  if (isStar) {
    const glow = ctx.createRadialGradient(x, y, r, x, y, r * 5.5);
    glow.addColorStop(0, 'rgba(255, 190, 80, 0.35)');
    glow.addColorStop(0.5, 'rgba(184, 120, 50, 0.12)');
    glow.addColorStop(1, 'rgba(184, 120, 50, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, r * 5.5, 0, Math.PI * 2); ctx.fill();
    // small hot center
    const hot = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, 0, x, y, r * 0.6);
    hot.addColorStop(0, 'rgba(255, 240, 210, 0.95)');
    hot.addColorStop(1, 'rgba(255, 240, 210, 0)');
    ctx.fillStyle = hot;
    ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawBrushTrail(ctx, body) {
  const t = body.trail;
  if (!t || t.length < 2) return;
  const n = t.length;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const baseColor = body.color;

  // Two-pass: a broad soft underlay and a narrower crisp overlay
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < n; i++) {
      const u = i / (n - 1);
      // taper: head (new) is thicker & more opaque, tail thinner & fading
      const headBoost = Math.pow(u, 1.4);
      const alpha = (pass === 0 ? 0.10 : 0.35) * headBoost + (pass === 0 ? 0.02 : 0.01);
      const w = ((pass === 0 ? 3.2 : 1.2) * headBoost + (pass === 0 ? 0.8 : 0.3)) / state.zoom;
      ctx.strokeStyle = hexA(baseColor, alpha);
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(t[i - 1].x, t[i - 1].y);
      ctx.lineTo(t[i].x, t[i].y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawSelectionRing(ctx, body) {
  const { x, y } = body.position;
  const r = Math.max(body.radius * 2.6, 14 / state.zoom);
  ctx.save();

  // Outer faint vermillion wash
  const halo = ctx.createRadialGradient(x, y, body.radius, x, y, r * 1.4);
  halo.addColorStop(0, 'rgba(184, 52, 42, 0.0)');
  halo.addColorStop(0.6, 'rgba(184, 52, 42, 0.22)');
  halo.addColorStop(1, 'rgba(184, 52, 42, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(x, y, r * 1.4, 0, Math.PI * 2); ctx.fill();

  // Hand-drawn wavy vermillion ring (double stroke for brush thickness)
  const draw = (offset, alpha, width) => {
    ctx.strokeStyle = `rgba(184, 52, 42, ${alpha})`;
    ctx.lineWidth = width / state.zoom;
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
    const segs = 96;
    ctx.beginPath();
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const wob = Math.sin(a * 5 + body.seed * 0.01) * 1.2
                + Math.cos(a * 9 + body.seed * 0.02) * 0.6;
      const rr = r + offset + wob / state.zoom;
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  };
  draw(1.0 / state.zoom, 0.35, 3.6);
  draw(0, 0.85, 1.4);

  // Vermillion seal with 觀 character (top-right)
  const seal = 7 / state.zoom;
  const sx = x + r * 0.95, sy = y - r * 0.95;
  ctx.fillStyle = 'rgba(184, 52, 42, 0.96)';
  ctx.beginPath();
  ctx.arc(sx, sy, seal, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(80, 10, 5, 0.5)';
  ctx.lineWidth = 0.7 / state.zoom;
  ctx.stroke();
  ctx.fillStyle = 'rgba(247, 239, 219, 0.95)';
  ctx.font = `${10.5 / state.zoom}px "Ma Shan Zheng", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('觀', sx, sy + 0.3 / state.zoom);

  ctx.restore();
}

function drawNameLabels() {
  const ctx = drawingContext;
  ctx.save();
  ctx.font = '13px "Ma Shan Zheng", "Noto Serif SC", serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const body of state.bodies) {
    if (!body.name) continue;
    const p = worldToScreen(body.position.x, body.position.y);
    const rOff = body.radius * 2.2 * state.zoom + 8;
    const lx = p.x + rOff * 0.55;
    const ly = p.y - rOff * 0.55;
    // Hairline ink tick connecting to body
    ctx.strokeStyle = 'rgba(30, 22, 14, 0.35)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(p.x + (body.radius * 1.4 * state.zoom), p.y - (body.radius * 1.0 * state.zoom));
    ctx.lineTo(lx - 2, ly);
    ctx.stroke();
    // Text in ink tone, with a faint paper shadow for legibility
    ctx.fillStyle = 'rgba(245, 235, 210, 0.72)';
    ctx.fillText(body.name, lx + 0.6, ly + 0.6);
    ctx.fillStyle = 'rgba(19, 16, 13, 0.85)';
    ctx.fillText(body.name, lx, ly);
  }
  ctx.restore();
}

function drawGhostOrbit(ctx) {
  const previewColor = (inputs && inputs.color ? inputs.color.value : '#28445e') || '#28445e';
  const ghostSteps = 150;
  const ghostDt = state.timeScale;
  let tempPos = new Vector2(placeStart.x, placeStart.y);
  let tempVel;
  const dx = placeCurrent.x - placeStart.x;
  const dy = placeCurrent.y - placeStart.y;
  const dragDist = Math.hypot(dx, dy);
  if (dragDist >= dragMinThresholdPx) {
    tempVel = new Vector2(dx * velocityScale, dy * velocityScale);
  } else if (state.model === PhysicsModel.Keplerian || state.model === PhysicsModel.KeplerExact) {
    const rx = tempPos.x - starBody.position.x;
    const ry = tempPos.y - starBody.position.y;
    const r = Math.max(1, Math.hypot(rx, ry));
    const vMag = Math.sqrt(state.gravityConstant * starBody.mass / r);
    tempVel = new Vector2(-ry / r * vMag, rx / r * vMag);
  } else {
    tempVel = new Vector2(0, 0);
  }

  ctx.save();
  ctx.setLineDash([6 / state.zoom, 6 / state.zoom]);
  ctx.strokeStyle = hexA(previewColor, 0.55);
  ctx.lineWidth = 1.1 / state.zoom;
  ctx.beginPath();
  ctx.moveTo(tempPos.x, tempPos.y);
  for (let i = 0; i < ghostSteps; i++) {
    if (state.model === PhysicsModel.KeplerExact) {
      const tempBody = { position: tempPos, velocity: tempVel, fixed: false };
      keplerExactStep(tempBody, starBody, state.gravityConstant, ghostDt);
      tempPos = tempBody.position;
      tempVel = tempBody.velocity;
    } else {
      const dxs = starBody.position.x - tempPos.x;
      const dys = starBody.position.y - tempPos.y;
      const r2 = dxs * dxs + dys * dys + (state.model === PhysicsModel.Keplerian ? 0 : state.softening2);
      const invR = 1 / Math.sqrt(r2);
      const invR3 = invR * invR * invR;
      const ax = state.gravityConstant * starBody.mass * dxs * invR3;
      const ay = state.gravityConstant * starBody.mass * dys * invR3;
      tempPos.x += tempVel.x * ghostDt + 0.5 * ax * ghostDt * ghostDt;
      tempPos.y += tempVel.y * ghostDt + 0.5 * ay * ghostDt * ghostDt;
      const dx2 = starBody.position.x - tempPos.x;
      const dy2 = starBody.position.y - tempPos.y;
      const r22 = dx2 * dx2 + dy2 * dy2 + (state.model === PhysicsModel.Keplerian ? 0 : state.softening2);
      const invR2 = 1 / Math.sqrt(r22);
      const invR32 = invR2 * invR2 * invR2;
      const ax2 = state.gravityConstant * starBody.mass * dx2 * invR32;
      const ay2 = state.gravityConstant * starBody.mass * dy2 * invR32;
      tempVel.x += 0.5 * (ax + ax2) * ghostDt;
      tempVel.y += 0.5 * (ay + ay2) * ghostDt;
    }
    ctx.lineTo(tempPos.x, tempPos.y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawPlacementPreview() {
  if (!isPlacingPlanet || !placeStart || !placeCurrent) return;
  push();
  translate(width / 2, height / 2);
  translate(state.pan.x, state.pan.y);
  scale(state.zoom);
  translate(-width / 2, -height / 2);

  const ctx = drawingContext;
  const previewRadius = Number(inputs && inputs.radius ? inputs.radius.value : 6) || 6;
  const previewColor = (inputs && inputs.color ? inputs.color.value : '#28445e') || '#28445e';

  // Ghost ink blot at start
  ctx.save();
  const br = previewRadius * 2.4;
  const g = ctx.createRadialGradient(placeStart.x, placeStart.y, 0, placeStart.x, placeStart.y, br);
  g.addColorStop(0, hexA(previewColor, 0.55));
  g.addColorStop(0.6, hexA(previewColor, 0.15));
  g.addColorStop(1, hexA(previewColor, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(placeStart.x, placeStart.y, br, 0, Math.PI * 2); ctx.fill();

  // Brush arrow for velocity
  const dx = placeCurrent.x - placeStart.x;
  const dy = placeCurrent.y - placeStart.y;
  const ang = Math.atan2(dy, dx);
  const len = Math.hypot(dx, dy);
  ctx.strokeStyle = 'rgba(19,16,13,0.75)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.0 / state.zoom;
  ctx.beginPath();
  ctx.moveTo(placeStart.x, placeStart.y);
  ctx.lineTo(placeCurrent.x, placeCurrent.y);
  ctx.stroke();
  // arrowhead
  const headLen = 12 / state.zoom;
  ctx.beginPath();
  ctx.moveTo(placeCurrent.x, placeCurrent.y);
  ctx.lineTo(placeCurrent.x - headLen * Math.cos(ang - Math.PI / 7),
             placeCurrent.y - headLen * Math.sin(ang - Math.PI / 7));
  ctx.moveTo(placeCurrent.x, placeCurrent.y);
  ctx.lineTo(placeCurrent.x - headLen * Math.cos(ang + Math.PI / 7),
             placeCurrent.y - headLen * Math.sin(ang + Math.PI / 7));
  ctx.stroke();

  // Speed readout
  const speed = len * velocityScale;
  ctx.font = `${13 / state.zoom}px "Ma Shan Zheng", serif`;
  ctx.fillStyle = 'rgba(30,22,14,0.85)';
  ctx.fillText(`速 v=${speed.toFixed(2)}`, placeCurrent.x + 8 / state.zoom, placeCurrent.y - 10 / state.zoom);
  ctx.restore();
  pop();
}

// ============================================================================
// View / transforms
// ============================================================================

function screenToWorld(sx, sy) {
  const cx = width / 2, cy = height / 2;
  return new Vector2(
    cx + (sx - cx - state.pan.x) / state.zoom,
    cy + (sy - cy - state.pan.y) / state.zoom
  );
}

function worldToScreen(wx, wy) {
  const cx = width / 2, cy = height / 2;
  return new Vector2(
    cx + state.pan.x + (wx - cx) * state.zoom,
    cy + state.pan.y + (wy - cy) * state.zoom
  );
}

function isPointerOverUI() {
  try {
    const rect = canvasEl?.getBoundingClientRect();
    if (!rect) return false;
    const el = document.elementFromPoint(rect.left + mouseX, rect.top + mouseY);
    if (!el) return false;
    return !!el.closest('#control-panel, #btn-expand-panel, .floating-toggle, #status-bar, #corner-title, #compass-rose, #canvas-hint');
  } catch (_) { return false; }
}

function centerOn(target) {
  const cx = width / 2, cy = height / 2;
  const wx = typeof target?.x === 'number' ? target.x : target?.position?.x;
  const wy = typeof target?.y === 'number' ? target.y : target?.position?.y;
  if (typeof wx !== 'number' || typeof wy !== 'number') return;
  state.pan.x = -((wx - cx) * state.zoom);
  state.pan.y = -((wy - cy) * state.zoom);
}

function fitAllBodies() {
  if (!state.bodies.length) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of state.bodies) {
    minX = Math.min(minX, b.position.x);
    minY = Math.min(minY, b.position.y);
    maxX = Math.max(maxX, b.position.x);
    maxY = Math.max(maxY, b.position.y);
  }
  const pad = 80;
  const worldW = Math.max(1, maxX - minX);
  const worldH = Math.max(1, maxY - minY);
  const newZoom = Math.max(0.25, Math.min(3.0,
    Math.min((width - pad * 2) / worldW, (height - pad * 2) / worldH)));
  state.zoom = newZoom;
  centerOn({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
}

// ============================================================================
// Save / Load
// ============================================================================

function exportState() {
  return {
    version: 2,
    model: state.model,
    gravityConstant: state.gravityConstant,
    timeScale: state.timeScale,
    softening2: state.softening2,
    trailLength: state.trailLength,
    zoom: state.zoom,
    pan: { x: state.pan.x, y: state.pan.y },
    flags: {
      collide: state.collide,
      showGhostOrbit: state.showGhostOrbit,
      showGrid: state.showGrid,
      showLabels: state.showLabels,
    },
    audio: {
      enabled: !!(audioCheckbox && audioCheckbox.checked),
      reverb: !!(checkboxReverb && checkboxReverb.checked),
      phaseByOrbit: !!(checkboxPhaseOrbit && checkboxPhaseOrbit.checked),
      rhythm: rhythmModeSelect ? rhythmModeSelect.value : 'off',
      masterVolume: Number(rangeMasterVol?.value || 0.6),
      bpm: metronomeBpm,
      scale: selectScale ? selectScale.value : 'gong',
      root: selectRoot ? selectRoot.value : 'G',
      subdiv: selectSubdiv ? selectSubdiv.value : '4',
    },
    bodies: state.bodies.map((b) => ({
      id: b.id, name: b.name, mass: b.mass, radius: b.radius, color: b.color,
      position: { x: b.position.x, y: b.position.y },
      velocity: { x: b.velocity.x, y: b.velocity.y },
      fixed: b.fixed, timbre: b.timbre || 'sine',
      muted: !!b.muted, solo: !!b.solo, seed: b.seed,
    })),
  };
}

function importState(obj) {
  if (!obj || !obj.bodies) return;
  for (const b of state.bodies) stopBodyAudio(b);
  state.bodies = [];
  state.nextId = 1;
  if (typeof obj.gravityConstant === 'number') state.gravityConstant = obj.gravityConstant;
  if (typeof obj.timeScale === 'number') state.timeScale = obj.timeScale;
  if (typeof obj.softening2 === 'number') state.softening2 = obj.softening2;
  if (typeof obj.trailLength === 'number') state.trailLength = obj.trailLength;
  if (obj.model) state.model = obj.model;
  if (obj.zoom) state.zoom = obj.zoom;
  if (obj.pan) state.pan = new Vector2(obj.pan.x || 0, obj.pan.y || 0);
  if (obj.flags) {
    state.collide = !!obj.flags.collide;
    state.showGhostOrbit = obj.flags.showGhostOrbit !== false;
    state.showGrid = !!obj.flags.showGrid;
    state.showLabels = obj.flags.showLabels !== false;
  }
  for (const b of obj.bodies) {
    addBody({
      name: b.name, mass: b.mass, radius: b.radius, color: b.color,
      position: new Vector2(b.position.x, b.position.y),
      velocity: new Vector2(b.velocity.x, b.velocity.y),
      fixed: !!b.fixed, timbre: b.timbre || 'sine',
      muted: !!b.muted, solo: !!b.solo, seed: b.seed,
    });
  }
  const anyStar = state.bodies.find((b) => b.fixed);
  starBody = anyStar || null;

  // Reflect UI
  if (selectModel) selectModel.value = state.model;
  if (rangeDt) { rangeDt.value = String(state.timeScale); labelDt.textContent = state.timeScale.toFixed(2); }
  if (rangeG) { rangeG.value = String(state.gravityConstant); labelG.textContent = state.gravityConstant.toFixed(1); }
  if (rangeTrail) { rangeTrail.value = String(state.trailLength); labelTrail.textContent = String(state.trailLength); }
  if (rangeSoft) { rangeSoft.value = String(state.softening2); labelSoft.textContent = String(state.softening2); }
  if (checkboxCollide) checkboxCollide.checked = state.collide;
  if (checkboxGhostOrbit) checkboxGhostOrbit.checked = state.showGhostOrbit;
  if (checkboxGrid) checkboxGrid.checked = state.showGrid;
  if (checkboxLabels) checkboxLabels.checked = state.showLabels;

  const a = obj.audio || {};
  if (audioCheckbox) audioCheckbox.checked = !!a.enabled;
  if (checkboxReverb) checkboxReverb.checked = !!a.reverb;
  if (checkboxPhaseOrbit) checkboxPhaseOrbit.checked = !!a.phaseByOrbit;
  if (rhythmModeSelect && a.rhythm) rhythmModeSelect.value = a.rhythm;
  if (rangeMasterVol && typeof a.masterVolume === 'number') {
    rangeMasterVol.value = String(a.masterVolume);
    labelMasterVol.textContent = a.masterVolume.toFixed(2);
    if (masterGainNode) masterGainNode.gain.value = a.masterVolume;
  }
  if (typeof a.bpm === 'number') {
    metronomeBpm = a.bpm;
    if (rangeBpm) rangeBpm.value = String(a.bpm);
    if (labelBpm) labelBpm.textContent = String(a.bpm);
  }
  if (selectScale && a.scale) selectScale.value = a.scale;
  if (selectRoot && a.root) selectRoot.value = a.root;
  if (selectSubdiv && a.subdiv) selectSubdiv.value = String(a.subdiv);

  refreshBodiesUI();
  updateStatusModel();
  fitAllBodies();
}

// ============================================================================
// Presets
// ============================================================================

function loadPresetSolarMini() {
  resetSimulation();
  const AU = 130;
  const G = state.gravityConstant;
  const M = starBody.mass;
  const circV = (r) => Math.sqrt(G * M / r);
  const planets = [
    { name: '水 · Mercury',  r: 0.42, color: '#8e6a3a', radius: 4, timbre: 'bell' },
    { name: '金 · Venus',    r: 0.72, color: '#a47338', radius: 5.5, timbre: 'organ' },
    { name: '地 · Earth',    r: 1.00, color: '#28445e', radius: 6, timbre: 'sine' },
    { name: '火 · Mars',     r: 1.46, color: '#7a4c3c', radius: 5, timbre: 'triangle' },
    { name: '木 · Jupiter',  r: 2.30, color: '#6b7d55', radius: 10, timbre: 'pluck' },
    { name: '土 · Saturn',   r: 3.00, color: '#88a396', radius: 8.5, timbre: 'pluck' },
  ];
  for (const p of planets) {
    const pos = new Vector2(state.canvasCenter.x + p.r * AU, state.canvasCenter.y);
    addBody({
      name: p.name, mass: 3 + Math.random() * 3, radius: p.radius, color: p.color,
      position: pos, velocity: new Vector2(0, circV(p.r * AU)), timbre: p.timbre,
    });
  }
  state.model = PhysicsModel.KeplerExact;
  if (selectModel) selectModel.value = 'kepler_exact';
  state.isRunning = true;
  if (btnToggle) btnToggle.querySelector('.cn').textContent = '息';
  if (btnToggle) btnToggle.querySelector('.en').textContent = 'Pause';
  if (statusPlay) statusPlay.textContent = '動 · Flowing';
  updateStatusModel();
  fitAllBodies();
}

function loadPresetBinaryStars() {
  hardReset();
  const center = state.canvasCenter.clone();
  const M1 = 800, M2 = 600, sep = 220;
  const G = state.gravityConstant;
  // circular mutual orbit about barycenter
  const mu = G * (M1 + M2);
  const omega = Math.sqrt(mu / (sep * sep * sep));
  const r1 = sep * M2 / (M1 + M2);
  const r2 = sep * M1 / (M1 + M2);
  addBody({
    name: '甲 · Star A', mass: M1, radius: 20, color: '#a47338',
    position: new Vector2(center.x - r1, center.y),
    velocity: new Vector2(0, -omega * r1),
    timbre: 'organ',
  });
  addBody({
    name: '乙 · Star B', mass: M2, radius: 17, color: '#8e6a3a',
    position: new Vector2(center.x + r2, center.y),
    velocity: new Vector2(0, omega * r2),
    timbre: 'organ',
  });
  // A couple planets around barycenter
  const outer = 420;
  const vOut = Math.sqrt(G * (M1 + M2) / outer);
  addBody({
    name: '伴一', mass: 4, radius: 6, color: '#28445e',
    position: new Vector2(center.x, center.y + outer),
    velocity: new Vector2(-vOut, 0), timbre: 'bell',
  });
  addBody({
    name: '伴二', mass: 3, radius: 5, color: '#6b7d55',
    position: new Vector2(center.x + outer * 1.15, center.y - outer * 0.3),
    velocity: new Vector2(vOut * 0.25, vOut * 0.9), timbre: 'pluck',
  });
  state.model = PhysicsModel.NBody;
  if (selectModel) selectModel.value = 'nbody';
  starBody = state.bodies[0];
  state.isRunning = true;
  if (statusPlay) statusPlay.textContent = '動 · Flowing';
  updateStatusModel();
  fitAllBodies();
}

function loadPresetAsteroidRing() {
  resetSimulation();
  const center = state.canvasCenter.clone();
  const G = state.gravityConstant;
  const ringR = 280;
  const count = 120;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.05;
    const r = ringR + (Math.random() - 0.5) * 14;
    const x = center.x + r * Math.cos(angle);
    const y = center.y + r * Math.sin(angle);
    const vMag = Math.sqrt(G * starBody.mass / r);
    addBody({
      name: `塵${i + 1}`, mass: 0.05, radius: 2 + Math.random() * 1.6,
      color: BodyInkPalette[i % BodyInkPalette.length],
      position: new Vector2(x, y),
      velocity: new Vector2(-Math.sin(angle) * vMag, Math.cos(angle) * vMag),
      timbre: 'pluck',
      muted: i % 6 !== 0,  // sparse sonification
    });
  }
  state.model = PhysicsModel.Keplerian;
  if (selectModel) selectModel.value = 'keplerian';
  state.isRunning = true;
  if (statusPlay) statusPlay.textContent = '動 · Flowing';
  updateStatusModel();
  fitAllBodies();
}

function loadPresetRandomSystem() {
  resetSimulation();
  const n = 6 + Math.floor(Math.random() * 6);
  const G = state.gravityConstant;
  for (let i = 0; i < n; i++) {
    const r = 110 + Math.random() * 380;
    const angle = Math.random() * Math.PI * 2;
    const x = state.canvasCenter.x + r * Math.cos(angle);
    const y = state.canvasCenter.y + r * Math.sin(angle);
    const vMag = Math.sqrt(G * starBody.mass / r) * (0.75 + Math.random() * 0.5);
    const col = BodyInkPalette[i % BodyInkPalette.length];
    const timbres = ['sine', 'triangle', 'bell', 'pluck', 'organ'];
    addBody({
      name: `星${i + 1}`, mass: 1.5 + Math.random() * 6,
      radius: 3.5 + Math.random() * 5.5,
      color: col,
      position: new Vector2(x, y),
      velocity: new Vector2(-Math.sin(angle) * vMag, Math.cos(angle) * vMag),
      timbre: timbres[i % timbres.length],
    });
  }
  state.model = PhysicsModel.Keplerian;
  if (selectModel) selectModel.value = 'keplerian';
  state.isRunning = true;
  if (statusPlay) statusPlay.textContent = '動 · Flowing';
  updateStatusModel();
  fitAllBodies();
}

// Trojan dance: Sun + small primary at L0 + ~massless tracers at L4/L5.
// L4/L5 stability requires M_secondary / M_primary < 1/24.96 (Routh-Hurwitz
// criterion for the planar circular restricted three-body problem). We place
// bodies in true barycentric initial conditions so the configuration drifts
// in a real co-rotating frame, not an approximate one.
function loadPresetTrojan() {
  hardReset();
  const G = state.gravityConstant;
  const center = state.canvasCenter.clone();
  const M_sun = 2000;
  const M_jup = 60;                                      // ratio 0.030 < 0.04007 → stable
  const R = 280;                                         // sun-jupiter separation
  const M_total = M_sun + M_jup;
  const omega = Math.sqrt(G * M_total / (R * R * R));    // common angular velocity

  // Place barycenter at canvas center → primaries on opposite sides of it.
  const r_sun = R * M_jup / M_total;                     // sun's distance from barycenter
  const r_jup = R * M_sun / M_total;                     // jupiter's distance from barycenter

  // Sun: at -x from barycenter, moving +y
  const sun = addBody({
    name: '日 · Sol', mass: M_sun, radius: 22, color: '#a47338',
    position: new Vector2(center.x - r_sun, center.y),
    velocity: new Vector2(0, -omega * r_sun),            // counter-rotating
    fixed: false,
    timbre: 'organ',
  });
  starBody = sun;

  // Jupiter: at +x from barycenter, moving -y
  addBody({
    name: '木 · Jupiter', mass: M_jup, radius: 12, color: '#6b7d55',
    position: new Vector2(center.x + r_jup, center.y),
    velocity: new Vector2(0, omega * r_jup),
    timbre: 'pluck',
  });

  // L4 / L5: equilateral triangle with the two primaries, distance R from each.
  // In barycentric coords (sun at -r_sun, jupiter at +r_jup along x),
  // L4 = ((r_jup - r_sun)/2, +R·√3/2), L5 mirrored below the axis.
  const Lx = (r_jup - r_sun) * 0.5;
  const Ly = R * Math.sqrt(3) / 2;

  for (const side of [+1, -1]) {
    const px = Lx;
    const py = side * Ly;
    // L-point co-rotates with the primaries: v = ω × r, where r is the
    // position vector from the barycenter (origin in this local frame).
    // ω is along +z (counterclockwise), so v = (-ω·py, +ω·px).
    addBody({
      name: side > 0 ? '伴 L4' : '伴 L5',
      mass: 0.4, radius: 5,                              // ~massless tracer
      color: side > 0 ? '#28445e' : '#7a4c3c',
      position: new Vector2(center.x + px, center.y + py),
      velocity: new Vector2(-omega * py, omega * px),
      timbre: 'bell',
    });
  }

  state.model = PhysicsModel.NBody;
  if (selectModel) selectModel.value = 'nbody';
  state.isRunning = true;
  if (statusPlay) statusPlay.textContent = '動 · Flowing';
  updateStatusModel();
  fitAllBodies();
}

// Chenciner–Montgomery figure-8 three-body choreography.
// Canonical units (G=1, m=1) positions & velocities, scaled to canvas.
function loadPresetFigure8() {
  hardReset();
  const center = state.canvasCenter.clone();
  const G = state.gravityConstant;
  const m = 160;                    // per-body mass
  const R = 150;                    // length scale (pixels per canonical unit)
  const s = Math.sqrt(G * m / R);   // time-scaling factor sqrt(Gm/R)

  const p1 = new Vector2( 0.97000436,  -0.24308753);
  const p2 = new Vector2(-0.97000436,   0.24308753);
  const p3 = new Vector2( 0,            0);
  const v3 = new Vector2(-0.93240737,  -0.86473146);
  const v1 = new Vector2(-v3.x / 2,    -v3.y / 2);
  const v2 = new Vector2(-v3.x / 2,    -v3.y / 2);

  addBody({
    name: '甲', mass: m, radius: 10, color: '#13100d',
    position: new Vector2(center.x + p1.x * R, center.y + p1.y * R),
    velocity: new Vector2(v1.x * s, v1.y * s),
    timbre: 'bell',
  });
  addBody({
    name: '乙', mass: m, radius: 10, color: '#28445e',
    position: new Vector2(center.x + p2.x * R, center.y + p2.y * R),
    velocity: new Vector2(v2.x * s, v2.y * s),
    timbre: 'bell',
  });
  addBody({
    name: '丙', mass: m, radius: 10, color: '#a47338',
    position: new Vector2(center.x + p3.x * R, center.y + p3.y * R),
    velocity: new Vector2(v3.x * s, v3.y * s),
    timbre: 'pluck',
  });
  starBody = state.bodies[2];
  state.model = PhysicsModel.NBody;
  if (selectModel) selectModel.value = 'nbody';
  // longer trails, lower G jitter — this orbit needs accuracy
  state.timeScale = 0.25;
  if (rangeDt) { rangeDt.value = '0.25'; labelDt.textContent = '0.25'; }
  state.trailLength = 400;
  if (rangeTrail) { rangeTrail.value = '400'; labelTrail.textContent = '400'; }
  state.isRunning = true;
  if (statusPlay) statusPlay.textContent = '動 · Flowing';
  updateStatusModel();
  fitAllBodies();
}

// ============================================================================
// Mouse handling (placement, pan, select, zoom)
// ============================================================================

function mousePressed() {
  if (mouseX < 0 || mouseY < 0 || mouseX > width || mouseY > height) return;
  if (isPointerOverUI()) return;
  const isRight = typeof RIGHT !== 'undefined' ? mouseButton === RIGHT : false;
  const isMiddle = typeof CENTER !== 'undefined' ? mouseButton === CENTER : false;
  const panModifier = keyIsDown(SHIFT);
  if (isRight || isMiddle || panModifier) {
    isPanning = true;
    panStartScreen = { x: mouseX, y: mouseY };
    panStartPan = new Vector2(state.pan.x, state.pan.y);
  } else {
    const world = screenToWorld(mouseX, mouseY);
    const hit = pickBodyAt(world.x, world.y);
    if (hit) { selectBody(hit.id); return; }
    isPlacingPlanet = true;
    placeStart = new Vector2(world.x, world.y);
    placeCurrent = new Vector2(world.x, world.y);
  }
}

function mouseDragged() {
  if (isPanning && panStartScreen && panStartPan) {
    state.pan.x = panStartPan.x + (mouseX - panStartScreen.x);
    state.pan.y = panStartPan.y + (mouseY - panStartScreen.y);
    return;
  }
  if (!isPlacingPlanet) return;
  const w = screenToWorld(mouseX, mouseY);
  placeCurrent.x = w.x;
  placeCurrent.y = w.y;
}

function mouseReleased() {
  if (isPanning) { isPanning = false; panStartScreen = null; panStartPan = null; return; }
  if (!isPlacingPlanet || !placeStart) return;

  const s0 = worldToScreen(placeStart.x, placeStart.y);
  const dxS = mouseX - s0.x;
  const dyS = mouseY - s0.y;
  const dragDist = Math.hypot(dxS, dyS);
  const useVel = dragDist >= dragMinThresholdPx;

  const name = (inputs && inputs.name && inputs.name.value.trim()) || `星${state.nextId}`;
  const color = (inputs && inputs.color && inputs.color.value) || '#28445e';
  const timbre = (inputs && inputs.timbre && inputs.timbre.value) || 'sine';
  const mass = Number(inputs && inputs.mass ? inputs.mass.value : 5) || 5;
  const radius = Number(inputs && inputs.radius ? inputs.radius.value : 6) || 6;

  const velocity = useVel
    ? new Vector2(dxS * velocityScale, dyS * velocityScale)
    : new Vector2(0, 0);

  if (!useVel && starBody && (state.model === PhysicsModel.Keplerian || state.model === PhysicsModel.KeplerExact)) {
    const dx = placeStart.x - starBody.position.x;
    const dy = placeStart.y - starBody.position.y;
    const r = Math.max(1, Math.hypot(dx, dy));
    const vMag = Math.sqrt(state.gravityConstant * starBody.mass / r);
    velocity.x = -dy / r * vMag;
    velocity.y = dx / r * vMag;
  }

  addBody({
    name, color, timbre, mass, radius,
    position: new Vector2(placeStart.x, placeStart.y),
    velocity,
  });
  selectBody(state.bodies[state.bodies.length - 1].id);
  isPlacingPlanet = false;
  placeStart = null;
  placeCurrent = null;
}

function mouseWheel(event) {
  const target = event && event.target;
  const cEl = document.querySelector('#canvas-holder canvas');
  if (!cEl || !cEl.contains(target)) return true;
  const factor = event.deltaY > 0 ? 0.9 : 1.1;
  state.zoom = Math.max(0.25, Math.min(4.0, state.zoom * factor));
  return false;
}

// ============================================================================
// Body lifecycle
// ============================================================================

function addBody({ name, mass, radius, color, position, velocity, fixed = false,
                   timbre = 'sine', muted = false, solo = false, seed = null }) {
  const body = new CelestialBody({
    id: state.nextId++,
    name: name || `星${state.nextId}`,
    mass: Number(mass),
    radius: Number(radius),
    color: color || '#28445e',
    position: position || state.canvasCenter.clone(),
    velocity: velocity || new Vector2(0, 0),
    fixed, timbre, muted, solo, seed,
  });
  state.bodies.push(body);
  refreshBodiesUI();
  return body;
}

function removeBody(id) {
  const idx = state.bodies.findIndex((b) => b.id === id);
  if (idx >= 0) {
    const removed = state.bodies.splice(idx, 1)[0];
    if (removed === starBody) {
      starBody = state.bodies.find((b) => b.fixed) || null;
      if (!starBody && (state.model === PhysicsModel.Keplerian || state.model === PhysicsModel.KeplerExact)) {
        state.model = PhysicsModel.NBody;
        if (selectModel) selectModel.value = 'nbody';
        updateStatusModel();
      }
    }
    stopBodyAudio(removed);
    if (selectedBodyId === id) { selectedBodyId = null; if (inspectorCard) inspectorCard.hidden = true; }
    refreshBodiesUI();
  }
}

function hardReset() {
  for (const b of state.bodies) stopBodyAudio(b);
  state.bodies = [];
  state.nextId = 1;
  selectedBodyId = null;
  if (inspectorCard) inspectorCard.hidden = true;
  state.pan = new Vector2(0, 0);
  state.zoom = 1.0;
  refreshBodiesUI();
}

function resetSimulation() {
  hardReset();
  state.model = PhysicsModel.Keplerian;
  if (selectModel) selectModel.value = 'keplerian';
  starBody = addBody({
    name: '日 · Sol',
    mass: 1000,
    radius: 18,
    color: '#a47338',
    position: state.canvasCenter.clone(),
    velocity: new Vector2(0, 0),
    fixed: true,
    timbre: 'organ',
  });
  updateStatusModel();
}

// ============================================================================
// UI setup
// ============================================================================

function initUI() {
  btnToggle = document.getElementById('btn-toggle');
  btnStep = document.getElementById('btn-step');
  btnReset = document.getElementById('btn-reset');
  selectModel = document.getElementById('select-model');
  rangeDt = document.getElementById('range-dt');
  labelDt = document.getElementById('label-dt');
  rangeG = document.getElementById('range-g');
  labelG = document.getElementById('label-g');
  rangeTrail = document.getElementById('range-trail');
  labelTrail = document.getElementById('label-trail');
  rangeSoft = document.getElementById('range-soft');
  labelSoft = document.getElementById('label-soft');
  formAdd = document.getElementById('form-add');
  bodiesList = document.getElementById('list-bodies');
  statusPlay = document.getElementById('status-playstate');
  statusModel = document.getElementById('status-model');
  statusBodies = document.getElementById('status-bodies');
  statusEnergy = document.getElementById('status-energy');
  btnCollapsePanel = document.getElementById('btn-collapse-panel');
  btnExpandPanel = document.getElementById('btn-expand-panel');
  appRoot = document.getElementById('app');
  controlPanelEl = document.getElementById('control-panel');
  audioCheckbox = document.getElementById('checkbox-audio');
  rhythmModeSelect = document.getElementById('select-rhythm');
  btnCenter = document.getElementById('btn-center');
  btnFit = document.getElementById('btn-fit');
  btnSave = document.getElementById('btn-save');
  btnLoad = document.getElementById('btn-load');
  fileInput = document.getElementById('input-file');
  rangeMasterVol = document.getElementById('range-master-volume');
  labelMasterVol = document.getElementById('label-master-volume');
  presetSolarBtn = document.getElementById('preset-solar');
  presetBinaryBtn = document.getElementById('preset-binary');
  presetRingBtn = document.getElementById('preset-ring');
  presetRandomBtn = document.getElementById('preset-random');
  presetTrojanBtn = document.getElementById('preset-trojan');
  presetFigure8Btn = document.getElementById('preset-figure8');
  inspectorCard = document.getElementById('inspector-card');
  formInspector = document.getElementById('form-inspector');
  insName = document.getElementById('ins-name');
  insColor = document.getElementById('ins-color');
  insMass = document.getElementById('ins-mass');
  insRadius = document.getElementById('ins-radius');
  insVelX = document.getElementById('ins-velx');
  insVelY = document.getElementById('ins-vely');
  insDeselect = document.getElementById('ins-deselect');
  insRemove = document.getElementById('ins-remove');
  readOrbit = document.getElementById('read-orbit');
  readPeriod = document.getElementById('read-period');
  readSpeed = document.getElementById('read-speed');
  checkboxReverb = document.getElementById('checkbox-reverb');
  checkboxPhaseOrbit = document.getElementById('checkbox-phase-orbit');
  checkboxCollide = document.getElementById('checkbox-collide');
  checkboxGhostOrbit = document.getElementById('checkbox-ghost-orbit');
  checkboxGrid = document.getElementById('checkbox-grid');
  checkboxLabels = document.getElementById('checkbox-labels');
  selectScale = document.getElementById('select-scale');
  selectRoot = document.getElementById('select-root');
  selectSubdiv = document.getElementById('select-subdiv');
  rangeBpm = document.getElementById('range-bpm');
  labelBpm = document.getElementById('label-bpm');

  inputs = {
    name: document.getElementById('input-name'),
    color: document.getElementById('input-color'),
    timbre: document.getElementById('input-timbre'),
    mass: document.getElementById('input-mass'),
    radius: document.getElementById('input-radius'),
    posx: document.getElementById('input-posx'),
    posy: document.getElementById('input-posy'),
    velx: document.getElementById('input-velx'),
    vely: document.getElementById('input-vely'),
  };

  // Play/step/reset
  btnToggle.addEventListener('click', () => {
    state.isRunning = !state.isRunning;
    const cn = btnToggle.querySelector('.cn');
    const en = btnToggle.querySelector('.en');
    if (cn) cn.textContent = state.isRunning ? '息' : '啟';
    if (en) en.textContent = state.isRunning ? 'Pause' : 'Play';
    statusPlay.textContent = state.isRunning ? '動 · Flowing' : '靜 · Still';
  });
  btnStep.addEventListener('click', () => {
    state.isRunning = false;
    const cn = btnToggle.querySelector('.cn'); const en = btnToggle.querySelector('.en');
    if (cn) cn.textContent = '啟'; if (en) en.textContent = 'Play';
    statusPlay.textContent = '靜 · Still';
    stepSimulation();
  });
  btnReset.addEventListener('click', () => {
    state.isRunning = false;
    const cn = btnToggle.querySelector('.cn'); const en = btnToggle.querySelector('.en');
    if (cn) cn.textContent = '啟'; if (en) en.textContent = 'Play';
    statusPlay.textContent = '靜 · Still';
    resetSimulation();
  });

  // Model select
  selectModel.addEventListener('change', (e) => {
    const v = e.target.value;
    state.model = v === 'nbody' ? PhysicsModel.NBody
               : v === 'kepler_exact' ? PhysicsModel.KeplerExact
               : PhysicsModel.Keplerian;
    updateStatusModel();
  });

  // Physics sliders
  rangeDt.addEventListener('input', () => {
    state.timeScale = Number(rangeDt.value);
    labelDt.textContent = state.timeScale.toFixed(2);
  });
  rangeG.addEventListener('input', () => {
    state.gravityConstant = Number(rangeG.value);
    labelG.textContent = state.gravityConstant.toFixed(1);
  });
  rangeTrail.addEventListener('input', () => {
    state.trailLength = parseInt(rangeTrail.value, 10);
    labelTrail.textContent = String(state.trailLength);
  });
  rangeSoft.addEventListener('input', () => {
    state.softening2 = Number(rangeSoft.value);
    labelSoft.textContent = state.softening2.toFixed(1);
  });

  // Visual toggles
  checkboxCollide.addEventListener('change', () => { state.collide = checkboxCollide.checked; });
  checkboxGhostOrbit.addEventListener('change', () => { state.showGhostOrbit = checkboxGhostOrbit.checked; });
  checkboxGrid.addEventListener('change', () => { state.showGrid = checkboxGrid.checked; });
  checkboxLabels.addEventListener('change', () => { state.showLabels = checkboxLabels.checked; });

  // Add-planet form
  formAdd.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = inputs.name.value.trim() || `星${state.nextId}`;
    const color = inputs.color.value;
    const timbre = inputs.timbre.value;
    const mass = parseFloat(inputs.mass.value || '5');
    const radius = parseFloat(inputs.radius.value || '6');
    const posx = parseFloat(inputs.posx.value || '0');
    const posy = parseFloat(inputs.posy.value || '0');
    const velx = parseFloat(inputs.velx.value || '0');
    const vely = parseFloat(inputs.vely.value || '0');
    addBody({
      name, color, timbre, mass, radius,
      position: Vector2.add(state.canvasCenter, new Vector2(posx, posy)),
      velocity: new Vector2(velx, vely),
    });
    // Keep color & timbre sticky; clear name so user gets fresh placeholder
    inputs.name.value = '';
  });

  refreshBodiesUI();
  updateStatusModel();

  // Collapse / expand
  function resizeCanvasToContainer() {
    const container = document.getElementById('canvas-holder');
    if (!container) return;
    const w = Math.max(1, Math.floor(container.clientWidth));
    const h = Math.max(1, Math.floor(container.clientHeight));
    if (w !== width || h !== height) {
      resizeCanvas(w, h);
      state.canvasCenter = new Vector2(width / 2, height / 2);
      rebuildPaperGraphics();
    }
  }
  function setPanelCollapsed(collapsed) {
    if (!appRoot) return;
    appRoot.classList.toggle('panel-collapsed', collapsed);
    requestAnimationFrame(resizeCanvasToContainer);
  }
  btnCollapsePanel.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setPanelCollapsed(true); });
  btnExpandPanel.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setPanelCollapsed(false); });

  // Audio on/off
  audioCheckbox.addEventListener('change', () => {
    if (audioCheckbox.checked) {
      ensureAudioContext();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    } else {
      for (const b of state.bodies) stopBodyAudio(b);
    }
  });
  rhythmModeSelect.addEventListener('change', () => { lastTickTime = 0; });
  rangeMasterVol.addEventListener('input', () => {
    const v = Number(rangeMasterVol.value);
    labelMasterVol.textContent = v.toFixed(2);
    if (masterGainNode) masterGainNode.gain.value = v;
  });
  rangeBpm.addEventListener('input', () => {
    metronomeBpm = Number(rangeBpm.value);
    labelBpm.textContent = String(metronomeBpm);
  });
  checkboxReverb.addEventListener('change', () => {
    ensureAudioContext();
    ensureReverb();
    if (!audioCtx || !reverbNode || !reverbDryGain || !reverbWetGain) return;
    const wet = checkboxReverb.checked ? 0.55 : 0;
    const dry = checkboxReverb.checked ? 0.7 : 1.0;
    reverbWetGain.gain.setTargetAtTime(wet, audioCtx.currentTime, 0.05);
    reverbDryGain.gain.setTargetAtTime(dry, audioCtx.currentTime, 0.05);
  });

  // View
  btnCenter.addEventListener('click', () => centerOn(starBody || state.canvasCenter));
  btnFit.addEventListener('click', fitAllBodies);

  // Save / Load
  btnSave.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(exportState(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ink-cosmos-scroll.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  btnLoad.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { importState(JSON.parse(await file.text())); }
    catch (err) { console.error('Failed to load scene', err); }
    fileInput.value = '';
  });

  // Presets
  presetSolarBtn.addEventListener('click', loadPresetSolarMini);
  presetBinaryBtn.addEventListener('click', loadPresetBinaryStars);
  presetRingBtn.addEventListener('click', loadPresetAsteroidRing);
  presetRandomBtn.addEventListener('click', loadPresetRandomSystem);
  presetTrojanBtn.addEventListener('click', loadPresetTrojan);
  presetFigure8Btn.addEventListener('click', loadPresetFigure8);

  // Inspector
  insName.addEventListener('input', () => withSelected((b) => { b.name = insName.value; refreshBodiesUI(); }));
  insColor.addEventListener('input', () => withSelected((b) => { b.color = insColor.value; refreshBodiesUI(); }));
  insMass.addEventListener('input', () => withSelected((b) => { b.mass = Number(insMass.value) || b.mass; }));
  insRadius.addEventListener('input', () => withSelected((b) => { b.radius = Number(insRadius.value) || b.radius; }));
  insVelX.addEventListener('input', () => withSelected((b) => { b.velocity.x = Number(insVelX.value) || 0; }));
  insVelY.addEventListener('input', () => withSelected((b) => { b.velocity.y = Number(insVelY.value) || 0; }));
  insDeselect.addEventListener('click', deselectBody);
  insRemove.addEventListener('click', () => { if (selectedBodyId != null) removeBody(selectedBodyId); deselectBody(); });

  // Reflect default model label
  updateStatusModel();
}

function withSelected(fn) {
  if (selectedBodyId == null) return;
  const b = state.bodies.find((x) => x.id === selectedBodyId);
  if (b) fn(b);
}

function updateStatusModel() {
  if (!statusModel) return;
  const label = state.model === PhysicsModel.Keplerian ? '法 · Keplerian'
              : state.model === PhysicsModel.KeplerExact ? '法 · Kepler exact'
              : '法 · N-Body';
  statusModel.textContent = label;
}

// ============================================================================
// Bodies list UI (FIXED: no double-append of chip)
// ============================================================================

function refreshBodiesUI() {
  if (!statusBodies || !bodiesList) return;
  statusBodies.textContent = `星 · ${state.bodies.length}`;

  bodiesList.innerHTML = '';
  for (const body of state.bodies) {
    const li = document.createElement('li');
    if (selectedBodyId === body.id) li.classList.add('selected');
    li.addEventListener('click', () => selectBody(body.id));

    const left = document.createElement('div');
    left.className = 'body-left';

    const chip = document.createElement('div');
    chip.className = 'body-chip';
    const dot = document.createElement('span');
    dot.className = 'chip-color';
    dot.style.setProperty('--chip-color', body.color);
    const name = document.createElement('span');
    name.className = 'body-name';
    name.textContent = body.name;
    name.title = `m=${body.mass.toFixed(2)}  r=${body.radius.toFixed(1)}`;
    chip.appendChild(dot);
    chip.appendChild(name);

    const sub = document.createElement('div');
    sub.className = 'body-subinfo';
    const tag = document.createElement('span');
    tag.className = 'body-tag';
    tag.textContent = body.fixed ? '固 · fixed' : `音 · ${body.timbre}`;
    const statsText = document.createElement('span');
    const speed = Math.hypot(body.velocity.x, body.velocity.y);
    statsText.textContent = `m ${body.mass.toFixed(1)} · |v| ${speed.toFixed(2)}`;
    sub.appendChild(tag);
    sub.appendChild(statsText);

    left.appendChild(chip);
    left.appendChild(sub);

    const actions = document.createElement('div');
    actions.className = 'body-actions';

    const muteBtn = document.createElement('button');
    muteBtn.className = 'mini-btn' + (body.muted ? ' active' : '');
    muteBtn.textContent = body.muted ? '啞' : '鳴';
    muteBtn.title = body.muted ? 'Unmute' : 'Mute';
    muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      body.muted = !body.muted;
      refreshBodiesUI();
    });

    const soloBtn = document.createElement('button');
    soloBtn.className = 'mini-btn' + (body.solo ? ' active' : '');
    soloBtn.textContent = body.solo ? '獨' : '伴';
    soloBtn.title = body.solo ? 'Unsolo' : 'Solo';
    soloBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      body.solo = !body.solo;
      refreshBodiesUI();
    });

    const rmBtn = document.createElement('button');
    rmBtn.className = 'mini-btn danger';
    rmBtn.textContent = '消';
    rmBtn.title = 'Remove';
    rmBtn.addEventListener('click', (e) => { e.stopPropagation(); removeBody(body.id); });

    actions.appendChild(muteBtn);
    actions.appendChild(soloBtn);
    actions.appendChild(rmBtn);

    li.appendChild(left);
    li.appendChild(actions);
    bodiesList.appendChild(li);
  }
}

function pickBodyAt(wx, wy) {
  for (let i = state.bodies.length - 1; i >= 0; i--) {
    const b = state.bodies[i];
    const dx = wx - b.position.x;
    const dy = wy - b.position.y;
    if (dx * dx + dy * dy <= (b.radius * 2.2) ** 2) return b;
  }
  return null;
}

function selectBody(id) {
  selectedBodyId = id;
  const b = state.bodies.find((x) => x.id === id);
  if (!b) return deselectBody();
  inspectorCard.hidden = false;
  insName.value = b.name;
  insColor.value = b.color;
  insMass.value = String(b.mass);
  insRadius.value = String(b.radius);
  insVelX.value = b.velocity.x.toFixed(2);
  insVelY.value = b.velocity.y.toFixed(2);
  refreshBodiesUI();
}

function deselectBody() {
  selectedBodyId = null;
  if (inspectorCard) inspectorCard.hidden = true;
  refreshBodiesUI();
}

// Called every draw tick to refresh inspector readouts + energy status
function updateReadouts() {
  // Inspector live readout
  if (selectedBodyId != null && inspectorCard && !inspectorCard.hidden) {
    const b = state.bodies.find((x) => x.id === selectedBodyId);
    if (b) {
      const elem = orbitalElements(b);
      if (!elem) {
        readOrbit.textContent = b.fixed ? 'fixed anchor' : '—';
        readPeriod.textContent = '—';
        readSpeed.textContent = Math.hypot(b.velocity.x, b.velocity.y).toFixed(3);
      } else {
        const aStr = elem.a > 0 && elem.a < 1e7 ? elem.a.toFixed(1) : '∞';
        readOrbit.textContent = `a ${aStr} · e ${elem.e.toFixed(3)}${elem.bound ? '' : ' (unbound)'}`;
        readPeriod.textContent = elem.bound && isFinite(elem.period) ? `${elem.period.toFixed(1)} t` : '—';
        readSpeed.textContent = elem.v.toFixed(3);
      }
    }
  }
  // Energy
  if (statusEnergy && frameCount % 12 === 0) {
    const E = totalEnergy();
    statusEnergy.textContent = `能 · ${formatEnergy(E)}`;
  }
}
function formatEnergy(E) {
  const a = Math.abs(E);
  if (a > 1e6) return `${(E / 1e6).toFixed(2)}M`;
  if (a > 1e3) return `${(E / 1e3).toFixed(2)}k`;
  return E.toFixed(1);
}

// ============================================================================
// Audio — oscillators per body, pentatonic quantization, reverb, rhythms
// ============================================================================

function stopBodyAudio(body) {
  if (!body || !body.audio) return;
  try { body.audio.osc.stop(); } catch (_) {}
  try { body.audio.osc.disconnect(); } catch (_) {}
  try { body.audio.gain.disconnect(); } catch (_) {}
  try { body.audio.pan?.disconnect(); } catch (_) {}
  body.audio = null;
}

function ensureAudioContext() {
  if (!audioCtx) {
    const ACtx = window.AudioContext || window.webkitAudioContext;
    if (ACtx) {
      audioCtx = new ACtx();
      masterGainNode = audioCtx.createGain();
      masterGainNode.gain.value = Number(rangeMasterVol?.value || 0.6);
      masterGainNode.connect(audioCtx.destination);
    }
  }
  return audioCtx;
}

function ensureReverb() {
  if (!audioCtx) return;
  if (reverbNode) return;
  reverbNode = audioCtx.createConvolver();
  // Synthesize a soft cathedral-ish IR
  const len = Math.floor(audioCtx.sampleRate * 2.4);
  const ir = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (0.6 + 0.4 * Math.sin(t * 40));
    }
  }
  reverbNode.buffer = ir;

  // Re-route: masterGain -> [dry -> destination] + [wet -> reverb -> destination]
  try { masterGainNode.disconnect(); } catch (_) {}
  reverbDryGain = audioCtx.createGain();
  reverbWetGain = audioCtx.createGain();
  reverbDryGain.gain.value = 1.0;
  reverbWetGain.gain.value = 0.0;
  masterGainNode.connect(reverbDryGain);
  masterGainNode.connect(reverbWetGain);
  reverbWetGain.connect(reverbNode);
  reverbNode.connect(audioCtx.destination);
  reverbDryGain.connect(audioCtx.destination);
}

// ----- Scales & notes -----

const RootOffsets = { C: -9, 'C#': -8, D: -7, Eb: -6, E: -5, F: -4, 'F#': -3, G: -2, Ab: -1, A: 0, Bb: 1, B: 2 };
// All scales as semitone offsets from the tonic.
// 宫 Gong (major pentatonic), 商/角/徵/羽 are rotations:
const ScaleSet = {
  off:    null,
  gong:   [0, 2, 4, 7, 9, 12],            // 1 2 3 5 6
  shang:  [0, 2, 5, 7, 10, 12],           // 2 3 5 6 1'
  jue:    [0, 3, 5, 8, 10, 12],           // 3 5 6 1' 2'
  zhi:    [0, 2, 5, 7, 9, 12],            // 5 6 1' 2' 3'
  yu:     [0, 3, 5, 7, 10, 12],           // 6 1' 2' 3' 5'
  major:  [0, 2, 4, 5, 7, 9, 11, 12],
  minor:  [0, 2, 3, 5, 7, 8, 10, 12],
  dorian: [0, 2, 3, 5, 7, 9, 10, 12],
  lydian: [0, 2, 4, 6, 7, 9, 11, 12],
};

function noteFreq(rootName, offset) {
  const A4 = 440;
  const semitone = RootOffsets[rootName] ?? -2;
  const n = 48 + semitone + offset; // 48 ≈ C3
  return A4 * Math.pow(2, (n - 57) / 12);
}

function quantizeToScale(fr, rootName, scaleKey) {
  const scale = ScaleSet[scaleKey];
  if (!scale) return fr;
  let best = fr, bestErr = Infinity;
  for (let oct = -2; oct <= 3; oct++) {
    for (const off of scale) {
      const f = noteFreq(rootName, off + oct * 12);
      const err = Math.abs(Math.log(fr / f));
      if (err < bestErr) { bestErr = err; best = f; }
    }
  }
  return best;
}

// ----- Oscillator factory (including "bell", "pluck", "organ" emulation) -----

function makeVoice(ctx, timbre, freq, destination) {
  // Returns { osc, gain, pan, triggerAttack, triggerRelease } where the first 3
  // are the public nodes we track on body.audio.
  const gain = ctx.createGain();
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  const osc = ctx.createOscillator();
  gain.gain.setValueAtTime(0, ctx.currentTime);

  // Map our flavor names to real wave types + optional additional partials.
  let type = 'sine';
  let partials = null;
  switch (timbre) {
    case 'sine': type = 'sine'; break;
    case 'triangle': type = 'triangle'; break;
    case 'square': type = 'square'; break;
    case 'sawtooth': type = 'sawtooth'; break;
    case 'organ': {
      // custom with odd/even harmonics for a reed/笙 feel
      const real = new Float32Array([0, 0.6, 0.35, 0.0, 0.18, 0.0, 0.08]);
      const imag = new Float32Array(real.length);
      partials = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
      break;
    }
    case 'bell': {
      // inharmonic partials mix — emulate with two oscillators summed
      const real = new Float32Array([0, 1, 0.0, 0.4, 0.0, 0.0, 0.25, 0.0, 0.12]);
      const imag = new Float32Array(real.length);
      partials = ctx.createPeriodicWave(real, imag);
      break;
    }
    case 'pluck': type = 'triangle'; break;
    case 'noise': type = 'sine'; break; // handled specially below
    default: type = 'sine';
  }
  if (partials) osc.setPeriodicWave(partials);
  else osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);

  if (pan) {
    osc.connect(gain).connect(pan).connect(destination);
  } else {
    osc.connect(gain).connect(destination);
  }
  try { osc.start(); } catch (_) {}
  return { osc, gain, pan };
}

function updateAudioForBodies() {
  if (!audioCheckbox || !audioCheckbox.checked) {
    for (const b of state.bodies) stopBodyAudio(b);
    return;
  }
  const ctx = ensureAudioContext();
  if (!ctx) return;
  if (checkboxReverb && checkboxReverb.checked) ensureReverb();

  const now = ctx.currentTime;
  const baseFreq = 140;
  const maxSpeedForPitch = 8;
  const maxGain = 0.14;
  const rhythmMode = rhythmModeSelect ? rhythmModeSelect.value : 'off';
  const metroInterval = 60 / metronomeBpm;
  const dt = now - (lastTickTime || now);
  const shouldTick = (rhythmMode === 'metronome' || rhythmMode === 'guqin') && dt >= metroInterval;
  if (shouldTick) lastTickTime = now;

  const scaleKey = selectScale ? selectScale.value : 'gong';
  const rootName = selectRoot ? selectRoot.value : 'G';
  const phaseByOrbit = !!(checkboxPhaseOrbit && checkboxPhaseOrbit.checked);
  const anySolo = state.bodies.some((x) => x.solo);

  for (const b of state.bodies) {
    if (b.fixed) { stopBodyAudio(b); continue; }

    const speed = Math.hypot(b.velocity.x, b.velocity.y);
    const t = Math.min(1, speed / maxSpeedForPitch);
    let freq = baseFreq * Math.pow(2, t * 3);
    freq = quantizeToScale(freq, rootName, scaleKey);

    const dx = b.position.x - state.canvasCenter.x;
    const dy = b.position.y - state.canvasCenter.y;
    const dist = Math.hypot(dx, dy);
    const norm = Math.min(1, dist / (Math.max(width, height) * 0.6));
    let gainValue = (1 - norm * 0.7) * maxGain;

    // rhythm shaping
    if (rhythmMode === 'orbit') {
      const accMag = Math.hypot(b.acceleration.x, b.acceleration.y);
      const curv = Math.min(1, accMag / Math.max(1e-6, speed));
      gainValue *= Math.pow(curv, 0.6);
    } else if (rhythmMode === 'speed') {
      const pulsesPerSec = 0.5 + t * 4;
      let phase = (now * pulsesPerSec) % 1;
      if (phaseByOrbit && starBody) {
        const ang = Math.atan2(b.position.y - starBody.position.y, b.position.x - starBody.position.x);
        phase = (phase + (ang / (2 * Math.PI)) + 1) % 1;
      }
      gainValue *= phase < 0.25 ? 1 : 0;
    } else if (rhythmMode === 'apsidal') {
      // Pluck on periapsis (closest approach) and apoapsis (farthest) — the
      // physically meaningful turning points of the radial coordinate. Detect
      // by sign change of radial velocity v_r = (r⃗ · v⃗) / |r⃗|.
      gainValue = 0.0008;
    } else if (rhythmMode === 'metronome') {
      if (!shouldTick) gainValue = Math.min(gainValue, 0.001);
    } else if (rhythmMode === 'guqin') {
      // Ambient silence; we'll schedule plucks on tick below
      gainValue = 0.001;
    }

    if (anySolo && !b.solo) gainValue = 0;
    if (b.muted) gainValue = 0;

    // Ensure voice exists
    const dest = masterGainNode || ctx.destination;
    if (!b.audio) {
      b.audio = makeVoice(ctx, b.timbre || 'sine', freq, dest);
    }

    // Update continuous params
    const panVal = Math.max(-1, Math.min(1, (b.position.x - state.canvasCenter.x) / (width * 0.5)));
    if (b.audio.pan && b.audio.pan.pan) b.audio.pan.pan.setTargetAtTime(panVal, now, 0.05);
    // Keep timbre in sync if user changed it
    try {
      if (b.timbre === 'organ' || b.timbre === 'bell') {
        // no-op: periodic wave set at creation. If timbre changed, rebuild voice.
        if (b.audio.currentTimbre && b.audio.currentTimbre !== b.timbre) {
          stopBodyAudio(b);
          b.audio = makeVoice(ctx, b.timbre, freq, dest);
          b.audio.currentTimbre = b.timbre;
        } else if (!b.audio.currentTimbre) b.audio.currentTimbre = b.timbre;
      } else {
        if (b.audio.currentTimbre && (b.audio.currentTimbre === 'organ' || b.audio.currentTimbre === 'bell')) {
          stopBodyAudio(b);
          b.audio = makeVoice(ctx, b.timbre, freq, dest);
        }
        b.audio.osc.type = ({ sine: 'sine', triangle: 'triangle', square: 'square', sawtooth: 'sawtooth', pluck: 'triangle', noise: 'sine' })[b.timbre] || 'sine';
        b.audio.currentTimbre = b.timbre;
      }
    } catch (_) {}

    b.audio.osc.frequency.setTargetAtTime(freq, now, 0.06);

    // Apply gain depending on rhythm behavior
    if (rhythmMode === 'metronome') {
      if (shouldTick) scheduleShortPluck(b.audio.gain, now, Math.min(maxGain, gainValue + 0.05), 0.2);
      else b.audio.gain.gain.setTargetAtTime(0.001, now, 0.06);
    } else if (rhythmMode === 'guqin') {
      if (shouldTick) {
        // Guqin-like: short attack, long exponential decay, pitched by body speed/scale
        scheduleGuqinPluck(b.audio.gain, now, Math.min(maxGain * 1.3, (gainValue || maxGain * 0.5) + 0.08), 1.4);
      } else {
        b.audio.gain.gain.setTargetAtTime(0.0005, now, 0.08);
      }
    } else if (rhythmMode === 'apsidal' && starBody && !b.muted && !(anySolo && !b.solo)) {
      // Detect periapsis/apoapsis by sign change of radial velocity.
      // v_r > 0 → moving outward; v_r < 0 → moving inward.
      // Sign flip neg→pos = periapsis (just passed closest point).
      // Sign flip pos→neg = apoapsis (just passed farthest point).
      const dx = b.position.x - starBody.position.x;
      const dy = b.position.y - starBody.position.y;
      const r = Math.hypot(dx, dy);
      if (r > 1e-3) {
        const vr = (dx * b.velocity.x + dy * b.velocity.y) / r;
        if (b._lastVr !== undefined) {
          const periapsis = b._lastVr < 0 && vr >= 0;
          const apoapsis  = b._lastVr > 0 && vr <= 0;
          if (periapsis) {
            // Brighter, sharper attack at periapsis (body is at closest, fastest)
            scheduleGuqinPluck(b.audio.gain, now, Math.min(maxGain * 1.4, maxGain * 0.9), 1.0);
          } else if (apoapsis) {
            // Softer, longer decay at apoapsis (body is far, slow, contemplative)
            scheduleGuqinPluck(b.audio.gain, now, Math.min(maxGain, maxGain * 0.55), 1.6);
          } else {
            b.audio.gain.gain.setTargetAtTime(0.0008, now, 0.15);
          }
        }
        b._lastVr = vr;
      }
    } else if (b.timbre === 'pluck' && !b.muted && !(anySolo && !b.solo)) {
      // Continuous-pluck mode: retrigger on orbit quadrant crossing
      if (starBody) {
        const ang = Math.atan2(b.position.y - starBody.position.y, b.position.x - starBody.position.x);
        const quad = Math.floor((ang + Math.PI) / (Math.PI / 2));
        if (b._lastQuad !== quad) {
          if (b._lastQuad !== undefined) {
            scheduleGuqinPluck(b.audio.gain, now, Math.min(maxGain, gainValue + 0.02), 0.9);
          }
          b._lastQuad = quad;
        }
      }
      b.audio.gain.gain.setTargetAtTime(gainValue * 0.2, now, 0.08);
    } else {
      b.audio.gain.gain.setTargetAtTime(gainValue, now, 0.06);
    }
  }
}

function scheduleShortPluck(gainNode, now, peak, dur) {
  const g = gainNode.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(0, now);
  g.linearRampToValueAtTime(peak, now + 0.015);
  g.exponentialRampToValueAtTime(0.0005, now + dur);
}

function scheduleGuqinPluck(gainNode, now, peak, dur) {
  const g = gainNode.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(0, now);
  g.linearRampToValueAtTime(peak, now + 0.008);
  g.exponentialRampToValueAtTime(peak * 0.3, now + dur * 0.25);
  g.exponentialRampToValueAtTime(0.0005, now + dur);
}

// ============================================================================
// Color utilities (hex <-> rgba, lighten/darken)
// ============================================================================

function hexToRgb(hex) {
  if (!hex) return [0, 0, 0];
  if (hex.startsWith('hsl')) {
    // crude parse hsl(H,S%,L%)
    const m = hex.match(/hsl\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%/);
    if (m) { return hslToRgb(Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100); }
    return [0, 0, 0];
  }
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(hue2rgb(h + 1 / 3) * 255), Math.round(hue2rgb(h) * 255), Math.round(hue2rgb(h - 1 / 3) * 255)];
}

function hexA(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lighten(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(clampByte(r + 255 * amt), clampByte(g + 255 * amt), clampByte(b + 255 * amt));
}
function darken(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(clampByte(r - 255 * amt), clampByte(g - 255 * amt), clampByte(b - 255 * amt));
}
function rgbToHex(r, g, b) {
  const toHex = (v) => clampByte(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
function clampByte(v) { return Math.max(0, Math.min(255, Math.round(v))); }
