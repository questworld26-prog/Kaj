#!/usr/bin/env node
/**
 * Standalone Kaj Backup Decryption Tool
 * Zero external dependencies. Works on any machine with Node.js 18+.
 *
 * Usage:
 *   node scripts/decrypt-backup.js <backup-file.db.enc> [output.db]
 *
 * Passphrase resolution order:
 *   1. Prompt from stdin (interactive)
 *   2. KAJ_BACKUP_KEY environment variable
 *   3. ~/.config/kaj/backup.key file
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createDecipheriv, scryptSync } from "node:crypto";

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function decrypt(sourcePath, destPath, passphrase) {
  const fileBytes = fs.readFileSync(sourcePath);
  const headerLength = SALT_LENGTH + IV_LENGTH + TAG_LENGTH;

  if (fileBytes.length < headerLength) {
    throw new Error("Invalid backup file: header size too small");
  }

  const salt = fileBytes.subarray(0, SALT_LENGTH);
  const iv = fileBytes.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = fileBytes.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + TAG_LENGTH,
  );
  const encrypted = fileBytes.subarray(headerLength);

  const key = scryptSync(passphrase, salt, KEY_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  fs.writeFileSync(destPath, decrypted);
}

async function promptPassphrase() {
  if (process.env.KAJ_BACKUP_KEY) {
    return process.env.KAJ_BACKUP_KEY.trim();
  }

  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (home) {
    const keyFile = path.join(home, ".config", "kaj", "backup.key");
    if (fs.existsSync(keyFile)) {
      return fs.readFileSync(keyFile, "utf-8").trim();
    }
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("Enter backup passphrase: ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    console.log("Usage: node scripts/decrypt-backup.js <backup.db.enc> [output.db]");
    process.exit(1);
  }

  const inputPath = path.resolve(args[0]);
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const outputPath = args[1]
    ? path.resolve(args[1])
    : path.resolve(
        path.dirname(inputPath),
        path.basename(inputPath).replace(/\.enc$/, "").replace(/\.db$/, "") + "-restored.db",
      );

  const passphrase = await promptPassphrase();
  if (!passphrase) {
    console.error("❌ No passphrase provided.");
    process.exit(1);
  }

  try {
    decrypt(inputPath, outputPath, passphrase);
    console.log(`✅ Successfully decrypted database to: ${outputPath}`);
  } catch (err) {
    console.error(`❌ Decryption failed: ${err.message}`);
    process.exit(1);
  }
}

main();
