#!/bin/zsh

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_URL="http://localhost:4173/"
PORT="4173"

cd "$APP_DIR" || exit 1

open_app() {
  open "$APP_URL" >/dev/null 2>&1 || echo "Open this URL in your browser: $APP_URL"
}

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "LLM Daluandou is already running."
  open_app
  exit 0
fi

echo "Starting LLM Daluandou..."
npm start &
SERVER_PID=$!

for _ in {1..30}; do
  if curl -fsS "$APP_URL" >/dev/null 2>&1; then
    echo "LLM Daluandou is ready: $APP_URL"
    open_app
    echo
    echo "Keep this Terminal window open while using LLM Daluandou."
    echo "Press Ctrl-C here to stop the server."
    wait "$SERVER_PID"
    exit $?
  fi
  sleep 1
done

echo "LLM Daluandou did not become ready in time."
echo "Check the messages above for details."
wait "$SERVER_PID"
