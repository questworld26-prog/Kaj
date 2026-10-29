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
  *)
    echo "Usage: $0 {start|stop|restart|status|logs|install|uninstall}"
    echo ""
    echo "Commands:"
    echo "  install    Register LaunchAgent to auto-start on laptop boot"
    echo "  uninstall  Remove LaunchAgent"
    echo "  start      Start the daemon"
    echo "  stop       Stop the daemon"
    echo "  restart    Restart the daemon"
    echo "  status     Check daemon health & PID"
    echo "  logs       Live tail daemon logs"
    exit 1
    ;;
esac
