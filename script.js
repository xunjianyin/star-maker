/*
  Star Maker - 2D Solar System Simulator (p5.js)
  Implements two physics modes: Keplerian (single-star gravity) and Newtonian N-body.
  Allows adding/removing bodies and adjusting simulation parameters.
*/

const PhysicsModel = {
  Keplerian: 'keplerian',
  NBody: 'nbody',
  KeplerExact: 'kepler_exact',
};

class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  mult(s) {
    this.x *= s;
    this.y *= s;
    return this;
  }

  clone() {
    return new Vector2(this.x, this.y);
  }

  static dot(a, b) {
    return a.x * b.x + a.y * b.y;
  }

  static length(a) {
    return Math.sqrt(a.x * a.x + a.y * a.y);
  }

  static sub(a, b) {
    return new Vector2(a.x - b.x, a.y - b.y);
  }

  static add(a, b) {
    return new Vector2(a.x + b.x, a.y + b.y);
  }

  static dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

class CelestialBody {
  constructor({ id, name, mass, radius, color, position, velocity, fixed = false, timbre = 'sine' }) {
    this.id = id;
    this.name = name;
    this.mass = mass;
    this.radius = radius;
    this.color = color;
    this.position = position; // Vector2
    this.velocity = velocity; // Vector2
    this.acceleration = new Vector2();
    this.fixed = fixed; // if true, body is static (e.g., central star)
    this.trail = [];
    this.timbre = timbre;
    this.audio = null; // { osc, gain }
  }

  updateTrail(maxLength) {
    this.trail.push({ x: this.position.x, y: this.position.y });
    if (this.trail.length > maxLength) {
      this.trail.shift();
    }
  }
}

class SimulationState {
  constructor() {
    this.bodies = [];
    this.nextId = 1;
    this.isRunning = false;
    this.timeScale = 0.5; // delta time multiplier
    this.gravityConstant = 2.0;
    this.trailLength = 150;
    this.model = PhysicsModel.Keplerian;
    this.canvasCenter = new Vector2(0, 0);
    this.zoom = 1.0; // zoom factor (1.0 = 100%)
    this.pan = new Vector2(0, 0); // screen-space pan (pixels)
    this.softening2 = 4; // gravitational softening epsilon^2 to avoid singularities
    this.simTime = 0; // accumulated simulation time in arbitrary units
  }
}

const state = new SimulationState();

// UI elements
let btnToggle, btnStep, btnReset, selectModel;
let rangeDt, labelDt, rangeG, labelG, rangeTrail, labelTrail;
let formAdd, inputs;
let bodiesList;
let statusPlay, statusModel, statusBodies;
let btnCollapsePanel, btnExpandPanel, appRoot, controlPanelEl;
let audioCheckbox;
let audioCtx = null;
let rhythmModeSelect;
let lastTickTime = 0;
let metronomeBpm = 90;
let btnCenter, btnFit, btnSave, btnLoad, fileInput;
let rangeMasterVol, labelMasterVol;
let masterGainNode = null;
let presetSolarBtn, presetBinaryBtn, presetRingBtn, presetRandomBtn;
let inspectorCard, formInspector, insName, insColor, insMass, insRadius, insVelX, insVelY, insDeselect, insRemove;
let selectedBodyId = null;
let checkboxReverb, reverbNode;
let selectScale, selectRoot, selectSubdiv, checkboxPhaseOrbit;
let rangeBpm, labelBpm;

// p5.js globals
let sketchWidth = 0;
let sketchHeight = 0;
let starBody = null;
let canvasEl = null;

// Mouse placement state
let isPlacingPlanet = false;
let placeStart = null; // Vector2 canvas position where mouse pressed
let placeCurrent = null; // Vector2 current mouse during drag
const dragMinThresholdPx = 3; // below this, velocity is treated as zero
const velocityScale = 0.02; // pixels dragged -> velocity units per frame

// Pan state
let isPanning = false;
let panStartScreen = null; // {x, y} screen coords when pan started
let panStartPan = null; // Vector2 previous pan when started

function setup() {
  const container = document.getElementById('canvas-holder');
  sketchWidth = container.clientWidth;
  sketchHeight = container.clientHeight;
  const cnv = createCanvas(sketchWidth, sketchHeight);
  cnv.parent('canvas-holder');
  canvasEl = cnv.elt || cnv.canvas || document.querySelector('#canvas-holder canvas');
  frameRate(60);

  state.canvasCenter = new Vector2(width / 2, height / 2);

  // Initialize UI before adding any bodies so DOM references exist
  initUI();

  // Observe container size changes (e.g., panel collapsed/expanded) to resize canvas
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.target.id === 'canvas-holder') {
        const w = Math.max(1, Math.floor(entry.contentRect.width));
        const h = Math.max(1, Math.floor(entry.contentRect.height));
        if (w !== width || h !== height) {
          resizeCanvas(w, h);
          state.canvasCenter = new Vector2(width / 2, height / 2);
        }
      }
    }
  });
  resizeObserver.observe(container);

  // Create a central star (fixed)
  starBody = addBody({
    name: 'Star',
    mass: 1000,
    radius: 16,
    color: '#ffd27d',
    position: state.canvasCenter.clone(),
    velocity: new Vector2(0, 0),
    fixed: true,
  });

  // A default planet
  addBody({
    name: 'Planet 1',
    mass: 5,
    radius: 6,
    color: '#51a7f9',
    position: Vector2.add(state.canvasCenter, new Vector2(160, 0)),
    velocity: new Vector2(0, 1.6),
  });
}

function windowResized() {
  const container = document.getElementById('canvas-holder');
  resizeCanvas(container.clientWidth, container.clientHeight);
  state.canvasCenter = new Vector2(width / 2, height / 2);
}

function draw() {
  drawBackground();

  if (state.isRunning) {
    stepSimulation();
  }

  renderSimulation();
  drawPlacementPreview();
}

function drawBackground() {
  background(7, 10, 24);

  // Starfield
  noStroke();
  fill(255, 255, 255, 60);
  for (let i = 0; i < 60; i++) {
    const x = (i * 73) % width;
    const y = (i * 131) % height;
    circle(x, y, 1 + ((i * 17) % 2));
  }

  // Subtle vignette
  noFill();
  for (let r = 0; r < 8; r++) {
    stroke(10, 15, 35, 20 - r * 2);
    strokeWeight(80 + r * 10);
    circle(width / 2, height / 2, Math.max(width, height) * 1.2);
  }
}

