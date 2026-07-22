"use client";

import { PointerEvent, useCallback, useEffect, useRef, useState } from "react";

const WORLD_W = 430;
const WORLD_H = 760;
const PLATFORM_Y = 522;
const DOWNLOAD_URL = "https://www.taptap.cn/moment/791302421241397589";

type BlockKind = "stone" | "ruby" | "sapphire" | "gold";

type Block = {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  vx: number;
  vy: number;
  va: number;
  kind: BlockKind;
  cleared: boolean;
  hitFlash: number;
};

type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  active: boolean;
  age: number;
  trail: { x: number; y: number; life: number }[];
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
  shape: "spark" | "dust";
};

type GameRuntime = {
  blocks: Block[];
  ball: Ball | null;
  particles: Particle[];
  aiming: boolean;
  aimX: number;
  aimY: number;
  shots: number;
  physicsLive: boolean;
  combo: number;
  lastHitAt: number;
  ended: boolean;
};

const palettes: Record<BlockKind, { face: string; edge: string; light: string }> = {
  stone: { face: "#8b93a5", edge: "#4e566b", light: "#c6ccda" },
  ruby: { face: "#e64b3f", edge: "#8b292c", light: "#ff8b63" },
  sapphire: { face: "#3285df", edge: "#174a9a", light: "#75c4ff" },
  gold: { face: "#ffc43d", edge: "#a96713", light: "#fff18b" },
};

