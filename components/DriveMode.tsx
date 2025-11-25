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

  // --- derive tuning from rideName (fake “stats” for now) ----
  const baseMaxSpeed = 200;
  const baseRoadWidth = 2000;

  const nameHash = [...(rideName || "Mason")]
    .map((c) => c.charCodeAt(0))
    .reduce((a, b) => a + b, 0);

  const speedMult = 0.85 + (nameHash % 30) / 100; // 0.85–1.15
  const widthMult = 0.9 + (nameHash % 20) / 100; // 0.9–1.1

  const tunedMaxSpeed = baseMaxSpeed * speedMult;
  const tunedRoadWidth = baseRoadWidth * widthMult;

  useEffect(() => {
    // make sure overlay is reset each run
    setGameOver(false);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = canvas.clientWidth;
    let height = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
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

    // ---- game state ----
    let position = 0; // distance along road
    let playerX = 0; // lateral offset (-2..2)
    let speedVal = 0;
    let maxSpeed = tunedMaxSpeed;
    let accel = 100;
    let healthVal = 100;
    let scoreVal = 0;
    let gameRunning = true;

    let zombies: { offsetZ: number; x: number }[] = [];
    let lastSpawn = 0;
    let spawnRate = 1.5;

    let lastTime = performance.now();
    let accumulator = 0;
    const fps = 60;
    const step = 1 / fps;

    const keys: Record<number, boolean> = {};
    let touchLeft = false;
    let touchRight = false;

    // Road config
    const roadWidth = tunedRoadWidth;
    const segmentLength = 200;
    const segments: any[] = [];
    const drawDistance = 200;
    const cameraDepth = 1.5; // simple perspective factor

    const Util = {
      // SIMPLE 3D PROJECTION (x, z -> screen x/y/width)
      project(
        p: any,
        camX: number,
        camZ: number,
        w: number,
        h: number,
        roadW: number
      ) {
        p.camera = p.camera || {};
        p.screen = p.screen || {};

        const dz = p.world.z - camZ; // distance in front of camera

        if (dz <= 0.1) {
          p.screen.visible = false;
          return;
        }

        const scale = cameraDepth / dz; // closer = bigger
        p.screen.visible = true;
        p.screen.scale = scale;

        // centre x, widen with distance
        p.screen.x = w / 2 + (p.world.x - camX) * scale * (w / 2);

        // y: 0.25h is horizon, 0.95h is bottom of screen
        p.screen.y = h * (0.25 + 0.7 * (1 - scale));

        // road width in pixels at this depth
        p.screen.w = roadW * scale * 0.25;
      },
      limit(val: number, min: number, max: number) {
        return Math.max(min, Math.min(max, val));
      },
      increase(current: number, amount: number, max: number) {
        return (current + amount) % max;
      },
    };

    // Build road segments – world.x = 0, z marches forward
    const resetRoad = () => {
      for (let i = 0; i < 500; i++) {
        segments[i] = {
          index: i,
          p1: {
            world: { x: 0, z: i * segmentLength },
            camera: {},
            screen: {},
          },
          p2: {
            world: { x: 0, z: (i + 1) * segmentLength },
            camera: {},
            screen: {},
          },
          color: Math.floor(i / 3) % 2 ? "#555" : "#999",
        };
      }
    };
    resetRoad();

    // Input
    const handleKeyDown = (e: KeyboardEvent) => {
      keys[e.keyCode] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keys[e.keyCode] = false;
    };

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      const rect = canvas.getBoundingClientRect();
      const mid = rect.left + rect.width / 2;
      if (touch.clientX < mid) touchLeft = true;
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

    // Spawn zombie
    const spawnZombie = () => {
      zombies.push({
        offsetZ: 200 + Math.random() * 600, // a bit further away
        x: (Math.random() - 0.5) * 2, // -1..1
      });

      // moan
      if (zombieAudioRef.current) {
        zombieAudioRef.current.currentTime = 0;
        zombieAudioRef.current.play().catch(() => {});
      }
    };

    const update = (dt: number) => {
      if (!gameRunning) return;

      // accel
      speedVal = Util.limit(speedVal + accel * dt, 0, maxSpeed);

      // engine audio when moving
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

      // distance along road
      position = Util.increase(
        position,
        dt * speedVal,
        segments.length * segmentLength
      );

      // steering
      const dx = dt * 4 * (speedVal / maxSpeed);
      if (keys[37] || keys[65] || touchLeft) playerX -= dx; // left
      if (keys[39] || keys[68] || touchRight) playerX += dx; // right
      playerX = Util.limit(playerX, -2, 2);

      // spawn logic
      lastSpawn += dt;
      if (lastSpawn > spawnRate) {
        spawnZombie();
        lastSpawn = 0;
        spawnRate = Math.max(0.4, spawnRate - 0.002);
      }

      // zombies move + collisions
      zombies = zombies.filter((z) => {
        z.offsetZ -= dt * speedVal;
        if (z.offsetZ <= 20) return false; // passed under car

        const dz = z.offsetZ;
        const sameLane = Math.abs(z.x - playerX) < 0.3;

        if (dz < 120 && sameLane) {
          healthVal -= 20;
          scoreVal += 10;
          if (healthVal <= 0) {
            gameRunning = false;
            setGameOver(true);
            if (engineAudioRef.current) engineAudioRef.current.pause();
          }
          return false;
        }
        return true;
      });

      // scoring
      scoreVal += (dt * speedVal) / 10;

      // push to HUD
      setSpeed(Math.floor(speedVal));
      setHealth(healthVal);
      setScore(Math.floor(scoreVal));
    };

    const render = () => {
      ctx.save();
      ctx.clearRect(0, 0, width, height);

      const w = width;
      const h = height;

      // Cockpit sides
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, w * 0.2, h);
      ctx.fillRect(w * 0.8, 0, w * 0.2, h);

      // Sky
      const gradient = ctx.createLinearGradient(0, 0, 0, h / 2);
      gradient.addColorStop(0, "#87CEEB");
      gradient.addColorStop(1, "#333");
      ctx.fillStyle = gradient;
      ctx.fillRect(w * 0.2, 0, w * 0.6, h / 2);

      // Road segments
      const camX = playerX * roadWidth;
      const baseSegmentIdx =
        Math.floor(position / segmentLength) % segments.length;
      let maxY = h;

      for (let n = 0; n < drawDistance; n++) {
        const segIdx = (baseSegmentIdx + n) % segments.length;
        const segment = segments[segIdx];

        segment.p1.world.x = 0;
        segment.p2.world.x = 0;

        Util.project(segment.p1, camX, position, w, h, roadWidth);
        Util.project(segment.p2, camX, position, w, h, roadWidth);

        if (
          !segment.p1.screen.visible ||
          !segment.p2.screen.visible ||
          segment.p2.screen.y >= maxY
        )
          continue;

        // grass
        ctx.fillStyle = "#0a0";
        ctx.fillRect(
          0,
          segment.p1.screen.y,
          w * 0.2,
          segment.p2.screen.y - segment.p1.screen.y
        );
        ctx.fillRect(
          w * 0.8,
          segment.p1.screen.y,
          w * 0.2,
          segment.p2.screen.y - segment.p1.screen.y
        );

        // road
        ctx.fillStyle = segment.color;
        ctx.beginPath();
        ctx.moveTo(
          segment.p1.screen.x - segment.p1.screen.w,
          segment.p1.screen.y
        );
        ctx.lineTo(
          segment.p1.screen.x + segment.p1.screen.w,
          segment.p1.screen.y
        );
        ctx.lineTo(
          segment.p2.screen.x + segment.p2.screen.w,
          segment.p2.screen.y
        );
        ctx.lineTo(
          segment.p2.screen.x - segment.p2.screen.w,
          segment.p2.screen.y
        );
        ctx.closePath();
        ctx.fill();

        // centre line
        ctx.fillStyle = "#fff";
        const lineW = 10;
        ctx.beginPath();
        ctx.moveTo(segment.p1.screen.x - lineW, segment.p1.screen.y);
        ctx.lineTo(segment.p1.screen.x + lineW, segment.p1.screen.y);
        ctx.lineTo(segment.p2.screen.x + lineW, segment.p2.screen.y);
        ctx.lineTo(segment.p2.screen.x - lineW, segment.p2.screen.y);
        ctx.closePath();
        ctx.fill();

        maxY = segment.p2.screen.y;
      }

      // Zombies
      zombies.forEach((z) => {
        const proj: any = {
          world: { x: z.x * roadWidth * 0.3, z: position + z.offsetZ },
          camera: {},
          screen: {},
        };
        Util.project(proj, camX, position, w, h, roadWidth);
        if (!proj.screen.visible) return;

        const size = 40 + 100 / (1 + z.offsetZ / 100);
        ctx.save();
        ctx.translate(proj.screen.x, proj.screen.y);
        const scale = size / 40;
        ctx.scale(scale, scale);
        ctx.shadowColor = "red";
        ctx.shadowBlur =
          (15 * (100 - Math.min(100, z.offsetZ))) / 100;

        ctx.fillStyle = "#0f0";
        ctx.fillRect(-8, 0, 16, 30);
        ctx.fillStyle = "#f00";
        ctx.beginPath();
        ctx.arc(0, -5, 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(-4, -7, 3, 0, Math.PI * 2);
        ctx.arc(4, -7, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-6, 2, 3, 4);
        ctx.fillRect(-1, 2, 3, 4);
        ctx.fillRect(3, 2, 3, 4);

        ctx.restore();
      });

      // Car image bottom centre
      if (carImgRef.current && carImgRef.current.complete) {
        const carW = w * 0.18;
        const carH = carW * 0.6;
        const x = w / 2 - carW / 2;
        const y = h * 0.7;
        ctx.drawImage(carImgRef.current, x, y, carW, carH);
      }

      // Dashboard HUD
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      const dashX = w * 0.25;
      const dashY = h * 0.78;
      const dashW = w * 0.5;
      const dashH = h * 0.18;
      ctx.fillRect(dashX, dashY, dashW, dashH);

      ctx.strokeStyle = "lime";
      ctx.lineWidth = 3;
      ctx.strokeRect(dashX, dashY, dashW, dashH);

      // Speedometer arc
      ctx.strokeStyle = "yellow";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(
        w / 2,
        dashY + dashH * 0.7,
        60,
        Math.PI * 0.75,
        Math.PI * 0.75 + (speedVal / maxSpeed) * Math.PI * 1.3
      );
      ctx.stroke();

      ctx.fillStyle = "lime";
      ctx.font = "14px monospace";
      ctx.fillText(`SPD ${Math.floor(speedVal)} km/h`, dashX + 20, dashY + 30);
      ctx.fillText(`HP  ${healthVal}`, dashX + 20, dashY + 55);
      ctx.fillText(`SC  ${Math.floor(scoreVal)}`, dashX + 20, dashY + 80);

      ctx.restore();
    };

    const loop = (time: number) => {
      const dt = Math.min(1, (time - lastTime) / 1000);
      lastTime = time;
      accumulator += dt;

      while (accumulator >= step) {
        update(step);
        accumulator -= step;
      }

      render();
      if (gameRunning) {
        requestAnimationFrame(loop);
      }
    };

    requestAnimationFrame(loop);

    return () => {
      gameRunning = false;
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchend", handleTouchEnd);
      if (engineAudioRef.current) engineAudioRef.current.pause();
    };
  }, [rideName, carImageUrl, runId, tunedMaxSpeed, tunedRoadWidth]);

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
