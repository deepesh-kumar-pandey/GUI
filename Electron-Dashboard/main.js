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
const MONITOR_KEY = process.env.MONITOR_KEY || "SecretKey123";
const DEEPGUARD_LOG = path.resolve(__dirname, 'alerts.log');

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
            contextIsolation: true,
            nodeIntegration: false,
            // Security: Disable webview tag
            webviewTag: false,
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
    });

    gatekeeperProcess.stderr.on('data', (data) => {
        console.error("Gatekeeper stderr:", data.toString());
    });
}

ipcMain.handle('gatekeeper-command', async (event, command) => {
    // Security: Validate input before processing
    if (!validateCommand(command)) {
        console.warn(`Blocked invalid command: ${command}`);
        return "Error: Invalid command format caught by security filter.";
    }

    ensureGatekeeper();
    if (gatekeeperProcess && !gatekeeperProcess.killed) {
        gatekeeperProcess.stdin.write(command + "\n");
        return "Command sent";
    }
    return "Error: Gatekeeper process not available";
});


// --- DeepGuard Logic ---

function xorDecrypt(data, key) {
    let result = "";
    for (let i = 0; i < data.length; i++) {
        result += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
}

ipcMain.handle('deepguard-start', async () => {
    if (deepguardProcess && !deepguardProcess.killed) return "Already running";

    console.log("Spawning DeepGuard at:", DEEPGUARD_PATH);

    if (!fs.existsSync(DEEPGUARD_PATH)) {
        return `Error: Binary not found at ${DEEPGUARD_PATH}`;
    }

    const env = { ...process.env, MONITOR_KEY: MONITOR_KEY };

    deepguardProcess = spawn(DEEPGUARD_PATH, [], {
        cwd: path.dirname(DEEPGUARD_PATH),
        env: env
    });

    setTimeout(() => {
        if (deepguardProcess && !deepguardProcess.killed) deepguardProcess.stdin.write("0.1\n");
    }, 500);
    setTimeout(() => {
        if (deepguardProcess && !deepguardProcess.killed) deepguardProcess.stdin.write(DEEPGUARD_LOG + "\n");
    }, 1000);
    setTimeout(() => {
        if (deepguardProcess && !deepguardProcess.killed) deepguardProcess.stdin.write("3\n");
    }, 1500);

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

function startLogWatcher() {
    if (logWatcher) logWatcher.close();

    if (!fs.existsSync(DEEPGUARD_LOG)) {
        fs.writeFileSync(DEEPGUARD_LOG, '');
    }

    logWatcher = fs.watch(DEEPGUARD_LOG, (eventType, filename) => {
        if (eventType === 'change') {
            fs.readFile(DEEPGUARD_LOG, 'utf8', (err, data) => {
                if (err) return;
                const decrypted = xorDecrypt(data, MONITOR_KEY);
                if (mainWindow) mainWindow.webContents.send('deepguard-log', decrypted);
            });
        }
    });
}
