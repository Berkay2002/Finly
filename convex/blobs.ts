/**
 * Account-less encrypted blob store.
 *
 * Security model: there is no auth and no users table by design. The client
 * derives an unguessable 64-hex `syncId` from a secret phrase and encrypts the
 * plan client-side (AES-GCM). The `syncId` is a capability: anyone who holds it
 * can overwrite or delete the stored ciphertext, but cannot read the plaintext
 * without the encryption key, which never leaves the client. The server only
 * ever sees the id and the ciphertext.
 *
 * Writes are optimistic-concurrency checked via `version`, and a row may not be
 * rewritten more than once per second. The client debounces its own writes, so
 * the throttle only bites on abuse.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";

const SYNC_ID_RE = /^[0-9a-f]{64}$/;
const MAX_CIPHERTEXT_LENGTH = 900_000;
const MAX_IV_LENGTH = 64;
const MIN_WRITE_INTERVAL_MS = 1000;

function assertSyncId(syncId: string): void {
  if (!SYNC_ID_RE.test(syncId)) {
    throw new ConvexError({
      code: "INVALID_SYNC_ID",
      message: "syncId must be 64 lowercase hex characters",
    });
  }
}

function assertPayloadSize(ciphertext: string, iv: string): void {
  if (ciphertext.length > MAX_CIPHERTEXT_LENGTH) {
    throw new ConvexError({
      code: "TOO_LARGE",
      message: `ciphertext exceeds ${MAX_CIPHERTEXT_LENGTH} characters`,
    });
  }
  if (iv.length > MAX_IV_LENGTH) {
    throw new ConvexError({
      code: "TOO_LARGE",
      message: `iv exceeds ${MAX_IV_LENGTH} characters`,
    });
  }
}

const storedBlobValidator = v.object({
  ciphertext: v.string(),
  iv: v.string(),
  version: v.number(),
  updatedAt: v.number(),
});

export const get = query({
  args: { syncId: v.string() },
  returns: v.union(v.null(), storedBlobValidator),
  handler: async (ctx, args) => {
    assertSyncId(args.syncId);
    const row = await ctx.db
      .query("blobs")
      .withIndex("by_syncId", (q) => q.eq("syncId", args.syncId))
      .unique();
    if (!row) return null;
    return {
      ciphertext: row.ciphertext,
      iv: row.iv,
      version: row.version,
      updatedAt: row.updatedAt,
    };
  },
});

export const put = mutation({
  args: {
    syncId: v.string(),
    ciphertext: v.string(),
    iv: v.string(),
    // The version the client believes is currently stored (0 = never synced).
    version: v.number(),
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      version: v.number(),
      updatedAt: v.number(),
    }),
    v.object({
      ok: v.literal(false),
      reason: v.literal("conflict"),
      current: storedBlobValidator,
    }),
    v.object({
      ok: v.literal(false),
      reason: v.literal("throttled"),
      retryAfterMs: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    assertSyncId(args.syncId);
    assertPayloadSize(args.ciphertext, args.iv);

    const now = Date.now();
    const existing = await ctx.db
      .query("blobs")
      .withIndex("by_syncId", (q) => q.eq("syncId", args.syncId))
      .unique();

    if (!existing) {
      if (args.version !== 0) {
        // Client thinks something is stored, but nothing is (e.g. removed).
        return {
          ok: false as const,
          reason: "conflict" as const,
          current: { ciphertext: "", iv: "", version: 0, updatedAt: 0 },
        };
      }
      await ctx.db.insert("blobs", {
        syncId: args.syncId,
        ciphertext: args.ciphertext,
        iv: args.iv,
        version: 1,
        updatedAt: now,
        size: args.ciphertext.length,
      });
      return { ok: true as const, version: 1, updatedAt: now };
    }

    if (existing.version !== args.version) {
      return {
        ok: false as const,
        reason: "conflict" as const,
        current: {
          ciphertext: existing.ciphertext,
          iv: existing.iv,
          version: existing.version,
          updatedAt: existing.updatedAt,
        },
      };
    }

    const elapsed = now - existing.updatedAt;
    if (elapsed < MIN_WRITE_INTERVAL_MS) {
      return {
        ok: false as const,
        reason: "throttled" as const,
        retryAfterMs: MIN_WRITE_INTERVAL_MS - elapsed,
      };
    }

    const nextVersion = existing.version + 1;
    await ctx.db.replace(existing._id, {
      syncId: args.syncId,
      ciphertext: args.ciphertext,
      iv: args.iv,
      version: nextVersion,
      updatedAt: now,
      size: args.ciphertext.length,
    });
    return { ok: true as const, version: nextVersion, updatedAt: now };
  },
});

export const remove = mutation({
  args: { syncId: v.string() },
  returns: v.object({ ok: v.literal(true), existed: v.boolean() }),
  handler: async (ctx, args) => {
    assertSyncId(args.syncId);
    const existing = await ctx.db
      .query("blobs")
      .withIndex("by_syncId", (q) => q.eq("syncId", args.syncId))
      .unique();
    if (!existing) {
      return { ok: true as const, existed: false };
    }
    await ctx.db.delete(existing._id);
    return { ok: true as const, existed: true };
  },
});
