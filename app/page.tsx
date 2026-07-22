"use client";

import { PointerEvent, useCallback, useEffect, useRef, useState } from "react";

const WORLD_W = 430;
const WORLD_H = 760;
const SHOT_COUNT = 7;
const VANISH_X = 215;
const VANISH_Y = 248;
const DOWNLOAD_URL = "https://www.taptap.cn/moment/791302421241397589";

type BrickKind = "stone" | "blue" | "red" | "gold";

type Brick = {
  id: number;
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
  kind: BrickKind;
  attached: boolean;
  cleared: boolean;
  crack: number;
  flash: number;
};

type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  age: number;
  trail: { x: number; y: number; life: number }[];
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
};

type Runtime = {
  bricks: Brick[];
  initialBricks: number;
  ball: Ball | null;
  particles: Particle[];
  shockwaves: Shockwave[];
  craters: { x: number; y: number; radius: number; alpha: number }[];
  aiming: boolean;
  aimX: number;
  aimY: number;
  shots: number;
  shotCooldown: number;
  shake: number;
  punch: number;
  impactCount: number;
  victoryTimer: number;
  outTimer: number;
  locked: boolean;
};

const colors: Record<BrickKind, { light: string; face: string; edge: string; deep: string }> = {
  stone: { light: "#e4e8ee", face: "#9ca6b8", edge: "#667086", deep: "#434c62" },
  blue: { light: "#9be0ff", face: "#3489df", edge: "#1d56a9", deep: "#143a77" },
  red: { light: "#ff9a76", face: "#e94b3e", edge: "#a92c32", deep: "#701e2b" },
  gold: { light: "#fff19c", face: "#ffc53d", edge: "#c27416", deep: "#81400e" },
};

function createCastle() {
  const bricks: Brick[] = [];
  let id = 0;
  const add = (x: number, y: number, w: number, h: number, kind: BrickKind, crack = 0) => {
    bricks.push({
      id: id++, x, y, z: 0, w, h,
      vx: 0, vy: 0, vz: 0,
      rx: 0, ry: 0, rz: 0,
      vrx: 0, vry: 0, vrz: 0,
      kind, attached: true, cleared: false, crack, flash: 0,
    });
  };

  const addTower = (centerX: number, rows: number, mirror = false) => {
    for (let row = 0; row < rows; row += 1) {
      const offset = row % 2 === 0 ? 0 : 2;
      for (let col = 0; col < 3; col += 1) {
        const x = centerX + (col - 1) * 29 + offset;
        const y = 515 - row * 21;
        let kind: BrickKind = "stone";
        if (row === 5 && col === (mirror ? 0 : 2)) kind = "red";
        if (row === 8 && col === 1) kind = "blue";
        add(x, y, 27, 19, kind, (row + col) % 7 === 0 ? 1 : 0);
      }
    }
    for (const col of [-1, 1]) add(centerX + col * 29, 294, 27, 25, "stone");
    add(centerX, 305, 27, 19, "gold");
  };

  for (let row = 0; row < 13; row += 1) {
    const offset = row % 2 === 0 ? 0 : 2;
    for (let col = 0; col < 6; col += 1) {
      if (row < 3 && (col === 2 || col === 3)) continue;
      const x = 127 + col * 35 + offset;
      const y = 515 - row * 21;
      let kind: BrickKind = "stone";
      if (row === 4 && (col === 2 || col === 3)) kind = "red";
      if (row === 8 && (col === 0 || col === 5)) kind = "blue";
      if (row === 10 && (col === 2 || col === 3)) kind = "gold";
      add(x, y, 33, 19, kind, (row * 3 + col) % 11 === 0 ? 1 : 0);
    }
  }

  addTower(69, 10);
  addTower(361, 10, true);

  for (const col of [0, 2, 3, 5]) add(127 + col * 35, 248, 33, 26, col === 2 || col === 3 ? "gold" : "stone");
  add(215, 221, 54, 28, "gold");
  return bricks;
}

