# --- Production Setup Script for Specialized Dashboard (Windows) ---
# This script builds the backend services for Windows environments.
# Requirements: 
# 1. MinGW-w64 (g++) installed and in PATH
# 2. Npcap SDK installed (for packet sniffing)
# 3. OpenSSL for Windows installed

Write-Host "🛠️ Starting Windows Production Build..." -ForegroundColor Cyan

# 1. Build Gatekeeper
Write-Host "📦 Building Gatekeeper..." -ForegroundColor Yellow
if (Test-Path "API-project") {
    cd API-project
    # Using wpcap for Npcap/WinPcap and ws2_32 for Winsock
    g++ -I./include src/main.cpp src/Rate_limiter.cpp src/TrafficSniffer.cpp -o gatekeeper.exe -lwpcap -lws2_32 -lssl -lcrypto
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Gatekeeper built." -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to build Gatekeeper. Ensure MinGW and Npcap SDK are configured." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    cd ..
}

# 2. Build DeepGuard
Write-Host "📦 Building DeepGuard..." -ForegroundColor Yellow
if (Test-Path "Health-Monitoring-Service") {
    cd Health-Monitoring-Service
    g++ -I./include src/main.cpp src/Monitor.cpp src/Config.cpp -o deepguard.exe -lws2_32 -lssl -lcrypto
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ DeepGuard built." -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to build DeepGuard." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    cd ..
}

# 3. Install Dashboard Dependencies
Write-Host "📦 Installing Dashboard Dependencies..." -ForegroundColor Yellow
if (Test-Path "Electron-Dashboard") {
    cd Electron-Dashboard
    npm install
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Dashboard dependencies installed." -ForegroundColor Green
    } else {
        Write-Host "❌ npm install failed." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    cd ..
}

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "🎉 Windows Setup complete!" -ForegroundColor Cyan
Write-Host "🚀 To run the application:" -ForegroundColor Cyan
Write-Host "   1. Ensure GATEKEEPER_KEY and MONITOR_KEY are set in .env" -ForegroundColor Cyan
Write-Host "   2. cd Electron-Dashboard; npm start" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
