import { ConvexReactClient } from 'convex/react';

/** Set by `npx convex dev` (in `.env.local`) or by `npx convex deploy` at build time. */
export const convexUrl: string | undefined = import.meta.env.VITE_CONVEX_URL || undefined;

/** Null when the build has no backend: the app then runs local-only and the sync card says so. */
export const convex: ConvexReactClient | null = convexUrl ? new ConvexReactClient(convexUrl) : null;
