import "server-only";
import bcrypt from "bcryptjs";

const PIN_PATTERN = /^\d{4}$/;

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

export function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
