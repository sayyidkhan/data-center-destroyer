import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    hostId: v.string(),
    guestId: v.optional(v.string()),
    status: v.union(
      v.literal("waiting"),
      v.literal("ready"),
      v.literal("playing"),
      v.literal("ended")
    ),
    hostReady: v.boolean(),
    guestReady: v.boolean(),
    startedAt: v.optional(v.number()),
    hostLastSeen: v.number(),
    guestLastSeen: v.optional(v.number()),
    actions: v.array(
      v.object({
        player: v.union(v.literal("host"), v.literal("guest")),
        tick: v.number(),
        type: v.string(),
        payload: v.any(),
        sentAt: v.number(),
      })
    ),
    winner: v.optional(v.union(v.literal("host"), v.literal("guest"))),
    roomSeed: v.number(),
    isPublic: v.optional(v.boolean()),
    joinRequests: v.optional(v.array(v.string())), // guestIds requesting to join
  })
    .index("by_code", ["code"])
    .index("by_status", ["status"])
    .index("by_public", ["isPublic", "status"]),
});
