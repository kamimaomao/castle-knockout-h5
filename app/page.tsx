"use client";

import { PointerEvent, useCallback, useEffect, useRef, useState } from "react";

const WORLD_W = 430;
const WORLD_H = 760;
const VANISH_X = 215;
const VANISH_Y = 244;
const SHOT_COUNT = 6;
const TARGET_COUNT = 5;
const DOWNLOAD_URL = "https://www.taptap.cn/moment/791302421241397589";

type ShotColor = "blue" | "red" | "gold";
type BrickKind = ShotColor | "stone";
type GameState = "INTRO" | "READY" | "CHARGING" | "FLYING" | "RESOLVING" | "CLIMAX" | "RESULT";

type ShotSpec = {
  color: ShotColor;
  band: number;
  clusterId: number;
  targetDepth: number;
  label: string;
};

type Brick = {
  id: number;
  band: number;
  col: number;
  row: number;
  clusterId: number;
  kind: BrickKind;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  vrx: number;
  vry: number;
  vrz: number;
  attached: boolean;
  cleared: boolean;
  crack: number;
  flash: number;
  pendingDetach: number;
  pendingFinal: boolean;
};

type Ball = {
  x: number;
  y: number;
  groundY: number;
  radius: number;
  progress: number;
  duration: number;
  power: number;
  depth: number;
  assisted: boolean;
  color: ShotColor;
  trail: { x: number; y: number; radius: number; life: number }[];
};

type Particle = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  size: number;
  color: string;
  spark: boolean;
};

type Shockwave = {
  x: number;
  y: number;
  radius: number;
  life: number;
  color: string;
};

type Runtime = {
  bricks: Brick[];
  ball: Ball | null;
  particles: Particle[];
  shockwaves: Shockwave[];
  state: GameState;
  charging: boolean;
  chargeStarted: number;
  charge: number;
  chargeCuePlayed: boolean;
  shots: number;
  targetIndex: number;
  shotCooldown: number;
  resolveTimer: number;
  victoryTimer: number;
  outTimer: number;
  shake: number;
  punch: number;
  hitStop: number;
  idleTime: number;
  firstInput: boolean;
  missCount: number;
  locked: boolean;
  progressEvents: Set<number>;
};

const SHOT_SEQUENCE: ShotSpec[] = [
  { color: "blue", band: 0, clusterId: 0, targetDepth: 0.2, label: "FRONT GATE" },
  { color: "red", band: 1, clusterId: 1, targetDepth: 0.52, label: "MID WALL" },
  { color: "gold", band: 2, clusterId: 2, targetDepth: 0.84, label: "CROWN TOWER" },
  { color: "red", band: 1, clusterId: 3, targetDepth: 0.58, label: "MID WALL" },
  { color: "blue", band: 0, clusterId: 4, targetDepth: 0.27, label: "FRONT GATE" },
];

const brickPalettes: Record<BrickKind, { light: string; face: string; edge: string; deep: string }> = {
  stone: { light: "#eff3fa", face: "#9aa6ba", edge: "#606b81", deep: "#3f485d" },
  blue: { light: "#b9efff", face: "#36a4f2", edge: "#1460ba", deep: "#0b347a" },
  red: { light: "#ffb09a", face: "#ee5547", edge: "#a92c38", deep: "#681c31" },
  gold: { light: "#fff6a6", face: "#ffc93f", edge: "#c57416", deep: "#75400d" },
};

const shotHex: Record<ShotColor, string> = {
  blue: "#39aaf5",
  red: "#ef5547",
  gold: "#ffd047",
};

