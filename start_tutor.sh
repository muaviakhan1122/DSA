#!/bin/bash

# --- AUTOMATED DSA AI TUTOR STARTUP INTERFACE ---

echo "========================================================"
echo "    🚀 STARTING YOUR DSA AI TUTOR PORTAL (SELF-HOSTED)  "
echo "========================================================"

# 1. Check and Start MongoDB Local Service
if ! brew services list | grep -q "mongodb-community.*started"; then
    echo "[System] MongoDB is not running. Starting MongoDB via Homebrew..."
    brew services start mongodb-community
    sleep 2
else
    echo "[System] MongoDB local service is already active."
fi

# 2. Check and Install Ngrok
if ! command -v ngrok &> /dev/null; then
    echo "[System] Ngrok is not installed. Installing via Homebrew..."
    brew install ngrok/ngrok/ngrok
fi

# 3. Ensure Ngrok Auth token is registered
# (Checks if authtoken exists in ngrok's default configuration paths)
if ! grep -q "authtoken" ~/Library/Application\ Support/ngrok/ngrok.yml 2>/dev/null; then
    echo "========================================================"
    echo "🔑 NGROK AUTHENTICATION REQUIRED"
    echo "To get a free public tunnel URL, please:"
    echo "1. Go to https://dashboard.ngrok.com/signup (Sign up for free)"
    echo "2. Copy your Authtoken from your dashboard get-started tab."
    echo "========================================================"
    read -p "Paste your Ngrok Authtoken here: " token
    if [ ! -z "$token" ]; then
        ngrok config add-authtoken "$token"
    else
        echo "[Error] Auth token cannot be empty. Aborting startup."
        exit 1
    fi
fi

# 4. Start Node.js Backend Server in Background
echo "[Server] Launching Node.js backend server..."
npm start > server.log 2>&1 &
NODE_PID=$!

# Trap terminal shutdown (Ctrl+C) to cleanly kill background Node process
cleanup() {
    echo -e "\n[System] Stopping background Node.js server (PID: $NODE_PID)..."
    kill $NODE_PID
    echo "[System] DSA AI Tutor halted successfully."
    exit 0
}
trap cleanup SIGINT SIGTERM

sleep 3
echo "[Server] Backend running locally on port 3000. Logs routed to 'server.log'."

# 5. Launch Public Tunnel
echo "========================================================"
echo "🌍 ESTABLISHING PUBLIC SECURE TUNNEL TO INTERNET..."
echo "Copy the 'Forwarding' URL below (e.g. https://xxxx.ngrok-free.app)."
echo "Share it with your friends or load it on your phone!"
echo "Press Ctrl+C to cleanly stop the server and close the tunnel."
echo "========================================================"

lt --port 3000