const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

require('dotenv').config();

let mainWindow;
let gatekeeperProcess;
let deepguardProcess;
let logWatcher;

// Helper to handle Windows .exe extension
function getExecutablePath(basePath) {
    if (process.platform === 'win32' && !basePath.toLowerCase().endsWith('.exe')) {
        const exePath = basePath + '.exe';
        if (fs.existsSync(exePath)) return exePath;
    }
    return basePath;
}

const isPackaged = app.isPackaged;
const resourcesPath = isPackaged ? process.resourcesPath : __dirname;

const GATEKEEPER_PATH = getExecutablePath(
    process.env.GATEKEEPER_PATH ? 
    path.resolve(__dirname, process.env.GATEKEEPER_PATH) : 
    (isPackaged ? path.join(resourcesPath, 'bin', 'gatekeeper') : path.resolve(__dirname, '../API-project/gatekeeper'))
);

const DEEPGUARD_PATH = getExecutablePath(
    process.env.DEEPGUARD_PATH ? 
    path.resolve(__dirname, process.env.DEEPGUARD_PATH) : 
    (isPackaged ? path.join(resourcesPath, 'bin', 'deepguard') : path.resolve(__dirname, '../Health-Monitoring-Service/deepguard'))
);

const DEEPGUARD_LOG = path.join(app.getPath('userData'), 'alerts.log');
const dbPath = path.join(app.getPath('userData'), 'audit_trail.sqlite');

const MONITOR_KEY = process.env.MONITOR_KEY;
if (!MONITOR_KEY) {
    console.warn("WARNING: MONITOR_KEY not set in environment variables.");
}

process.env.DB_PATH = dbPath;
const db = require('./database');

// --- Input Validation ---
const VALID_COMMANDS = ['check', 'status', 'clear', 'sniff'];
const MAX_INPUT_LENGTH = 50;
const USER_ID_REGEX = /^[a-zA-Z0-9_\.]+$/; // Allow dot for IPs


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
            enableRemoteModule: false, // Explicitly disable remote module
            allowRunningInsecureContent: false, // Block mixed content
            experimentalFeatures: false, // Disable experimental Chromium features
            webSecurity: true,       // Enforce same-origin policy
            navigateOnDragDrop: false, // Prevent drag-drop navigation attacks
        },
    });

    // Security: Handle navigation
    mainWindow.webContents.on('will-navigate', (event, url) => {
        const parsedUrl = new URL(url);
        if (parsedUrl.origin !== 'file://') {
            console.warn(`Blocked navigation to: ${url}`);
            event.preventDefault();
        }
    });

    // Security: Handle new windows (including middle-click/auxclick)
    // This blocks ALL new window requests from any source including auxclick
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        console.warn(`Blocked window open request to: ${url}`);
        return { action: 'deny' };
    });

    // Security: Block webview attachment attempts
    mainWindow.webContents.on('did-attach-webview', (event, webContents) => {
        console.warn('Blocked webview attachment attempt');
        event.preventDefault();
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

function aesDecrypt(hexData, secret) {
    try {
        if (!hexData || !secret) return "";
        const binaryData = Buffer.from(hexData, 'hex');
        if (binaryData.length < 16) return "";

        const iv = binaryData.slice(0, 16);
        const encrypted = binaryData.slice(16);
        
        const key = crypto.createHash('sha256').update(secret).digest();
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        return decrypted.toString();
    } catch (e) {
        console.error("AES Decryption Error:", e.message);
        return `[Decryption Error: ${e.message}]`;
    }
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
        if (deepguardProcess && !deepguardProcess.killed) {
            deepguardProcess.stdin.write(interval + "\n");
            console.log("DeepGuard configuration sequence complete.");
            startLogWatcher();
        }
    }, 2000);

    deepguardProcess.stdout.on('data', (data) => {
        console.log(`DeepGuard: ${data}`);
        if (mainWindow) mainWindow.webContents.send('deepguard-status', "Running: " + data.toString().slice(0, 50) + "...");
    });

    deepguardProcess.stderr.on('data', (data) => {
        console.error(`DeepGuard Error: ${data}`);
    });

    return "Started";
});

ipcMain.handle('deepguard-stop', async () => {
    if (deepguardProcess) {
        deepguardProcess.kill();
        deepguardProcess = null;
    }
    if (logWatcher) {
        fs.unwatchFile(DEEPGUARD_LOG);
        logWatcher = null;
    }
    return "Stopped";
});

let lastProcessedLineCount = 0;

function startLogWatcher() {
    if (logWatcher) fs.unwatchFile(DEEPGUARD_LOG);
    logWatcher = true; // Use true just to mark as active
    lastProcessedLineCount = 0;

    // Use watchFile (polling) instead of watch for better reliability on some Linux/Docker setups
    fs.watchFile(DEEPGUARD_LOG, { interval: 1000 }, (curr, prev) => {
        if (curr.mtime > prev.mtime) {
            fs.readFile(DEEPGUARD_LOG, 'utf8', (err, data) => {
                if (err) return;
                
                // Split lines and filter out empty ones to be precise
                const lines = data.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                let decryptedContent = "";
                
                lines.forEach((line, index) => {
                    const decryptedLine = aesDecrypt(line, MONITOR_KEY);
                    decryptedContent += decryptedLine + "\n";
                    
                    if (index >= lastProcessedLineCount) {
                        if (decryptedLine.includes("CRITICAL") || decryptedLine.includes("WARNING")) {
                            showNotification("DeepGuard Alert", decryptedLine);
                            
                            const level = decryptedLine.includes("CRITICAL") ? "CRITICAL" : "WARNING";
                            db.logAlert(level, decryptedLine);

                            if (decryptedLine.includes("Load") || decryptedLine.includes("RAM")) {
                                console.log("Adaptive Throttling: Reducing Gatekeeper capacity to 20%");
                                sendGatekeeperCmd("throttle 0.2");
                            }
                        }
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
