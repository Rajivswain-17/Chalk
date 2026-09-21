import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { videos, type NewVideo, type Video } from "./schema/videos";
import {
  generationJobs,
  type GenerationJob,
  type NewGenerationJob,
} from "./schema/jobs";
import {
  oauthAccounts,
  refreshTokens,
  users,
  type NewUser,
  type OAuthAccount,
  type RefreshToken,
  type User,
} from "./schema/users";

/** Atomically create the video intent and its queue-tracking row. */
export async function createVideoAndJob(
  videoData: NewVideo,
): Promise<{ video: Video; job: GenerationJob }> {
  return db.transaction(async (tx) => {
    const [video] = await tx.insert(videos).values(videoData).returning();
    const jobId = randomUUID();
    const [job] = await tx
      .insert(generationJobs)
      .values({
        id: jobId,
        videoId: video.id,
        bullmqJobId: jobId,
        status: "queued",
      })
      .returning();
    return { video, job };
  });
}

export async function createVideo(data: NewVideo): Promise<Video> {
  const [row] = await db.insert(videos).values(data).returning();
  return row;
}

export async function updateVideo(
  id: string,
  data: Partial<Omit<Video, "id" | "createdAt" | "updatedAt">>,
): Promise<void> {
  await db
    .update(videos)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(videos.id, id));
}

export async function getVideo(id: string): Promise<Video | null> {
  const [row] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  return row ?? null;
}

export async function createJob(data: NewGenerationJob): Promise<GenerationJob> {
  const [row] = await db.insert(generationJobs).values(data).returning();
  return row;
}

export async function updateJob(
  id: string,
  data: Partial<Omit<GenerationJob, "id" | "videoId" | "createdAt" | "updatedAt">>,
): Promise<void> {
  await db
    .update(generationJobs)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(generationJobs.id, id));
}

export async function getJob(videoId: string): Promise<GenerationJob | null> {
  const [row] = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.videoId, videoId))
    .orderBy(desc(generationJobs.createdAt), desc(generationJobs.id))
    .limit(1);
  return row ?? null;
}

export async function getJobById(id: string): Promise<GenerationJob | null> {
  const [row] = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.id, id))
    .limit(1);
  return row ?? null;
}

// --- users ---------------------------------------------------------------

/** Emails are canonicalized lowercase at every boundary (signup/login/OAuth). */
export function canonicalEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createUser(data: NewUser): Promise<User> {
  const [row] = await db.insert(users).values(data).returning();
  return row;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, canonicalEmail(email)))
    .limit(1);
  return row ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

/** Public profile shape for GET /api/auth/me (never leaks passwordHash). */
export function toPublicUser(user: User): {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
} {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

// --- oauth_accounts -------------------------------------------------------

export async function getOAuthAccount(
  provider: string,
  providerUserId: string,
): Promise<OAuthAccount | null> {
  const [row] = await db
    .select()
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, provider),
        eq(oauthAccounts.providerUserId, providerUserId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Link a provider identity; unique index rejects double-linking (409 path). */
export async function linkOAuthAccount(data: {
  userId: string;
  provider: string;
  providerUserId: string;
  email: string | null;
}): Promise<OAuthAccount> {
  const [row] = await db.insert(oauthAccounts).values(data).returning();
  return row;
}

// --- refresh_tokens (rotation family) -------------------------------------

export async function createRefreshToken(data: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<RefreshToken> {
  const [row] = await db.insert(refreshTokens).values(data).returning();
  return row;
}

export async function getRefreshToken(
  tokenHash: string,
): Promise<RefreshToken | null> {
  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

/** Revoke one token (rotation parent or single logout). */
export async function revokeRefreshToken(id: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, id));
}

/** Revoke every live token for a user (reuse detected = theft → logout all). */
export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.userId, userId));
}