function createRuntime(): Runtime {
  const bricks = createCastle();
  return {
    bricks,
    initialBricks: bricks.length,
    ball: null,
    particles: [],
    shockwaves: [],
    craters: [],
    aiming: false,
    aimX: 215,
    aimY: 360,
    shots: SHOT_COUNT,
    shotCooldown: 0,
    shake: 0,
    punch: 0,
    impactCount: 0,
    victoryTimer: 0,
    outTimer: 0,
    locked: false,
  };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
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

function project(brick: Brick) {
  const scale = 500 / (500 + brick.z);
  return {
    x: VANISH_X + (brick.x - VANISH_X) * scale,
    y: VANISH_Y + (brick.y - VANISH_Y) * scale,
    scale,
  };
}

function drawBrick(ctx: CanvasRenderingContext2D, brick: Brick) {
  const palette = colors[brick.kind];
  const p = project(brick);
  const flipX = 0.88 + Math.abs(Math.cos(brick.ry)) * 0.12;
  const flipY = 0.84 + Math.abs(Math.cos(brick.rx)) * 0.16;
  const depth = 5 + Math.abs(Math.sin(brick.ry)) * 9;
  const opacity = Math.max(0.18, 1 - brick.z / 930);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(p.x, p.y);
  ctx.rotate(brick.rz);
  ctx.scale(p.scale * flipX, p.scale * flipY);

  ctx.shadowColor = brick.attached ? "rgba(32, 39, 58, .28)" : "rgba(20, 35, 70, .5)";
  ctx.shadowBlur = brick.attached ? 3 : 9;
  ctx.shadowOffsetY = brick.attached ? 2 : 7;

  ctx.fillStyle = palette.deep;
  ctx.beginPath();
  ctx.moveTo(brick.w / 2, -brick.h / 2);
  ctx.lineTo(brick.w / 2 + depth, -brick.h / 2 - depth * 0.55);
  ctx.lineTo(brick.w / 2 + depth, brick.h / 2 - depth * 0.55);
  ctx.lineTo(brick.w / 2, brick.h / 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = palette.light;
  ctx.beginPath();
  ctx.moveTo(-brick.w / 2, -brick.h / 2);
  ctx.lineTo(-brick.w / 2 + depth, -brick.h / 2 - depth * 0.55);
  ctx.lineTo(brick.w / 2 + depth, -brick.h / 2 - depth * 0.55);
  ctx.lineTo(brick.w / 2, -brick.h / 2);
  ctx.closePath();
  ctx.fill();

  roundedRect(ctx, -brick.w / 2, -brick.h / 2, brick.w, brick.h, 4);
  const gradient = ctx.createLinearGradient(-brick.w / 2, -brick.h / 2, brick.w / 2, brick.h / 2);
  gradient.addColorStop(0, brick.flash > 0 ? "#fffce0" : palette.light);
  gradient.addColorStop(0.32, palette.face);
  gradient.addColorStop(1, palette.edge);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 1.7;
  ctx.strokeStyle = palette.deep;
  ctx.stroke();

  ctx.globalAlpha = opacity * 0.62;
  ctx.fillStyle = "#fff";
  roundedRect(ctx, -brick.w / 2 + 3, -brick.h / 2 + 3, brick.w * 0.44, 3, 2);
  ctx.fill();
  ctx.globalAlpha = opacity;

  if (brick.crack > 0) {
    ctx.strokeStyle = "rgba(48, 48, 59, .62)";
    ctx.lineWidth = 1.2 + brick.crack * 0.35;
    ctx.beginPath();
    ctx.moveTo(-2, -brick.h / 2 + 1);
    ctx.lineTo(2, -2);
    ctx.lineTo(-4, 3);
    ctx.lineTo(3, brick.h / 2 - 1);
    ctx.stroke();
  }
  if (brick.kind === "gold" && brick.w > 45) drawCrown(ctx, 0.55);
  ctx.restore();
}

function drawCastleBacking(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.shadowColor = "rgba(24, 33, 57, .42)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#4d5870";
  roundedRect(ctx, 110, 258, 210, 284, 10);
  ctx.fill();
  roundedRect(ctx, 24, 304, 92, 238, 12);
  ctx.fill();
  roundedRect(ctx, 314, 304, 92, 238, 12);
  ctx.fill();
  ctx.shadowColor = "transparent";

  const door = ctx.createRadialGradient(215, 506, 5, 215, 506, 43);
  door.addColorStop(0, "#14243d");
  door.addColorStop(1, "#26344e");
  ctx.fillStyle = door;
  ctx.beginPath();
  ctx.arc(215, 497, 35, Math.PI, 0);
  ctx.lineTo(250, 541);
  ctx.lineTo(180, 541);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(22, 38, 65, .9)";
  for (const x of [69, 361]) {
    ctx.beginPath();
    ctx.arc(x, 395, 13, Math.PI, 0);
    ctx.lineTo(x + 13, 426);
    ctx.lineTo(x - 13, 426);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawBase(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.shadowColor = "rgba(38, 35, 42, .45)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 8;
  roundedRect(ctx, 14, 536, 402, 30, 10);
  const base = ctx.createLinearGradient(0, 536, 0, 566);
  base.addColorStop(0, "#e3e7ef");
  base.addColorStop(0.3, "#919bad");
  base.addColorStop(1, "#525b70");
  ctx.fillStyle = base;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#454d60";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, glow = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = glow ? "rgba(255, 225, 80, .95)" : "rgba(15, 34, 80, .55)";
  ctx.shadowBlur = glow ? 22 : 10;
  ctx.shadowOffsetY = glow ? 0 : 6;
  const gradient = ctx.createRadialGradient(-radius * 0.38, -radius * 0.42, 1, 0, 0, radius);
  gradient.addColorStop(0, "#e8fbff");
  gradient.addColorStop(0.18, "#68c7ff");
  gradient.addColorStop(0.62, "#1768cc");
  gradient.addColorStop(1, "#092f75");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#ffd64f";
  ctx.lineWidth = Math.max(2, radius * 0.13);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.7, -1, 1.85);
  ctx.stroke();
  drawCrown(ctx, radius / 48);
  ctx.restore();
}

function spawnParticles(runtime: Runtime, x: number, y: number, amount: number) {
  const palette = ["#fff19a", "#ffbf32", "#f15743", "#58b8ff", "#d8dde7", "#ffffff"];
  for (let i = 0; i < amount; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2.5 + Math.random() * 8;
    runtime.particles.push({
      x,
      y,
      z: 0,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      vz: 2 + Math.random() * 8,
      life: 0.65 + Math.random() * 0.9,
      size: 1.5 + Math.random() * 5.5,
      color: palette[Math.floor(Math.random() * palette.length)],
      spark: i % 3 === 0,
    });
  }
}

function detachBrick(brick: Brick, hitX: number, hitY: number, strength: number, finalBurst = false) {
  const dx = brick.x - hitX;
  const dy = brick.y - hitY;
  const length = Math.max(8, Math.hypot(dx, dy));
  brick.attached = false;
  brick.flash = 0.28;
  brick.crack = 2;
  brick.vx = (dx / length) * (2.5 + strength * 4.8) + (Math.random() - 0.5) * 2.8;
  brick.vy = (dy / length) * (2 + strength * 4) - 2.8 - Math.random() * 4.5;
  brick.vz = (finalBurst ? 5 : 8) + strength * 9 + Math.random() * 8;
  brick.vrx = (Math.random() - 0.5) * 0.2;
  brick.vry = (Math.random() - 0.5) * 0.25;
  brick.vrz = (Math.random() - 0.5) * 0.16;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<Runtime>(createRuntime());
  const soundRef = useRef(true);
  const audioRef = useRef<AudioContext | null>(null);
  const bannerTimerRef = useRef<number | null>(null);
  const [shots, setShots] = useState(SHOT_COUNT);
  const [damage, setDamage] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [tutorial, setTutorial] = useState(true);
  const [impactLabel, setImpactLabel] = useState("");
  const [endState, setEndState] = useState<null | "victory" | "out">(null);

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
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.45), audio.currentTime + duration);
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
    bannerTimerRef.current = window.setTimeout(() => setImpactLabel(""), 820);
  }, []);

  const resetGame = useCallback(() => {
    runtimeRef.current = createRuntime();
    setShots(SHOT_COUNT);
    setDamage(0);
    setTutorial(false);
    setImpactLabel("");
    setEndState(null);
  }, []);

  const blastAt = useCallback((hitX: number, hitY: number) => {
    const runtime = runtimeRef.current;
    const candidates = runtime.bricks
      .filter((brick) => brick.attached && !brick.cleared)
      .map((brick) => ({ brick, distance: Math.hypot(brick.x - hitX, brick.y - hitY) }))
      .sort((a, b) => a.distance - b.distance);
    if (!candidates.length) return;

    runtime.impactCount += 1;
    const take = Math.min(candidates.length, 19 + (runtime.impactCount % 3) * 2);
    const selected = candidates.slice(0, take);
    const furthest = Math.max(70, selected[selected.length - 1]?.distance ?? 70);
    for (const { brick, distance } of selected) {
      detachBrick(brick, hitX, hitY, Math.max(0.2, 1 - distance / (furthest + 18)));
    }
    for (const { brick, distance } of candidates.slice(take)) {
      if (distance < furthest + 58) {
        brick.crack = Math.min(2, brick.crack + 1);
        brick.flash = 0.12;
      }
    }

    runtime.craters.push({ x: hitX, y: hitY, radius: 38 + take * 0.55, alpha: 0.55 });
    runtime.shockwaves.push({ x: hitX, y: hitY, radius: 8, life: 1 });
    runtime.shake = 15;
    runtime.punch = 1;
    runtime.ball = null;
    runtime.shotCooldown = 0.48;
    spawnParticles(runtime, hitX, hitY, 62 + take);

    const attached = runtime.bricks.filter((brick) => brick.attached).length;
    const nextDamage = Math.min(100, Math.round((1 - attached / runtime.initialBricks) * 100));
    setDamage(nextDamage);
    showImpact(runtime.impactCount % 3 === 0 ? `ROYAL SMASH  +${take}` : `BRICKSTORM  +${take}`);
    playTone(86, 0.28, "sawtooth", 0.09);
    window.setTimeout(() => playTone(54, 0.22, "square", 0.045), 45);
    if (navigator.vibrate) navigator.vibrate([28, 24, 55]);

    if (attached <= 18 && runtime.victoryTimer <= 0) {
      for (const brick of runtime.bricks.filter((item) => item.attached)) {
        detachBrick(brick, 215, 395, 0.75 + Math.random() * 0.25, true);
      }
      runtime.locked = true;
      runtime.victoryTimer = 1.45;
      runtime.shake = 22;
      spawnParticles(runtime, 215, 380, 120);
      setDamage(100);
      showImpact("TOTAL BREACH!");
    } else if (runtime.shots === 0) {
      runtime.outTimer = 1.8;
    }
  }, [playTone, showImpact]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let previous = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(2, Math.max(0.45, (now - previous) / 16.667));
      previous = now;
      const runtime = runtimeRef.current;
      runtime.shotCooldown = Math.max(0, runtime.shotCooldown - 0.0167 * dt);
      runtime.shake *= Math.pow(0.79, dt);
      runtime.punch *= Math.pow(0.77, dt);

      for (const brick of runtime.bricks) {
        brick.flash = Math.max(0, brick.flash - 0.025 * dt);
        if (brick.attached || brick.cleared) continue;
        brick.x += brick.vx * dt;
        brick.y += brick.vy * dt;
        brick.z += brick.vz * dt;
        brick.vy += 0.18 * dt;
        brick.vx *= Math.pow(0.993, dt);
        brick.vz *= Math.pow(0.987, dt);
        brick.rx += brick.vrx * dt;
        brick.ry += brick.vry * dt;
        brick.rz += brick.vrz * dt;
        brick.vrx *= 0.996;
        brick.vry *= 0.996;
        brick.vrz *= 0.997;
        if (brick.z > 800 || brick.y > 930) brick.cleared = true;
      }

      if (runtime.ball) {
        const ball = runtime.ball;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        ball.age += 0.0167 * dt;
        ball.trail.unshift({ x: ball.x, y: ball.y, life: 1 });
        if (ball.trail.length > 12) ball.trail.pop();
        ball.trail.forEach((point) => { point.life -= 0.11 * dt; });

        const hit = runtime.bricks
          .filter((brick) => brick.attached)
          .find((brick) => Math.abs(ball.x - brick.x) < brick.w / 2 + ball.radius && Math.abs(ball.y - brick.y) < brick.h / 2 + ball.radius);
        if (hit) blastAt(hit.x, hit.y);
        else if (ball.y < 160 || ball.x < -40 || ball.x > WORLD_W + 40 || ball.age > 4.5) {
          runtime.ball = null;
          runtime.shotCooldown = 0.28;
          if (runtime.shots === 0) runtime.outTimer = 1.5;
        }
      }

      for (const particle of runtime.particles) {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.z += particle.vz * dt;
        particle.vy += 0.12 * dt;
        particle.vz *= Math.pow(0.98, dt);
        particle.life -= 0.027 * dt;
      }
      runtime.particles = runtime.particles.filter((particle) => particle.life > 0);
      for (const wave of runtime.shockwaves) {
        wave.radius += 9.5 * dt;
        wave.life -= 0.055 * dt;
      }
      runtime.shockwaves = runtime.shockwaves.filter((wave) => wave.life > 0);

      if (runtime.victoryTimer > 0) {
        runtime.victoryTimer -= 0.0167 * dt;
        if (runtime.victoryTimer <= 0) {
          setEndState("victory");
          playTone(523, 0.24, "triangle", 0.06);
          window.setTimeout(() => playTone(659, 0.3, "triangle", 0.055), 120);
          window.setTimeout(() => playTone(784, 0.42, "triangle", 0.05), 250);
        }
      }
      if (runtime.outTimer > 0 && runtime.victoryTimer <= 0) {
        runtime.outTimer -= 0.0167 * dt;
        if (runtime.outTimer <= 0 && !runtime.locked) {
          runtime.locked = true;
          setEndState("out");
        }
      }

      ctx.clearRect(0, 0, WORLD_W, WORLD_H);
      const shakeX = (Math.random() - 0.5) * runtime.shake;
      const shakeY = (Math.random() - 0.5) * runtime.shake;
      const cameraScale = 1 + runtime.punch * 0.025;
      ctx.save();
      ctx.translate(WORLD_W / 2 + shakeX, WORLD_H / 2 + shakeY);
      ctx.scale(cameraScale, cameraScale);
      ctx.translate(-WORLD_W / 2, -WORLD_H / 2);

      const stageLight = ctx.createRadialGradient(215, 360, 30, 215, 420, 280);
      stageLight.addColorStop(0, "rgba(255, 242, 175, .18)");
      stageLight.addColorStop(1, "rgba(25, 43, 81, .08)");
      ctx.fillStyle = stageLight;
      ctx.fillRect(0, 120, WORLD_W, 520);

      drawBase(ctx);
      drawCastleBacking(ctx);
      for (const crater of runtime.craters) {
        const craterGradient = ctx.createRadialGradient(crater.x, crater.y, 3, crater.x, crater.y, crater.radius);
        craterGradient.addColorStop(0, `rgba(16, 23, 39, ${crater.alpha})`);
        craterGradient.addColorStop(0.55, `rgba(31, 37, 51, ${crater.alpha * 0.7})`);
        craterGradient.addColorStop(1, "rgba(31, 37, 51, 0)");
        ctx.fillStyle = craterGradient;
        ctx.beginPath();
        ctx.arc(crater.x, crater.y, crater.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      const flying = runtime.bricks.filter((brick) => !brick.attached && !brick.cleared).sort((a, b) => b.z - a.z);
      flying.forEach((brick) => drawBrick(ctx, brick));
      runtime.bricks.filter((brick) => brick.attached).forEach((brick) => drawBrick(ctx, brick));

      for (const wave of runtime.shockwaves) {
        ctx.save();
        ctx.globalAlpha = wave.life;
        ctx.strokeStyle = "#fff4ac";
        ctx.lineWidth = 8 * wave.life;
        ctx.shadowColor = "#ffb62f";
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      for (const particle of runtime.particles) {
        const scale = 500 / (500 + particle.z);
        const x = VANISH_X + (particle.x - VANISH_X) * scale;
        const y = VANISH_Y + (particle.y - VANISH_Y) * scale;
        ctx.save();
        ctx.globalAlpha = Math.min(1, particle.life);
        ctx.translate(x, y);
        ctx.fillStyle = particle.color;
        if (particle.spark) {
          ctx.rotate(Math.atan2(particle.vy, particle.vx));
          ctx.fillRect(-particle.size * 2, -particle.size / 2, particle.size * 4, particle.size);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, particle.size * scale, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      if (runtime.aiming && !runtime.ball && runtime.shots > 0 && !runtime.locked) {
        const dx = runtime.aimX - 215;
        const dy = Math.min(-50, runtime.aimY - 686);
        const length = Math.max(1, Math.hypot(dx, dy));
        for (let i = 1; i <= 10; i += 1) {
          const distance = 28 + i * 28;
          ctx.globalAlpha = 0.98 - i * 0.075;
          ctx.fillStyle = i < 6 ? "#fff2a4" : "#fff";
          ctx.beginPath();
          ctx.arc(215 + dx / length * distance, 686 + dy / length * distance, Math.max(2.5, 6.5 - i * 0.36), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      if (runtime.ball) {
        runtime.ball.trail.forEach((point, index) => {
          ctx.globalAlpha = Math.max(0, point.life) * (0.5 - index * 0.025);
          drawBall(ctx, point.x, point.y, Math.max(4, runtime.ball!.radius - index * 0.85));
        });
        ctx.globalAlpha = 1;
        drawBall(ctx, runtime.ball.x, runtime.ball.y, runtime.ball.radius, true);
      } else if (runtime.shots > 0 && !runtime.locked) {
        drawBall(ctx, 215, 686, runtime.aiming ? 22 : 26, runtime.aiming);
      }
      ctx.restore();

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [blastAt, playTone]);

  const canvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width * WORLD_W,
      y: (event.clientY - rect.top) / rect.height * WORLD_H,
    };
  };

  const beginAim = (event: PointerEvent<HTMLCanvasElement>) => {
    const runtime = runtimeRef.current;
    if (runtime.ball || runtime.shotCooldown > 0 || runtime.shots <= 0 || runtime.locked) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = canvasPoint(event);
    runtime.aiming = true;
    runtime.aimX = point.x;
    runtime.aimY = Math.min(620, point.y);
    setTutorial(false);
  };

  const moveAim = (event: PointerEvent<HTMLCanvasElement>) => {
    const runtime = runtimeRef.current;
    if (!runtime.aiming) return;
    const point = canvasPoint(event);
    runtime.aimX = point.x;
    runtime.aimY = Math.min(620, point.y);
  };

  const fire = (event: PointerEvent<HTMLCanvasElement>) => {
    const runtime = runtimeRef.current;
    if (!runtime.aiming || runtime.ball || runtime.shotCooldown > 0 || runtime.shots <= 0 || runtime.locked) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const dx = runtime.aimX - 215;
    const dy = Math.min(-62, runtime.aimY - 686);
    const length = Math.max(1, Math.hypot(dx, dy));
    runtime.ball = { x: 215, y: 686, vx: dx / length * 16.2, vy: dy / length * 16.2, radius: 18, age: 0, trail: [] };
    runtime.aiming = false;
    runtime.shots -= 1;
    setShots(runtime.shots);
    playTone(135, 0.13, "sawtooth", 0.065);
    if (navigator.vibrate) navigator.vibrate(24);
  };

  const toggleSound = () => {
    const next = !soundRef.current;
    soundRef.current = next;
    setSoundOn(next);
    if (next) playTone(520, 0.08, "sine", 0.035);
  };

  return (
    <main className="stage-wrap">
      <section className="game-shell" aria-label="Castle Knockout playable demo">
        <div className="scene-light" aria-hidden="true" />
        <header className="hud hud-top">
          <div className="level-badge" aria-label="Level 12">
            <span>LEVEL</span>
            <strong>12</strong>
          </div>
          <div className="mission-card damage-card" aria-live="polite">
            <div className="damage-title"><span>♛</span><small>CASTLE DAMAGE</small><strong>{damage}%</strong></div>
            <div className="damage-track"><i style={{ width: `${damage}%` }} /></div>
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
          onPointerDown={beginAim}
          onPointerMove={moveAim}
          onPointerUp={fire}
          onPointerCancel={fire}
          aria-label="Drag to aim at the castle wall, then release to fire"
        />

        {tutorial && (
          <div className="tutorial" role="status">
            <span className="gesture-hand">☝</span>
            <strong>AIM AT THE WALL</strong>
            <small>Release to blast bricks into the distance</small>
          </div>
        )}
        {impactLabel && <div className="impact-label" aria-live="polite">{impactLabel}</div>}

        <footer className="hud shots-hud" aria-label={`${shots} shots remaining`}>
          <span>SHOTS</span>
          <div className="shot-dots">
            {Array.from({ length: SHOT_COUNT }, (_, index) => <i key={index} className={index < shots ? "shot active" : "shot"} aria-hidden="true" />)}
          </div>
          <strong>{shots}</strong>
        </footer>

        {endState && (
          <div className="end-overlay" role="dialog" aria-modal="true" aria-labelledby="end-title">
            <div className="confetti" aria-hidden="true">
              {Array.from({ length: 20 }, (_, index) => <i key={index} style={{ "--i": index } as React.CSSProperties} />)}
            </div>
            <div className="end-card">
              <div className="end-crown" aria-hidden="true">♛</div>
              <p className="eyebrow">CASTLE BREACH COMPLETE</p>
              <h1 id="end-title">{endState === "victory" ? "WALL DESTROYED!" : "THE WALL HOLDS!"}</h1>
              <p>{endState === "victory" ? "The royal cannon sent every last brick flying. A bigger siege awaits in the full adventure." : "Find the weak points and fire again—or continue the siege in the full game."}</p>
              <div className="reward-row"><span>♛</span><strong>{endState === "victory" ? "+500" : "+120"}</strong><small>ROYAL COINS</small></div>
              <a className="download-button" href={DOWNLOAD_URL} target="_blank" rel="noreferrer"><span>DOWNLOAD</span><small>CONTINUE ON TAPTAP</small></a>
              <button className="try-again" type="button" onClick={resetGame}>↻ PLAY AGAIN</button>
            </div>
          </div>
        )}
      </section>
      <p className="desktop-caption">CASTLE KNOCKOUT · DEPTH-BLAST H5 DEMO</p>
    </main>
  );
}
