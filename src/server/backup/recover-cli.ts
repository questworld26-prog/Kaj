#!/usr/bin/env node
// [spec: BACKUP-002]
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadEnvFromRoot, resolveDatabasePath } from "../db.js";
import { resolveBackupPassphrase } from "./service.js";
import { listAvailableBackups, recoverDatabase } from "./recover.js";

interface CliArgs {
  file?: string;
  target?: string;
  verifyOnly: boolean;
  yes: boolean;
  help: boolean;
}

function parseCliArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = { verifyOnly: false, yes: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--verify-only") {
      parsed.verifyOnly = true;
    } else if (arg === "--yes" || arg === "-y") {
      parsed.yes = true;
    } else if (arg === "--file" && argv[i + 1]) {
      parsed.file = argv[++i];
    } else if (arg === "--target" && argv[i + 1]) {
      parsed.target = argv[++i];
    } else if (!arg.startsWith("-") && !parsed.file) {
      parsed.file = arg;
    }
  }
  return parsed;
}

function printHelp(): void {
  console.log(`
Kaj (কাজ) Encrypted Database Recovery CLI

Usage:
  npm run recover -- [options]

Options:
  --file <path>     Path to encrypted .db.enc backup file (defaults to interactive picker from KAJ_BACKUP_DIR)
  --target <path>   Override target SQLite database path (defaults to KAJ_DB_PATH from .env)
  --verify-only     Decrypt and validate integrity & schema in staging without modifying the live database
  --yes, -y         Skip confirmation prompts (uses newest backup if --file is omitted)
  --help, -h        Show this help message
`);
}

function promptQuestion(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function isDaemonRunning(): boolean {
  try {
    execFileSync("pgrep", ["-f", "dist/server/index.js"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function runDaemonControl(action: "start" | "stop"): void {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const scriptPath = path.resolve(dirname, "../../../scripts/daemon-ctl.sh");
  if (!fs.existsSync(scriptPath)) return;
  execFileSync("bash", [scriptPath, action], { stdio: "inherit" });
}

async function resolveBackupFileInteractively(args: CliArgs): Promise<string | null> {
  if (args.file) return args.file;

  const backups = listAvailableBackups();
  if (backups.length === 0) {
    console.error(
      "❌ No backups found in KAJ_BACKUP_DIR. Pass --file <path/to/kaj-backup-DD-MM-YYYY.db.enc> explicitly or configure KAJ_BACKUP_DIR in .env.",
    );
    return null;
  }

  if (args.yes) {
    return backups[0].path;
  }

  console.log("\nAvailable encrypted backups in KAJ_BACKUP_DIR:");
  backups.forEach((b, idx) => {
    console.log(`  [${idx + 1}] ${b.filename}`);
  });

  const choice = await promptQuestion(`\nSelect backup to restore [1]: `);
  const index = choice === "" ? 0 : parseInt(choice, 10) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= backups.length) {
    console.error("❌ Invalid selection.");
    return null;
  }
  return backups[index].path;
}

async function main(): Promise<void> {
  loadEnvFromRoot();
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const targetDbPath = resolveDatabasePath(args.target);
  const backupFilePath = await resolveBackupFileInteractively(args);
  if (!backupFilePath) {
    process.exit(1);
  }

  let passphrase = resolveBackupPassphrase();
  if (!passphrase) {
    passphrase = await promptQuestion("Enter backup decryption passphrase: ");
    if (!passphrase) {
      console.error("❌ No passphrase provided.");
      process.exit(1);
    }
  }

  console.log("\n🔍 Step 1: Decrypting and validating backup in isolated staging...");
  const check = recoverDatabase({
    backupFilePath,
    targetDbPath,
    passphrase,
    verifyOnly: true,
  });

  if (!check.success) {
    console.error(`❌ Pre-flight validation failed: ${check.error}`);
    process.exit(1);
  }

  console.log(`   ✅ Authentication & SQLite integrity verified.`);
  console.log(`   📊 Contents: ${check.taskCount} task(s), ${check.projectCount} project(s)`);
  console.log(
    `   🧬 Schema: Backup v${check.backupSchemaVersion} → App v${check.appSchemaVersion}${
      check.migrated ? " (auto-migrated cleanly in staging)" : " (compatible)"
    }`,
  );

  if (args.verifyOnly) {
    console.log("\n✅ Dry-run verification passed. Target database was not modified.");
    process.exit(0);
  }

  console.log(`\n   Source: ${check.backupFilePath}`);
  console.log(`   Target: ${check.targetDbPath}`);

  if (!args.yes) {
    const confirm = await promptQuestion(
      "\nProceed with atomic database restore? (A .pre-restore-*.bak snapshot will be saved) [y/N]: ",
    );
    if (!/^y(es)?$/i.test(confirm)) {
      console.log("🚫 Recovery cancelled by user. Live database untouched.");
      process.exit(0);
    }
  }

  const daemonWasRunning = isDaemonRunning();
  if (daemonWasRunning) {
    console.log("\n🛑 Step 2: Stopping running Kaj daemon cleanly before WAL swap...");
    runDaemonControl("stop");
  }

  let result;
  try {
    console.log("♻️ Step 3: Snapshotting existing DB, clearing WAL sidecars, and restoring...");
    result = recoverDatabase({
      backupFilePath,
      targetDbPath,
      passphrase,
      verifyOnly: false,
    });
  } finally {
    if (daemonWasRunning) {
      console.log("\n🚀 Step 4: Restarting Kaj daemon...");
      runDaemonControl("start");
    }
  }

  if (!result.success) {
    console.error(`❌ Recovery failed: ${result.error}`);
    process.exit(1);
  }

  console.log("\n✅ Database recovery complete!");
  console.log(`   Active DB:   ${result.targetDbPath}`);
  if (result.preRestoreBackupPath) {
    console.log(`   Rollback DB: ${result.preRestoreBackupPath}`);
  }
}

main().catch((err) => {
  console.error("❌ Unexpected recovery error:", err);
  process.exit(1);
});
