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

  // One row per device that turned reminders on. The server knows when to send and nothing about what.
  pushDevices: defineTable({
    deviceId: v.string(), // random UUID, chosen by the device
    subscription: v.string(), // PushSubscription JSON
    reminders: v.array(
      v.object({
        fireAt: v.number(), // Date.now() at which to send
        ciphertext: v.string(), // base64 AES-GCM, key never leaves the device
        iv: v.string(), // base64 12-byte IV
      }),
    ),
    nextFireAt: v.optional(v.number()), // earliest reminders[].fireAt; absent when there are none
    updatedAt: v.number(),
  })
    .index("by_deviceId", ["deviceId"])
    .index("by_nextFireAt", ["nextFireAt"]),
});
