#!/usr/bin/env bash
set -e

PLIST_NAME="com.kaj.daemon"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$HOME/.local/share/kaj"
LOG_FILE="$LOG_DIR/daemon.log"
ERR_LOG_FILE="$LOG_DIR/daemon.err.log"
NODE_BIN="$(which node || echo "/opt/homebrew/bin/node")"

mkdir -p "$LOG_DIR"

install_agent() {
  echo "📦 Installing LaunchAgent to ${PLIST_PATH}..."
  mkdir -p "$HOME/Library/LaunchAgents"

  # Stop any running instances first
  stop_daemon 2>/dev/null || true

  cat <<EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_BIN}</string>
        <string>${PROJECT_DIR}/dist/server/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${PROJECT_DIR}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>PORT</key>
        <string>4820</string>
        <key>HOST</key>
        <string>0.0.0.0</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_FILE}</string>
    <key>StandardErrorPath</key>
    <string>${ERR_LOG_FILE}</string>
</dict>
</plist>
EOF

  launchctl load "$PLIST_PATH"
  echo "✅ LaunchAgent installed and loaded! Kaj will now auto-start when your laptop starts."
  sleep 1.5
  check_status
}

uninstall_agent() {
  if [ -f "$PLIST_PATH" ]; then
    echo "🛑 Unloading and removing LaunchAgent..."
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    rm -f "$PLIST_PATH"
    echo "✅ LaunchAgent uninstalled."
  else
    echo "ℹ️ LaunchAgent not installed at ${PLIST_PATH}."
  fi
  stop_daemon 2>/dev/null || true
}

start_daemon() {
  if [ -f "$PLIST_PATH" ]; then
    echo "🚀 Starting Kaj via LaunchAgent..."
    launchctl load "$PLIST_PATH" 2>/dev/null || launchctl start "${PLIST_NAME}" 2>/dev/null || true
  else
    echo "🚀 Starting Kaj in background..."
    # Fallback to direct background execution if plist not installed
    pkill -f "${PROJECT_DIR}/dist/server/index.js" 2>/dev/null || true
    nohup "${NODE_BIN}" "${PROJECT_DIR}/dist/server/index.js" >> "${LOG_FILE}" 2>> "${ERR_LOG_FILE}" &
    PID=$!
    disown "$PID" 2>/dev/null || true
  fi
  sleep 1.5
  check_status
}

stop_daemon() {
  echo "🛑 Stopping Kaj daemon..."
  if [ -f "$PLIST_PATH" ]; then
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
  fi
  pkill -f "${PROJECT_DIR}/dist/server/index.js" 2>/dev/null || true
  pkill -f "dist/server/index.js" 2>/dev/null || true
  sleep 0.5
  echo "✅ Kaj daemon stopped."
}

restart_daemon() {
  echo "🔄 Restarting Kaj daemon..."
  stop_daemon
  start_daemon
}

