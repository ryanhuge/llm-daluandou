#!/bin/zsh

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_URL="http://localhost:4173/"
PORT="4173"

cd "$APP_DIR" || exit 1

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "LLM 大亂鬥 is already running."
  open "$APP_URL"
  exit 0
fi

echo "Starting LLM 大亂鬥..."
npm start &
SERVER_PID=$!

for _ in {1..30}; do
  if curl -fsS "$APP_URL" >/dev/null 2>&1; then
    echo "LLM 大亂鬥 is ready: $APP_URL"
    open "$APP_URL"
    echo
    echo "Keep this Terminal window open while using LLM 大亂鬥."
    echo "Press Ctrl-C here to stop the server."
    wait "$SERVER_PID"
    exit $?
  fi
  sleep 1
done

echo "LLM 大亂鬥 did not become ready in time."
echo "Check the messages above for details."
wait "$SERVER_PID"
