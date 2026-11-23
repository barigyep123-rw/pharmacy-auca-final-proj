import bcrypt from "bcryptjs";

export function hashPassword(password: string) {
  const rounds = process.env.APOTHEKA_PGLITE === "memory" ? 4 : 10;
  return bcrypt.hash(password, rounds);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
