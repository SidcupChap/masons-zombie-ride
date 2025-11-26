// src/components/DriveMode.tsx
import React, { useEffect, useRef, useState } from "react";

type DriveModeProps = {
  rideName: string;
  carImageUrl: string;
  onExit: () => void;
};

export const DriveMode: React.FC<DriveModeProps> = ({
  rideName,
  carImageUrl,
  onExit,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // HUD state
  const [speed, setSpeed] = useState(0);
  const [health, setHealth] = useState(100);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [runId, setRunId] = useState(0); // restart token

  const engineAudioRef = useRef<HTMLAudioElement | null>(null);
  const zombieAudioRef = useRef<HTMLAudioElement | null>(null);
  const carImgRef = useRef<HTMLImageElement | null>(null);

  // preload car image whenever it changes
  useEffect(() => {
    if (!carImageUrl) {
      carImgRef.current = null;
      return;
    }
    const img = new Image();
    img.src = carImageUrl;
    carImgRef.current = img;
  }, [carImageUrl]);

  // fake stats from ride name (affects max speed)
  const baseMaxSpeed = 220;
  const nameHash = [...(rideName || "Mason")]
    .map((c) => c.charCodeAt(0))
    .reduce((a, b) => a + b, 0);
  const speedMult = 0.9 + (nameHash % 30) / 100; // 0.9–1.2
  const tunedMaxSpeed = baseMaxSpeed * speedMult;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = canvas.clientWidth || 320;
    let height = canvas.clientHeight || 480;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      width = canvas.clientWidth || 320;
      height = canvas.clientHeight || 480;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    // --- Audio setup ---
    const engineAudio = new Audio("/engine.mp3");
    engineAudio.loop = true;
    engineAudio.volume = 0.4;
    engineAudioRef.current = engineAudio;

    const zombieAudio = new Audio("/zombie.mp3");
    zombieAudio.volume = 0.6;
    zombieAudioRef.current = zombieAudio;

    // ---- GAME STATE ----
    let speedVal = 0;
    const maxSpeed = tunedMaxSpeed;
    const accel = 180;

    // OutRun road geometry (shared between update + render)
    const horizonY = height * 0.38;
    const roadTopY = horizonY;
    const roadBottomY = height;
    const roadCenterX = width / 2;
    const roadTopWidth = width * 0.2;
    const roadBottomWidth = width * 0.95;

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    // Car setup – size and position around bottom of road
    const carWidth = width * 0.12;
    const carHeight = carWidth * 1.4;
    const carY = height * 0.7;
    let carX = roadCenterX - carWidth / 2;

    // Zombies live in "lane space" [-1, 1] and a screen Y
    type Zombie = { lane: number; y: number; size: number; speed: number };
    let zombies: Zombie[] = [];
    let spawnTimer = 0;
    let spawnInterval = 1.0; // seconds (will decrease slightly)

    // Stripe phase 0–1
    let laneStripeOffset = 0;

    let healthVal = 100;
    let scoreVal = 0;
    let gameRunning = true;

    const keys: Record<string, boolean> = {};
    let touchLeft = false;
    let touchRight = false;

    // INPUT
    const handleKeyDown = (e: KeyboardEvent) => {
      keys[e.key] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keys[e.key] = false;
    };

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      const rect = canvas.getBoundingClientRect();
      const mid = rect.left + rect.width / 2;
      if (t.clientX < mid) touchLeft = true;
      else touchRight = true;
    };
    const handleTouchEnd = () => {
      touchLeft = false;
      touchRight = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd);

    const clamp = (v: number, min: number, max: number) =>
      Math.max(min, Math.min(max, v));

    // Convert a (lane, y) zombie position to screen X
    const zombieScreenX = (lane: number, y: number, size: number) => {
      const t = clamp((y - roadTopY) / (roadBottomY - roadTopY), 0, 1);
      const halfW = lerp(roadTopWidth / 2, roadBottomWidth / 2, t);
      const leftEdge = roadCenterX - halfW;
      const rightEdge = roadCenterX + halfW;
      const laneNorm = (lane + 1) / 2; // -1..1 -> 0..1
      return leftEdge + laneNorm * (rightEdge - leftEdge) - size / 2;
    };

    const spawnZombie = () => {
      const lane = -0.8 + Math.random() * 1.6; // mostly within road
      const size = 30 + Math.random() * 25;
      const y = roadTopY - size - 20; // just above horizon
      zombies.push({
        lane,
        y,
        size,
        speed: 90 + Math.random() * 80,
      });

      if (zombieAudioRef.current) {
        zombieAudioRef.current.currentTime = 0;
        zombieAudioRef.current.play().catch(() => {});
      }
    };

    // COLLISION (AABB) – uses screen-space X/Y for zombie
    const rectanglesOverlap = (
      x1: number,
      y1: number,
      w1: number,
      h1: number,
      x2: number,
      y2: number,
      w2: number,
      h2: number
    ) => {
      return !(
        x1 + w1 < x2 ||
        x2 + w2 < x1 ||
        y1 + h1 < y2 ||
        y2 + h2 < y1
      );
    };

    let lastTime = performance.now();

    const update = (dt: number) => {
      if (!gameRunning) return;

      // accelerate up to max
      speedVal = clamp(speedVal + accel * dt, 0, maxSpeed);

      // engine audio
      if (engineAudioRef.current) {
        if (speedVal > 5) {
          if (engineAudioRef.current.paused) {
            engineAudioRef.current.play().catch(() => {});
          }
          engineAudioRef.current.playbackRate =
            0.9 + (speedVal / maxSpeed) * 0.4;
        } else {
          engineAudioRef.current.pause();
        }
      }

      // steering
      const steering = (speedVal / maxSpeed) * 260; // px/sec at full speed
      if (keys["ArrowLeft"] || keys["a"] || touchLeft) {
        carX -= steering * dt;
      }
      if (keys["ArrowRight"] || keys["d"] || touchRight) {
        carX += steering * dt;
      }

      // clamp car within road at carY using perspective
      const tCar = clamp((carY - roadTopY) / (roadBottomY - roadTopY), 0, 1);
      const halfWCar = lerp(roadTopWidth / 2, roadBottomWidth / 2, tCar);
      const leftEdgeCar = roadCenterX - halfWCar;
      const rightEdgeCar = roadCenterX + halfWCar;
      carX = clamp(
        carX,
        leftEdgeCar + 10,
        rightEdgeCar - carWidth - 10
      );

      // lane stripes scroll (0–1 range for perspective stripes)
      laneStripeOffset =
        (laneStripeOffset + dt * (speedVal / maxSpeed) * 1.4) % 1;

      // spawn zombies
      spawnTimer += dt;
      if (spawnTimer >= spawnInterval) {
        spawnZombie();
        spawnTimer = 0;
        spawnInterval = clamp(spawnInterval - 0.02, 0.45, 2.0);
      }

      // move zombies & collisions
      zombies = zombies.filter((z) => {
        z.y += z.speed * dt + (speedVal / maxSpeed) * 80 * dt;

        const zx = zombieScreenX(z.lane, z.y, z.size);
        const zy = z.y;

        const carHit = rectanglesOverlap(
          carX,
          carY,
          carWidth,
          carHeight,
          zx,
          zy,
          z.size,
          z.size
        );

        if (carHit) {
          healthVal -= 25;
          if (healthVal <= 0) {
            healthVal = 0;
            gameRunning = false;
            setGameOver(true);
            if (engineAudioRef.current) engineAudioRef.current.pause();
          }
          return false; // remove zombie on hit
        }

        // scored if dodged
        if (z.y > height + z.size) {
          scoreVal += 25;
          return false;
        }

        return true;
      });

      // passive score gain from speed
      scoreVal += (dt * speedVal) / 12;

      // push to HUD
      setSpeed(Math.round(speedVal));
      setHealth(healthVal);
      setScore(Math.round(scoreVal));
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // --- BACKGROUND ---
      ctx.fillStyle = "#020617";
      ctx.fillRect(0, 0, width, height);

      // Sky
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
      skyGrad.addColorStop(0, "#6ec5ff");
      skyGrad.addColorStop(1, "#1f2933");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, horizonY);

      // Ground
      const groundGrad = ctx.createLinearGradient(0, horizonY, 0, height);
      groundGrad.addColorStop(0, "#020617");
      groundGrad.addColorStop(1, "#020617");
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, horizonY, width, height - horizonY);

      // --- OUTRUN-STYLE ROAD GEOMETRY ---
      // Road body (big trapezoid)
      ctx.fillStyle = "#111827";
      ctx.beginPath();
      ctx.moveTo(roadCenterX - roadTopWidth / 2, roadTopY);
      ctx.lineTo(roadCenterX + roadTopWidth / 2, roadTopY);
      ctx.lineTo(roadCenterX + roadBottomWidth / 2, roadBottomY);
      ctx.lineTo(roadCenterX - roadBottomWidth / 2, roadBottomY);
      ctx.closePath();
      ctx.fill();

      // Road glow edges
      ctx.strokeStyle = "rgba(34,197,94,0.45)";
      ctx.lineWidth = 10;
      ctx.stroke();

      // --- CENTER LANE STRIPES IN PERSPECTIVE ---
      const stripeCount = 18;
      ctx.strokeStyle = "#facc15";

      for (let i = 0; i < stripeCount; i++) {
        const t = (i / stripeCount + laneStripeOffset) % 1;

        const y = lerp(roadTopY, roadBottomY, t);
        const nextY = lerp(roadTopY, roadBottomY, t + 0.04);
        const lineW = lerp(1.5, 7, t);

        ctx.lineWidth = lineW;
        ctx.beginPath();
        ctx.moveTo(roadCenterX, y);
        ctx.lineTo(roadCenterX, nextY);
        ctx.stroke();
      }

      // --- ZOMBIES (scaled by depth, always on road) ---
      zombies.forEach((z) => {
        const depthT = clamp(
          (z.y - roadTopY) / (roadBottomY - roadTopY),
          0,
          1
        );
        const scale = 0.6 + depthT * 0.9;
        const drawSize = z.size * scale;

        const zx = zombieScreenX(z.lane, z.y, drawSize);
        const zy = z.y;

        ctx.save();
        ctx.translate(zx + drawSize / 2, zy + drawSize / 2);
        ctx.shadowColor = "rgba(248, 113, 113, 0.8)";
        ctx.shadowBlur = 18;

        // body
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(-drawSize / 2, -drawSize / 2, drawSize, drawSize * 0.7);

        // head
        ctx.beginPath();
        ctx.fillStyle = "#16a34a";
        ctx.arc(0, -drawSize * 0.3, drawSize * 0.35, 0, Math.PI * 2);
        ctx.fill();

        // eyes
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(
          -drawSize * 0.12,
          -drawSize * 0.34,
          drawSize * 0.07,
          0,
          Math.PI * 2
        );
        ctx.arc(
          drawSize * 0.12,
          -drawSize * 0.34,
          drawSize * 0.07,
          0,
          Math.PI * 2
        );
        ctx.fill();

        ctx.restore();
      });

      // --- CAR (bottom centre of road) ---
      if (carImgRef.current && carImgRef.current.complete) {
        ctx.drawImage(carImgRef.current, carX, carY, carWidth, carHeight);
      } else {
        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(carX, carY, carWidth, carHeight);
      }

      // NOTE: in-canvas dashboard removed – React HUD handles SPD / HP / SC.
    };

    const loop = (time: number) => {
      const dt = Math.min(0.05, (time - lastTime) / 1000);
      lastTime = time;

      update(dt);
      render();

      if (gameRunning) {
        requestAnimationFrame(loop);
      }
    };

    requestAnimationFrame(loop);

    // cleanup
    return () => {
      gameRunning = false;
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchend", handleTouchEnd);
      if (engineAudioRef.current) engineAudioRef.current.pause();
    };
  }, [rideName, carImageUrl, runId, tunedMaxSpeed]);

  const handleRestart = () => {
    setGameOver(false);
    setHealth(100);
    setSpeed(0);
    setScore(0);
    setRunId((id) => id + 1);
  };

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/95 text-slate-50 flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div>
          <p className="text-xs uppercase tracking-wide text-emerald-400">
            Drive Mode
          </p>
          <h1 className="text-lg font-bold truncate max-w-[240px]">
            {rideName || "Zombie Drive"}
          </h1>
        </div>
        <button
          onClick={onExit}
          className="text-xs px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600"
        >
          Back to Garage
        </button>
      </header>

      {/* HUD row */}
      <div className="px-4 py-2 flex items-center justify-between text-xs">
        <div>
          <span className="text-slate-400 mr-1">Speed:</span>
          <span className="font-semibold">{speed} km/h</span>
        </div>
        <div>
          <span className="text-slate-400 mr-1">Health:</span>
          <span className="font-semibold">{health}</span>
        </div>
        <div>
          <span className="text-slate-400 mr-1">Score:</span>
          <span className="font-semibold">{score}</span>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 px-4 pb-4 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          className="w-full h-full max-w-md max-h-[520px] bg-black rounded-2xl border border-slate-800"
        />
      </div>

      {/* Game over overlay */}
      {gameOver && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-center px-4">
          <p className="text-3xl font-mono text-red-400 mb-2">
            ZOMBIES OVERWHELMED!
          </p>
          <p className="text-lg mb-4">Score: {score}</p>
          <div className="flex gap-3">
            <button
              onClick={handleRestart}
              className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold"
            >
              Have another go
            </button>
            <button
              onClick={onExit}
              className="px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs"
            >
              Back to Garage
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
