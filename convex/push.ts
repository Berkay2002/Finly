/**
 * Push reminders without accounts. A device registers a push subscription and a list of encrypted
 * reminders with the moments to send them; the cron in pushSend.ts sends each one when its time
 * comes. The reminder text is encrypted with a key that lives in the device's IndexedDB, so the
 * server sees an endpoint, some timestamps and ciphertext. Anyone can call `register`, so every
 * field is capped: the damage an abuser can do is bounded by the caps and the 15-minute cron.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";

const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_REMINDERS = 90;
const MAX_CIPHERTEXT_LENGTH = 4000; // Web Push payloads are capped at 4 KB
const MAX_IV_LENGTH = 64;
const MAX_SUBSCRIPTION_LENGTH = 4000;
/** A device that has no reminder left and has not been heard from for this long is forgotten. */
const STALE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;

const reminderValidator = v.object({ fireAt: v.number(), ciphertext: v.string(), iv: v.string() });

function bad(message: string): never {
  throw new ConvexError({ code: "INVALID_PUSH", message });
}

function nextFireAt(reminders: { fireAt: number }[]): number | undefined {
  return reminders.length ? Math.min(...reminders.map((r) => r.fireAt)) : undefined;
}

export const register = mutation({
  args: { deviceId: v.string(), subscription: v.string(), reminders: v.array(reminderValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!DEVICE_ID_RE.test(args.deviceId)) bad("deviceId must be a UUID");
    if (args.subscription.length > MAX_SUBSCRIPTION_LENGTH) bad("subscription too large");
    let endpoint: unknown;
    try {
      endpoint = (JSON.parse(args.subscription) as { endpoint?: unknown }).endpoint;
    } catch {
      bad("subscription is not JSON");
    }
    if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) bad("subscription has no https endpoint");
    if (args.reminders.length > MAX_REMINDERS) bad(`more than ${MAX_REMINDERS} reminders`);
    for (const r of args.reminders) {
      if (r.ciphertext.length > MAX_CIPHERTEXT_LENGTH || r.iv.length > MAX_IV_LENGTH) bad("reminder too large");
      if (!Number.isFinite(r.fireAt)) bad("fireAt must be a number");
    }

    const row = {
      deviceId: args.deviceId,
      subscription: args.subscription,
      reminders: args.reminders,
      nextFireAt: nextFireAt(args.reminders),
      updatedAt: Date.now(),
    };
    const existing = await ctx.db
      .query("pushDevices")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .unique();
    if (existing) await ctx.db.replace(existing._id, row);
    else await ctx.db.insert("pushDevices", row);
    return null;
  },
});

export const unregister = mutation({
  args: { deviceId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushDevices")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

/** Devices with at least one reminder due. Rows without `nextFireAt` sort first in the index, so the range starts at 0. */
export const due = internalQuery({
  args: { now: v.number() },
  returns: v.array(v.object({ _id: v.id("pushDevices"), subscription: v.string(), reminders: v.array(reminderValidator) })),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("pushDevices")
      .withIndex("by_nextFireAt", (q) => q.gte("nextFireAt", 0).lte("nextFireAt", args.now))
      .take(100);
    return rows.map((r) => ({ _id: r._id, subscription: r.subscription, reminders: r.reminders }));
  },
});

/** Devices with nothing left to send that have not re-registered in a long time. */
export const stale = internalQuery({
  args: { now: v.number() },
  returns: v.array(v.id("pushDevices")),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("pushDevices")
      .withIndex("by_nextFireAt", (q) => q.eq("nextFireAt", undefined))
      .take(100);
    return rows.filter((r) => r.updatedAt < args.now - STALE_AFTER_MS).map((r) => r._id);
  },
});

/** Drops the reminders that were sent and moves `nextFireAt` on. */
export const markSent = internalMutation({
  args: { id: v.id("pushDevices"), sentBefore: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return null;
    const reminders = row.reminders.filter((r) => r.fireAt > args.sentBefore);
    await ctx.db.patch(args.id, { reminders, nextFireAt: nextFireAt(reminders) });
    return null;
  },
});

export const remove = internalMutation({
  args: { id: v.id("pushDevices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await ctx.db.get(args.id)) await ctx.db.delete(args.id);
    return null;
  },
});
