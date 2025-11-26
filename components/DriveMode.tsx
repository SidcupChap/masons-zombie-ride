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

    const roadWidth = width * 0.6;
    const roadX = (width - roadWidth) / 2;

    const carWidth = roadWidth * 0.18;
    const carHeight = carWidth * 1.4;
    let carX = width / 2 - carWidth / 2;
    const carY = height * 0.65;

    type Zombie = { x: number; y: number; size: number; speed: number };
    let zombies: Zombie[] = [];
    let spawnTimer = 0;
    let spawnInterval = 1.0; // seconds (will decrease slightly)

    let laneStripeOffset = 0; // 0–1 for perspective stripes

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

    const spawnZombie = () => {
      const edgePadding = roadWidth * 0.05;
      const laneMinX = roadX + edgePadding;
      const laneMaxX = roadX + roadWidth - edgePadding;

      const size = 30 + Math.random() * 25;
      const x =
        laneMinX +
        Math.random() * (laneMaxX - laneMinX - size);
      zombies.push({
        x,
        y: -size,
        size,
        speed: 90 + Math.random() * 80,
      });

      if (zombieAudioRef.current) {
        zombieAudioRef.current.currentTime = 0;
        zombieAudioRef.current.play().catch(() => {});
      }
    };

    // COLLISION (AABB)
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
      const carMinX = roadX + roadWidth * 0.05;
      const carMaxX = roadX + roadWidth * 0.95 - carWidth;
      carX = clamp(carX, carMinX, carMaxX);

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

      // move zombies
      zombies = zombies.filter((z) => {
        z.y += z.speed * dt + (speedVal / maxSpeed) * 80 * dt;

        const carHit = rectanglesOverlap(
          carX,
          carY,
          carWidth,
          carHeight,
          z.x,
          z.y,
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
      const horizonY = height * 0.38;
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
      const roadCenterX = width / 2;
      const roadBottomY = height;
      const roadTopY = horizonY;

      const roadBottomWidth = width * 0.95; // wide at camera
      const roadTopWidth = width * 0.2; // narrow at horizon

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
      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

      ctx.strokeStyle = "#facc15";

      for (let i = 0; i < stripeCount; i++) {
        // t: 0 = horizon, 1 = bottom
        const t = (i / stripeCount + laneStripeOffset) % 1;

        const y = lerp(roadTopY, roadBottomY, t);
        const nextY = lerp(roadTopY, roadBottomY, t + 0.04); // stripe length

        // line width grows as it comes towards camera
        const lineW = lerp(1.5, 7, t);

        ctx.lineWidth = lineW;
        ctx.beginPath();
        ctx.moveTo(roadCenterX, y);
        ctx.lineTo(roadCenterX, nextY);
        ctx.stroke();
      }

      // --- ZOMBIES (scaled a bit by depth) ---
      const roadBottomYClamped = roadBottomY;
      zombies.forEach((z) => {
        const depthT = Math.max(
          0,
          Math.min(1, (z.y - roadTopY) / (roadBottomYClamped - roadTopY))
        );
        const scale = 0.6 + depthT * 0.9; // smaller far away, bigger near

        const drawSize = z.size * scale;
        const screenX = z.x;
        const screenY = z.y;

        ctx.save();
        ctx.translate(screenX + drawSize / 2, screenY + drawSize / 2);
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

      // --- CAR (bottom centre) ---
      const carDrawX = carX;
      const carDrawY = carY;

      if (carImgRef.current && carImgRef.current.complete) {
        ctx.drawImage(carImgRef.current, carDrawX, carDrawY, carWidth, carHeight);
      } else {
        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(carDrawX, carDrawY, carWidth, carHeight);
      }

      // --- DASHBOARD HUD ---
      const dashW = width * 0.8;
      const dashH = height * 0.16;
      const dashX = (width - dashW) / 2;
      const dashY = height - dashH - 10;

      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(dashX, dashY, dashW, dashH);
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.strokeRect(dashX, dashY, dashW, dashH);

      // speedometer arc
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(
        width / 2,
        dashY + dashH * 0.7,
        54,
        Math.PI * 0.75,
        Math.PI * 0.75 + (speedVal / maxSpeed) * Math.PI * 1.4
      );
      ctx.stroke();

      ctx.fillStyle = "#bbf7d0";
      ctx.font = "14px monospace";
      ctx.fillText(`SPD ${Math.round(speedVal)} km/h`, dashX + 18, dashY + 26);
      ctx.fillText(`HP  ${healthVal}`, dashX + 18, dashY + 48);
      ctx.fillText(`SC  ${Math.round(scoreVal)}`, dashX + 18, dashY + 70);
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
