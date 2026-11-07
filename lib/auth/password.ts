import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY = 64 * 1024 * 1024;

function deriveKey(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      KEY_LENGTH,
      { N: n, r, p, maxmem: MAX_MEMORY },
      (error, key) => (error ? reject(error) : resolve(key))
    );
  });
}

/** Returns a human-readable problem, or null when the password is acceptable. */
export function validatePassword(password: string): string | null {
  if (password.length < 12) {
    return "Passwords must be at least 12 characters long.";
  }
  if (password.length > 200) {
    return "Passwords must be 200 characters or fewer.";
  }
  if (!/[A-Za-z]/.test(password)) {
    return "Passwords must include at least one letter.";
  }
  if (!/\d/.test(password)) {
    return "Passwords must include at least one number.";
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  encoded: string
): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (
    !Number.isInteger(n) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    n < 1024 ||
    n > 1048576 ||
    r < 1 ||
    r > 32 ||
    p < 1 ||
    p > 16
  ) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64url");
    expected = Buffer.from(parts[5], "base64url");
  } catch {
    return false;
  }
  if (salt.length < 8 || expected.length !== KEY_LENGTH) return false;

  const actual = await deriveKey(password, salt, n, r, p);
  return timingSafeEqual(actual, expected);
}

/**
 * Runs the same scrypt work as a real verification so that unknown emails do
 * not answer faster than known ones.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  try {
    await deriveKey(password, Buffer.alloc(SALT_LENGTH), SCRYPT_N, SCRYPT_R, SCRYPT_P);
  } catch {
    // the dummy derivation is only a timing counterweight
  }
}
