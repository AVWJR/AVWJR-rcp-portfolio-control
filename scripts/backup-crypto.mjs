#!/usr/bin/env node
/**
 * AES-256-GCM for pg_dump bytes.
 * Layout: magic "RCPG" | 16-byte salt | 12-byte iv | 16-byte tag | ciphertext.
 * The key is scrypt(passphrase, salt). A wrong passphrase or a flipped byte fails the tag check.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";

const MAGIC = Buffer.from("RCPG");

function passphrase() {
  const value = (process.env.BACKUP_ENCRYPTION_KEY || "").trim();
  if (!value) {
    console.error("Set BACKUP_ENCRYPTION_KEY.");
    process.exit(1);
  }
  return value;
}

function deriveKey(secret, salt) {
  return scryptSync(secret, salt, 32);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function encrypt(plain, secret) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret, salt), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, salt, iv, tag, body]);
}

function decrypt(blob, secret) {
  if (blob.length < 4 + 16 + 12 + 16 || blob.subarray(0, 4).toString() !== "RCPG") {
    throw new Error("This file is not an RCP encrypted backup (expected RCPG).");
  }
  const salt = blob.subarray(4, 20);
  const iv = blob.subarray(20, 32);
  const tag = blob.subarray(32, 48);
  const body = blob.subarray(48);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret, salt), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

const command = process.argv[2];
const secret = passphrase();

if (command === "encrypt") {
  const plain = await readStdin();
  process.stdout.write(encrypt(plain, secret));
} else if (command === "decrypt") {
  const file = process.argv[3];
  const blob = file ? readFileSync(file) : await readStdin();
  try {
    process.stdout.write(decrypt(blob, secret));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Could not decrypt the backup.");
    process.exit(1);
  }
} else {
  console.error("Usage: backup-crypto.mjs encrypt | decrypt [file]");
  process.exit(1);
}
