document.addEventListener('DOMContentLoaded', () => {
    // --- Navigation ---
    function showSection(id) {
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

        document.getElementById(id).classList.add('active');
        // Simple way to highlight correct nav item
        const navItems = document.querySelectorAll('.nav-item');
        if (id === 'gatekeeper') navItems[0].classList.add('active');
        else navItems[1].classList.add('active');
    }

    document.getElementById('nav-gatekeeper').addEventListener('click', () => showSection('gatekeeper'));
    document.getElementById('nav-deepguard').addEventListener('click', () => showSection('deepguard'));

    // --- Gatekeeper Functions ---

    function checkUser() {
        const user = document.getElementById('gk-user-input').value.trim();
        if (!user) {
            alert('Please enter a User ID');
            return;
        }
        window.electronAPI.sendGatekeeperCommand(`check ${user}`).then(res => {
            const term = document.getElementById('terminal-output');
            term.textContent += `> Sent: check ${user}\n`;
            term.scrollTop = term.scrollHeight;
        });
    }

    function checkStatus() {
        const user = document.getElementById('gk-user-input').value.trim();
        if (!user) {
            alert('Please enter a User ID');
            return;
        }
        window.electronAPI.sendGatekeeperCommand(`status ${user}`).then(res => {
            const term = document.getElementById('terminal-output');
            term.textContent += `> Sent: status ${user}\n`;
            term.scrollTop = term.scrollHeight;
        });
    }

    function resetUser() {
        const user = document.getElementById('gk-user-input').value.trim();
        if (!user) {
            alert('Please enter a User ID');
            return;
        }
        window.electronAPI.sendGatekeeperCommand(`clear ${user}`).then(res => {
            const term = document.getElementById('terminal-output');
            term.textContent += `> Sent: clear ${user}\n`;
            term.scrollTop = term.scrollHeight;
        });
    }

    document.getElementById('btn-gk-check').addEventListener('click', checkUser);
    document.getElementById('btn-gk-status').addEventListener('click', checkStatus);
    document.getElementById('btn-gk-reset').addEventListener('click', resetUser);

    window.electronAPI.onGatekeeperOutput((output) => {
        const term = document.getElementById('terminal-output');
        term.textContent += output; // Append
        term.scrollTop = term.scrollHeight; // Auto scroll
    });

    // --- DeepGuard Functions ---

    function startDeepGuard() {
        const cpu = document.getElementById('dg-cpu-input').value.trim();
        const interval = document.getElementById('dg-interval-input').value.trim();

        if (!cpu || !interval) {
            alert('Please enter both CPU Load Threshold and Check Interval');
            return;
        }

        document.getElementById('dg-status-badge').textContent = 'STARTING...';
        window.electronAPI.startDeepGuard({ cpu, interval }).then(res => {
            if (res.startsWith('Error')) {
                document.getElementById('dg-status-badge').className = 'status-badge status-stopped';
                document.getElementById('dg-status-badge').textContent = 'STOPPED';
                document.getElementById('dg-status-text').textContent = res;
            } else {
                document.getElementById('dg-status-badge').className = 'status-badge status-running';
                document.getElementById('dg-status-badge').textContent = 'RUNNING';
                document.getElementById('dg-status-text').textContent = 'Initializing...';
            }
        }).catch(err => {
            document.getElementById('dg-status-badge').className = 'status-badge status-stopped';
            document.getElementById('dg-status-badge').textContent = 'ERROR';
            document.getElementById('dg-status-text').textContent = 'Failed to start: ' + err.message;
        });
    }

    function stopDeepGuard() {
        document.getElementById('dg-status-badge').textContent = 'STOPPING...';
        window.electronAPI.stopDeepGuard().then(res => {
            document.getElementById('dg-status-badge').className = 'status-badge status-stopped';
            document.getElementById('dg-status-badge').textContent = 'STOPPED';
            document.getElementById('dg-status-text').textContent = 'Service stopped.';
        });
    }

    document.getElementById('btn-dg-start').addEventListener('click', startDeepGuard);
    document.getElementById('btn-dg-stop').addEventListener('click', stopDeepGuard);

    window.electronAPI.onDeepGuardStatus((status) => {
        document.getElementById('dg-status-text').textContent = status;
    });

    window.electronAPI.onDeepGuardLog((log) => {
        const logDiv = document.getElementById('log-output');
        logDiv.textContent = log;
        logDiv.scrollTop = logDiv.scrollHeight;
    });
});