function stepSimulation() {
  const dt = state.timeScale;
  const G = state.gravityConstant;
  const eps2 = state.softening2;

  // Helper to compute accelerations for all bodies
  function computeAccelerations() {
    for (const body of state.bodies) {
      body.acceleration.x = 0;
      body.acceleration.y = 0;
    }
    if (state.model === PhysicsModel.Keplerian) {
      for (const body of state.bodies) {
        if (body.fixed || body === starBody) continue;
        const dx = starBody.position.x - body.position.x;
        const dy = starBody.position.y - body.position.y;
        const r2 = dx * dx + dy * dy; // eps2=0 in Keplerian to preserve closed orbits
        const invR = 1 / Math.sqrt(r2);
        const invR3 = invR * invR * invR;
        const ax = G * starBody.mass * dx * invR3;
        const ay = G * starBody.mass * dy * invR3;
        body.acceleration.x += ax;
        body.acceleration.y += ay;
      }
    } else if (state.model === PhysicsModel.NBody) {
      for (let i = 0; i < state.bodies.length; i++) {
        const a = state.bodies[i];
        if (a.fixed) continue;
        for (let j = 0; j < state.bodies.length; j++) {
          if (i === j) continue;
          const b = state.bodies[j];
          const dx = b.position.x - a.position.x;
          const dy = b.position.y - a.position.y;
          const r2 = dx * dx + dy * dy + eps2;
          const invR = 1 / Math.sqrt(r2);
          const invR3 = invR * invR * invR;
          a.acceleration.x += G * b.mass * dx * invR3;
          a.acceleration.y += G * b.mass * dy * invR3;
        }
      }
    }
  }

  // If using analytic Kepler for star-only, propagate exactly per body
  if (state.model === PhysicsModel.KeplerExact && starBody) {
    // Star must be fixed at center
    for (const body of state.bodies) {
      if (body.fixed || body === starBody) continue;
      // Reduce to 2D Kepler problem with central mass M = starBody.mass, mu = G*M
      const mu = G * starBody.mass;
      // Relative position and velocity wrt star
      const rx = body.position.x - starBody.position.x;
      const ry = body.position.y - starBody.position.y;
      const vx = body.velocity.x - 0; // star is fixed
      const vy = body.velocity.y - 0;
      const r0 = Math.sqrt(rx * rx + ry * ry);
      const v0 = Math.sqrt(vx * vx + vy * vy);
      const vr0 = (rx * vx + ry * vy) / Math.max(1e-9, r0); // radial velocity
      const alpha = 2 / r0 - (v0 * v0) / mu; // 1/a (universal variable form)

      // Universal Kepler solver for dt: solve for chi (Stumpff functions)
      let chi = Math.sqrt(Math.max(mu, 1e-9)) * Math.abs(alpha) * dt; // initial guess
      if (alpha > 0) chi = Math.sqrt(mu) * dt * alpha; // elliptical initial guess
      const maxIter = 20;
      const tol = 1e-6;
      const sqrtMu = Math.sqrt(mu);
      const zFromChi = (c) => alpha * c * c;
      function stumpffC(z) { return z > 0 ? (1 - Math.cos(Math.sqrt(z))) / z : z < 0 ? (1 - Math.cosh(Math.sqrt(-z))) / z : 0.5; }
      function stumpffS(z) { return z > 0 ? (Math.sqrt(z) - Math.sin(Math.sqrt(z))) / (Math.sqrt(z) ** 3) : z < 0 ? (Math.sinh(Math.sqrt(-z)) - Math.sqrt(-z)) / ((Math.sqrt(-z)) ** 3) : 1 / 6; }
      for (let k = 0; k < maxIter; k++) {
        const z = zFromChi(chi);
        const C = stumpffC(z);
        const S = stumpffS(z);
        const r = chi * chi * C + vr0 / sqrtMu * chi * (1 - z * S) + r0 * (1 - z * C);
        const F = r0 * vr0 / sqrtMu * chi * chi * C + (1 - alpha * r0) * chi * chi * chi * S + r0 * chi - sqrtMu * dt;
        const dF = r / sqrtMu * (1 - alpha * r0) * chi * S + r0 * (1 - z * C);
        const dChi = F / Math.max(1e-9, dF);
        chi -= dChi;
        if (Math.abs(dChi) < tol) break;
      }
      const z = zFromChi(chi);
      const C = stumpffC(z);
      const S = stumpffS(z);
      const f = 1 - (chi * chi / r0) * C;
      const g = dt - (1 / sqrtMu) * chi * chi * chi * S;
      const rNewX = f * rx + g * vx;
      const rNewY = f * ry + g * vy;
      const rNew = Math.sqrt(rNewX * rNewX + rNewY * rNewY);
      const fdot = (sqrtMu / (r0 * rNew)) * (z * S - 1) * chi;
      const gdot = 1 - (chi * chi / rNew) * C;
      const vNewX = fdot * rx + gdot * vx;
      const vNewY = fdot * ry + gdot * vy;

      body.position.x = starBody.position.x + rNewX;
      body.position.y = starBody.position.y + rNewY;
      body.velocity.x = vNewX;
      body.velocity.y = vNewY;
      body.updateTrail(state.trailLength);
    }
    state.simTime += dt;
    return;
  }

  // Substep Velocity Verlet integration for better accuracy with large dt
  // Adaptive substep based on max acceleration to limit per-step velocity change
  let maxAcc = 0;
  // quick estimate using current positions
  if (state.model === PhysicsModel.NBody || !starBody) {
    for (let i = 0; i < state.bodies.length; i++) {
      const a = state.bodies[i];
      if (a.fixed) continue;
      let ax = 0, ay = 0;
      for (let j = 0; j < state.bodies.length; j++) {
        if (i === j) continue;
        const b = state.bodies[j];
        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        const r2 = dx * dx + dy * dy + eps2;
        const invR = 1 / Math.sqrt(r2);
        const invR3 = invR * invR * invR;
        ax += G * b.mass * dx * invR3;
        ay += G * b.mass * dy * invR3;
      }
      const aMag = Math.sqrt(ax * ax + ay * ay);
      if (aMag > maxAcc) maxAcc = aMag;
    }
  } else {
    for (const body of state.bodies) {
      if (body.fixed || body === starBody) continue;
      const dx = starBody.position.x - body.position.x;
      const dy = starBody.position.y - body.position.y;
      const r2 = dx * dx + dy * dy;
      const invR = 1 / Math.sqrt(r2);
      const invR3 = invR * invR * invR;
      const aMag = G * starBody.mass * invR3 * Math.sqrt(dx * dx + dy * dy);
      if (aMag > maxAcc) maxAcc = aMag;
    }
  }
  const velChangeLimit = 0.2; // max allowed |Δv| per substep approx
  const maxStep = maxAcc > 0 ? Math.min(0.25, Math.max(0.02, velChangeLimit / Math.max(1e-6, maxAcc))) : 0.25;
  const steps = Math.max(1, Math.ceil(dt / maxStep));
  const h = dt / steps;
  for (let s = 0; s < steps; s++) {
    // 1) a(t)
    computeAccelerations();
    // 2) x(t+h) = x(t) + v(t) h + 0.5 a(t) h^2
    for (const body of state.bodies) {
      if (body.fixed) continue;
      body.position.x += body.velocity.x * h + 0.5 * body.acceleration.x * h * h;
      body.position.y += body.velocity.y * h + 0.5 * body.acceleration.y * h * h;
    }
    // 3) a(t+h)
    const axPrev = new Map();
    for (const b of state.bodies) {
      axPrev.set(b.id, { x: b.acceleration.x, y: b.acceleration.y });
    }
    computeAccelerations();
    // 4) v(t+h) = v(t) + 0.5 (a(t) + a(t+h)) h
    for (const body of state.bodies) {
      if (body.fixed) continue;
      const prev = axPrev.get(body.id) || { x: 0, y: 0 };
      body.velocity.x += 0.5 * (prev.x + body.acceleration.x) * h;
      body.velocity.y += 0.5 * (prev.y + body.acceleration.y) * h;
    }
  }
  // Trails update once per frame for performance
  for (const body of state.bodies) {
    if (!body.fixed) body.updateTrail(state.trailLength);
  }
  state.simTime += dt;
}

