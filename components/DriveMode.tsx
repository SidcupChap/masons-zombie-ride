import React, { useEffect, useRef, useState } from "react";

type DriveModeProps = {
  rideName: string;
  carImageUrl: string;
  onExit: () => void;
};

type Zombie = {
  id: number;
  lane: number; // 0,1,2
  y: number;    // 0 = bottom, 100 = top
};

type ScoreEntry = {
  rideName: string;
  distance: number;
  time: number;
  date: string;
};

const TRACK_LENGTH = 800; // meters
const CAR_SPEED = 70; // m/s (roughly, for timing)
const ZOMBIE_SPEED = 40; // arbitrary units per second on screen
const ZOMBIE_SPAWN_INTERVAL = 900; // ms
const STORAGE_KEY = "mz_drive_scores";

export const DriveMode: React.FC<DriveModeProps> = ({
  rideName,
  carImageUrl,
  onExit,
}) => {
  const [lane, setLane] = useState(1); // middle lane 0,1,2
  const [zombies, setZombies] = useState<Zombie[]>([]);
  const [distance, setDistance] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [isFinished, setIsFinished] = useState(false);
  const [reason, setReason] = useState<"crash" | "finished" | null>(null);
  const [scores, setScores] = useState<ScoreEntry[]>([]);

  const lastTickRef = useRef<number | null>(null);
  const zombieIdRef = useRef(1);
  const spawnTimerRef = useRef<number | null>(null);

  // Load leaderboard on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setScores(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }, []);

  // Keyboard controls (desktop)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!isRunning) return;

      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") {
        setLane((prev) => Math.max(0, prev - 1));
      } else if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") {
        setLane((prev) => Math.min(2, prev + 1));
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isRunning]);

  // Touch controls (mobile) – tap left / right half
  const handleTouch = (e: React.TouchEvent) => {
    if (!isRunning) return;
    const touch = e.touches[0];
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    if (touch.clientX < mid) {
      setLane((prev) => Math.max(0, prev - 1));
    } else {
      setLane((prev) => Math.min(2, prev + 1));
    }
  };

  // Game loop
  useEffect(() => {
    if (!isRunning || isFinished) return;

    const tick = (timestamp: number) => {
      if (!lastTickRef.current) lastTickRef.current = timestamp;
      const delta = (timestamp - lastTickRef.current) / 1000;
      lastTickRef.current = timestamp;

      // Update distance + time
      setDistance((prev) => {
        const next = prev + CAR_SPEED * delta;
        if (next >= TRACK_LENGTH) {
          handleFinish("finished", next, elapsedTime + delta);
          return TRACK_LENGTH;
        }
        return next;
      });

      setElapsedTime((prev) => prev + delta);

      // Move zombies
      setZombies((prev) =>
        prev
          .map((z) => ({ ...z, y: z.y - ZOMBIE_SPEED * delta }))
          .filter((z) => z.y > -10)
      );

      // Collision check
      setZombies((prev) => {
        // Approx car hitbox zone
        const carY = 15;
        const hit = prev.some(
          (z) =>
            z.lane === lane && z.y < carY + 10 && z.y > carY - 10
        );
        if (hit) {
          handleFinish("crash", distance, elapsedTime);
          return [];
        }
        return prev;
      });

      if (!isFinished) {
        requestAnimationFrame(tick);
      }
    };

    const id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, isFinished, lane]);

  // Spawn zombies periodically
  useEffect(() => {
    if (!isRunning || isFinished) return;

    spawnTimerRef.current = window.setInterval(() => {
      setZombies((prev) => [
        ...prev,
        {
          id: zombieIdRef.current++,
          lane: Math.floor(Math.random() * 3),
          y: 110, // above top, falls down
        },
      ]);
    }, ZOMBIE_SPAWN_INTERVAL);

    return () => {
      if (spawnTimerRef.current) window.clearInterval(spawnTimerRef.current);
    };
  }, [isRunning, isFinished]);

  const handleFinish = (
    why: "crash" | "finished",
    finalDistance: number,
    finalTime: number
  ) => {
    setIsRunning(false);
    setIsFinished(true);
    setReason(why);

    const roundedDist = Math.floor(finalDistance);
    const roundedTime = Number(finalTime.toFixed(2));

    const newEntry: ScoreEntry = {
      rideName,
      distance: roundedDist,
      time: roundedTime,
      date: new Date().toISOString(),
    };

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const prev: ScoreEntry[] = stored ? JSON.parse(stored) : [];
      const updated = [...prev, newEntry].sort(
        (a, b) => b.distance - a.distance
      ).slice(0, 20);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setScores(updated);
    } catch {
      // ignore
    }
  };

  const handleRetry = () => {
    setLane(1);
    setZombies([]);
    setDistance(0);
    setElapsedTime(0);
    setIsFinished(false);
    setReason(null);
    lastTickRef.current = null;
    setIsRunning(true);
  };

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/95 text-slate-50 flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div>
          <p className="text-xs uppercase tracking-wide text-emerald-400">
            Drive Mode
          </p>
          <h1 className="text-lg font-bold">
            {rideName || "Zombie Run"}
          </h1>
        </div>
        <button
          onClick={onExit}
          className="text-xs px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600"
        >
          Back to Garage
        </button>
      </header>

      {/* Stats row */}
      <div className="px-4 py-2 flex items-center justify-between text-xs">
        <div>
          <span className="text-slate-400 mr-1">Distance:</span>
          <span className="font-semibold">
            {Math.floor(distance)} m / {TRACK_LENGTH} m
          </span>
        </div>
        <div>
          <span className="text-slate-400 mr-1">Time:</span>
          <span className="font-semibold">
            {elapsedTime.toFixed(1)} s
          </span>
        </div>
      </div>

      {/* Track */}
      <div
        className="flex-1 flex items-center justify-center px-4 pb-4"
        onTouchStart={handleTouch}
      >
        <div className="relative w-full max-w-md h-full max-h-[520px] bg-gradient-to-b from-slate-900 to-slate-950 rounded-2xl border border-slate-800 overflow-hidden">
          {/* Road background */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#0f172a,_#020617)] opacity-70" />

          {/* Lane lines */}
          <div className="absolute inset-y-0 left-1/3 w-px border-l border-dashed border-slate-600/60" />
          <div className="absolute inset-y-0 left-2/3 w-px border-l border-dashed border-slate-600/60" />

          {/* Finish line */}
          <div className="absolute top-4 left-0 right-0 flex justify-center">
            <div className="w-40 h-3 bg-[repeating-linear-gradient(90deg,_#fbbf24,_#fbbf24_8px,_#000_8px,_#000_16px)] rounded-sm shadow-md shadow-yellow-500/30" />
          </div>

          {/* Zombies */}
          {zombies.map((z) => {
            const laneX = z.lane === 0 ? "16.5%" : z.lane === 1 ? "50%" : "83.5%";
            return (
              <div
                key={z.id}
                className="absolute w-10 h-10 -translate-x-1/2 rounded-md bg-rose-600/90 border border-rose-300/80 flex items-center justify-center text-[10px] font-semibold shadow-lg shadow-rose-900/70"
                style={{
                  left: laneX,
                  bottom: `${z.y}%`,
                }}
              >
                🧟
              </div>
            );
          })}

          {/* Car */}
          <div
            className="absolute bottom-6 w-14 h-16 -translate-x-1/2 rounded-xl border border-emerald-300/80 bg-emerald-600/80 flex items-center justify-center shadow-[0_0_25px_rgba(16,185,129,0.7)]"
            style={{
              left: lane === 0 ? "16.5%" : lane === 1 ? "50%" : "83.5%",
            }}
          >
            {carImageUrl ? (
              <img
                src={carImageUrl}
                alt={rideName}
                className="w-full h-full object-cover rounded-xl"
              />
            ) : (
              <span className="text-[10px] text-slate-900 font-bold">
                RIDE
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Controls + result */}
      <div className="px-4 pb-4 space-y-3">
        {!isFinished && (
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>Tap left/right or use ◀ ▶ / A D to change lane.</span>
            <span className="text-emerald-400 font-semibold">
              Dodge the zombies!
            </span>
          </div>
        )}

        {isFinished && (
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-700 text-xs space-y-1">
            <p className="font-semibold">
              {reason === "crash"
                ? "You were overrun!"
                : "You cleared the strip!"}
            </p>
            <p>
              Distance:{" "}
              <span className="font-semibold">
                {Math.floor(distance)} m
              </span>
            </p>
            <p>
              Time:{" "}
              <span className="font-semibold">
                {elapsedTime.toFixed(2)} s
              </span>
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleRetry}
                className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold"
              >
                Have another go
              </button>
              <button
                onClick={onExit}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs"
              >
                Back to Garage
              </button>
            </div>
          </div>
        )}

        {/* Leaderboard */}
        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 max-h-40 overflow-y-auto text-xs">
          <p className="font-semibold mb-1">Local Leaderboard</p>
          {scores.length === 0 && (
            <p className="text-slate-400">No runs yet. Go set the record!</p>
          )}
          {scores.map((s, i) => (
            <div
              key={s.date + i}
              className="flex items-center justify-between py-1 border-b border-slate-800/60 last:border-0"
            >
              <div className="flex-1 pr-2">
                <p className="font-semibold text-[11px] truncate">
                  #{i + 1} {s.rideName}
                </p>
                <p className="text-[10px] text-slate-400">
                  {new Date(s.date).toLocaleDateString()} •{" "}
                  {s.time.toFixed(2)} s
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-[11px]">
                  {s.distance} m
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
