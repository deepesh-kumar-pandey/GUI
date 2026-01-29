const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
require('dotenv').config();

let mainWindow;
let gatekeeperProcess;
let deepguardProcess;
let logWatcher;

// --- Configuration ---
// Securely loaded from environment variables
const GATEKEEPER_PATH = process.env.GATEKEEPER_PATH ? path.resolve(__dirname, process.env.GATEKEEPER_PATH) : path.resolve(__dirname, '../API-project/gatekeeper');
const DEEPGUARD_PATH = process.env.DEEPGUARD_PATH ? path.resolve(__dirname, process.env.DEEPGUARD_PATH) : path.resolve(__dirname, '../Health-Monitoring-Service/deepguard');
const MONITOR_KEY = process.env.MONITOR_KEY;
if (!MONITOR_KEY) {
    console.warn("WARNING: MONITOR_KEY not set in environment variables.");
}
const db = require('./database');

const DEEPGUARD_LOG = path.join(__dirname, 'alerts.log');

// --- Input Validation ---
const VALID_COMMANDS = ['check', 'status', 'clear'];
const MAX_INPUT_LENGTH = 50;
const USER_ID_REGEX = /^[a-zA-Z0-9_]+$/;

function validateCommand(command) {
    if (!command || typeof command !== 'string') return false;
    if (command.length > MAX_INPUT_LENGTH) return false;

    const parts = command.trim().split(' ');
    if (parts.length !== 2) return false;

    const [cmd, user] = parts;
    if (!VALID_COMMANDS.includes(cmd)) return false;
    if (!USER_ID_REGEX.test(user)) return false;

    return true;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,  // Isolates your preload script context
            nodeIntegration: false,  // Prevents web pages from using Node.js
            sandbox: true,           // Runs the window in a restricted mode
            webviewTag: false,       // Disable webview tag for security
        },
    });

    // Security: Handle permissions
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        // Deny all permissions by default
        return callback(false);
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
    // Cleanup processes
    if (gatekeeperProcess) gatekeeperProcess.kill();
    if (deepguardProcess) deepguardProcess.kill();
    if (logWatcher) logWatcher.close();
});

// --- Gatekeeper Logic ---

function ensureGatekeeper() {
    if (!gatekeeperProcess || gatekeeperProcess.killed) {
        console.log("Spawning Gatekeeper at:", GATEKEEPER_PATH);
        if (!fs.existsSync(GATEKEEPER_PATH)) {
            console.error("Gatekeeper executable not found!");
            return;
        }

        gatekeeperProcess = spawn(GATEKEEPER_PATH, [], {
            cwd: path.dirname(GATEKEEPER_PATH)
        });

        startGatekeeperDataListener();

        // Initial config input
        gatekeeperProcess.stdin.write("100\n"); // Max Requests
        gatekeeperProcess.stdin.write("60\n");  // Time Window
    }
}

function startGatekeeperDataListener() {
    gatekeeperProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('gatekeeper-output', output);
        }

        // --- DB LOGGING FOR GATEKEEPER ---
        if (output.includes('[ALLOWED]') || output.includes('[DENIED]')) {
            try {
                // Parsing logic: "[ALLOWED] Request logged for user1 | Remaining: 9/10"
                const status = output.includes('[ALLOWED]') ? 'ALLOWED' : 'DENIED';
                const userMatch = output.match(/for\s+([^\s|]+)/);
                const remainingMatch = output.match(/Remaining:\s+(\d+)/);
                
                if (userMatch) {
                    db.logGatekeeper(
                        userMatch[1], 
                        status, 
                        remainingMatch ? parseInt(remainingMatch[1]) : null
                    );
                }
            } catch (e) {
                console.error("Failed to log gatekeeper to DB:", e);
            }
        }
    });

    gatekeeperProcess.stderr.on('data', (data) => {
        console.error("Gatekeeper stderr:", data.toString());
    });
}

function sendGatekeeperCmd(command) {
    try {
        ensureGatekeeper();
        if (gatekeeperProcess && !gatekeeperProcess.killed) {
            gatekeeperProcess.stdin.write(command + "\n");
            return true;
        }
    } catch (err) {
        console.error("Gatekeeper error:", err);
    }
    return false;
}

// --- IPC Handlers for Database ---
ipcMain.handle('get-alerts', async () => {
    return await db.getAlerts();
});

ipcMain.handle('get-gatekeeper-logs', async () => {
    return await db.getGatekeeperLogs();
});

ipcMain.handle('gatekeeper-command', async (event, command) => {
    // Security: Validate input before processing
    if (!validateCommand(command)) {
        const errorMsg = `Error: Invalid command format "${command}". Use <cmd> <user>.`;
        console.warn(errorMsg);
        return errorMsg;
    }

    if (sendGatekeeperCmd(command)) {
        return "Command sent";
    }
    return "Error: Gatekeeper process not available";
});