const progressEventNames: Record<number, string> = {
  25: "CHALLENGE_PASS_25",
  50: "CHALLENGE_PASS_50",
  75: "CHALLENGE_PASS_75",
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;
const depthToY = (depth: number) => 568 - clamp(depth) * 300;

function emitPlayableEvent(name: string, detail: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const payload = { name, ...detail };
  window.dispatchEvent(new CustomEvent("playable:event", { detail: payload }));
  const target = window as typeof window & { dataLayer?: Record<string, unknown>[] };
  target.dataLayer?.push({ event: name, ...detail });
}

function createCastle() {
  const configs = [
    { band: 0, cols: 12, rows: 7, w: 31, h: 19, gap: 2, baseY: 558 },
    { band: 1, cols: 10, rows: 6, w: 29, h: 17, gap: 2, baseY: 442 },
    { band: 2, cols: 8, rows: 5, w: 27, h: 15, gap: 2, baseY: 337 },
  ];
  const clusterCells = new Map<string, { kind: ShotColor; clusterId: number }>();
  const addCluster = (band: number, clusterId: number, kind: ShotColor, cells: [number, number][]) => {
    cells.forEach(([col, row]) => clusterCells.set(`${band}:${col}:${row}`, { kind, clusterId }));
  };

  addCluster(0, 0, "blue", [[3, 1], [4, 1], [3, 2], [4, 2], [4, 3]]);
  addCluster(1, 1, "red", [[3, 1], [4, 1], [5, 1], [4, 2], [5, 2]]);
  addCluster(2, 2, "gold", [[3, 1], [4, 1], [3, 2], [4, 2], [3, 3], [4, 3]]);
  addCluster(1, 3, "red", [[6, 3], [7, 3], [6, 4], [7, 4]]);
  addCluster(0, 4, "blue", [[7, 1], [8, 1], [7, 2], [8, 2], [7, 3]]);

  const bricks: Brick[] = [];
  let id = 0;
  for (const config of configs) {
    const totalWidth = config.cols * config.w + (config.cols - 1) * config.gap;
    const startX = (WORLD_W - totalWidth) / 2 + config.w / 2;
    for (let row = 0; row < config.rows; row += 1) {
      for (let col = 0; col < config.cols; col += 1) {
        if (config.band === 0 && row <= 2 && (col === 5 || col === 6)) continue;
        const special = clusterCells.get(`${config.band}:${col}:${row}`);
        const stagger = row % 2 === 0 ? 0 : config.w * 0.08;
        const x = startX + col * (config.w + config.gap) + stagger;
        const y = config.baseY - row * (config.h + config.gap);
        bricks.push({
          id: id++,
          band: config.band,
          col,
          row,
          clusterId: special?.clusterId ?? -1,
          kind: special?.kind ?? "stone",
          x,
          y,
          z: 0,
          w: config.w,
          h: config.h,
          vx: 0,
          vy: 0,
          vz: 0,
          rx: 0,
          ry: 0,
          rz: 0,
          vrx: 0,
          vry: 0,
          vrz: 0,
          attached: true,
          cleared: false,
          crack: (id + row * 3 + col) % 13 === 0 ? 1 : 0,
          flash: 0,
          pendingDetach: -1,
          pendingFinal: false,
        });
      }
    }
  }
  return bricks;
}

function createRuntime(): Runtime {
  return {
    bricks: createCastle(),
    ball: null,
    particles: [],
    shockwaves: [],
    state: "READY",
    charging: false,
    chargeStarted: 0,
    charge: 0,
    chargeCuePlayed: false,
    shots: SHOT_COUNT,
    targetIndex: 0,
    shotCooldown: 0,
    resolveTimer: 0,
    victoryTimer: 0,
    outTimer: 0,
    shake: 0,
    punch: 0,
    hitStop: 0,
    idleTime: 0,
    firstInput: false,
    missCount: 0,
    locked: false,
    progressEvents: new Set<number>(),
  };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(radius, w / 2, h / 2));
}

function drawCrown(ctx: CanvasRenderingContext2D, scale = 1) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(-16, 7);
  ctx.lineTo(-20, -9);
  ctx.lineTo(-8, -2);
  ctx.lineTo(0, -16);
  ctx.lineTo(8, -2);
  ctx.lineTo(20, -9);
  ctx.lineTo(16, 7);
  ctx.closePath();
  ctx.fillStyle = "#fff278";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#8b4e0e";
  ctx.stroke();
  ctx.restore();
}

function projectPoint(x: number, y: number, z: number) {
  const scale = 560 / (560 + Math.max(0, z));
  return {
    x: VANISH_X + (x - VANISH_X) * scale,
    y: VANISH_Y + (y - VANISH_Y) * scale,
    scale,
  };
}

