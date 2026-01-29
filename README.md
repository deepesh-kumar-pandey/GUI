# Specialized Dashboard

> **Ultra High-Performance Electron Dashboard interfacing with Security-Hardened C++ Microservices.**

![License](https://img.shields.io/badge/license-ISC-blue.svg)
![Platform](https://img.shields.io/badge/platform-linux-lightgrey.svg)
![Stability](https://img.shields.io/badge/status-production--ready-success.svg)

---

## 🛠️ Complete Production Setup (From Scratch)

Follow these steps precisely to deploy the dashboard on a fresh Linux server.

### Step 1: Install System Requirements

Ensure your OS has the necessary compilers, Node.js environment, and network libraries.

```bash
sudo apt-get update
sudo apt-get install -y g++ make libpcap-dev nodejs npm python3
```

### Step 2: Set Up Security & Encryption Keys

The system requires two unique keys for data protection. You **must** generate these before starting.

#### 1. Generate Secure Keys

Run these commands to generate random 32-character hex strings:

```bash
# Generate a key for Gatekeeper flow encryption
openssl rand -hex 16
# Generate a key for DeepGuard log encryption
openssl rand -hex 16
```

#### 2. Create the Configuration File

Create a `.env` file in the `Electron-Dashboard` directory and paste your generated keys:

```bash
cd Electron-Dashboard
cat <<EOF > .env
# Mandatory Security Keys
GATEKEEPER_KEY=your_generated_gatekeeper_key_here
MONITOR_KEY=your_generated_monitor_key_here

# Backend Binary Paths
GATEKEEPER_PATH=../API-project/gatekeeper
DEEPGUARD_PATH=../Health-Monitoring-Service/deepguard
EOF
cd ..
```

### Step 3: Run the Automated Build

The production script compiles the C++ services and sets the required Linux Network Capabilities (`cap_net_raw`) so you don't have to run the app as root.

```bash
chmod +x setup_production.sh
./setup_production.sh
```

### Step 4: Deploy as a Background Service (Optional)

To keep the dashboard running even if you log out, use the provided systemd service:

```bash
# 1. Edit the service file to match your absolute paths
# 2. Copy to systemd
sudo cp dashboard.service /etc/systemd/system/dashboard.service
# 3. Enable and Start
sudo systemctl daemon-reload
sudo systemctl enable dashboard
sudo systemctl start dashboard
```

---

## 🚀 Performance Benchmarks (at Scale)

Verified with **150,000 unique users**.

| Component      | Metric         | Value             |
| :------------- | :------------- | :---------------- |
| **Gatekeeper** | **Throughput** | **280,111 req/s** |
| Gatekeeper     | Avg Latency    | **0.0031 ms**     |
| Gatekeeper     | P95 Latency    | 0.0040 ms         |

---

## 🏗️ Technical Architecture

- **Gatekeeper (C++)**: High-speed request validator using `libpcap` for zero-overhead packet sniffing.
- **DeepGuard (C++)**: Real-time system health monitor with encrypted alerting.
- **Electron (JS)**: Advanced dashboard for visualization and live analytics.

---

## 📡 Verification & Testing

### Live User Tracking

To see the system automatically detect and track unique users:

1. Launch the Dashboard: `cd Electron-Dashboard && npm start`
2. Click **"Start Sniffer"** on port 80.
3. Run the mock traffic generator:
   ```bash
   python3 API-project/live_traffic_demo.py 80
   ```

### Manual Benchmarking

To re-run the 150k user stress test:

```bash
cd Electron-Dashboard
python3 benchmark_suite.py --requests 150000 --users 150000
```

---

## 📄 License

ISC - High Performance, Secure, and Scalable.
