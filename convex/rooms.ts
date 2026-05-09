import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

const ROOM_CODE_LENGTH = 6;
const HEARTBEAT_TIMEOUT_MS = 15000;

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const createPublicLobby = mutation({
  args: { hostId: v.string() },
  handler: async (ctx, args) => {
    // Purge stale rooms every time a new lobby is created to stay within limits
    const now = Date.now();
    const allRooms = await ctx.db.query("rooms").collect();
    for (const room of allRooms) {
      const hostStale = now - room.hostLastSeen > HEARTBEAT_TIMEOUT_MS * 4;
      const isEndedOrOld = room.status === "ended" || (room.status === "waiting" && hostStale);
      if (isEndedOrOld) {
        await ctx.db.delete(room._id);
      }
    }

    let code = generateRoomCode();
    let existing = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    while (existing) {
      code = generateRoomCode();
      existing = await ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
    }

    const roomSeed = Math.floor(Math.random() * 1_000_000_000);

    const roomId = await ctx.db.insert("rooms", {
      code,
      hostId: args.hostId,
      guestId: undefined,
      status: "waiting",
      hostReady: false,
      guestReady: false,
      startedAt: undefined,
      hostLastSeen: Date.now(),
      guestLastSeen: undefined,
      actions: [],
      winner: undefined,
      roomSeed,
      isPublic: true,
      joinRequests: [],
    });

    return { roomId, code, roomSeed };
  },
});

export const requestJoin = mutation({
  args: { roomId: v.id("rooms"), guestId: v.string() },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("Room not found");
    if (room.isPublic !== true) throw new Error("Room is not public");
    if (room.guestId) throw new Error("Room is full");
    if (room.status !== "waiting") throw new Error("Room is not available");
    if (room.hostId === args.guestId) throw new Error("Cannot join your own room");

    // 1v1: auto-accept the guest immediately
    await ctx.db.patch(args.roomId, {
      guestId: args.guestId,
      status: "ready",
      hostReady: false,
      guestReady: false,
    });

    return true;
  },
});

export const acceptGuest = mutation({
  args: { roomId: v.id("rooms"), hostId: v.string(), guestId: v.string() },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("Room not found");
    if (room.hostId !== args.hostId) throw new Error("Only host can accept");
    if (room.guestId) throw new Error("Room is already full");
    const requests = room.joinRequests ?? [];
    if (!requests.includes(args.guestId)) throw new Error("No join request from this player");

    await ctx.db.patch(args.roomId, {
      guestId: args.guestId,
      status: "ready",
      hostReady: true,
      joinRequests: requests.filter((id) => id !== args.guestId),
    });

    return true;
  },
});

export const rejectGuest = mutation({
  args: { roomId: v.id("rooms"), hostId: v.string(), guestId: v.string() },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("Room not found");
    if (room.hostId !== args.hostId) throw new Error("Only host can reject");

    const requests = room.joinRequests ?? [];
    await ctx.db.patch(args.roomId, {
      joinRequests: requests.filter((id) => id !== args.guestId),
    });

    return true;
  },
});

export const listPublicLobbies = query({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    const waitingRooms = await ctx.db
      .query("rooms")
      .withIndex("by_status", (q) => q.eq("status", "waiting"))
      .take(50);

    return waitingRooms
      .filter(
        (room) =>
          room.isPublic === true &&
          !room.guestId &&
          room.hostLastSeen > args.now - HEARTBEAT_TIMEOUT_MS
      )
      .map((room) => ({
        roomId: room._id,
        code: room.code,
        hostId: room.hostId,
      }));
  },
});

export const setReady = mutation({
  args: { roomId: v.id("rooms"), playerId: v.string(), ready: v.boolean() },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("Room not found");

    const isHost = room.hostId === args.playerId;
    const isGuest = room.guestId === args.playerId;
    if (!isHost && !isGuest) throw new Error("Not a player in this room");

    const updates: Partial<typeof room> = {};
    if (isHost) updates.hostReady = args.ready;
    if (isGuest) updates.guestReady = args.ready;

    await ctx.db.patch(args.roomId, updates);

    const updated = await ctx.db.get(args.roomId);
    if (!updated) throw new Error("Room vanished");

    if (updated.hostReady && updated.guestReady && updated.status === "ready") {
      await ctx.db.patch(args.roomId, {
        status: "playing",
        startedAt: Date.now(),
      });
    }

    return updated;
  },
});

export const sendAction = mutation({
  args: {
    roomId: v.id("rooms"),
    playerId: v.string(),
    tick: v.number(),
    type: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("Room not found");
    if (room.status !== "playing") throw new Error("Game not in progress");

    const isHost = room.hostId === args.playerId;
    const isGuest = room.guestId === args.playerId;
    if (!isHost && !isGuest) throw new Error("Not a player");

    const action = {
      player: isHost ? ("host" as const) : ("guest" as const),
      tick: args.tick,
      type: args.type,
      payload: args.payload,
      sentAt: Date.now(),
    };

    await ctx.db.patch(args.roomId, {
      actions: [...room.actions, action],
    });

    return action;
  },
});

export const heartbeat = mutation({
  args: { roomId: v.id("rooms"), playerId: v.string() },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("Room not found");

    const isHost = room.hostId === args.playerId;
    const isGuest = room.guestId === args.playerId;
    if (!isHost && !isGuest) throw new Error("Not a player");

    const updates: Partial<typeof room> = {};
    if (isHost) updates.hostLastSeen = Date.now();
    if (isGuest) updates.guestLastSeen = Date.now();

    await ctx.db.patch(args.roomId, updates);

    // Return current room state so host can detect guest joining even if subscriptions lag
    return { guestId: room.guestId ?? null, status: room.status };
  },
});

export const endGame = mutation({
  args: {
    roomId: v.id("rooms"),
    winner: v.union(v.literal("host"), v.literal("guest")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.roomId, {
      status: "ended",
      winner: args.winner,
    });
    return true;
  },
});

export const leaveRoom = mutation({
  args: { roomId: v.id("rooms"), playerId: v.string() },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("Room not found");

    const isHost = room.hostId === args.playerId;
    const isGuest = room.guestId === args.playerId;
    if (!isHost && !isGuest) throw new Error("Not a player");

    if (isHost) {
      await ctx.db.patch(args.roomId, { status: "ended" });
    } else if (isGuest) {
      await ctx.db.patch(args.roomId, {
        guestId: undefined,
        guestReady: false,
        status: "waiting",
      });
    }

    return true;
  },
});

export const getRoom = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.roomId);
  },
});

export const getRoomByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
  },
});

export const getActions = query({
  args: { roomId: v.id("rooms"), afterTick: v.number() },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return [];
    return room.actions.filter((a) => a.tick > args.afterTick);
  },
});

export const cleanupStaleRooms = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const stale = await ctx.db
      .query("rooms")
      .withIndex("by_status", (q) => q.eq("status", "waiting"))
      .collect();

    for (const room of stale) {
      if (now - room.hostLastSeen > HEARTBEAT_TIMEOUT_MS) {
        await ctx.db.delete(room._id);
      }
    }

    return true;
  },
});

// ---- Game State (real-time environment store) ----

export const writeGameState = mutation({
  args: {
    roomId: v.id("rooms"),
    state: v.any(),
    tick: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("gameStates")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        state: args.state,
        tick: args.tick,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("gameStates", {
        roomId: args.roomId,
        state: args.state,
        tick: args.tick,
        updatedAt: Date.now(),
      });
    }

    return true;
  },
});

export const getGameState = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("gameStates")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .first();
  },
});
