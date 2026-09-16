import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  blobs: defineTable({
    syncId: v.string(), // 64 lowercase hex chars, capability id
    ciphertext: v.string(), // base64 AES-GCM output
    iv: v.string(), // base64 12-byte IV
    version: v.number(), // monotonically increasing, starts at 1 on first write
    updatedAt: v.number(), // Date.now()
    size: v.number(), // ciphertext.length
  }).index("by_syncId", ["syncId"]),
});
