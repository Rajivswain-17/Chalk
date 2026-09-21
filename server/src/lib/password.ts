// Chalk — password hashing (bcryptjs, pure JS).
// bcryptjs over native bcrypt/argon2 deliberately: zero node-gyp toolchain,
// identical API on Windows dev + Linux Docker. Cost 12 ≈ ~250ms per hash —
// slow enough to blunt brute force, fast enough for login UX.

import bcrypt from "bcryptjs";

const COST = 12;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$/;

/** Hash a plaintext password for users.passwordHash. Throws on empty input. */
export async function hashPassword(password: string): Promise<string> {
  if (!password) throw new Error("password must not be empty");
  return bcrypt.hash(password, COST);
}

/** Compare plaintext against a stored hash. Never throws on mismatch (false). */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  if (!password || !hash || !BCRYPT_HASH_PATTERN.test(hash)) return false;
  return bcrypt.compare(password, hash);
}
