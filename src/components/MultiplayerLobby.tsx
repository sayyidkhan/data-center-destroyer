import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

export type LobbyStage = 'menu' | 'host_waiting' | 'host_accept' | 'guest_find' | 'guest_requesting' | 'ready';

interface MultiplayerLobbyProps {
  onBack: () => void;
  onJoined: (roomId: string, playerRole: 'host' | 'guest', roomSeed: number) => void;
  onReady?: () => void;
  playerId: string;
}

export function MultiplayerLobby({ onBack, onJoined, onReady, playerId }: MultiplayerLobbyProps) {
  const [stage, setStage] = useState<LobbyStage>('menu');
  const [error, setError] = useState('');
  const roomIdRef = useRef<string | null>(null);

  const createPublicLobby = useMutation(api.rooms.createPublicLobby as any);
  const requestJoin = useMutation(api.rooms.requestJoin as any);
  const acceptGuest = useMutation(api.rooms.acceptGuest as any);
  const rejectGuest = useMutation(api.rooms.rejectGuest as any);
  const leaveRoom = useMutation(api.rooms.leaveRoom as any);
  const heartbeat = useMutation(api.rooms.heartbeat as any);

  const publicLobbies = useQuery(api.rooms.listPublicLobbies as any);

  // Keep the lobby alive while host is waiting — fire heartbeat every 5s
  useEffect(() => {
    if ((stage !== 'host_waiting' && stage !== 'host_accept') || !roomIdRef.current) return;
    const roomId = roomIdRef.current;
    const interval = setInterval(() => {
      heartbeat({ roomId, playerId }).catch(() => undefined);
    }, 5000);
    return () => clearInterval(interval);
  }, [stage, playerId, heartbeat]);

  const currentRoomId = roomIdRef.current;
  const room = useQuery(
    api.rooms.getRoom as any,
    currentRoomId ? { roomId: currentRoomId } : 'skip'
  );

  // Host: watch for join requests
  useEffect(() => {
    if ((stage === 'host_waiting' || stage === 'host_accept') && room) {
      const requests = room.joinRequests ?? [];
      if (stage === 'host_waiting' && requests.length > 0) {
        setStage('host_accept');
      }
      if (room.guestId) {
        onJoined(currentRoomId!, 'host', room.roomSeed);
        setStage('ready');
      }
    }
  }, [room, stage, currentRoomId, onJoined]);

  // Guest: watch for acceptance
  useEffect(() => {
    if (stage === 'guest_requesting' && room && room.guestId === playerId) {
      onJoined(currentRoomId!, 'guest', room.roomSeed);
      setStage('ready');
    }
  }, [room, stage, currentRoomId, playerId, onJoined]);

  const handleCreateLobby = useCallback(async () => {
    setError('');
    try {
      const result = await createPublicLobby({ hostId: playerId });
      roomIdRef.current = result.roomId;
      setStage('host_waiting');
    } catch (e: any) {
      setError(e.message || 'Failed to create lobby');
    }
  }, [createPublicLobby, playerId]);

  const handleRequestJoin = useCallback(async (roomId: string) => {
    setError('');
    try {
      await requestJoin({ roomId, guestId: playerId });
      roomIdRef.current = roomId;
      setStage('guest_requesting');
    } catch (e: any) {
      setError(e.message || 'Failed to request join');
    }
  }, [requestJoin, playerId]);

  const handleAccept = useCallback(async (guestId: string) => {
    if (!currentRoomId) return;
    try {
      await acceptGuest({ roomId: currentRoomId, hostId: playerId, guestId });
    } catch (e: any) {
      setError(e.message || 'Failed to accept guest');
    }
  }, [acceptGuest, currentRoomId, playerId]);

  const handleReject = useCallback(async (guestId: string) => {
    if (!currentRoomId) return;
    try {
      await rejectGuest({ roomId: currentRoomId, hostId: playerId, guestId });
      if (room && room.joinRequests.length <= 1) {
        setStage('host_waiting');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to reject guest');
    }
  }, [rejectGuest, currentRoomId, playerId, room]);

  const handleLeave = useCallback(async () => {
    if (currentRoomId) {
      try {
        await leaveRoom({ roomId: currentRoomId, playerId });
      } catch {}
    }
    roomIdRef.current = null;
    onBack();
  }, [leaveRoom, currentRoomId, playerId, onBack]);

  if (stage === 'host_waiting') {
    return (
      <HostWaitingScreen
        onLeave={handleLeave}
        playerCount={room?.joinRequests?.length ?? 0}
      />
    );
  }

  if (stage === 'host_accept') {
    return (
      <HostAcceptScreen
        joinRequests={room?.joinRequests ?? []}
        onAccept={handleAccept}
        onReject={handleReject}
        onLeave={handleLeave}
      />
    );
  }

  if (stage === 'guest_find') {
    return (
      <GuestFindScreen
        lobbies={publicLobbies ?? []}
        onRequestJoin={handleRequestJoin}
        onBack={() => setStage('menu')}
      />
    );
  }

  if (stage === 'guest_requesting') {
    return (
      <GuestRequestingScreen
        onLeave={handleLeave}
      />
    );
  }

  if (stage === 'ready') {
    return (
      <ReadyScreen
        roomId={currentRoomId!}
        roomCode={room?.code ?? ''}
        playerId={playerId}
        onReady={onReady}
        onLeave={handleLeave}
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

        <div className="flex w-full flex-col gap-4">
          <button
            type="button"
            onClick={handleCreateLobby}
            className="group relative overflow-hidden rounded-xl border border-cyber-green/45 bg-cyber-green/[0.12] px-8 py-4 font-mono text-lg font-black uppercase tracking-[0.15em] text-cyber-green transition-all hover:scale-[1.02] hover:bg-cyber-green/[0.18] active:scale-[0.98]"
            style={{ boxShadow: '0 0 30px rgba(0,255,136,0.18)' }}
          >
            Create Lobby
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="font-mono text-xs uppercase tracking-widest text-white/30">or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <button
            type="button"
            onClick={() => setStage('guest_find')}
            className="rounded-xl border border-fuchsia-400/35 bg-fuchsia-400/[0.1] px-8 py-4 font-mono text-lg font-black uppercase tracking-[0.15em] text-fuchsia-300 transition-all hover:scale-[1.02] hover:bg-fuchsia-400/[0.16] active:scale-[0.98]"
            style={{ boxShadow: '0 0 30px rgba(232,121,249,0.14)' }}
          >
            Find Lobby
          </button>
        </div>

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

function HostWaitingScreen({ onLeave, playerCount }: { onLeave: () => void; playerCount: number }) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center p-4">
      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-cyber-blue/20 bg-dark-900/95 p-8 shadow-cyber backdrop-blur-sm">
        <h2
          className="text-xl font-black uppercase tracking-widest text-cyber-blue"
          style={{ fontFamily: 'Orbitron, sans-serif' }}
        >
          Lobby Open
        </h2>
        <div className="flex items-center gap-2 font-mono text-sm text-white/50">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyber-green" />
          Waiting for players to join...
        </div>
        {playerCount > 0 && (
          <p className="font-mono text-sm text-fuchsia-300 animate-pulse">
            {playerCount} player{playerCount > 1 ? 's' : ''} requesting to join!
          </p>
        )}
        <button
          type="button"
          onClick={onLeave}
          className="rounded-xl bg-dark-800/90 px-6 py-2.5 font-mono text-sm font-bold uppercase tracking-[0.15em] text-white/50 transition-all hover:bg-dark-700/95 hover:text-red-300"
        >
          Close Lobby
        </button>
      </div>
    </div>
  );
}

function HostAcceptScreen({
  joinRequests,
  onAccept,
  onReject,
  onLeave,
}: {
  joinRequests: string[];
  onAccept: (guestId: string) => void;
  onReject: (guestId: string) => void;
  onLeave: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center p-4">
      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-cyber-blue/20 bg-dark-900/95 p-8 shadow-cyber backdrop-blur-sm">
        <h2
          className="text-xl font-black uppercase tracking-widest text-cyber-blue"
          style={{ fontFamily: 'Orbitron, sans-serif' }}
        >
          Join Requests
        </h2>
        <p className="text-center font-mono text-sm text-white/50">
          Review and accept a player to start the match.
        </p>

        <div className="flex w-full flex-col gap-3">
          {joinRequests.map((guestId) => (
            <div
              key={guestId}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-dark-800/80 px-4 py-3"
            >
              <span className="font-mono text-sm text-white/70">Player {guestId.slice(0, 8)}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onAccept(guestId)}
                  className="rounded-lg border border-cyber-green/40 bg-cyber-green/10 px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-cyber-green transition-all hover:bg-cyber-green/20"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => onReject(guestId)}
                  className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-red-300 transition-all hover:bg-red-400/20"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onLeave}
          className="rounded-xl bg-dark-800/90 px-6 py-2.5 font-mono text-sm font-bold uppercase tracking-[0.15em] text-white/50 transition-all hover:bg-dark-700/95 hover:text-red-300"
        >
          Close Lobby
        </button>
      </div>
    </div>
  );
}

function GuestFindScreen({
  lobbies,
  onRequestJoin,
  onBack,
}: {
  lobbies: Array<{ roomId: string; code: string; hostId: string }>;
  onRequestJoin: (roomId: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center p-4">
      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-cyber-blue/20 bg-dark-900/95 p-8 shadow-cyber backdrop-blur-sm">
        <h2
          className="text-xl font-black uppercase tracking-widest text-fuchsia-300"
          style={{ fontFamily: 'Orbitron, sans-serif' }}
        >
          Find Lobby
        </h2>

        {lobbies.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <p className="font-mono text-sm text-white/40">No open lobbies found.</p>
            <p className="font-mono text-xs text-white/30">Check back in a moment or create your own.</p>
          </div>
        ) : (
          <div className="flex w-full flex-col gap-3">
            {lobbies.map((lobby) => (
              <div
                key={lobby.roomId}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-dark-800/80 px-4 py-3"
              >
                <div className="flex flex-col">
                  <span className="font-mono text-sm font-bold text-white/80">Lobby {lobby.code}</span>
                  <span className="font-mono text-xs text-white/40">Host: {lobby.hostId.slice(0, 8)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onRequestJoin(lobby.roomId)}
                  className="rounded-lg border border-cyber-green/40 bg-cyber-green/10 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-cyber-green transition-all hover:bg-cyber-green/20"
                >
                  Join
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onBack}
          className="rounded-xl bg-dark-800/90 px-6 py-2.5 font-mono text-sm font-bold uppercase tracking-[0.15em] text-white/50 transition-all hover:bg-dark-700/95 hover:text-cyber-blue/80"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}

function GuestRequestingScreen({ onLeave }: { onLeave: () => void }) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center p-4">
      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-cyber-blue/20 bg-dark-900/95 p-8 shadow-cyber backdrop-blur-sm">
        <h2
          className="text-xl font-black uppercase tracking-widest text-cyber-blue"
          style={{ fontFamily: 'Orbitron, sans-serif' }}
        >
          Request Sent
        </h2>
        <div className="flex items-center gap-2 font-mono text-sm text-white/50">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyber-green" />
          Waiting for host to accept...
        </div>
        <button
          type="button"
          onClick={onLeave}
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
  onLeave,
}: {
  roomId: string;
  roomCode: string;
  playerId: string;
  onReady?: () => void;
  onLeave: () => void;
}) {
  const room = useQuery(api.rooms.getRoom as any, { roomId });
  const [hasClickedReady, setHasClickedReady] = useState(false);

  const isHost = room?.hostId === playerId;
  const isGuest = room?.guestId === playerId;
  const myReady = isHost ? room?.hostReady : room?.guestReady;
  const opponentReady = isHost ? room?.guestReady : room?.hostReady;

  const handleReady = useCallback(() => {
    setHasClickedReady(true);
    onReady?.();
  }, [onReady]);

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
          <span className="font-mono text-xs uppercase tracking-widest text-white/40">Lobby</span>
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
          {isHost && myReady
            ? 'You are ready. Waiting for opponent...'
            : isGuest && opponentReady
              ? 'Host is ready. Click Ready to begin!'
              : 'Click Ready when you are prepared to begin.'}
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

        {opponentReady && !myReady && (
          <p className="font-mono text-xs text-cyber-green/70 animate-pulse">
            Opponent is ready!
          </p>
        )}

        <button
          type="button"
          onClick={onLeave}
          className="rounded-xl bg-dark-800/90 px-6 py-2.5 font-mono text-sm font-bold uppercase tracking-[0.15em] text-white/50 transition-all hover:bg-dark-700/95 hover:text-red-300"
        >
          Leave Room
        </button>
      </div>
    </div>
  );
}