// --- DeepGuard Logic ---

function xorDecrypt(data, key) {
    let result = "";
    for (let i = 0; i < data.length; i++) {
        // Handle potential undefined if data is shorter than expected
        const charCode = data.charCodeAt(i);
        if (isNaN(charCode)) continue;
        result += String.fromCharCode(charCode ^ key.charCodeAt(i % key.length));
    }
    return result;
}

function showNotification(title, message) {
    const { Notification } = require('electron');
    if (Notification.isSupported()) {
        const notif = new Notification({
            title: title,
            body: message,
            silent: false
        });
        notif.show();
    }
}

ipcMain.handle('deepguard-start', async (event, config) => {
    if (deepguardProcess && !deepguardProcess.killed) return "Already running";

    console.log("Spawning DeepGuard at:", DEEPGUARD_PATH);

    if (!fs.existsSync(DEEPGUARD_PATH)) {
        return `Error: Binary not found at ${DEEPGUARD_PATH}`;
    }

    const { cpu, ram, interval } = config || { cpu: "0.5", ram: "80.0", interval: "5" };
    const env = { ...process.env, MONITOR_KEY: MONITOR_KEY };

    deepguardProcess = spawn(DEEPGUARD_PATH, [], {
        cwd: path.dirname(DEEPGUARD_PATH),
        env: env
    });

    setTimeout(() => {
        if (deepguardProcess && !deepguardProcess.killed) deepguardProcess.stdin.write(cpu + "\n");
    }, 500);
    setTimeout(() => {
        if (deepguardProcess && !deepguardProcess.killed) deepguardProcess.stdin.write(ram + "\n");
    }, 1000);
    setTimeout(() => {
        if (deepguardProcess && !deepguardProcess.killed) deepguardProcess.stdin.write(DEEPGUARD_LOG + "\n");
    }, 1500);
    setTimeout(() => {
        if (deepguardProcess && !deepguardProcess.killed) deepguardProcess.stdin.write(interval + "\n");
    }, 2000);

    deepguardProcess.stdout.on('data', (data) => {
        console.log(`DeepGuard: ${data}`);
        if (mainWindow) mainWindow.webContents.send('deepguard-status', "Running: " + data.toString().slice(0, 50) + "...");
    });

    deepguardProcess.stderr.on('data', (data) => {
        console.error(`DeepGuard Error: ${data}`);
    });

    startLogWatcher();

    return "Started";
});

ipcMain.handle('deepguard-stop', async () => {
    if (deepguardProcess) {
        deepguardProcess.kill();
        deepguardProcess = null;
    }
    if (logWatcher) {
        logWatcher.close();
        logWatcher = null;
    }
    return "Stopped";
});

let lastProcessedLineCount = 0;

function startLogWatcher() {
    if (logWatcher) logWatcher.close();
    lastProcessedLineCount = 0;

    if (!fs.existsSync(DEEPGUARD_LOG)) {
        fs.writeFileSync(DEEPGUARD_LOG, '');
    }

    logWatcher = fs.watch(DEEPGUARD_LOG, (eventType, filename) => {
        if (eventType === 'change') {
            fs.readFile(DEEPGUARD_LOG, 'utf8', (err, data) => {
                if (err) return;
                
                // C++ appends encrypted lines separated by raw \n
                const lines = data.split('\n');
                let decryptedContent = "";
                
                lines.forEach((line, index) => {
                    if (line.trim().length === 0) return;
                    
                    const decryptedLine = xorDecrypt(line, MONITOR_KEY);
                    decryptedContent += decryptedLine + "\n";
                    
                    // Only notify for NEW lines that contain CRITICAL or WARNING
                    if (index >= lastProcessedLineCount) {
                        if (decryptedLine.includes("CRITICAL") || decryptedLine.includes("WARNING")) {
                            showNotification("DeepGuard Alert", decryptedLine);
                            
                            // --- DB LOGGING FOR ALERTS ---
                            const level = decryptedLine.includes("CRITICAL") ? "CRITICAL" : "WARNING";
                            db.logAlert(level, decryptedLine);

                            // --- ADAPTIVE THROTTLING ---
                            // If load/RAM is critical, throttle Gatekeeper to 20% capacity
                            if (decryptedLine.includes("Load") || decryptedLine.includes("RAM")) {
                                console.log("Adaptive Throttling: Reducing Gatekeeper capacity to 20%");
                                sendGatekeeperCmd("throttle 0.2");
                            }
                        }
                        // Recovery logic (simple check for "System OK")
                        if (decryptedLine.includes("System OK")) {
                            sendGatekeeperCmd("throttle 1.0");
                        }
                    }
                });
                
                lastProcessedLineCount = lines.length;
                if (mainWindow) mainWindow.webContents.send('deepguard-log', decryptedContent);
            });
        }
    });
}