function renderSimulation() {
  push();
  // Apply zoom centered on canvas center
  translate(width / 2, height / 2);
  translate(state.pan.x, state.pan.y); // screen-space pan
  scale(state.zoom);
  translate(-width / 2, -height / 2);

  // Orbits (trails)
  for (const body of state.bodies) {
    if (body.trail.length > 1) {
      noFill();
      strokeWeight(1 / state.zoom);
      const col = color(body.color);
      col.setAlpha(120);
      stroke(col);
      beginShape();
      for (const p of body.trail) {
        vertex(p.x, p.y);
      }
      endShape();
    }
  }

  // Bodies
  noStroke();
  for (const body of state.bodies) {
    const glow = color(body.color);
    glow.setAlpha(70);
    fill(glow);
    circle(body.position.x, body.position.y, body.radius * 3);

    fill(body.color);
    circle(body.position.x, body.position.y, body.radius * 2);

    if (body === starBody) {
      fill(255, 200);
      circle(body.position.x, body.position.y, body.radius);
    }

    // Selection highlight ring
    if (selectedBodyId === body.id) {
      noFill();
      stroke(255, 240, 150, 180);
      strokeWeight(2 / state.zoom);
      circle(body.position.x, body.position.y, body.radius * 3.6);
    }
  }

  // Predictive ghost path for currently placing body (only for star-based modes)
  if (isPlacingPlanet && placeStart && placeCurrent && starBody && state.model !== PhysicsModel.NBody) {
    const previewColor = (inputs && inputs.color ? inputs.color.value : '#51a7f9') || '#51a7f9';
    const col = color(previewColor);
    col.setAlpha(80);
    stroke(col);
    strokeWeight(1 / state.zoom);
    noFill();
    const ghostSteps = 120;
    const ghostDt = state.timeScale;
    // derive initial state from placement
    let pos = new Vector2(placeStart.x, placeStart.y);
    let vel;
    const dx = placeCurrent.x - placeStart.x;
    const dy = placeCurrent.y - placeStart.y;
    const dragDist = Math.sqrt(dx * dx + dy * dy);
    if (dragDist >= dragMinThresholdPx) {
      vel = new Vector2(dx * velocityScale, dy * velocityScale);
    } else if (state.model === PhysicsModel.Keplerian || state.model === PhysicsModel.KeplerExact) {
      // circular guess
      const rx = pos.x - starBody.position.x;
      const ry = pos.y - starBody.position.y;
      const r = Math.max(1, Math.sqrt(rx * rx + ry * ry));
      const vMag = Math.sqrt(state.gravityConstant * starBody.mass / r);
      vel = new Vector2(-ry / r * vMag, rx / r * vMag);
    } else {
      vel = new Vector2(0, 0);
    }
    beginShape();
    let tempPos = pos.clone();
    let tempVel = vel.clone();
    for (let i = 0; i < ghostSteps; i++) {
      // advance using same integrator (KeplerExact uses f-g with star only)
      if (state.model === PhysicsModel.KeplerExact) {
        const mu = state.gravityConstant * starBody.mass;
        const rx0 = tempPos.x - starBody.position.x;
        const ry0 = tempPos.y - starBody.position.y;
        const vx0 = tempVel.x;
        const vy0 = tempVel.y;
        const r0 = Math.sqrt(rx0 * rx0 + ry0 * ry0);
        const v0 = Math.sqrt(vx0 * vx0 + vy0 * vy0);
        const vr0 = (rx0 * vx0 + ry0 * vy0) / Math.max(1e-9, r0);
        const alpha = 2 / r0 - (v0 * v0) / mu;
        let chi = Math.sqrt(Math.max(mu, 1e-9)) * Math.abs(alpha) * ghostDt;
        if (alpha > 0) chi = Math.sqrt(mu) * ghostDt * alpha;
        const maxIter = 12, tol = 1e-5, sqrtMu = Math.sqrt(mu);
        const zFromChi = (c) => alpha * c * c;
        const Cfun = (z) => (z > 0 ? (1 - Math.cos(Math.sqrt(z))) / z : z < 0 ? (1 - Math.cosh(Math.sqrt(-z))) / z : 0.5);
        const Sfun = (z) => (z > 0 ? (Math.sqrt(z) - Math.sin(Math.sqrt(z))) / (Math.sqrt(z) ** 3) : z < 0 ? (Math.sinh(Math.sqrt(-z)) - Math.sqrt(-z)) / ((Math.sqrt(-z)) ** 3) : 1 / 6);
        for (let k = 0; k < maxIter; k++) {
          const z = zFromChi(chi), C = Cfun(z), S = Sfun(z);
          const r = chi * chi * C + vr0 / sqrtMu * chi * (1 - z * S) + r0 * (1 - z * C);
          const F = r0 * vr0 / sqrtMu * chi * chi * C + (1 - alpha * r0) * chi * chi * chi * S + r0 * chi - sqrtMu * ghostDt;
          const dF = r / sqrtMu * (1 - alpha * r0) * chi * S + r0 * (1 - z * C);
          const dChi = F / Math.max(1e-9, dF);
          chi -= dChi;
          if (Math.abs(dChi) < tol) break;
        }
        const z = zFromChi(chi), C = Cfun(z), S = Sfun(z);
        const f = 1 - (chi * chi / r0) * C;
        const g = ghostDt - (1 / sqrtMu) * chi * chi * chi * S;
        const rNewX = f * rx0 + g * vx0;
        const rNewY = f * ry0 + g * vy0;
        const rNew = Math.sqrt(rNewX * rNewX + rNewY * rNewY);
        const fdot = (sqrtMu / (r0 * rNew)) * (z * S - 1) * chi;
        const gdot = 1 - (chi * chi / rNew) * C;
        const vNewX = fdot * rx0 + gdot * vx0;
        const vNewY = fdot * ry0 + gdot * vy0;
        tempPos.x = starBody.position.x + rNewX;
        tempPos.y = starBody.position.y + rNewY;
        tempVel.x = vNewX;
        tempVel.y = vNewY;
      } else {
        // one small velocity-Verlet step under star-only gravity
        const dx = starBody.position.x - tempPos.x;
        const dy = starBody.position.y - tempPos.y;
        const r2 = dx * dx + dy * dy + (state.model === PhysicsModel.Keplerian ? 0 : state.softening2);
        const invR = 1 / Math.sqrt(r2);
        const invR3 = invR * invR * invR;
        const ax = state.gravityConstant * starBody.mass * dx * invR3;
        const ay = state.gravityConstant * starBody.mass * dy * invR3;
        tempPos.x += tempVel.x * ghostDt + 0.5 * ax * ghostDt * ghostDt;
        tempPos.y += tempVel.y * ghostDt + 0.5 * ay * ghostDt * ghostDt;
        // new accel
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
      vertex(tempPos.x, tempPos.y);
    }
    endShape();
  }
  pop();

  // Update audio after positions/velocities rendered so it's in sync
  if (typeof updateAudioForBodies === 'function') {
    updateAudioForBodies();
  }
}

function drawPlacementPreview() {
  if (!isPlacingPlanet || !placeStart || !placeCurrent) return;
  push();
  // Draw in world coordinates under zoom so preview aligns with world
  translate(width / 2, height / 2);
  translate(state.pan.x, state.pan.y);
  scale(state.zoom);
  translate(-width / 2, -height / 2);

  // Preview body using current form inputs if available
  const previewRadius = Number(inputs && inputs.radius ? inputs.radius.value : 6) || 6;
  const previewColor = (inputs && inputs.color ? inputs.color.value : '#51a7f9') || '#51a7f9';

  noStroke();
  const glow = color(previewColor);
  glow.setAlpha(60);
  fill(glow);
  circle(placeStart.x, placeStart.y, previewRadius * 3);

  fill(previewColor);
  circle(placeStart.x, placeStart.y, previewRadius * 2);

  // Velocity arrow
  const dx = placeCurrent.x - placeStart.x;
  const dy = placeCurrent.y - placeStart.y;
  stroke(240);
  strokeWeight(1.5 / state.zoom);
  line(placeStart.x, placeStart.y, placeCurrent.x, placeCurrent.y);

  const angle = Math.atan2(dy, dx);
  const headLen = 10;
  line(
    placeCurrent.x,
    placeCurrent.y,
    placeCurrent.x - headLen * Math.cos(angle - Math.PI / 6),
    placeCurrent.y - headLen * Math.sin(angle - Math.PI / 6)
  );
  line(
    placeCurrent.x,
    placeCurrent.y,
    placeCurrent.x - headLen * Math.cos(angle + Math.PI / 6),
    placeCurrent.y - headLen * Math.sin(angle + Math.PI / 6)
  );

  // Speed label
  const speed = Math.sqrt(dx * dx + dy * dy) * velocityScale;
  noStroke();
  fill(220);
  text(`v=${speed.toFixed(2)}`, placeCurrent.x + 8, placeCurrent.y - 8);

  pop();
}

function screenToWorld(sx, sy) {
  const cx = width / 2;
  const cy = height / 2;
  // invert: translate(-cx,-cy) -> translate(-pan) -> scale(1/zoom) -> translate(cx,cy)
  return new Vector2(
    cx + (sx - cx - state.pan.x) / state.zoom,
    cy + (sy - cy - state.pan.y) / state.zoom
  );
}

function worldToScreen(wx, wy) {
  const cx = width / 2;
  const cy = height / 2;
  // forward: translate(-cx,-cy) -> scale(zoom) -> translate(+pan) -> translate(+cx,+cy)
  const sx = cx + state.pan.x + (wx - cx) * state.zoom;
  const sy = cy + state.pan.y + (wy - cy) * state.zoom;
  return new Vector2(sx, sy);
}

function isPointerOverUI() {
  try {
    const rect = canvasEl?.getBoundingClientRect();
    if (!rect) return false;
    const clientX = rect.left + mouseX;
    const clientY = rect.top + mouseY;
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return false;
    return !!el.closest('#control-panel, #btn-expand-panel, .floating-toggle, #status-bar');
  } catch (_) {
    return false;
  }
}

// View helpers
function centerOn(target) {
  const cx = width / 2;
  const cy = height / 2;
  const wx = typeof target.x === 'number' ? target.x : target.position?.x;
  const wy = typeof target.y === 'number' ? target.y : target.position?.y;
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
  const pad = 60;
  const worldW = Math.max(1, maxX - minX);
  const worldH = Math.max(1, maxY - minY);
  const targetZoomX = (width - pad * 2) / worldW;
  const targetZoomY = (height - pad * 2) / worldH;
  const newZoom = Math.max(0.25, Math.min(3.0, Math.min(targetZoomX, targetZoomY)));
  state.zoom = newZoom;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  centerOn({ x: midX, y: midY });
}

// Save/Load helpers
function exportState() {
  const data = {
    model: state.model,
    gravityConstant: state.gravityConstant,
    timeScale: state.timeScale,
    softening2: state.softening2,
    zoom: state.zoom,
    pan: { x: state.pan.x, y: state.pan.y },
    audio: {
      enabled: !!(audioCheckbox && audioCheckbox.checked),
      rhythm: rhythmModeSelect ? rhythmModeSelect.value : 'off',
      masterVolume: Number(rangeMasterVol?.value || 0.6),
    },
    bodies: state.bodies.map((b) => ({
      id: b.id,
      name: b.name,
      mass: b.mass,
      radius: b.radius,
      color: b.color,
      position: { x: b.position.x, y: b.position.y },
      velocity: { x: b.velocity.x, y: b.velocity.y },
      fixed: b.fixed,
      timbre: b.timbre || 'sine',
    })),
  };
  return data;
}

function importState(obj) {
  if (!obj || !obj.bodies) return;
  for (const b of state.bodies) stopBodyAudio(b);
  state.bodies = [];
  state.nextId = 1;
  if (typeof obj.gravityConstant === 'number') state.gravityConstant = obj.gravityConstant;
  if (typeof obj.timeScale === 'number') state.timeScale = obj.timeScale;
  if (typeof obj.softening2 === 'number') state.softening2 = obj.softening2;
  if (obj.model) state.model = obj.model;
  if (obj.zoom) state.zoom = obj.zoom;
  if (obj.pan) state.pan = new Vector2(obj.pan.x || 0, obj.pan.y || 0);
  // Recreate bodies
  for (const b of obj.bodies) {
    addBody({
      name: b.name,
      mass: b.mass,
      radius: b.radius,
      color: b.color,
      position: new Vector2(b.position.x, b.position.y),
      velocity: new Vector2(b.velocity.x, b.velocity.y),
      fixed: !!b.fixed,
      timbre: b.timbre || 'sine',
    });
  }
  // Ensure there is a fixed star
  const anyStar = state.bodies.find((b) => b.fixed);
  if (!anyStar) {
    starBody = addBody({
      name: 'Star',
      mass: 1000,
      radius: 16,
      color: '#ffd27d',
      position: state.canvasCenter.clone(),
      velocity: new Vector2(0, 0),
      fixed: true,
    });
  } else {
    starBody = anyStar;
  }
  // UI reflect
  if (audioCheckbox) audioCheckbox.checked = !!(obj.audio && obj.audio.enabled);
  if (rhythmModeSelect && obj.audio && obj.audio.rhythm) rhythmModeSelect.value = obj.audio.rhythm;
  if (rangeMasterVol && obj.audio && typeof obj.audio.masterVolume === 'number') {
    rangeMasterVol.value = String(obj.audio.masterVolume);
    labelMasterVol.textContent = obj.audio.masterVolume.toFixed(2);
    if (masterGainNode) masterGainNode.gain.value = obj.audio.masterVolume;
  }
  refreshBodiesUI();
  // Adjust view to fit
  fitAllBodies();
}

// ---- Presets ----
function loadPresetSolarMini() {
  resetSimulation();
  // Star already reset
  const AU = 120; // arbitrary unit distance for nice canvas scale
  const G = state.gravityConstant;
  const M = starBody.mass;
  function circularV(r) { return Math.sqrt(G * M / r); }
  const planets = [
    { name: 'Mercury', r: 0.39 * AU, color: '#c8925b', radius: 4 },
    { name: 'Venus', r: 0.72 * AU, color: '#e3c16f', radius: 5 },
    { name: 'Earth', r: 1.0 * AU, color: '#51a7f9', radius: 6 },
    { name: 'Mars', r: 1.52 * AU, color: '#d96b4c', radius: 5 },
  ];
  for (const p of planets) {
    const pos = new Vector2(state.canvasCenter.x + p.r, state.canvasCenter.y);
    const v = circularV(p.r);
    addBody({ name: p.name, mass: 5, radius: p.radius, color: p.color, position: pos, velocity: new Vector2(0, v) });
  }
  fitAllBodies();
}

function loadPresetBinaryStars() {
  // Two stars orbiting barycenter with a couple planets
  state.bodies = [];
  state.nextId = 1;
  const center = state.canvasCenter.clone();
  const M1 = 800, M2 = 600, sep = 200;
  const pos1 = new Vector2(center.x - sep / 2, center.y);
  const pos2 = new Vector2(center.x + sep / 2, center.y);
  // set velocities for circular mutual orbit
  const mu = state.gravityConstant * (M1 + M2);
  const r1 = sep * (M2 / (M1 + M2));
  const r2 = sep * (M1 / (M1 + M2));
  const v1 = Math.sqrt(mu * r1) / sep;
  const v2 = Math.sqrt(mu * r2) / sep;
  const star1 = addBody({ name: 'Star A', mass: M1, radius: 18, color: '#ffd27d', position: pos1, velocity: new Vector2(0, v1), fixed: false });
  const star2 = addBody({ name: 'Star B', mass: M2, radius: 16, color: '#ffb347', position: pos2, velocity: new Vector2(0, -v2), fixed: false });
  starBody = star1; // primary reference; N-Body will handle both
  // A couple planets around barycenter
  addBody({ name: 'P1', mass: 4, radius: 6, color: '#7aa2ff', position: new Vector2(center.x, center.y + 260), velocity: new Vector2(1.4, 0) });
  addBody({ name: 'P2', mass: 3, radius: 5, color: '#8fd18a', position: new Vector2(center.x, center.y - 320), velocity: new Vector2(-1.2, 0) });
  state.model = PhysicsModel.NBody;
  fitAllBodies();
}

function loadPresetAsteroidRing() {
  resetSimulation();
  const center = state.canvasCenter.clone();
  const ringR = 260;
  const count = 120;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.05;
    const r = ringR + (Math.random() - 0.5) * 8;
    const x = center.x + r * Math.cos(angle);
    const y = center.y + r * Math.sin(angle);
    const vMag = Math.sqrt(state.gravityConstant * starBody.mass / r);
    const ux = -Math.sin(angle);
    const uy = Math.cos(angle);
    addBody({ name: `A${i}`, mass: 0.2, radius: 3, color: '#b0b9c8', position: new Vector2(x, y), velocity: new Vector2(ux * vMag, uy * vMag) });
  }
  fitAllBodies();
}

