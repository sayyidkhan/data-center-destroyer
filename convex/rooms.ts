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

export const createRoom = mutation({
  args: { hostId: v.string() },
  handler: async (ctx, args) => {
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
    });

    return { roomId, code, roomSeed };
  },
});

export const joinRoom = mutation({
  args: { code: v.string(), guestId: v.string() },
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();

    if (!room) throw new Error("Room not found");
    if (room.status !== "waiting") throw new Error("Room is not available");
    if (room.guestId) throw new Error("Room is full");
    if (room.hostId === args.guestId) throw new Error("Cannot join your own room");

    await ctx.db.patch(room._id, {
      guestId: args.guestId,
      status: "ready",
      guestLastSeen: Date.now(),
    });

    return { roomId: room._id, roomSeed: room.roomSeed };
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

    // Both ready -> start countdown
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
    return true;
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
      .withIndex("by_status", (q) =>
        q.eq("status", "waiting")
      )
      .collect();

    for (const room of stale) {
      if (now - room.hostLastSeen > HEARTBEAT_TIMEOUT_MS) {
        await ctx.db.delete(room._id);
      }
    }

    return true;
  },
});
