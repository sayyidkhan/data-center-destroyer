import React, { useEffect, useRef, useState } from 'react';

const COUNTDOWN_SECONDS = Number(import.meta.env.VITE_COUNTDOWN_SECONDS) || 3;

interface CountdownOverlayProps {
  hostName: string;
  guestName: string;
  onComplete: () => void;
}

export function CountdownOverlay({ hostName, guestName, onComplete }: CountdownOverlayProps) {
  const [count, setCount] = useState(COUNTDOWN_SECONDS);
  const [showGo, setShowGo] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (count > 0) {
      const id = setTimeout(() => setCount(count - 1), 1000);
      return () => clearTimeout(id);
    }
    if (!doneRef.current) {
      doneRef.current = true;
      setShowGo(true);
      const id = setTimeout(onComplete, 1200);
      return () => clearTimeout(id);
    }
  }, [count, onComplete]);

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#0a0f1a] via-[#050810] to-[#020408]">
      {/* Hex grid background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 50%, rgba(0,212,255,0.08) 0%, transparent 60%), repeating-linear-gradient(60deg, transparent, transparent 20px, rgba(0,212,255,0.03) 20px, rgba(0,212,255,0.03) 21px), repeating-linear-gradient(-60deg, transparent, transparent 20px, rgba(232,121,249,0.03) 20px, rgba(232,121,249,0.03) 21px)',
        }}
      />

      {/* Pulsing neon ring */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="h-64 w-64 rounded-full border border-cyan-400/20 shadow-[0_0_60px_rgba(0,212,255,0.15)] animate-ping" style={{ animationDuration: '2s' }} />
        <div className="absolute inset-4 rounded-full border border-fuchsia-400/15 shadow-[0_0_40px_rgba(232,121,249,0.12)] animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.3s' }} />
      </div>

      {/* Player names */}
      <div className="relative z-10 mb-12 flex w-full max-w-2xl items-center justify-between px-8">
        <div className="flex flex-col items-center gap-2">
          <span className="rounded-md bg-cyan-400/10 px-3 py-1 font-mono text-[10px] font-black uppercase tracking-widest text-cyan-300 border border-cyan-400/20">
            Host
          </span>
          <span className="font-mono text-lg font-bold text-white drop-shadow-[0_0_12px_rgba(34,211,238,0.4)]">
            {hostName}
          </span>
          <span className="flex h-2 w-2 rounded-full bg-cyber-green shadow-[0_0_8px_rgba(100,255,218,0.6)]" />
        </div>

        <div className="flex flex-col items-center">
          <span
            className="text-4xl font-black tracking-[0.3em] text-white/20"
            style={{ fontFamily: 'Orbitron, sans-serif' }}
          >
            VS
          </span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <span className="rounded-md bg-fuchsia-400/10 px-3 py-1 font-mono text-[10px] font-black uppercase tracking-widest text-fuchsia-300 border border-fuchsia-400/20">
            Guest
          </span>
          <span className="font-mono text-lg font-bold text-white drop-shadow-[0_0_12px_rgba(232,121,249,0.4)]">
            {guestName}
          </span>
          <span className="flex h-2 w-2 rounded-full bg-cyber-green shadow-[0_0_8px_rgba(100,255,218,0.6)]" />
        </div>
      </div>

      {/* Countdown number */}
      <div className="relative z-10 flex items-center justify-center">
        {showGo ? (
          <span
            className="animate-bounce text-8xl font-black text-cyber-green drop-shadow-[0_0_40px_rgba(0,255,136,0.6)]"
            style={{ fontFamily: 'Orbitron, sans-serif' }}
          >
            GO
          </span>
        ) : (
          <span
            key={count}
            className="animate-in fade-in zoom-in text-[10rem] font-black leading-none text-transparent drop-shadow-[0_0_50px_rgba(0,212,255,0.5)]"
            style={{
              fontFamily: 'Orbitron, sans-serif',
              backgroundImage: 'linear-gradient(135deg, #22d3ee, #e879f9)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              animation: 'countdown-pop 0.5s ease-out',
            }}
          >
            {count}
          </span>
        )}
      </div>

      <style>{`
        @keyframes countdown-pop {
          0% { transform: scale(1.5); opacity: 0; }
          50% { transform: scale(0.95); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-in { animation-fill-mode: both; }
        .fade-in { animation-name: fadeIn; animation-duration: 0.3s; }
        .zoom-in { animation-name: zoomIn; animation-duration: 0.5s; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoomIn { from { transform: scale(0.8); } to { transform: scale(1); } }
      `}</style>
    </div>
  );
}