function loadPresetRandomSystem() {
  resetSimulation();
  const n = 8 + Math.floor(Math.random() * 8);
  for (let i = 0; i < n; i++) {
    const r = 80 + Math.random() * 380;
    const angle = Math.random() * Math.PI * 2;
    const x = state.canvasCenter.x + r * Math.cos(angle);
    const y = state.canvasCenter.y + r * Math.sin(angle);
    const vMag = Math.sqrt(state.gravityConstant * starBody.mass / r) * (0.6 + Math.random() * 0.8);
    const ux = -Math.sin(angle);
    const uy = Math.cos(angle);
    addBody({
      name: `R${i}`,
      mass: 2 + Math.random() * 6,
      radius: 4 + Math.random() * 4,
      color: `hsl(${Math.floor(Math.random() * 360)},70%,65%)`,
      position: new Vector2(x, y),
      velocity: new Vector2(ux * vMag, uy * vMag),
    });
  }
  fitAllBodies();
}

// Mouse interaction to place planets with initial velocity by dragging
function mousePressed() {
  // Only start placement if inside canvas
  if (mouseX < 0 || mouseY < 0 || mouseX > width || mouseY > height) return;
  // If clicking a UI overlay element (e.g., Show Controls), ignore for simulation
  if (isPointerOverUI()) return;
  // Determine if this is a pan or placement
  const isRight = typeof RIGHT !== 'undefined' ? mouseButton === RIGHT : false;
  const isMiddle = typeof CENTER !== 'undefined' ? mouseButton === CENTER : false;
  const panModifier = keyIsDown(SHIFT); // allow Shift+Left to pan as well
  if (isRight || isMiddle || panModifier) {
    isPanning = true;
    panStartScreen = { x: mouseX, y: mouseY };
    panStartPan = new Vector2(state.pan.x, state.pan.y);
  } else {
    // Hit-test bodies for selection (screen space)
    const world = screenToWorld(mouseX, mouseY);
    const hit = pickBodyAt(world.x, world.y);
    if (hit) {
      selectBody(hit.id);
      return;
    }
    isPlacingPlanet = true;
    const w = screenToWorld(mouseX, mouseY);
    placeStart = new Vector2(w.x, w.y);
    placeCurrent = new Vector2(w.x, w.y);
  }
}