function drawBrick(ctx: CanvasRenderingContext2D, brick: Brick, now: number, activeCluster: number) {
  const palette = brickPalettes[brick.kind];
  const projected = projectPoint(brick.x, brick.y, brick.z);
  const flipX = 0.84 + Math.abs(Math.cos(brick.ry)) * 0.16;
  const flipY = 0.82 + Math.abs(Math.cos(brick.rx)) * 0.18;
  const extrude = 4 + Math.abs(Math.sin(brick.ry)) * 8;
  const pulse = brick.attached && brick.clusterId === activeCluster ? 0.68 + Math.sin(now * 0.008 + brick.id) * 0.24 : 0;

  ctx.save();
  ctx.globalAlpha = Math.max(0.12, 1 - brick.z / 980);
  ctx.translate(projected.x, projected.y);
  ctx.rotate(brick.rz);
  ctx.scale(projected.scale * flipX, projected.scale * flipY);
  ctx.shadowColor = pulse > 0 ? shotHex[brick.kind as ShotColor] : brick.attached ? "rgba(26,34,58,.34)" : "rgba(12,26,63,.52)";
  ctx.shadowBlur = pulse > 0 ? 15 + pulse * 10 : brick.attached ? 3 : 11;
  ctx.shadowOffsetY = pulse > 0 ? 0 : brick.attached ? 2 : 7;

  ctx.fillStyle = palette.deep;
  ctx.beginPath();
  ctx.moveTo(brick.w / 2, -brick.h / 2);
  ctx.lineTo(brick.w / 2 + extrude, -brick.h / 2 - extrude * 0.52);
  ctx.lineTo(brick.w / 2 + extrude, brick.h / 2 - extrude * 0.52);
  ctx.lineTo(brick.w / 2, brick.h / 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = palette.light;
  ctx.beginPath();
  ctx.moveTo(-brick.w / 2, -brick.h / 2);
  ctx.lineTo(-brick.w / 2 + extrude, -brick.h / 2 - extrude * 0.52);
  ctx.lineTo(brick.w / 2 + extrude, -brick.h / 2 - extrude * 0.52);
  ctx.lineTo(brick.w / 2, -brick.h / 2);
  ctx.closePath();
  ctx.fill();

  roundedRect(ctx, -brick.w / 2, -brick.h / 2, brick.w, brick.h, 3);
  ctx.fillStyle = brick.flash > 0 ? "#fff8d2" : palette.face;
  ctx.fill();
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.globalAlpha *= 0.38;
  ctx.fillStyle = "#fff";
  roundedRect(ctx, -brick.w / 2 + 3, -brick.h / 2 + 2, brick.w - 7, 3.5, 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  if (brick.crack > 0) {
    ctx.strokeStyle = "rgba(39,43,57,.6)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-2, -brick.h / 2 + 2);
    ctx.lineTo(2, -2);
    ctx.lineTo(-4, 3);
    ctx.lineTo(3, brick.h / 2 - 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawProjectile(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: ShotColor, glow = false) {
  const palettes: Record<ShotColor, [string, string, string]> = {
    blue: ["#eafcff", "#39aaf5", "#0a397e"],
    red: ["#fff1e9", "#ef5b48", "#7b1932"],
    gold: ["#fffce0", "#ffd047", "#93450c"],
  };
  const [light, middle, deep] = palettes[color];
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = glow ? middle : "rgba(13,30,72,.58)";
  ctx.shadowBlur = glow ? 24 : 10;
  ctx.shadowOffsetY = glow ? 0 : 6;
  const gradient = ctx.createRadialGradient(-radius * 0.38, -radius * 0.42, 1, 0, 0, radius);
  gradient.addColorStop(0, light);
  gradient.addColorStop(0.22, middle);
  gradient.addColorStop(1, deep);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#ffe76a";
  ctx.lineWidth = Math.max(2, radius * 0.11);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.72, -1.1, 1.9);
  ctx.stroke();
  drawCrown(ctx, radius / 48);
  ctx.restore();
}

function drawFortressBacking(ctx: CanvasRenderingContext2D) {
  ctx.save();
  const tiers = [
    { x: 12, y: 416, w: 406, h: 155, radius: 10, color: "#414c63" },
    { x: 54, y: 344, w: 322, h: 111, radius: 10, color: "#505a70" },
    { x: 94, y: 265, w: 242, h: 83, radius: 10, color: "#616b7d" },
  ];
  ctx.shadowColor = "rgba(17,28,55,.45)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 10;
  for (const tier of tiers) {
    roundedRect(ctx, tier.x, tier.y, tier.w, tier.h, tier.radius);
    ctx.fillStyle = tier.color;
    ctx.fill();
  }
  ctx.shadowColor = "transparent";
  const door = ctx.createRadialGradient(215, 533, 4, 215, 533, 48);
  door.addColorStop(0, "#101d38");
  door.addColorStop(1, "#27334b");
  ctx.fillStyle = door;
  ctx.beginPath();
  ctx.arc(215, 524, 37, Math.PI, 0);
  ctx.lineTo(252, 570);
  ctx.lineTo(178, 570);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGroundDepth(ctx: CanvasRenderingContext2D) {
  ctx.save();
  const ground = ctx.createLinearGradient(0, 560, 0, 760);
  ground.addColorStop(0, "rgba(255,239,166,.06)");
  ground.addColorStop(1, "rgba(21,30,68,.32)");
  ctx.fillStyle = ground;
  ctx.fillRect(0, 555, WORLD_W, 205);
  ctx.strokeStyle = "rgba(255,244,185,.15)";
  ctx.lineWidth = 1.5;
  for (let i = 1; i <= 6; i += 1) {
    const depth = i / 7;
    const y = depthToY(depth);
    ctx.beginPath();
    ctx.ellipse(215, y, 180 * (1 - depth * 0.67), 23 * (1 - depth * 0.55), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function spawnParticles(runtime: Runtime, x: number, y: number, color: ShotColor, amount: number) {
  const palette = [shotHex[color], "#fff4a8", "#f6b735", "#e7edf8", "#ffffff"];
  for (let i = 0; i < amount; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2.5 + Math.random() * 8;
    runtime.particles.push({
      x,
      y,
      z: 0,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2.5,
      vz: 3 + Math.random() * 10,
      life: 0.7 + Math.random() * 0.8,
      size: 1.8 + Math.random() * 5.2,
      color: palette[Math.floor(Math.random() * palette.length)],
      spark: i % 3 === 0,
    });
  }
}

function detachBrick(brick: Brick, hitX: number, hitY: number, strength: number, finalBurst = false) {
  if (!brick.attached) return;
  const dx = brick.x - hitX;
  const dy = brick.y - hitY;
  const length = Math.max(12, Math.hypot(dx, dy));
  brick.attached = false;
  brick.pendingDetach = -1;
  brick.pendingFinal = false;
  brick.flash = 0.3;
  brick.crack = 2;
  brick.vx = (dx / length) * (2.2 + strength * 4.6) + (Math.random() - 0.5) * 2.4;
  brick.vy = (dy / length) * (1.8 + strength * 3.2) - 2.6 - Math.random() * 3.8;
  brick.vz = (finalBurst ? 13 : 9) + strength * 11 + Math.random() * 9;
  brick.vrx = (Math.random() - 0.5) * 0.22;
  brick.vry = (Math.random() - 0.5) * 0.28;
  brick.vrz = (Math.random() - 0.5) * 0.18;
}

function scheduleUnsupported(runtime: Runtime, band: number) {
  const attached = runtime.bricks.filter((brick) => brick.band === band && brick.attached && brick.pendingDetach < 0);
  const supported = new Set<number>();
  attached.filter((brick) => brick.row === 0).forEach((brick) => supported.add(brick.id));
  const maxRow = Math.max(0, ...attached.map((brick) => brick.row));
  for (let row = 1; row <= maxRow; row += 1) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const brick of attached.filter((item) => item.row === row && !supported.has(item.id))) {
        const hasSupport = attached.some((base) => supported.has(base.id) && base.row === row - 1 && Math.abs(base.col - brick.col) <= 1);
        if (hasSupport) {
          supported.add(brick.id);
          changed = true;
        }
      }
    }
  }
  const unstable = attached
    .filter((brick) => !supported.has(brick.id) && brick.clusterId < 0)
    .sort((a, b) => a.row - b.row);
  unstable.forEach((brick, index) => {
    brick.pendingDetach = 0.1 + index * 0.025 + Math.random() * 0.16;
  });
  return unstable.length;
}

function getClusterCenter(bricks: Brick[], clusterId: number) {
  const cluster = bricks.filter((brick) => brick.clusterId === clusterId && brick.attached);
  if (!cluster.length) return { x: 215, y: depthToY(SHOT_SEQUENCE[clusterId]?.targetDepth ?? 0.5) };
  return {
    x: cluster.reduce((sum, brick) => sum + brick.x, 0) / cluster.length,
    y: cluster.reduce((sum, brick) => sum + brick.y, 0) / cluster.length,
  };
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<Runtime>(createRuntime());
  const soundRef = useRef(true);
  const audioRef = useRef<AudioContext | null>(null);
  const bannerTimerRef = useRef<number | null>(null);
  const [shots, setShots] = useState(SHOT_COUNT);
  const [clearedTargets, setClearedTargets] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [tutorial, setTutorial] = useState(true);
  const [impactLabel, setImpactLabel] = useState("");
  const [endState, setEndState] = useState<null | "victory" | "out">(null);

  const currentSpec = SHOT_SEQUENCE[Math.min(clearedTargets, TARGET_COUNT - 1)];
  const nextShots = [1, 2].map((offset) => SHOT_SEQUENCE[Math.min(clearedTargets + offset, TARGET_COUNT - 1)]?.color ?? "gold");

  const playTone = useCallback((frequency: number, duration: number, type: OscillatorType = "sine", volume = 0.05) => {
    if (!soundRef.current || typeof window === "undefined") return;
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const audio = audioRef.current ?? new AudioCtx();
    audioRef.current = audio;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(42, frequency * 0.48), audio.currentTime + duration);
    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + duration);
  }, []);

  const showImpact = useCallback((label: string) => {
    setImpactLabel(label);
    if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = window.setTimeout(() => setImpactLabel(""), 940);
  }, []);

  const resetGame = useCallback(() => {
    runtimeRef.current = createRuntime();
    setShots(SHOT_COUNT);
    setClearedTargets(0);
    setTutorial(true);
    setImpactLabel("");
    setEndState(null);
    emitPlayableEvent("CHALLENGE_STARTED", { replay: true });
  }, []);

  const resolveImpact = useCallback((ball: Ball) => {
    const runtime = runtimeRef.current;
    const spec = SHOT_SEQUENCE[Math.min(runtime.targetIndex, TARGET_COUNT - 1)];
    const depthError = Math.abs(ball.depth - spec.targetDepth);
    const tolerance = runtime.targetIndex === 0 ? 0.21 : 0.17;
    const success = ball.assisted || depthError <= tolerance;
    const targetY = depthToY(ball.depth);

    runtime.ball = null;
    runtime.hitStop = 0.07;
    runtime.shake = success ? 17 + ball.power * 7 : 9;
    runtime.punch = success ? 1.1 : 0.55;
    runtime.shockwaves.push({ x: 215, y: targetY, radius: 8, life: 1, color: shotHex[ball.color] });

    if (success) {
      const center = getClusterCenter(runtime.bricks, spec.clusterId);
      const cluster = runtime.bricks.filter((brick) => brick.clusterId === spec.clusterId && brick.attached);
      const neighbors = runtime.bricks
        .filter((brick) => brick.band === spec.band && brick.attached && brick.clusterId < 0)
        .map((brick) => ({ brick, distance: Math.hypot(brick.x - center.x, brick.y - center.y) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5 + Math.round(ball.power * 3))
        .map(({ brick }) => brick);
      const direct = [...cluster, ...neighbors];
      direct.forEach((brick) => detachBrick(brick, center.x, center.y, 0.9 + ball.power * 0.55));
      const cascaded = scheduleUnsupported(runtime, spec.band);
      spawnParticles(runtime, center.x, center.y, spec.color, 58 + direct.length * 3);
      runtime.shockwaves.push({ x: center.x, y: center.y, radius: 10, life: 1, color: shotHex[spec.color] });
      runtime.missCount = 0;
      runtime.targetIndex += 1;
      const progress = runtime.targetIndex;
      setClearedTargets(progress);
      showImpact(`${spec.color.toUpperCase()} CHAIN ×${direct.length + cascaded}`);
      playTone(spec.color === "gold" ? 118 : 84, 0.3, "sawtooth", 0.09);
      window.setTimeout(() => playTone(360 + progress * 42, 0.16, "triangle", 0.052), 65);
      if (navigator.vibrate) navigator.vibrate([26, 22, 52]);

      const progressPercent = progress / TARGET_COUNT * 100;
      for (const threshold of [25, 50, 75]) {
        if (progressPercent >= threshold && !runtime.progressEvents.has(threshold)) {
          runtime.progressEvents.add(threshold);
          emitPlayableEvent(progressEventNames[threshold], { target: progress });
        }
      }

      if (progress >= TARGET_COUNT) {
        runtime.state = "CLIMAX";
        runtime.locked = true;
        runtime.victoryTimer = 1.65;
        runtime.bricks.filter((brick) => brick.attached).forEach((brick) => {
          brick.pendingDetach = 0.05 + Math.random() * 0.62;
          brick.pendingFinal = true;
        });
        runtime.shake = 25;
        runtime.punch = 1.45;
        showImpact("CASTLE CLEARED!");
        emitPlayableEvent("CHALLENGE_SOLVED", { shotsUsed: SHOT_COUNT - runtime.shots });
      } else {
        runtime.state = "RESOLVING";
        runtime.resolveTimer = 0.82;
      }
    } else {
      const nearestBand = SHOT_SEQUENCE.reduce((best, item) => Math.abs(item.targetDepth - ball.depth) < Math.abs(best.targetDepth - ball.depth) ? item : best, SHOT_SEQUENCE[0]).band;
      const glancing = runtime.bricks
        .filter((brick) => brick.band === nearestBand && brick.attached && brick.clusterId < 0)
        .map((brick) => ({ brick, distance: Math.hypot(brick.x - 215, brick.y - targetY) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 4)
        .map(({ brick }) => brick);
      glancing.forEach((brick) => detachBrick(brick, 215, targetY, 0.55));
      spawnParticles(runtime, 215, targetY, ball.color, 34);
      runtime.missCount += 1;
      runtime.state = "RESOLVING";
      runtime.resolveTimer = 0.68;
      showImpact(ball.depth < spec.targetDepth ? "NEAR MISS • HOLD LONGER" : "NEAR MISS • RELEASE SOONER");
      playTone(68, 0.22, "square", 0.055);
      if (navigator.vibrate) navigator.vibrate(25);
    }

    if (runtime.shots === 0 && runtime.targetIndex < TARGET_COUNT) runtime.outTimer = 1.25;
  }, [playTone, showImpact]);

  useEffect(() => {
    emitPlayableEvent("CHALLENGE_STARTED");
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let previous = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(2, Math.max(0.45, (now - previous) / 16.667));
      const seconds = 0.0167 * dt;
      previous = now;
      const runtime = runtimeRef.current;
      runtime.shotCooldown = Math.max(0, runtime.shotCooldown - seconds);
      runtime.shake *= Math.pow(0.79, dt);
      runtime.punch *= Math.pow(0.76, dt);
      runtime.hitStop = Math.max(0, runtime.hitStop - seconds);

      if (runtime.state === "READY" && !runtime.charging && !runtime.ball && !runtime.locked) runtime.idleTime += seconds;
      else runtime.idleTime = 0;

      if (runtime.charging) {
        runtime.charge = Math.min(1, (now - runtime.chargeStarted) / 1250);
        if (runtime.charge >= 1 && !runtime.chargeCuePlayed) {
          runtime.chargeCuePlayed = true;
          playTone(760, 0.12, "triangle", 0.042);
          if (navigator.vibrate) navigator.vibrate(16);
        }
      }

      if (runtime.hitStop <= 0) {
        for (const brick of runtime.bricks) {
          brick.flash = Math.max(0, brick.flash - 0.03 * dt);
          if (brick.attached && brick.pendingDetach >= 0) {
            brick.pendingDetach -= seconds;
            if (brick.pendingDetach <= 0) detachBrick(brick, 215, 408, brick.pendingFinal ? 1.4 : 0.72, brick.pendingFinal);
          }
          if (brick.attached || brick.cleared) continue;
          brick.x += brick.vx * dt;
          brick.y += brick.vy * dt;
          brick.z += brick.vz * dt;
          brick.vy += 0.16 * dt;
          brick.vx *= Math.pow(0.992, dt);
          brick.vz *= Math.pow(0.989, dt);
          brick.rx += brick.vrx * dt;
          brick.ry += brick.vry * dt;
          brick.rz += brick.vrz * dt;
          if (brick.z > 980 || brick.y > 940) brick.cleared = true;
        }

        if (runtime.ball) {
          const ball = runtime.ball;
          ball.progress = Math.min(1, ball.progress + seconds / ball.duration);
          const depthEase = 1 - Math.pow(1 - ball.progress, 1.42);
          ball.groundY = lerp(790, depthToY(ball.depth), depthEase);
          const arcHeight = Math.sin(Math.PI * ball.progress) * (118 + ball.power * 62);
          ball.x = 215;
          ball.y = ball.groundY - arcHeight;
          ball.radius = lerp(38, 15, depthEase);
          ball.trail.unshift({ x: ball.x, y: ball.y, radius: ball.radius, life: 1 });
          if (ball.trail.length > 13) ball.trail.pop();
          ball.trail.forEach((point) => { point.life -= 0.105 * dt; });
          if (ball.progress >= 1) resolveImpact(ball);
        }

        for (const particle of runtime.particles) {
          particle.x += particle.vx * dt;
          particle.y += particle.vy * dt;
          particle.z += particle.vz * dt;
          particle.vy += 0.11 * dt;
          particle.vz *= Math.pow(0.982, dt);
          particle.life -= 0.028 * dt;
        }
        runtime.particles = runtime.particles.filter((particle) => particle.life > 0);
        runtime.shockwaves.forEach((wave) => {
          wave.radius += 9.5 * dt;
          wave.life -= 0.06 * dt;
        });
        runtime.shockwaves = runtime.shockwaves.filter((wave) => wave.life > 0);
      }

      if (runtime.resolveTimer > 0) {
        runtime.resolveTimer -= seconds;
        if (runtime.resolveTimer <= 0 && !runtime.locked) {
          runtime.state = "READY";
          runtime.shotCooldown = 0.12;
        }
      }
      if (runtime.victoryTimer > 0) {
        runtime.victoryTimer -= seconds;
        if (runtime.victoryTimer <= 0) {
          runtime.state = "RESULT";
          setEndState("victory");
          playTone(523, 0.2, "triangle", 0.055);
          window.setTimeout(() => playTone(659, 0.25, "triangle", 0.05), 110);
          window.setTimeout(() => playTone(784, 0.35, "triangle", 0.048), 220);
        }
      }
      if (runtime.outTimer > 0 && runtime.victoryTimer <= 0) {
        runtime.outTimer -= seconds;
        if (runtime.outTimer <= 0 && runtime.targetIndex < TARGET_COUNT) {
          runtime.locked = true;
          runtime.state = "RESULT";
          setEndState("out");
        }
      }

      ctx.clearRect(0, 0, WORLD_W, WORLD_H);
      const shakeX = (Math.random() - 0.5) * runtime.shake;
      const shakeY = (Math.random() - 0.5) * runtime.shake;
      const cameraScale = 1 + runtime.punch * 0.026;
      ctx.save();
      ctx.translate(WORLD_W / 2 + shakeX, WORLD_H / 2 + shakeY);
      ctx.scale(cameraScale, cameraScale);
      ctx.translate(-WORLD_W / 2, -WORLD_H / 2);

      const stageLight = ctx.createRadialGradient(215, 365, 25, 215, 420, 310);
      stageLight.addColorStop(0, "rgba(255,245,188,.2)");
      stageLight.addColorStop(1, "rgba(18,37,79,.08)");
      ctx.fillStyle = stageLight;
      ctx.fillRect(0, 110, WORLD_W, 610);
      drawGroundDepth(ctx);
      drawFortressBacking(ctx);

      const activeSpec = SHOT_SEQUENCE[Math.min(runtime.targetIndex, TARGET_COUNT - 1)];
      const targetCenter = getClusterCenter(runtime.bricks, activeSpec.clusterId);
      const targetPulse = 0.5 + Math.sin(now * 0.006) * 0.18;
      ctx.save();
      ctx.globalAlpha = runtime.locked ? 0 : targetPulse;
      ctx.strokeStyle = shotHex[activeSpec.color];
      ctx.lineWidth = 5;
      ctx.shadowColor = shotHex[activeSpec.color];
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.ellipse(targetCenter.x, targetCenter.y, 51, 25, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      const attached = runtime.bricks.filter((brick) => brick.attached).sort((a, b) => b.band - a.band || b.row - a.row);
      attached.forEach((brick) => drawBrick(ctx, brick, now, activeSpec.clusterId));
      const flying = runtime.bricks.filter((brick) => !brick.attached && !brick.cleared).sort((a, b) => b.z - a.z);
      flying.forEach((brick) => drawBrick(ctx, brick, now, activeSpec.clusterId));

      for (const wave of runtime.shockwaves) {
        ctx.save();
        ctx.globalAlpha = wave.life;
        ctx.strokeStyle = wave.color;
        ctx.lineWidth = 8 * wave.life;
        ctx.shadowColor = wave.color;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      for (const particle of runtime.particles) {
        const projected = projectPoint(particle.x, particle.y, particle.z);
        ctx.save();
        ctx.globalAlpha = Math.min(1, particle.life);
        ctx.translate(projected.x, projected.y);
        ctx.fillStyle = particle.color;
        if (particle.spark) {
          ctx.rotate(Math.atan2(particle.vy, particle.vx));
          ctx.fillRect(-particle.size * 2.2, -particle.size / 2, particle.size * 4.4, particle.size);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, particle.size * projected.scale, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      const showDepthGuide = runtime.charging || (runtime.idleTime > 1.8 && runtime.state === "READY");
      if (showDepthGuide && !runtime.ball && !runtime.locked) {
        const guideCharge = runtime.charging ? runtime.charge : clamp((Math.sin((runtime.idleTime - 1.8) * 1.35) + 1) / 2);
        const guideY = depthToY(guideCharge);
        ctx.save();
        for (let i = 0; i <= 10; i += 1) {
          const depth = i / 10;
          const y = depthToY(depth);
          ctx.globalAlpha = 0.16 + depth * 0.3;
          ctx.strokeStyle = "#fff6b1";
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.ellipse(215, y, 30 - depth * 20, 8 - depth * 5, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 0.96;
        ctx.strokeStyle = shotHex[activeSpec.color];
        ctx.lineWidth = 5;
        ctx.shadowColor = shotHex[activeSpec.color];
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.ellipse(215, guideY, 38, 12, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowColor = "transparent";
        ctx.setLineDash([6, 6]);
        ctx.globalAlpha = 0.72;
        ctx.beginPath();
        ctx.moveTo(215, 706);
        ctx.lineTo(215, guideY + 13);
        ctx.stroke();
        ctx.setLineDash([]);

        if (runtime.charging) {
          roundedRect(ctx, 86, 610, 258, 42, 20);
          ctx.fillStyle = "rgba(26,35,63,.9)";
          ctx.fill();
          ctx.strokeStyle = "#626f8a";
          ctx.lineWidth = 3;
          ctx.stroke();
          roundedRect(ctx, 96, 624, 238, 14, 7);
          ctx.fillStyle = "#17243f";
          ctx.fill();
          const chargeGradient = ctx.createLinearGradient(96, 0, 334, 0);
          chargeGradient.addColorStop(0, "#39aaf5");
          chargeGradient.addColorStop(0.62, "#ffd047");
          chargeGradient.addColorStop(1, "#ef5547");
          roundedRect(ctx, 96, 624, Math.max(12, 238 * runtime.charge), 14, 7);
          ctx.fillStyle = chargeGradient;
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = "900 11px Arial";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(`Z-DEPTH  ${Math.round(runtime.charge * 100)}%`, 215, 606);
        }
        ctx.restore();
      }

      if (runtime.ball) {
        ctx.save();
        ctx.globalAlpha = 0.2 + runtime.ball.progress * 0.16;
        ctx.fillStyle = "#13213d";
        ctx.beginPath();
        ctx.ellipse(runtime.ball.x, runtime.ball.groundY + 5, runtime.ball.radius * 1.28, runtime.ball.radius * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        runtime.ball.trail.forEach((point, index) => {
          ctx.globalAlpha = Math.max(0, point.life) * (0.48 - index * 0.022);
          drawProjectile(ctx, point.x, point.y, Math.max(4, point.radius * 0.72), runtime.ball!.color);
        });
        ctx.globalAlpha = 1;
        drawProjectile(ctx, runtime.ball.x, runtime.ball.y, runtime.ball.radius, runtime.ball.color, true);
      } else if (runtime.shots > 0 && !runtime.locked) {
        drawProjectile(ctx, 215, 752, 37 + runtime.charge * 3, activeSpec.color, runtime.charging);
      }
      ctx.restore();

      raf = requestAnimationFrame(frame);
    };

    runtimeRef.current.state = "READY";
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playTone, resolveImpact]);

  const beginCharge = (event: PointerEvent<HTMLCanvasElement>) => {
    const runtime = runtimeRef.current;
    if (runtime.state !== "READY" || runtime.charging || runtime.ball || runtime.shotCooldown > 0 || runtime.shots <= 0 || runtime.locked) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    runtime.state = "CHARGING";
    runtime.charging = true;
    runtime.chargeStarted = performance.now();
    runtime.charge = 0;
    runtime.chargeCuePlayed = false;
    runtime.idleTime = 0;
    if (!runtime.firstInput) {
      runtime.firstInput = true;
      emitPlayableEvent("FIRST_INTERACTION");
    }
    setTutorial(false);
    playTone(220, 0.08, "sine", 0.024);
  };

  const releaseCharge = (event: PointerEvent<HTMLCanvasElement>) => {
    const runtime = runtimeRef.current;
    if (!runtime.charging || runtime.ball || runtime.shots <= 0 || runtime.locked) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const spec = SHOT_SEQUENCE[Math.min(runtime.targetIndex, TARGET_COUNT - 1)];
    const rawDepth = Math.max(0.07, runtime.charge);
    const assistRange = runtime.missCount > 0 || runtime.shots === 1 ? 0.28 : runtime.targetIndex === 0 ? 0.2 : 0.12;
    const assisted = Math.abs(rawDepth - spec.targetDepth) <= assistRange;
    const depth = assisted ? spec.targetDepth : rawDepth;
    runtime.ball = {
      x: 215,
      y: 782,
      groundY: 790,
      radius: 38,
      progress: 0,
      duration: 1.08 - rawDepth * 0.26,
      power: rawDepth,
      depth,
      assisted,
      color: spec.color,
      trail: [],
    };
    runtime.state = "FLYING";
    runtime.charging = false;
    runtime.charge = 0;
    runtime.shots -= 1;
    setShots(runtime.shots);
    playTone(126 + rawDepth * 70, 0.17, "sawtooth", 0.055 + rawDepth * 0.025);
    if (navigator.vibrate) navigator.vibrate(20);
  };

  const cancelCharge = (event: PointerEvent<HTMLCanvasElement>) => {
    const runtime = runtimeRef.current;
    runtime.charging = false;
    runtime.charge = 0;
    if (!runtime.locked) runtime.state = "READY";
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const toggleSound = () => {
    const next = !soundRef.current;
    soundRef.current = next;
    setSoundOn(next);
    if (next) playTone(520, 0.08, "sine", 0.035);
  };

  const handleDownload = () => emitPlayableEvent("CLICK_CTA", { result: endState });

  return (
    <main className="stage-wrap">
      <section className="game-shell" aria-label="Castle Knockout color-match playable demo">
        <div className="scene-light" aria-hidden="true" />
        <header className="hud hud-top">
          <div className="level-badge" aria-label="Level 12">
            <span>LEVEL</span>
            <strong>12</strong>
          </div>
          <div className="objective-card" aria-live="polite">
            <div className="objective-title"><span>♛</span><strong>CLEAR THE CASTLE</strong><b>{clearedTargets}/{TARGET_COUNT}</b></div>
            <div className="core-progress" aria-label={`${clearedTargets} of ${TARGET_COUNT} color cores cleared`}>
              {SHOT_SEQUENCE.map((spec, index) => <i key={spec.clusterId} className={`core-dot ${spec.color} ${index < clearedTargets ? "cleared" : index === clearedTargets ? "current" : ""}`} />)}
            </div>
          </div>
          <div className="hud-actions">
            <button className="round-button" type="button" onClick={toggleSound} aria-label={soundOn ? "Mute sound" : "Turn sound on"}>{soundOn ? "♪" : "×"}</button>
            <button className="round-button restart-icon" type="button" onClick={resetGame} aria-label="Restart level">↻</button>
          </div>
        </header>

        <canvas
          ref={canvasRef}
          width={WORLD_W}
          height={WORLD_H}
          className="game-canvas"
          onPointerDown={beginCharge}
          onPointerUp={releaseCharge}
          onPointerCancel={cancelCharge}
          aria-label="Press and hold to move the landing point along the Z axis, then release to fire the matching color"
        />

        {tutorial && (
          <div className="tutorial" role="status">
            <span className="gesture-hand">☝</span>
            <strong>HOLD FOR DEPTH</strong>
            <small>Release on the glowing {currentSpec.color.toUpperCase()} blocks</small>
          </div>
        )}
        {impactLabel && <div className="impact-label" aria-live="polite">{impactLabel}</div>}

        <footer className="hud ammo-hud" aria-label={`${shots} shots remaining, current color ${currentSpec.color}`}>
          <div className={`ammo-orb ${currentSpec.color}`}><span>♛</span></div>
          <div className="ammo-copy">
            <small>CURRENT · {currentSpec.label}</small>
            <strong>{currentSpec.color.toUpperCase()} SHOT</strong>
            <div className="shots-mini"><span>SHOTS</span>{Array.from({ length: SHOT_COUNT }, (_, index) => <i key={index} className={index < shots ? "active" : ""} />)}</div>
          </div>
          <div className="next-ammo"><small>NEXT</small><div>{nextShots.map((color, index) => <i key={`${color}-${index}`} className={`mini-orb ${color}`} />)}</div></div>
        </footer>

        {endState && (
          <div className="end-overlay" role="dialog" aria-modal="true" aria-labelledby="end-title">
            <div className="confetti" aria-hidden="true">
              {Array.from({ length: 22 }, (_, index) => <i key={index} style={{ "--i": index } as React.CSSProperties} />)}
            </div>
            <div className="end-card">
              <div className="end-crown" aria-hidden="true">♛</div>
              <p className="eyebrow">COLOR CORES {endState === "victory" ? "DESTROYED" : "DAMAGED"}</p>
              <h1 id="end-title">{endState === "victory" ? "CASTLE CLEARED!" : "SO CLOSE!"}</h1>
              <p>{endState === "victory" ? "Perfect depth. Every matching core chained into one royal collapse." : "The wall is cracked. Continue with more colors, castles, and physics puzzles."}</p>
              <div className="reward-row"><span>♛</span><strong>{endState === "victory" ? "+500" : `+${clearedTargets * 80}`}</strong><small>ROYAL COINS</small></div>
              <a className="download-button" href={DOWNLOAD_URL} target="_blank" rel="noreferrer" onClick={handleDownload}><span>DOWNLOAD</span><small>CONTINUE ON TAPTAP</small></a>
              <button className="try-again" type="button" onClick={resetGame}>↻ PLAY AGAIN</button>
            </div>
          </div>
        )}
      </section>
      <p className="desktop-caption">CASTLE KNOCKOUT · COLOR-CHAIN Z-DEPTH H5</p>
    </main>
  );
}
