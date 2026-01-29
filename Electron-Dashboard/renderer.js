document.addEventListener('DOMContentLoaded', () => {
    // --- Navigation ---
    function showSection(tabId) {
        document.querySelectorAll('.view-section, .tab-content').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

        const target = document.getElementById(tabId);
        if (target) target.style.display = 'block';
        
        // Find the nav item that matches this tab
        const navItem = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
        if (navItem) navItem.classList.add('active');
    }

    document.getElementById('nav-gatekeeper').addEventListener('click', () => showSection('gatekeeper-tab'));
    document.getElementById('nav-history').addEventListener('click', () => showSection('history-tab'));
    document.getElementById('nav-deepguard').addEventListener('click', () => showSection('deepguard-tab'));

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

    // --- Auto-Simulation Logic ---
    let simulationTimer = null;
    let requestCounter = 0;

    function toggleSimulation() {
        const btn = document.getElementById('btn-sim-toggle');
        const user = document.getElementById('gk-user-input').value.trim();
        const rate = parseFloat(document.getElementById('sim-rate-input').value.trim());
        const totalReqInput = document.getElementById('sim-total-input').value.trim();
        const totalRequests = totalReqInput ? parseInt(totalReqInput) : Infinity;

        if (simulationTimer) {
            // Stop Simulation
            clearInterval(simulationTimer);
            simulationTimer = null;
            requestCounter = 0;
            btn.textContent = 'Start Auto-Check';
            btn.className = 'btn-success';
            return;
        }

        // Start Simulation
        if (!user) {
            alert('Please enter a User ID first');
            return;
        }

        if (isNaN(rate) || rate <= 0) {
            alert('Please enter a valid rate (requests per second)');
            return;
        }

        if (totalReqInput && (isNaN(totalRequests) || totalRequests <= 0)) {
            alert('Please enter a valid number for total requests');
            return;
        }

        btn.textContent = 'STOP Simulation';
        btn.className = 'btn-danger';
        requestCounter = 0;

        const intervalMs = Math.round(1000 / rate);
        simulationTimer = setInterval(() => {
            const currentUser = document.getElementById('gk-user-input').value.trim();
            if (!currentUser || requestCounter >= totalRequests) {
                toggleSimulation(); // Stop if user ID is cleared or limit reached
                return;
            }
            
            // Send Check
            window.electronAPI.sendGatekeeperCommand(`check ${currentUser}`).then(() => {
                requestCounter++;
                
                // Update button text to show progress if limited
                if (totalRequests !== Infinity) {
                    btn.textContent = `STOP (${requestCounter}/${totalRequests})`;
                }

                // Periodically also check status to keep the UI in sync (every 5 requests)
                if (Math.random() < 0.2) {
                    window.electronAPI.sendGatekeeperCommand(`status ${currentUser}`);
                }
            });
        }, intervalMs);
    }

    document.getElementById('btn-sim-toggle').addEventListener('click', toggleSimulation);
    
    // --- Sniffer Logic ---
    let sniffActive = false;
    function toggleSniff() {
        const btn = document.getElementById('btn-sniff-toggle');
        const port = document.getElementById('sniff-port-input').value.trim();
        
        if (sniffActive) {
            // Stopping sniffer is not directly supported via a dedicated CLI command yet, 
            // but we can just clear the UI state or rely on Gatekeeper's process kill.
            // For now, we'll just show it as stopped in UI.
            btn.textContent = 'Start Sniffer';
            btn.className = 'btn-primary';
            sniffActive = false;
            return;
        }

        if (!port || isNaN(port)) {
            alert('Please enter a valid port number');
            return;
        }

        window.electronAPI.sendGatekeeperCommand(`sniff ${port}`).then(res => {
            btn.textContent = 'Sniffing Port ' + port;
            btn.className = 'btn-danger';
            sniffActive = true;
        });
    }

    document.getElementById('btn-sniff-toggle').addEventListener('click', toggleSniff);

    document.getElementById('btn-mock-detect').addEventListener('click', () => {
        const mockOutput = `[AUTO-DETECTED] [ALLOWED] Source: 192.168.1.${Math.floor(Math.random()*254) + 1} | Remaining: 99/100\n`;
        handleGatekeeperOutput(mockOutput);
    });


    function handleGatekeeperOutput(output) {
        if (!output) return;
        const term = document.getElementById('terminal-output');
        term.textContent += output;
        term.scrollTop = term.scrollHeight;

        // --- ANALYTICS PARSING ---
        const analyticsCard = document.getElementById('analytics-card');
        const analyticsList = document.getElementById('analytics-list');
        const throttleBadge = document.getElementById('throttle-badge');

        if (output.includes('[ALLOWED]') || output.includes('[DENIED]')) {
            analyticsCard.style.display = 'block';
            if (analyticsList.innerText.includes('Waiting')) analyticsList.innerHTML = '';
            
            const div = document.createElement('div');
            div.style.padding = '4px 0';
            div.style.borderBottom = '1px solid #333';
            
            if (output.includes('[AUTO-DETECTED]')) {
                div.style.borderLeft = '4px solid #ffbb33';
                div.style.paddingLeft = '8px';
            }

            if (output.includes('[ALLOWED]')) {
                div.style.color = '#00C851';
            } else {
                div.style.color = '#ff4444';
            }

            div.textContent = `[${new Date().toLocaleTimeString()}] ${output.trim()}`;
            analyticsList.prepend(div);

            // Limit list to 50 items for performance during high-traffic demos
            if (analyticsList.children.length > 50) {
                analyticsList.removeChild(analyticsList.lastChild);
            }
        }


        if (output.includes('Global Throttle Multiplier set to')) {
            analyticsCard.style.display = 'block';
            const val = parseFloat(output.split('to ')[1]);
            if (val < 1.0) {
                throttleBadge.style.display = 'inline-block';
                throttleBadge.className = 'status-badge status-stopped';
                throttleBadge.textContent = `THROTTLED (${Math.round(val * 100)}%)`;
            } else {
                throttleBadge.style.display = 'none';
            }
        }
    }

    window.electronAPI.onGatekeeperOutput(handleGatekeeperOutput);


    // --- DeepGuard Functions ---

    function startDeepGuard() {
        const cpu = document.getElementById('dg-cpu-input').value.trim();
        const ram = document.getElementById('dg-ram-input').value.trim();
        const interval = document.getElementById('dg-interval-input').value.trim();
        
        if (!cpu || !ram || !interval) {
            alert('Please enter CPU Load, RAM Threshold and Check Interval');
            return;
        }

        document.getElementById('dg-status-badge').textContent = 'STARTING...';
        window.electronAPI.startDeepGuard({ cpu, ram, interval }).then(res => {
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

    // --- History / Database Functions ---
    async function loadHistory() {
        const alertsList = document.getElementById('history-alerts');
        const gatekeeperList = document.getElementById('history-gatekeeper');

        try {
            // Fetch Alerts
            const alerts = await window.electronAPI.getAlerts();
            alertsList.innerHTML = alerts.length === 0 ? '<div style="color: #888;">No historical alerts found.</div>' : '';
            alerts.forEach(alert => {
                const div = document.createElement('div');
                div.style.padding = '5px 0';
                div.style.borderBottom = '1px solid #333';
                div.style.color = alert.level === 'CRITICAL' ? '#ff4444' : '#ffbb33';
                div.textContent = `[${new Date(alert.timestamp).toLocaleString()}] ${alert.message}`;
                alertsList.appendChild(div);
            });

            // Fetch Gatekeeper Logs
            const logs = await window.electronAPI.getGatekeeperLogs();
            gatekeeperList.innerHTML = logs.length === 0 ? '<div style="color: #888;">No request history found.</div>' : '';
            logs.forEach(log => {
                const div = document.createElement('div');
                div.style.padding = '5px 0';
                div.style.borderBottom = '1px solid #333';
                div.style.color = log.status === 'ALLOWED' ? '#00C851' : '#ff4444';
                div.textContent = `[${new Date(log.timestamp).toLocaleString()}] User: ${log.user_id} | Status: ${log.status} | Remaining: ${log.remaining}`;
                gatekeeperList.appendChild(div);
            });
        } catch (err) {
            console.error("Failed to load history:", err);
            alertsList.innerHTML = '<div style="color: #ff4444;">Error loading history.</div>';
        }
    }

    document.getElementById('btn-refresh-history').addEventListener('click', loadHistory);

    // Refresh history when switching to tab
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (item.getAttribute('data-tab') === 'history-tab') {
                loadHistory();
            }
        });
    });
});
