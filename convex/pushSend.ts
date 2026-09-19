"use node";
/**
 * Sends the reminders that are due. Runs every 15 minutes (crons.ts). Payloads are the ciphertext
 * the device uploaded; the service worker decrypts them (public/push-sw.js).
 */
import { v } from "convex/values";
import webpush from "web-push";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

export const run = internalAction({
  args: {},
  returns: v.object({ sent: v.number(), removed: v.number() }),
  handler: async (ctx) => {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) throw new Error("VAPID_* env vars are not set");
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const now = Date.now();
    let sent = 0;
    let removed = 0;
    for (const device of await ctx.runQuery(internal.push.due, { now })) {
      let gone = false;
      for (const r of device.reminders) {
        if (r.fireAt > now) continue;
        try {
          await webpush.sendNotification(JSON.parse(device.subscription), JSON.stringify({ ciphertext: r.ciphertext, iv: r.iv }), {
            TTL: 60 * 60,
          });
          sent += 1;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          // The subscription was revoked (app deleted, permission withdrawn): forget the device.
          if (status === 404 || status === 410) {
            gone = true;
            break;
          }
          // ponytail: any other failure drops this reminder; no retry queue until one is missed in practice.
          console.error("push failed", status, e instanceof Error ? e.message : e);
        }
      }
      if (gone) {
        await ctx.runMutation(internal.push.remove, { id: device._id });
        removed += 1;
      } else {
        await ctx.runMutation(internal.push.markSent, { id: device._id, sentBefore: now });
      }
    }
    for (const id of await ctx.runQuery(internal.push.stale, { now })) {
      await ctx.runMutation(internal.push.remove, { id });
      removed += 1;
    }
    return { sent, removed };
  },
});
