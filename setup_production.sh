#!/bin/bash

# --- Production Setup Script for Specialized Dashboard ---
# This script builds the backend services and sets necessary 
# network capabilities for raw packet sniffing.

set -e

echo "🛠️ Starting Production Build..."

# 1. Build Gatekeeper
echo "📦 Building Gatekeeper..."
cd API-project
g++ -I./include src/main.cpp src/Rate_limiter.cpp src/TrafficSniffer.cpp -o gatekeeper -lpcap -lpthread -lssl -lcrypto
echo "✅ Gatekeeper built."


# 2. Build DeepGuard
echo "📦 Building DeepGuard..."
cd ../Health-Monitoring-Service
g++ -I./include src/main.cpp src/Monitor.cpp src/Config.cpp -o deepguard -lpthread -lssl -lcrypto
echo "✅ DeepGuard built."


# 3. Set Network Capabilities
# This allows Gatekeeper to sniff traffic without running the whole app as root.
echo "🔐 Setting Network Capabilities for Gatekeeper..."
cd ../API-project
sudo setcap 'cap_net_raw,cap_net_admin=eip' gatekeeper
echo "✅ Capabilities set."

# 4. Install Dashboard Dependencies
echo "📦 Installing Dashboard Dependencies..."
cd ../Electron-Dashboard
npm install
echo "✅ Dashboard dependencies installed."

echo "===================================================="
echo "🎉 Production setup complete!"
echo "🚀 To run the application:"
echo "   1. Ensure GATEKEEPER_KEY and MONITOR_KEY are set in .env"
echo "   2. cd Electron-Dashboard && npm start"
echo "===================================================="