function mouseDragged() {
  if (isPanning && panStartScreen && panStartPan) {
    // Update pan based on screen delta (unaffected by zoom)
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
  if (isPanning) {
    isPanning = false;
    panStartScreen = null;
    panStartPan = null;
    return;
  }
  if (!isPlacingPlanet || !placeStart) return;

  // Compute initial velocity from SCREEN drag delta for intuitive control under zoom
  const s0 = worldToScreen(placeStart.x, placeStart.y);
  const sx0 = s0.x;
  const sy0 = s0.y;
  const dxScreen = mouseX - sx0;
  const dyScreen = mouseY - sy0;
  const dragDist = Math.sqrt(dxScreen * dxScreen + dyScreen * dyScreen);
  const useVel = dragDist >= dragMinThresholdPx;

  // Use current form settings for properties if available
  const name = (inputs && inputs.name && inputs.name.value.trim()) || `Planet ${state.nextId}`;
  const color = (inputs && inputs.color && inputs.color.value) || '#51a7f9';
  const timbre = (inputs && inputs.timbre && inputs.timbre.value) || 'sine';
  const mass = Number(inputs && inputs.mass ? inputs.mass.value : 5) || 5;
  const radius = Number(inputs && inputs.radius ? inputs.radius.value : 6) || 6;

  const velocity = useVel
    ? new Vector2(dxScreen * velocityScale, dyScreen * velocityScale)
    : new Vector2(0, 0);

  // If no velocity provided and in Keplerian mode, auto-set circular orbital speed
  if (!useVel && starBody && (state.model === PhysicsModel.Keplerian || state.model === PhysicsModel.KeplerExact)) {
    const dx = placeStart.x - starBody.position.x;
    const dy = placeStart.y - starBody.position.y;
    const r = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const vMag = Math.sqrt(state.gravityConstant * starBody.mass / r);
    // perpendicular direction to radius vector (rotate by +90°)
    const ux = -dy / r;
    const uy = dx / r;
    velocity.x = ux * vMag;
    velocity.y = uy * vMag;
  }

  addBody({
    name,
    color,
    timbre,
    mass,
    radius,
    position: new Vector2(placeStart.x, placeStart.y),
    velocity,
  });

  // Select the newly created body for quick editing
  const newBody = state.bodies[state.bodies.length - 1];
  selectBody(newBody.id);

  isPlacingPlanet = false;
  placeStart = null;
  placeCurrent = null;
}

function mouseWheel(event) {
  // If the wheel event originated over controls or outside the canvas, do not zoom
  const target = event && event.target;
  const controlHit = controlPanelEl && controlPanelEl.contains(target);
  const expandBtnHit = btnExpandPanel && btnExpandPanel.contains(target);
  const statusBarEl = document.getElementById('status-bar');
  const statusHit = statusBarEl && statusBarEl.contains(target);
  const canvasEl = document.querySelector('#canvas-holder canvas');
  const canvasHit = canvasEl && canvasEl.contains(target);

  if (controlHit || expandBtnHit || statusHit || !canvasHit) {
    // allow normal scrolling (do not prevent default)
    return true;
  }

  // Zoom around center with limits when over the canvas only
  const factor = event.deltaY > 0 ? 0.9 : 1.1;
  state.zoom = Math.max(0.25, Math.min(3.0, state.zoom * factor));
  return false; // prevent page scroll when zooming the canvas
}

function addBody({ name, mass, radius, color, position, velocity, fixed = false, timbre = 'sine' }) {
  const body = new CelestialBody({
    id: state.nextId++,
    name: name || `Body ${state.nextId}`,
    mass: Number(mass),
    radius: Number(radius),
    color: color || '#ffffff',
    position: position || state.canvasCenter.clone(),
    velocity: velocity || new Vector2(0, 0),
    fixed,
    timbre,
  });
  state.bodies.push(body);
  refreshBodiesUI();
  return body;
}

function removeBody(id) {
  const idx = state.bodies.findIndex((b) => b.id === id);
  if (idx >= 0) {
    const removed = state.bodies.splice(idx, 1)[0];
    // If the central star is removed, clear reference and fall back to N-Body
    if (removed === starBody) {
      starBody = null;
      if (state.model === PhysicsModel.Keplerian || state.model === PhysicsModel.KeplerExact) {
        state.model = PhysicsModel.NBody;
        // Reflect in UI if present
        const modelSel = document.getElementById('select-model');
        if (modelSel) modelSel.value = 'nbody';
        if (statusModel) statusModel.textContent = 'Model: Newtonian N-Body';
      }
    }
    stopBodyAudio(removed);
    refreshBodiesUI();
  }
}

function resetSimulation() {
  for (const b of state.bodies) stopBodyAudio(b);
  state.bodies = [];
  state.nextId = 1;
  // Reset view and selection
  selectedBodyId = null;
  if (inspectorCard) inspectorCard.style.display = 'none';
  state.pan = new Vector2(0, 0);
  state.zoom = 1.0;
  // Reset model to Keplerian with a fresh star by default
  state.model = PhysicsModel.Keplerian;
  const modelSel = document.getElementById('select-model');
  if (modelSel) modelSel.value = 'keplerian';
  starBody = addBody({
    name: 'Star',
    mass: 1000,
    radius: 16,
    color: '#ffd27d',
    position: state.canvasCenter.clone(),
    velocity: new Vector2(0, 0),
    fixed: true,
  });
  if (statusModel) statusModel.textContent = 'Model: Keplerian';
  refreshBodiesUI();
}

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
  formAdd = document.getElementById('form-add');
  bodiesList = document.getElementById('list-bodies');
  statusPlay = document.getElementById('status-playstate');
  statusModel = document.getElementById('status-model');
  statusBodies = document.getElementById('status-bodies');
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
  checkboxReverb = document.getElementById('checkbox-reverb');
  selectScale = document.getElementById('select-scale');
  selectRoot = document.getElementById('select-root');
  selectSubdiv = document.getElementById('select-subdiv');
  checkboxPhaseOrbit = document.getElementById('checkbox-phase-orbit');
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

  // Events
  btnToggle.addEventListener('click', () => {
    state.isRunning = !state.isRunning;
    btnToggle.textContent = state.isRunning ? 'Pause' : 'Play';
    statusPlay.textContent = state.isRunning ? 'Running' : 'Paused';
  });

  btnStep.addEventListener('click', () => {
    state.isRunning = false;
    btnToggle.textContent = 'Play';
    statusPlay.textContent = 'Paused';
    stepSimulation();
  });

  btnReset.addEventListener('click', () => {
    state.isRunning = false;
    btnToggle.textContent = 'Play';
    statusPlay.textContent = 'Paused';
    resetSimulation();
  });

  selectModel.addEventListener('change', (e) => {
    const value = e.target.value;
    if (value === PhysicsModel.NBody) state.model = PhysicsModel.NBody;
    else if (value === PhysicsModel.KeplerExact) state.model = PhysicsModel.KeplerExact;
    else state.model = PhysicsModel.Keplerian;
    statusModel.textContent = `Model: ${
      state.model === PhysicsModel.Keplerian
        ? 'Keplerian'
        : state.model === PhysicsModel.KeplerExact
        ? 'Kepler (Exact)'
        : 'Newtonian N-Body'
    }`;
  });

  rangeDt.addEventListener('input', () => {
    const v = Number(rangeDt.value);
    state.timeScale = v;
    labelDt.textContent = v.toFixed(2);
  });

  rangeG.addEventListener('input', () => {
    const v = Number(rangeG.value);
    state.gravityConstant = v;
    labelG.textContent = v.toFixed(1);
  });

  rangeTrail.addEventListener('input', () => {
    const v = parseInt(rangeTrail.value, 10);
    state.trailLength = v;
    labelTrail.textContent = String(v);
  });

  formAdd.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = inputs.name.value.trim() || `Planet ${state.nextId}`;
    const color = inputs.color.value;
    const timbre = inputs.timbre.value;
    const mass = parseFloat(inputs.mass.value || '5');
    const radius = parseFloat(inputs.radius.value || '6');
    const posx = parseFloat(inputs.posx.value || '0');
    const posy = parseFloat(inputs.posy.value || '0');
    const velx = parseFloat(inputs.velx.value || '0');
    const vely = parseFloat(inputs.vely.value || '0');

    addBody({
      name,
      color,
      timbre,
      mass,
      radius,
      position: Vector2.add(state.canvasCenter, new Vector2(posx, posy)),
      velocity: new Vector2(velx, vely),
    });

    formAdd.reset();
    inputs.color.value = color; // reset clears color; restore previous
  });

  refreshBodiesUI();

  function resizeCanvasToContainer() {
    const container = document.getElementById('canvas-holder');
    if (!container) return;
    const w = Math.max(1, Math.floor(container.clientWidth));
    const h = Math.max(1, Math.floor(container.clientHeight));
    if (w !== width || h !== height) {
      resizeCanvas(w, h);
      state.canvasCenter = new Vector2(width / 2, height / 2);
    }
  }

  function setPanelCollapsed(collapsed) {
    if (!appRoot) return;
    if (collapsed) {
      appRoot.classList.add('panel-collapsed');
    } else {
      appRoot.classList.remove('panel-collapsed');
    }
    // Let CSS handle visibility of panel and floating button
    // Adjust canvas size to new layout
    requestAnimationFrame(resizeCanvasToContainer);
  }

  // Panel collapse/expand
  btnCollapsePanel.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setPanelCollapsed(true);
  });
  btnExpandPanel.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setPanelCollapsed(false);
  });

  // Audio enable/disable toggle
  if (audioCheckbox) {
    audioCheckbox.addEventListener('change', () => {
      if (audioCheckbox.checked) {
        // Prime/resume audio context on user gesture
        if (!audioCtx) {
          const ACtx = window.AudioContext || window.webkitAudioContext;
          if (ACtx) {
            audioCtx = new ACtx();
            masterGainNode = audioCtx.createGain();
            masterGainNode.gain.value = Number(rangeMasterVol?.value || 0.6);
            masterGainNode.connect(audioCtx.destination);
          }
        } else if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
      } else {
        // Stop all active oscillators
        for (const b of state.bodies) stopBodyAudio(b);
      }
    });
  }
  if (rhythmModeSelect) {
    rhythmModeSelect.addEventListener('change', () => {
      lastTickTime = 0; // reset rhythm phase
    });
  }

  // Master volume control
  rangeMasterVol?.addEventListener('input', () => {
    const v = Number(rangeMasterVol.value);
    labelMasterVol.textContent = v.toFixed(2);
    if (masterGainNode) masterGainNode.gain.value = v;
  });

  checkboxReverb?.addEventListener('change', () => {
    if (!audioCtx) return;
    if (checkboxReverb.checked) {
      if (!reverbNode) {
        reverbNode = audioCtx.createConvolver();
        // Simple synthetic impulse response
        const len = audioCtx.sampleRate * 1.2;
        const ir = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const data = ir.getChannelData(ch);
          for (let i = 0; i < len; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
          }
        }
        reverbNode.buffer = ir;
      }
      if (masterGainNode) {
        masterGainNode.disconnect();
        masterGainNode.connect(reverbNode);
        reverbNode.connect(audioCtx.destination);
      }
    } else {
      if (reverbNode && masterGainNode) {
        try { masterGainNode.disconnect(); } catch (_) {}
        try { reverbNode.disconnect(); } catch (_) {}
        masterGainNode.connect(audioCtx.destination);
      }
    }
  });

  // Tempo control
  rangeBpm?.addEventListener('input', () => {
    metronomeBpm = Number(rangeBpm.value);
    labelBpm.textContent = String(metronomeBpm);
  });

  // Center/Fit
  btnCenter?.addEventListener('click', () => centerOn(starBody));
  btnFit?.addEventListener('click', fitAllBodies);

  // Save/Load
  btnSave?.addEventListener('click', () => {
    const data = exportState();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'star-maker-scene.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  btnLoad?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const obj = JSON.parse(text);
      importState(obj);
    } catch (err) {
      console.error('Failed to load scene', err);
    }
    fileInput.value = '';
  });

  // Presets
  presetSolarBtn?.addEventListener('click', loadPresetSolarMini);
  presetBinaryBtn?.addEventListener('click', loadPresetBinaryStars);
  presetRingBtn?.addEventListener('click', loadPresetAsteroidRing);
  presetRandomBtn?.addEventListener('click', loadPresetRandomSystem);

  // Inspector events (live update)
  insName?.addEventListener('input', () => withSelected((b) => { b.name = insName.value; refreshBodiesUI(); }));
  insColor?.addEventListener('input', () => withSelected((b) => { b.color = insColor.value; }));
  insMass?.addEventListener('input', () => withSelected((b) => { b.mass = Number(insMass.value) || b.mass; }));
  insRadius?.addEventListener('input', () => withSelected((b) => { b.radius = Number(insRadius.value) || b.radius; }));
  insVelX?.addEventListener('input', () => withSelected((b) => { b.velocity.x = Number(insVelX.value) || 0; }));
  insVelY?.addEventListener('input', () => withSelected((b) => { b.velocity.y = Number(insVelY.value) || 0; }));
  insDeselect?.addEventListener('click', deselectBody);
  insRemove?.addEventListener('click', () => { if (selectedBodyId != null) removeBody(selectedBodyId); deselectBody(); });
}

