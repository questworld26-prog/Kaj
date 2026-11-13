// [spec: BACKUP-001]
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import fs from "node:fs";

const KEY_LENGTH = 32; // AES-256
const SALT_LENGTH = 16;
const IV_LENGTH = 12; // GCM recommended IV length
const TAG_LENGTH = 16; // GCM auth tag length

// [spec: BACKUP-001]
export function encryptDatabase(
  sourcePath: string,
  destPath: string,
  passphrase: string,
): void {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = scryptSync(passphrase, salt, KEY_LENGTH);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plainData = fs.readFileSync(sourcePath);
  const encrypted = Buffer.concat([cipher.update(plainData), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Layout: [salt(16)][iv(12)][tag(16)][encrypted_data...]
  const payload = Buffer.concat([salt, iv, tag, encrypted]);
  fs.writeFileSync(destPath, payload);
}

// [spec: BACKUP-001]
export function decryptDatabase(
  sourcePath: string,
  destPath: string,
  passphrase: string,
): void {
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
