import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

export type LobbyStage = 'create' | 'join' | 'waiting' | 'ready';

interface MultiplayerLobbyProps {
  onBack: () => void;
  onJoined: (roomId: string, playerRole: 'host' | 'guest', roomSeed: number) => void;
  onReady?: () => void;
  playerId: string;
}

export function MultiplayerLobby({ onBack, onJoined, onReady, playerId }: MultiplayerLobbyProps) {
  const [stage, setStage] = useState<LobbyStage>('create');
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [error, setError] = useState('');
  const roomIdRef = useRef<string | null>(null);

  const createRoom = useMutation(api.rooms.createRoom as any);
  const joinRoom = useMutation(api.rooms.joinRoom as any);

  const handleCreate = useCallback(async () => {
    setError('');
    try {
      const result = await createRoom({ hostId: playerId });
      roomIdRef.current = result.roomId;
      setRoomCode(result.code);
      setStage('waiting');
    } catch (e: any) {
      setError(e.message || 'Failed to create room');
    }
  }, [createRoom, playerId]);

  const handleJoin = useCallback(async () => {
    setError('');
    if (!inputCode.trim()) {
      setError('Enter a room code');
      return;
    }
    try {
      const result = await joinRoom({ code: inputCode.trim().toUpperCase(), guestId: playerId });
      roomIdRef.current = result.roomId;
      setRoomCode(inputCode.trim().toUpperCase());
      onJoined(result.roomId, 'guest', result.roomSeed);
      setStage('ready');
    } catch (e: any) {
      setError(e.message || 'Failed to join room');
    }
  }, [joinRoom, inputCode, playerId, onJoined]);

  const handleGuestJoined = useCallback(
    (roomId: string, roomSeed: number) => {
      onJoined(roomId, 'host', roomSeed);
      setStage('ready');
    },
    [onJoined]
  );

  if (stage === 'waiting') {
    return (
      <WaitingRoom
        roomCode={roomCode}
        roomId={roomIdRef.current!}
        playerId={playerId}
        onGuestJoined={handleGuestJoined}
        onBack={onBack}
      />
    );
  }

  if (stage === 'ready') {
    return (
      <ReadyScreen
        roomId={roomIdRef.current!}
        roomCode={roomCode}
        playerId={playerId}
        onReady={onReady}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center p-4">
      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-cyber-blue/20 bg-dark-900/95 p-8 shadow-cyber backdrop-blur-sm">
        <h2
          className="text-2xl font-black uppercase tracking-widest text-cyber-blue"
          style={{ fontFamily: 'Orbitron, sans-serif' }}
        >
          Multiplayer
        </h2>

        {stage === 'create' && (
          <div className="flex w-full flex-col gap-4">
            <button
              type="button"
              onClick={handleCreate}
              className="group relative overflow-hidden rounded-xl border border-cyber-green/45 bg-cyber-green/[0.12] px-8 py-4 font-mono text-lg font-black uppercase tracking-[0.15em] text-cyber-green transition-all hover:scale-[1.02] hover:bg-cyber-green/[0.18] active:scale-[0.98]"
              style={{ boxShadow: '0 0 30px rgba(0,255,136,0.18)' }}
            >
              Create Room
            </button>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="font-mono text-xs uppercase tracking-widest text-white/30">or</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                placeholder="Enter room code"
                maxLength={6}
                className="rounded-xl border border-cyber-blue/30 bg-dark-800 px-4 py-3 font-mono text-center text-lg uppercase tracking-widest text-white placeholder:text-white/20 focus:border-cyber-blue/60 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setStage('join')}
                disabled={!inputCode.trim()}
                className="rounded-xl border border-cyber-blue/30 bg-cyber-blue/[0.1] px-6 py-3 font-mono text-sm font-bold uppercase tracking-widest text-cyber-blue transition-all hover:bg-cyber-blue/[0.15] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Join Room
              </button>
            </div>
          </div>
        )}

        {stage === 'join' && (
          <div className="flex w-full flex-col gap-4">
            <p className="text-center font-mono text-sm text-white/50">
              Joining room <span className="text-cyber-blue font-bold">{inputCode}</span>
            </p>
            <button
              type="button"
              onClick={handleJoin}
              className="rounded-xl border border-cyber-blue/45 bg-cyber-blue/[0.15] px-6 py-3 font-mono text-base font-black uppercase tracking-widest text-cyber-blue transition-all hover:scale-[1.02] hover:bg-cyber-blue/[0.22] active:scale-[0.98]"
            >
              Connect
            </button>
            <button
              type="button"
              onClick={() => setStage('create')}
              className="rounded-xl bg-dark-800 px-6 py-2.5 font-mono text-sm font-bold uppercase tracking-widest text-white/50 transition-all hover:text-white/80"
            >
              Back
            </button>
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-500/10 px-4 py-2 font-mono text-xs text-red-300 border border-red-500/20">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onBack}
          className="mt-2 rounded-xl bg-dark-800/90 px-6 py-2.5 font-mono text-sm font-bold uppercase tracking-[0.15em] text-white/50 transition-all hover:bg-dark-700/95 hover:text-cyber-blue/80"
        >
          ← Back to Menu
        </button>
      </div>
    </div>
  );
}

function WaitingRoom({
  roomCode,
  roomId,
  playerId,
  onGuestJoined,
  onBack,
}: {
  roomCode: string;
  roomId: string;
  playerId: string;
  onGuestJoined: (roomId: string, roomSeed: number) => void;
  onBack: () => void;
}) {
  const room = useQuery(api.rooms.getRoom as any, { roomId });
  const leaveRoom = useMutation(api.rooms.leaveRoom as any);

  useEffect(() => {
    if (room?.guestId && room?.status === 'ready') {
      onGuestJoined(roomId, room.roomSeed);
    }
  }, [room, roomId, onGuestJoined]);

  const handleLeave = useCallback(async () => {
    try {
      await leaveRoom({ roomId, playerId });
    } catch {}
    onBack();
  }, [leaveRoom, roomId, playerId, onBack]);

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center p-4">
      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-cyber-blue/20 bg-dark-900/95 p-8 shadow-cyber backdrop-blur-sm">
        <h2
          className="text-xl font-black uppercase tracking-widest text-cyber-blue"
          style={{ fontFamily: 'Orbitron, sans-serif' }}
        >
          Waiting for Opponent
        </h2>

        <div className="flex flex-col items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-widest text-white/40">Room Code</span>
          <div className="flex items-center gap-3">
            <span className="rounded-xl border border-cyber-green/30 bg-cyber-green/10 px-6 py-3 font-mono text-3xl font-black tracking-[0.2em] text-cyber-green">
              {roomCode}
            </span>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(roomCode)}
              className="rounded-lg border border-white/10 bg-dark-800 px-3 py-2 font-mono text-xs uppercase tracking-wider text-white/50 hover:text-white/80"
              title="Copy code"
            >
              Copy
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-sm text-white/50">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyber-green" />
          Waiting for opponent to join...
        </div>

        <button
          type="button"
          onClick={handleLeave}
          className="rounded-xl bg-dark-800/90 px-6 py-2.5 font-mono text-sm font-bold uppercase tracking-[0.15em] text-white/50 transition-all hover:bg-dark-700/95 hover:text-red-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ReadyScreen({
  roomId,
  roomCode,
  playerId,
  onReady,
  onBack,
}: {
  roomId: string;
  roomCode: string;
  playerId: string;
  onReady?: () => void;
  onBack: () => void;
}) {
  const room = useQuery(api.rooms.getRoom as any, { roomId });
  const leaveRoom = useMutation(api.rooms.leaveRoom as any);
  const [hasClickedReady, setHasClickedReady] = useState(false);

  const isHost = room?.hostId === playerId;
  const isGuest = room?.guestId === playerId;
  const myReady = isHost ? room?.hostReady : room?.guestReady;
  const opponentReady = isHost ? room?.guestReady : room?.hostReady;

  const handleReady = useCallback(() => {
    setHasClickedReady(true);
    console.log('[Lobby] Ready clicked, calling onReady');
    onReady?.();
  }, [onReady]);

  const handleLeave = useCallback(async () => {
    try {
      await leaveRoom({ roomId, playerId });
    } catch {}
    onBack();
  }, [leaveRoom, roomId, playerId, onBack]);

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center p-4">
      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-cyber-blue/20 bg-dark-900/95 p-8 shadow-cyber backdrop-blur-sm">
        <h2
          className="text-xl font-black uppercase tracking-widest text-cyber-blue"
          style={{ fontFamily: 'Orbitron, sans-serif' }}
        >
          Opponent Connected
        </h2>

        <div className="flex flex-col items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-widest text-white/40">Room Code</span>
          <span className="rounded-xl border border-fuchsia-400/25 bg-fuchsia-400/10 px-6 py-2 font-mono text-2xl font-black tracking-[0.15em] text-fuchsia-300">
            {roomCode || '...'}
          </span>
        </div>

        {room === undefined && (
          <p className="font-mono text-xs text-white/40 animate-pulse">Loading room state...</p>
        )}

        {room === null && (
          <p className="font-mono text-xs text-red-300">Room not found.</p>
        )}

        <div className="flex items-center gap-4 font-mono text-sm text-white/60">
          <span className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${room?.hostReady ? 'bg-cyber-green shadow-[0_0_8px_rgba(100,255,218,0.6)]' : 'bg-white/20'}`} />
            Host {room?.hostReady ? '(Ready)' : ''}
          </span>
          <span className="text-white/20">vs</span>
          <span className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${room?.guestReady ? 'bg-cyber-green shadow-[0_0_8px_rgba(100,255,218,0.6)]' : 'bg-white/20'}`} />
            Guest {room?.guestReady ? '(Ready)' : ''}
          </span>
        </div>

        <p className="text-center font-mono text-sm text-white/50">
          Both players must click Ready to begin the match.
        </p>

        <button
          type="button"
          onClick={handleReady}
          disabled={hasClickedReady || myReady}
          className="group relative overflow-hidden rounded-2xl border border-cyber-green/45 bg-cyber-green/[0.12] px-12 py-4 font-mono text-lg font-black uppercase tracking-[0.15em] text-cyber-green transition-all hover:scale-[1.02] hover:bg-cyber-green/[0.18] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ boxShadow: '0 0 30px rgba(0,255,136,0.18)' }}
        >
          {hasClickedReady || myReady ? 'Waiting for opponent...' : 'Ready'}
        </button>

        {opponentReady && (
          <p className="font-mono text-xs text-cyber-green/70 animate-pulse">
            Opponent is ready!
          </p>
        )}

        <button
          type="button"
          onClick={handleLeave}
          className="rounded-xl bg-dark-800/90 px-6 py-2.5 font-mono text-sm font-bold uppercase tracking-[0.15em] text-white/50 transition-all hover:bg-dark-700/95 hover:text-red-300"
        >
          Leave Room
        </button>
      </div>
    </div>
  );
}
