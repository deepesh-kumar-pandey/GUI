const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');

let mainWindow;
let gatekeeperProcess;
let deepguardProcess;
let logWatcher;

// --- Configuration ---
// Adjust paths to where the actual binaries are located relative to this file or absolute
const GATEKEEPER_PATH = path.resolve(__dirname, '../API-project/gatekeeper');
const DEEPGUARD_PATH = path.resolve(__dirname, '../Health-Monitoring-Service/deepguard');
const DEEPGUARD_LOG = path.resolve(__dirname, 'alerts.log'); // Log file will be created in app dir

// XOR Key for DeepGuard (Must match what we send to the process)
const MONITOR_KEY = "SecretKey123";

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
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

// We keep Gatekeeper running because it has state (memory map)
// If it crashes or isn't started, we start it.
function ensureGatekeeper() {
    if (!gatekeeperProcess || gatekeeperProcess.killed) {
        console.log("Spawning Gatekeeper at:", GATEKEEPER_PATH);
        gatekeeperProcess = spawn(GATEKEEPER_PATH, [], {
            cwd: path.dirname(GATEKEEPER_PATH)
        });

        startGatekeeperDataListener();

        // Initial config input
        // Based on README: Input Max Requests, then Time Window
        gatekeeperProcess.stdin.write("100\n"); // Max Requests
        gatekeeperProcess.stdin.write("60\n");  // Time Window
    }
}

// Queue to handle command-response mapping? 
// For simplicity, we might assume sequential processing or just parse any output.
// Since it's a CLI, the output is "User: alice...".
// We'll just send the raw output to the renderer for now.

function startGatekeeperDataListener() {
    gatekeeperProcess.stdout.on('data', (data) => {
        const output = data.toString();
        // console.log("Gatekeeper stdout:", output);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('gatekeeper-output', output);
        }
    });

    gatekeeperProcess.stderr.on('data', (data) => {
        console.error("Gatekeeper stderr:", data.toString());
    });
}

ipcMain.handle('gatekeeper-command', async (event, command) => {
    ensureGatekeeper();
    // command ex: "check alice" or "status alice"
    gatekeeperProcess.stdin.write(command + "\n");
    return "Command sent";
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

    // Check if binary exists
    if (!fs.existsSync(DEEPGUARD_PATH)) {
        return `Error: Binary not found at ${DEEPGUARD_PATH}`;
    }

    // Set env var as per README
    const env = { ...process.env, MONITOR_KEY: MONITOR_KEY };

    deepguardProcess = spawn(DEEPGUARD_PATH, [], {
        cwd: path.dirname(DEEPGUARD_PATH),
        env: env
    });

    // Handle inputs for DeepGuard
    // Prompts: Threshold, Log File, Interval
    // We wait a bit or just blast the inputs. 
    // Standard input might be buffered, so writing immediately usually works.

    // Input 1: Threshold (e.g., 0.5 for CPU)
    // Input 2: Log file name (absolute path to ensure we can find it)
    // Input 3: Check interval (seconds)

    setTimeout(() => { deepguardProcess.stdin.write("0.1\n"); }, 500); // Low threshold to force alerts
    setTimeout(() => { deepguardProcess.stdin.write(DEEPGUARD_LOG + "\n"); }, 1000);
    setTimeout(() => { deepguardProcess.stdin.write("3\n"); }, 1500);

    deepguardProcess.stdout.on('data', (data) => {
        console.log(`DeepGuard: ${data}`);
        if (mainWindow) mainWindow.webContents.send('deepguard-status', "Running: " + data.toString().slice(0, 50) + "...");
    });

    deepguardProcess.stderr.on('data', (data) => {
        console.error(`DeepGuard Error: ${data}`);
    });

    // Start watching the log file
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

    // Create file if not exists
    if (!fs.existsSync(DEEPGUARD_LOG)) {
        fs.writeFileSync(DEEPGUARD_LOG, '');
    }

    logWatcher = fs.watch(DEEPGUARD_LOG, (eventType, filename) => {
        if (eventType === 'change') {
            fs.readFile(DEEPGUARD_LOG, 'utf8', (err, data) => {
                if (err) return;
                // The file might contain multiple lines.
                // We'll just read the whole thing and decrypt.
                // In a real app we'd tail it.
                // DeepGuard writes binary/encrypted data? 
                // The README says "XOR-Encrypted Logging". 
                // So the file content is essentially just characters.

                const decrypted = xorDecrypt(data, MONITOR_KEY);
                if (mainWindow) mainWindow.webContents.send('deepguard-log', decrypted);
            });
        }
    });
}
