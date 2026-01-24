function showSection(id) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    document.getElementById(id).classList.add('active');
    // Simple way to highlight correct nav item
    const navItems = document.querySelectorAll('.nav-item');
    if (id === 'gatekeeper') navItems[0].classList.add('active');
    else navItems[1].classList.add('active');
}

// --- Gatekeeper Functions ---

function checkUser() {
    const user = document.getElementById('gk-user-input').value;
    if (!user) return;
    window.electronAPI.sendGatekeeperCommand(`check ${user}`);
}

function checkStatus() {
    const user = document.getElementById('gk-user-input').value;
    if (!user) return;
    window.electronAPI.sendGatekeeperCommand(`status ${user}`);
}

function resetUser() {
    const user = document.getElementById('gk-user-input').value;
    if (!user) return;
    window.electronAPI.sendGatekeeperCommand(`clear ${user}`); // Assuming 'clear' is the command based on README
}

window.electronAPI.onGatekeeperOutput((output) => {
    const term = document.getElementById('terminal-output');
    term.textContent += output; // Append
    term.scrollTop = term.scrollHeight; // Auto scroll
});

// --- DeepGuard Functions ---

function startDeepGuard() {
    window.electronAPI.startDeepGuard().then(res => {
        document.getElementById('dg-status-badge').className = 'status-badge status-running';
        document.getElementById('dg-status-badge').textContent = 'RUNNING';
        document.getElementById('dg-status-text').textContent = 'Initializing...';
    });
}

function stopDeepGuard() {
    window.electronAPI.stopDeepGuard().then(res => {
        document.getElementById('dg-status-badge').className = 'status-badge status-stopped';
        document.getElementById('dg-status-badge').textContent = 'STOPPED';
        document.getElementById('dg-status-text').textContent = 'Service stopped.';
    });
}

window.electronAPI.onDeepGuardStatus((status) => {
    document.getElementById('dg-status-text').textContent = status;
});

window.electronAPI.onDeepGuardLog((log) => {
    const logDiv = document.getElementById('log-output');
    // Clear and set new content or append? File read sends whole file usually.
    // If our watcher sends the whole file decrypted content:
    logDiv.textContent = log;
    logDiv.scrollTop = logDiv.scrollHeight;
});