function refreshBodiesUI() {
  if (!statusBodies || !bodiesList) return;
  // Status
  statusBodies.textContent = `Bodies: ${state.bodies.length}`;

  // List
  bodiesList.innerHTML = '';
  for (const body of state.bodies) {
    const li = document.createElement('li');

    const chip = document.createElement('div');
    chip.className = 'body-chip';
    const dot = document.createElement('span');
    dot.className = 'chip-color';
    dot.style.background = body.color;
    const name = document.createElement('span');
    name.textContent = `${body.name}`;
    name.title = `m=${body.mass}, r=${body.radius}`;
    chip.appendChild(dot);
    chip.appendChild(name);

    const stats = document.createElement('span');
    stats.className = 'muted inline';
    stats.textContent = `${body.fixed ? 'fixed' : body.timbre}`;

    const audioCtrls = document.createElement('div');
    audioCtrls.className = 'inline';
    const muteBtn = document.createElement('button');
    muteBtn.textContent = body.muted ? 'Unmute' : 'Mute';
    const soloBtn = document.createElement('button');
    soloBtn.textContent = body.solo ? 'Unsolo' : 'Solo';
    muteBtn.addEventListener('click', (e) => { e.stopPropagation(); body.muted = !body.muted; if (body.audio) body.audio.gain.gain.value = body.muted ? 0 : body.audio.gain.gain.value; refreshBodiesUI(); });
    soloBtn.addEventListener('click', (e) => { e.stopPropagation(); body.solo = !body.solo; refreshBodiesUI(); });
    audioCtrls.appendChild(muteBtn);
    audioCtrls.appendChild(soloBtn);

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.className = 'danger';
    removeBtn.addEventListener('click', (e) => { e.stopPropagation(); removeBody(body.id); });

    // Select on click
    li.addEventListener('click', () => selectBody(body.id));
    if (selectedBodyId === body.id) li.classList.add('selected');

    li.appendChild(chip);
    const leftCol = document.createElement('div');
    leftCol.appendChild(chip);
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = `${body.fixed ? 'fixed' : body.timbre}`;
    leftCol.appendChild(tag);

    const rightCol = document.createElement('div');
    rightCol.className = 'inline';
    rightCol.style.gap = '8px';
    rightCol.appendChild(muteBtn);
    rightCol.appendChild(soloBtn);
    rightCol.appendChild(removeBtn);

    li.appendChild(leftCol);
    li.appendChild(rightCol);
    bodiesList.appendChild(li);
  }
}