function createLevel(): Block[] {
  return [
    { id: 1, x: 116, y: 478, w: 46, h: 86, angle: 0, vx: 0, vy: 0, va: 0, kind: "sapphire", cleared: false, hitFlash: 0 },
    { id: 2, x: 314, y: 478, w: 46, h: 86, angle: 0, vx: 0, vy: 0, va: 0, kind: "sapphire", cleared: false, hitFlash: 0 },
    { id: 3, x: 215, y: 446, w: 172, h: 32, angle: 0, vx: 0, vy: 0, va: 0, kind: "ruby", cleared: false, hitFlash: 0 },
    { id: 4, x: 165, y: 392, w: 39, h: 78, angle: 0, vx: 0, vy: 0, va: 0, kind: "stone", cleared: false, hitFlash: 0 },
    { id: 5, x: 265, y: 392, w: 39, h: 78, angle: 0, vx: 0, vy: 0, va: 0, kind: "stone", cleared: false, hitFlash: 0 },
    { id: 6, x: 215, y: 344, w: 154, h: 30, angle: 0, vx: 0, vy: 0, va: 0, kind: "ruby", cleared: false, hitFlash: 0 },
    { id: 7, x: 215, y: 293, w: 62, h: 72, angle: 0, vx: 0, vy: 0, va: 0, kind: "gold", cleared: false, hitFlash: 0 },
    { id: 8, x: 139, y: 310, w: 34, h: 58, angle: 0, vx: 0, vy: 0, va: 0, kind: "sapphire", cleared: false, hitFlash: 0 },
    { id: 9, x: 291, y: 310, w: 34, h: 58, angle: 0, vx: 0, vy: 0, va: 0, kind: "sapphire", cleared: false, hitFlash: 0 },
  ];
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function drawCrown(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
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
  ctx.fillStyle = "#ffe358";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#9e5c0d";
  ctx.stroke();
  ctx.fillStyle = "#fff6ad";
  ctx.fillRect(-14, 1, 28, 3);
  ctx.restore();
}

function drawBlock(ctx: CanvasRenderingContext2D, block: Block) {
  const palette = palettes[block.kind];
  ctx.save();
  ctx.translate(block.x, block.y);
  ctx.rotate(block.angle);
  ctx.shadowColor = "rgba(37, 29, 44, .35)";
  ctx.shadowBlur = 9;
  ctx.shadowOffsetY = 7;
  roundedRect(ctx, -block.w / 2, -block.h / 2, block.w, block.h, 7);
  const gradient = ctx.createLinearGradient(-block.w / 2, -block.h / 2, block.w / 2, block.h / 2);
  gradient.addColorStop(0, block.hitFlash > 0 ? "#fff7d5" : palette.light);
  gradient.addColorStop(0.28, palette.face);
  gradient.addColorStop(1, palette.edge);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 3;
  ctx.strokeStyle = palette.edge;
  ctx.stroke();

  ctx.globalAlpha = 0.7;
  ctx.fillStyle = palette.light;
  roundedRect(ctx, -block.w / 2 + 5, -block.h / 2 + 5, block.w - 10, Math.min(7, block.h / 5), 4);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (block.kind === "stone") {
    ctx.strokeStyle = "rgba(63, 72, 92, .42)";
    ctx.lineWidth = 2;
    for (let y = -block.h / 2 + 22; y < block.h / 2; y += 22) {
      ctx.beginPath();
      ctx.moveTo(-block.w / 2 + 3, y);
      ctx.lineTo(block.w / 2 - 3, y);
      ctx.stroke();
    }
  }

  if (block.kind === "gold") {
    drawCrown(ctx, 0, 4, 0.72);
  } else {
    ctx.fillStyle = "rgba(255,255,255,.3)";
    ctx.beginPath();
    ctx.arc(-block.w * 0.18, -block.h * 0.12, Math.max(3, Math.min(block.w, block.h) * 0.09), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlatform(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.shadowColor = "rgba(39, 30, 28, .4)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 8;
  roundedRect(ctx, 54, PLATFORM_Y, 322, 28, 9);
  const gradient = ctx.createLinearGradient(0, PLATFORM_Y, 0, PLATFORM_Y + 28);
  gradient.addColorStop(0, "#eef1f5");
  gradient.addColorStop(0.32, "#aab2c1");
  gradient.addColorStop(1, "#5c6374");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#51586a";
  ctx.stroke();
  ctx.strokeStyle = "rgba(65,72,88,.48)";
  ctx.lineWidth = 2;
  for (let x = 88; x < 370; x += 54) {
    ctx.beginPath();
    ctx.moveTo(x, PLATFORM_Y + 3);
    ctx.lineTo(x, PLATFORM_Y + 25);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, glow = false) {
  ctx.save();
  ctx.translate(x, y);
  if (glow) {
    ctx.shadowColor = "rgba(255, 225, 80, .9)";
    ctx.shadowBlur = 20;
  } else {
    ctx.shadowColor = "rgba(19, 37, 84, .5)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 5;
  }
  const gradient = ctx.createRadialGradient(-radius * 0.34, -radius * 0.4, radius * 0.1, 0, 0, radius);
  gradient.addColorStop(0, "#dff6ff");
  gradient.addColorStop(0.22, "#58b8ff");
  gradient.addColorStop(0.7, "#1764c8");
  gradient.addColorStop(1, "#0b347d");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = Math.max(2, radius * 0.14);
  ctx.strokeStyle = "#f5c740";
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.72, -0.9, 1.9);
  ctx.stroke();
  ctx.restore();
}

function spawnImpact(runtime: GameRuntime, x: number, y: number, color: string, amount = 9) {
  for (let i = 0; i < amount; i += 1) {
    const angle = (Math.PI * 2 * i) / amount + Math.random() * 0.45;
    const speed = 1.5 + Math.random() * 3.5;
    runtime.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      life: 0.7 + Math.random() * 0.45,
      size: 2.5 + Math.random() * 4,
      color,
      shape: i % 3 === 0 ? "spark" : "dust",
    });
  }
}

function resolveBlocks(a: Block, b: Block) {
  if (a.cleared || b.cleared) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const overlapX = (a.w + b.w) / 2 - Math.abs(dx);
  const overlapY = (a.h + b.h) / 2 - Math.abs(dy);
  if (overlapX <= 0 || overlapY <= 0) return;

  if (overlapX < overlapY) {
    const sign = dx >= 0 ? 1 : -1;
    a.x -= sign * overlapX * 0.5;
    b.x += sign * overlapX * 0.5;
    const avg = (a.vx + b.vx) * 0.5;
    a.vx = avg - sign * 0.12;
    b.vx = avg + sign * 0.12;
  } else {
    const sign = dy >= 0 ? 1 : -1;
    a.y -= sign * overlapY * 0.52;
    b.y += sign * overlapY * 0.52;
    const avg = (a.vy + b.vy) * 0.5;
    a.vy = avg - sign * 0.1;
    b.vy = avg + sign * 0.1;
    a.vx *= 0.98;
    b.vx *= 0.98;
  }
}

function hitBallAgainstBlock(ball: Ball, block: Block, runtime: GameRuntime) {
  if (block.cleared) return false;
  const closestX = Math.max(block.x - block.w / 2, Math.min(ball.x, block.x + block.w / 2));
  const closestY = Math.max(block.y - block.h / 2, Math.min(ball.y, block.y + block.h / 2));
  const dx = ball.x - closestX;
  const dy = ball.y - closestY;
  const distSq = dx * dx + dy * dy;
  if (distSq > ball.radius * ball.radius) return false;

  const dist = Math.max(0.01, Math.sqrt(distSq));
  const nx = dist > 0.05 ? dx / dist : ball.x < block.x ? -1 : 1;
  const ny = dist > 0.05 ? dy / dist : -1;
  const dot = ball.vx * nx + ball.vy * ny;
  ball.vx -= 1.65 * dot * nx;
  ball.vy -= 1.65 * dot * ny;
  ball.vx *= 0.78;
  ball.vy *= 0.78;
  ball.x = closestX + nx * (ball.radius + 2);
  ball.y = closestY + ny * (ball.radius + 2);

  block.vx += -nx * 3.1 + ball.vx * 0.15;
  block.vy += -ny * 2.6 + ball.vy * 0.08;
  block.va += (ball.x - block.x) * 0.0017 + (Math.random() - 0.5) * 0.035;
  block.hitFlash = 0.16;
  runtime.combo = performance.now() - runtime.lastHitAt < 650 ? runtime.combo + 1 : 1;
  runtime.lastHitAt = performance.now();
  spawnImpact(runtime, closestX, closestY, palettes[block.kind].light, runtime.combo > 2 ? 14 : 8);
  return true;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const soundRef = useRef(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const runtimeRef = useRef<GameRuntime>({
    blocks: createLevel(),
    ball: null,
    particles: [],
    aiming: false,
    aimX: 215,
    aimY: 350,
    shots: 5,
    physicsLive: false,
    combo: 0,
    lastHitAt: 0,
    ended: false,
  });

  const [shots, setShots] = useState(5);
  const [remaining, setRemaining] = useState(9);
  const [soundOn, setSoundOn] = useState(true);
  const [showTutorial, setShowTutorial] = useState(true);
  const [endState, setEndState] = useState<null | "victory" | "out">(null);
  const [impactLabel, setImpactLabel] = useState("");

  const playTone = useCallback((frequency: number, duration: number, type: OscillatorType = "sine", volume = 0.05) => {
    if (!soundRef.current || typeof window === "undefined") return;
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const audio = audioContextRef.current ?? new AudioCtx();
    audioContextRef.current = audio;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + duration);
  }, []);

  const resetGame = useCallback(() => {
    runtimeRef.current = {
      blocks: createLevel(),
      ball: null,
      particles: [],
      aiming: false,
      aimX: 215,
      aimY: 350,
      shots: 5,
      physicsLive: false,
      combo: 0,
      lastHitAt: 0,
      ended: false,
    };
    setShots(5);
    setRemaining(9);
    setEndState(null);
    setImpactLabel("");
    setShowTutorial(false);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    let lastTime = performance.now();
    let noShotTimer = 0;

    const render = (now: number) => {
      const dt = Math.min(2, Math.max(0.5, (now - lastTime) / 16.667));
      lastTime = now;
      const runtime = runtimeRef.current;

      if (runtime.physicsLive && !runtime.ended) {
        const subSteps = 3;
        for (let step = 0; step < subSteps; step += 1) {
          const tick = dt / subSteps;
          for (const block of runtime.blocks) {
            if (block.cleared) continue;
            block.vy += 0.22 * tick;
            block.x += block.vx * tick;
            block.y += block.vy * tick;
            block.angle += block.va * tick;
            block.vx *= Math.pow(0.995, tick);
            block.va *= Math.pow(0.992, tick);
            block.hitFlash = Math.max(0, block.hitFlash - 0.016 * tick);

            const halfW = Math.abs(Math.cos(block.angle)) * block.w / 2 + Math.abs(Math.sin(block.angle)) * block.h / 2;
            const halfH = Math.abs(Math.sin(block.angle)) * block.w / 2 + Math.abs(Math.cos(block.angle)) * block.h / 2;
            const onPlatform = block.x + halfW > 54 && block.x - halfW < 376;
            if (onPlatform && block.y + halfH > PLATFORM_Y && block.y < PLATFORM_Y + 18 && block.vy > 0) {
              block.y = PLATFORM_Y - halfH;
              block.vy *= -0.18;
              block.vx *= 0.92;
              block.va *= 0.84;
            }
          }

          for (let i = 0; i < runtime.blocks.length; i += 1) {
            for (let j = i + 1; j < runtime.blocks.length; j += 1) {
              resolveBlocks(runtime.blocks[i], runtime.blocks[j]);
            }
          }

          if (runtime.ball?.active) {
            const ball = runtime.ball;
            ball.vy += 0.03 * tick;
            ball.x += ball.vx * tick;
            ball.y += ball.vy * tick;
            ball.age += 0.016 * tick;
            for (const block of runtime.blocks) {
              if (hitBallAgainstBlock(ball, block, runtime)) {
                playTone(180 + runtime.combo * 35, 0.09, "square", 0.035);
                if (navigator.vibrate) navigator.vibrate(runtime.combo > 2 ? 28 : 14);
                if (runtime.combo === 2) setImpactLabel("DOUBLE HIT!");
                if (runtime.combo === 3) setImpactLabel("TRIPLE CRASH!");
                if (runtime.combo >= 4) setImpactLabel(`CASTLE COMBO ×${runtime.combo}`);
              }
            }
            ball.trail.unshift({ x: ball.x, y: ball.y, life: 1 });
            if (ball.trail.length > 9) ball.trail.pop();
            ball.trail.forEach((point) => { point.life -= 0.12 * tick; });
            if (ball.x < -70 || ball.x > WORLD_W + 70 || ball.y < -100 || ball.y > WORLD_H + 80 || ball.age > 7) {
              ball.active = false;
              runtime.ball = null;
              noShotTimer = now;
            }
          }
        }

        let changed = false;
        for (const block of runtime.blocks) {
          if (!block.cleared && (block.y > PLATFORM_Y + 95 || block.x < 25 || block.x > WORLD_W - 25)) {
            block.cleared = true;
            spawnImpact(runtime, Math.max(18, Math.min(WORLD_W - 18, block.x)), Math.min(WORLD_H - 50, block.y), "#ffe372", 14);
            changed = true;
          }
        }

        if (changed) {
          const activeCount = runtime.blocks.filter((block) => !block.cleared).length;
          setRemaining(activeCount);
          playTone(480, 0.12, "triangle", 0.045);
          window.setTimeout(() => setImpactLabel(""), 850);
          if (activeCount === 0) {
            runtime.ended = true;
            window.setTimeout(() => {
              setEndState("victory");
              playTone(523, 0.25, "triangle", 0.06);
              window.setTimeout(() => playTone(659, 0.25, "triangle", 0.055), 140);
              window.setTimeout(() => playTone(784, 0.4, "triangle", 0.05), 280);
            }, 800);
          }
        }

        if (!runtime.ball && runtime.shots === 0 && !runtime.ended && noShotTimer && now - noShotTimer > 2200) {
          runtime.ended = true;
          setEndState("out");
        }
      }

      for (const particle of runtime.particles) {
        particle.vy += 0.1 * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.life -= 0.025 * dt;
      }
      runtime.particles = runtime.particles.filter((particle) => particle.life > 0);

      ctx.clearRect(0, 0, WORLD_W, WORLD_H);
      const shade = ctx.createLinearGradient(0, 180, 0, 730);
      shade.addColorStop(0, "rgba(20, 92, 174, 0.02)");
      shade.addColorStop(0.7, "rgba(255, 195, 76, 0.03)");
      shade.addColorStop(1, "rgba(27, 35, 72, 0.22)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);

      drawPlatform(ctx);
      for (const block of runtime.blocks) {
        if (!block.cleared) drawBlock(ctx, block);
      }

      if (runtime.aiming && !runtime.ball && runtime.shots > 0) {
        const shooterX = 215;
        const shooterY = 668;
        const dx = runtime.aimX - shooterX;
        const dy = Math.min(-50, runtime.aimY - shooterY);
        const length = Math.max(1, Math.hypot(dx, dy));
        const nx = dx / length;
        const ny = dy / length;
        for (let i = 1; i <= 8; i += 1) {
          const distance = 30 + i * 27;
          ctx.globalAlpha = 0.95 - i * 0.08;
          ctx.fillStyle = i < 5 ? "#fff7ca" : "#ffffff";
          ctx.beginPath();
          ctx.arc(shooterX + nx * distance, shooterY + ny * distance, Math.max(2.5, 6 - i * 0.35), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      if (runtime.ball?.active) {
        runtime.ball.trail.forEach((point, index) => {
          ctx.globalAlpha = Math.max(0, point.life) * (0.5 - index * 0.035);
          drawBall(ctx, point.x, point.y, Math.max(3, runtime.ball!.radius - index * 1.4));
        });
        ctx.globalAlpha = 1;
        drawBall(ctx, runtime.ball.x, runtime.ball.y, runtime.ball.radius, true);
      } else if (runtime.shots > 0 && !runtime.ended) {
        drawBall(ctx, 215, 668, runtime.aiming ? 21 : 24, runtime.aiming);
      }

      for (const particle of runtime.particles) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, particle.life);
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.vx * 0.3);
        ctx.fillStyle = particle.color;
        if (particle.shape === "spark") {
          ctx.fillRect(-particle.size / 2, -particle.size * 1.6, particle.size, particle.size * 3.2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [playTone]);

  const canvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * WORLD_W,
      y: ((event.clientY - rect.top) / rect.height) * WORLD_H,
    };
  };

  const beginAim = (event: PointerEvent<HTMLCanvasElement>) => {
    const runtime = runtimeRef.current;
    if (runtime.ball || runtime.shots <= 0 || runtime.ended) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = canvasPoint(event);
    runtime.aiming = true;
    runtime.aimX = point.x;
    runtime.aimY = Math.min(point.y, 610);
    setShowTutorial(false);
  };

  const moveAim = (event: PointerEvent<HTMLCanvasElement>) => {
    const runtime = runtimeRef.current;
    if (!runtime.aiming) return;
    const point = canvasPoint(event);
    runtime.aimX = point.x;
    runtime.aimY = Math.min(point.y, 610);
  };

  const fire = (event: PointerEvent<HTMLCanvasElement>) => {
    const runtime = runtimeRef.current;
    if (!runtime.aiming || runtime.ball || runtime.shots <= 0 || runtime.ended) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const shooterX = 215;
    const shooterY = 668;
    const dx = runtime.aimX - shooterX;
    const dy = Math.min(-60, runtime.aimY - shooterY);
    const length = Math.max(1, Math.hypot(dx, dy));
    const speed = 13.5;
    runtime.ball = {
      x: shooterX,
      y: shooterY,
      vx: (dx / length) * speed,
      vy: (dy / length) * speed,
      radius: 17,
      active: true,
      age: 0,
      trail: [],
    };
    runtime.shots -= 1;
    runtime.aiming = false;
    runtime.physicsLive = true;
    runtime.combo = 0;
    setShots(runtime.shots);
    playTone(122, 0.12, "sawtooth", 0.055);
    if (navigator.vibrate) navigator.vibrate(22);
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
          <div className="level-badge" aria-label="Level 7">
            <span>LEVEL</span>
            <strong>7</strong>
          </div>
          <div className="mission-card" aria-live="polite">
            <span className="mission-crown">♛</span>
            <div>
              <small>KNOCK OUT</small>
              <strong>{remaining} BLOCKS</strong>
            </div>
          </div>
          <div className="hud-actions">
            <button className="round-button" type="button" onClick={toggleSound} aria-label={soundOn ? "Mute sound" : "Turn sound on"}>
              {soundOn ? "♪" : "×"}
            </button>
            <button className="round-button restart-icon" type="button" onClick={resetGame} aria-label="Restart level">
              ↻
            </button>
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
          aria-label="Drag upward to aim the royal ball, then release to fire"
        />

        {showTutorial && (
          <div className="tutorial" role="status">
            <span className="gesture-hand">☝</span>
            <strong>DRAG TO AIM</strong>
            <small>Release to fire</small>
          </div>
        )}

        {impactLabel && <div className="impact-label" aria-live="polite">{impactLabel}</div>}

        <footer className="hud shots-hud" aria-label={`${shots} shots remaining`}>
          <span>SHOTS</span>
          <div className="shot-dots">
            {Array.from({ length: 5 }, (_, index) => (
              <i key={index} className={index < shots ? "shot active" : "shot"} aria-hidden="true" />
            ))}
          </div>
          <strong>{shots}</strong>
        </footer>

        {endState && (
          <div className="end-overlay" role="dialog" aria-modal="true" aria-labelledby="end-title">
            <div className="confetti" aria-hidden="true">
              {Array.from({ length: 18 }, (_, index) => <i key={index} style={{ "--i": index } as React.CSSProperties} />)}
            </div>
            <div className="end-card">
              <div className="end-crown" aria-hidden="true">♛</div>
              <p className="eyebrow">CASTLE TRIAL COMPLETE</p>
              <h1 id="end-title">{endState === "victory" ? "ROYAL VICTORY!" : "SO CLOSE, HERO!"}</h1>
              <p>
                {endState === "victory"
                  ? "One perfect shot can bring down a kingdom. The full adventure is waiting."
                  : "Every castle has a weak point. Try again—or continue the siege in the full game."}
              </p>
              <div className="reward-row">
                <span>♛</span>
                <strong>{endState === "victory" ? "+300" : "+80"}</strong>
                <small>ROYAL COINS</small>
              </div>
              <a className="download-button" href={DOWNLOAD_URL} target="_blank" rel="noreferrer">
                <span>DOWNLOAD</span>
                <small>CONTINUE ON TAPTAP</small>
              </a>
              <button className="try-again" type="button" onClick={resetGame}>↻ PLAY AGAIN</button>
            </div>
          </div>
        )}
      </section>
      <p className="desktop-caption">CASTLE KNOCKOUT · PLAYABLE H5 DEMO</p>
    </main>
  );
}