check_status() {
  echo "🔍 Checking Kaj status..."
  if curl -s http://127.0.0.1:4820/api/health > /dev/null 2>&1; then
    HEALTH=$(curl -s http://127.0.0.1:4820/api/health)
    PID=$(lsof -ti :4820 | head -n 1 || echo "unknown")
    echo "✅ Kaj daemon is RUNNING on port 4820 (PID: ${PID})"
    echo "   Dashboard: http://localhost:4820"
    echo "   MCP URL:   http://localhost:4820/mcp"
    echo "   Health:    ${HEALTH}"
  else
    echo "❌ Kaj daemon is NOT running."
  fi
}

show_logs() {
  echo "📋 Showing live logs from ${LOG_FILE} (Ctrl+C to exit):"
  touch "${LOG_FILE}"
  tail -n 30 -f "${LOG_FILE}"
}

ensure_telegram_config() {
  local cfg="${PROJECT_DIR}/telegram.config.json"
  local ex="${PROJECT_DIR}/telegram.config.example.json"
  if [ ! -f "$cfg" ] && [ -f "$ex" ]; then
    cp "$ex" "$cfg"
  fi
}

toggle_telegram() {
  local state="$1"
  ensure_telegram_config
  local cfg="${PROJECT_DIR}/telegram.config.json"
  "${NODE_BIN}" -e '
    const fs = require("fs");
    const file = process.argv[1];
    const enabled = process.argv[2] === "true";
    let data = {
      enabled: false,
      bot_token: "YOUR_TELEGRAM_BOT_TOKEN",
      allowed_user_ids: [],
      default_status: "triage",
      poll_interval_ms: 2000
    };
    if (fs.existsSync(file)) {
      try { data = { ...data, ...JSON.parse(fs.readFileSync(file, "utf8")) }; } catch {}
    }
    data.enabled = enabled;
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  ' "$cfg" "$state"

  if [ "$state" = "true" ]; then
    echo "✅ Telegram bot feature flag set to ENABLED in telegram.config.json"
  else
    echo "🛑 Telegram bot feature flag set to DISABLED in telegram.config.json"
  fi

  # If daemon is running, notify runtime toggle endpoint or restart
  if curl -s http://127.0.0.1:4820/api/health > /dev/null 2>&1; then
    curl -s -X POST http://127.0.0.1:4820/api/telegram/toggle \
      -H "Content-Type: application/json" \
      -d "{\"enabled\": ${state}}" > /dev/null 2>&1 || restart_daemon
  fi
  telegram_status
}

telegram_status() {
  ensure_telegram_config
  local cfg="${PROJECT_DIR}/telegram.config.json"
  echo "🤖 Telegram Bot Integration Status:"
  "${NODE_BIN}" -e '
    const fs = require("fs");
    const file = process.argv[1];
    if (!fs.existsSync(file)) {
      console.log("   Config File: Not found");
      process.exit(0);
    }
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const hasToken = Boolean(data.bot_token && data.bot_token !== "YOUR_TELEGRAM_BOT_TOKEN");
    console.log("   Config File:      " + file);
    console.log("   Feature Flag:     " + (data.enabled ? "ON (enabled: true)" : "OFF (enabled: false)"));
    console.log("   Bot Token Set:    " + (hasToken ? "Yes (configured)" : "No (edit telegram.config.json)"));
    console.log("   Allowed User IDs: " + (Array.isArray(data.allowed_user_ids) && data.allowed_user_ids.length ? data.allowed_user_ids.join(", ") : "Any (recommend adding your ID)"));
    console.log("   Default Status:   " + (data.default_status || "triage"));
  ' "$cfg"
  if curl -s http://127.0.0.1:4820/api/telegram/status > /dev/null 2>&1; then
    LIVE=$(curl -s http://127.0.0.1:4820/api/telegram/status)
    echo "   Live Daemon:      ${LIVE}"
  fi
}

case "$1" in
  start)
    start_daemon
    ;;
  stop)
    stop_daemon
    ;;
  restart)
    restart_daemon
    ;;
  status)
    check_status
    ;;
  logs)
    show_logs
    ;;
  install)
    install_agent
    ;;
  uninstall)
    uninstall_agent
    ;;
  telegram-on)
    toggle_telegram true
    ;;
  telegram-off)
    toggle_telegram false
    ;;
  telegram-status)
    telegram_status
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs|install|uninstall|telegram-on|telegram-off|telegram-status}"
    echo ""
    echo "Commands:"
    echo "  install          Register LaunchAgent to auto-start on laptop boot"
    echo "  uninstall        Remove LaunchAgent"
    echo "  start            Start the daemon"
    echo "  stop             Stop the daemon"
    echo "  restart          Restart the daemon"
    echo "  status           Check daemon health & PID"
    echo "  logs             Live tail daemon logs"
    echo "  telegram-on      Enable Telegram bot integration flag"
    echo "  telegram-off     Disable Telegram bot integration flag"
    echo "  telegram-status  Show Telegram config & live bot status"
    exit 1
    ;;
esac