function pickBodyAt(wx, wy) {
  // Pick the top-most body within radius
  for (let i = state.bodies.length - 1; i >= 0; i--) {
    const b = state.bodies[i];
    const dx = wx - b.position.x;
    const dy = wy - b.position.y;
    if (dx * dx + dy * dy <= (b.radius * 2) ** 2) return b;
  }
  return null;
}

function selectBody(id) {
  selectedBodyId = id;
  const b = state.bodies.find((x) => x.id === id);
  if (!b) return deselectBody();
  inspectorCard.style.display = 'block';
  insName.value = b.name;
  insColor.value = b.color;
  insMass.value = String(b.mass);
  insRadius.value = String(b.radius);
  insVelX.value = String(b.velocity.x);
  insVelY.value = String(b.velocity.y);
  refreshBodiesUI();
}

function deselectBody() {
  selectedBodyId = null;
  inspectorCard.style.display = 'none';
  refreshBodiesUI();
}


// --- Audio helpers ---
function stopBodyAudio(body) {
  if (!body || !body.audio) return;
  try { body.audio.osc.stop(); } catch (_) {}
  try { body.audio.osc.disconnect(); } catch (_) {}
  try { body.audio.gain.disconnect(); } catch (_) {}
  body.audio = null;
}

function ensureAudioContext() {
  if (!audioCtx) {
    const ACtx = window.AudioContext || window.webkitAudioContext;
    if (ACtx) audioCtx = new ACtx();
  }
  return audioCtx;
}

function updateAudioForBodies() {
  if (!audioCheckbox || !audioCheckbox.checked) {
    for (const b of state.bodies) stopBodyAudio(b);
    return;
  }
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const baseFreq = 110; // A2
  const maxSpeedForPitch = 8; // px/frame
  const maxGain = 0.15;
  const rhythmMode = rhythmModeSelect ? rhythmModeSelect.value : 'off';
  const now = ctx.currentTime;
  const dt = now - (lastTickTime || now);
  const metroInterval = 60 / metronomeBpm; // seconds per beat
  const shouldTick = rhythmMode === 'metronome' && dt >= metroInterval;
  if (shouldTick) lastTickTime = now;
  const scaleMode = selectScale ? selectScale.value : 'off';
  const rootNote = selectRoot ? selectRoot.value : 'C';
  const subdiv = selectSubdiv ? Number(selectSubdiv.value) : 4;
  const phaseByOrbit = !!(checkboxPhaseOrbit && checkboxPhaseOrbit.checked);

  function noteToFreq(note) {
    const A4 = 440;
    const map = { C: -9, 'C#': -8, D: -7, Eb: -6, E: -5, F: -4, 'F#': -3, G: -2, Ab: -1, A: 0, Bb: 1, B: 2 };
    const semitone = map[rootNote] ?? -2;
    const n = 48 + semitone; // base around C3-A3 range
    return (offset) => A4 * Math.pow(2, (n + offset - 57) / 12);
  }
  const baseFromRoot = noteToFreq(rootNote);
  function quantizeToScale(fr) {
    if (scaleMode === 'off') return fr;
    const scaleOffsets = scaleMode === 'major' ? [0, 2, 4, 5, 7, 9, 11, 12] : scaleMode === 'minor' ? [0, 2, 3, 5, 7, 8, 10, 12] : [0, 2, 4, 7, 9, 12];
    let best = fr;
    let bestErr = Infinity;
    for (let oct = -2; oct <= 3; oct++) {
      for (const off of scaleOffsets) {
        const f = baseFromRoot(off + oct * 12);
        const err = Math.abs(Math.log(fr / f));
        if (err < bestErr) { bestErr = err; best = f; }
      }
    }
    return best;
  }

  for (const b of state.bodies) {
    if (b.fixed) continue;

    const speed = Math.sqrt(b.velocity.x * b.velocity.x + b.velocity.y * b.velocity.y);
    const t = Math.min(1, speed / maxSpeedForPitch);
    let freq = baseFreq * Math.pow(2, t * 4);
    freq = quantizeToScale(freq);

    const dx = b.position.x - state.canvasCenter.x;
    const dy = b.position.y - state.canvasCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const norm = Math.min(1, dist / (Math.max(width, height) * 0.6));
    let gainValue = (1 - norm) * maxGain;

    // Rhythm shaping
    if (rhythmMode === 'orbit') {
      // Pulse on periapsis/apoapsis approximations using curvature (from velocity change)
      // Approximate curvature by acceleration magnitude vs velocity magnitude
      const accMag = Math.sqrt(b.acceleration.x * b.acceleration.x + b.acceleration.y * b.acceleration.y);
      const curv = Math.min(1, accMag / Math.max(1e-6, speed));
      gainValue *= Math.pow(curv, 0.5); // stronger at high curvature
    } else if (rhythmMode === 'speed') {
      // Gate using a speed-driven LFO feel: faster -> higher pulse rate
      const pulsesPerSec = 0.5 + t * 4; // 0.5..4.5 Hz
      let phase = (now * pulsesPerSec) % 1;
      if (phaseByOrbit) {
        const angle = Math.atan2(b.position.y - starBody.position.y, b.position.x - starBody.position.x);
        phase = (phase + (angle / (2 * Math.PI))) % 1;
      }
      const gate = phase < 0.25 ? 1 : 0; // 25% duty cycle
      gainValue *= gate;
    } else if (rhythmMode === 'metronome') {
      // All bodies click on metronome tick (very short blip)
      if (shouldTick) {
        // schedule a short attack-release
        if (!b.audio) {
          // ensure node exists to schedule
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = b.timbre || 'sine';
          osc.frequency.setValueAtTime(freq, now);
          gain.gain.setValueAtTime(0, now);
          osc.connect(gain).connect(ctx.destination);
          try { osc.start(); } catch (_) {}
          b.audio = { osc, gain };
        }
        b.audio.gain.gain.cancelScheduledValues(now);
        b.audio.gain.gain.setValueAtTime(0, now);
        b.audio.gain.gain.linearRampToValueAtTime(Math.min(maxGain, gainValue + 0.05), now + 0.02);
        b.audio.gain.gain.linearRampToValueAtTime(0, now + 0.09);
      } else {
        // between ticks keep near zero
        gainValue = Math.min(gainValue, 0.001);
      }
    }

    // Solo/mute logic
    const anySolo = state.bodies.some((x) => x.solo);
    if (anySolo && !b.solo) gainValue = 0;
    if (b.muted) gainValue = 0;

    if (!b.audio) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = b.timbre || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(gainValue, ctx.currentTime);
      if (!masterGainNode && audioCtx) {
        masterGainNode = audioCtx.createGain();
        masterGainNode.gain.value = Number(rangeMasterVol?.value || 0.6);
        masterGainNode.connect(audioCtx.destination);
      }
      if (masterGainNode) {
        osc.connect(gain).connect(masterGainNode);
      } else {
        osc.connect(gain).connect(ctx.destination);
      }
      try { osc.start(); } catch (_) {}
      b.audio = { osc, gain };
    } else {
      // Ensure panner for stereo by x-position
      if (!b.audio.pan && ctx.createStereoPanner) {
        try {
          b.audio.pan = ctx.createStereoPanner();
          b.audio.gain.disconnect();
          b.audio.gain.connect(b.audio.pan);
          if (masterGainNode) b.audio.pan.connect(masterGainNode); else b.audio.pan.connect(ctx.destination);
        } catch (_) {}
      }
      const pan = Math.max(-1, Math.min(1, (b.position.x - state.canvasCenter.x) / (width * 0.5)));
      if (b.audio.pan && b.audio.pan.pan) b.audio.pan.pan.setTargetAtTime(pan, ctx.currentTime, 0.05);

      b.audio.osc.type = b.timbre || 'sine';
      b.audio.osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
      b.audio.gain.gain.setTargetAtTime(gainValue, ctx.currentTime, 0.05);
    }
  }
}

