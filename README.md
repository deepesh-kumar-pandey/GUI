# Specialized Dashboard

> **Ultra High-Performance Electron Dashboard interfacing with Security-Hardened C++ Microservices.**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-linux-lightgrey.svg)
![Stability](https://img.shields.io/badge/status-production--ready-success.svg)
![Security](https://img.shields.io/badge/encryption-AES--256--CBC-success.svg)

---

## 🛠️ Complete Production Setup (From Scratch)

Follow these steps precisely to deploy the dashboard on a fresh Linux server.

### Step 1: Install System Requirements

Ensure your OS has the necessary compilers, Node.js environment, and network libraries. We use OpenSSL for high-grade encryption.

```bash
sudo apt-get update
sudo apt-get install -y g++ make libpcap-dev libssl-dev nodejs npm python3
```

### Step 2: Set Up Security & Encryption Keys

XOR encryption has been **removed** and replaced with **Industry-Standard AES-256-CBC** for all data storage and logs.

#### 1. Generate Secure Keys

Run these commands to generate random keys. The system uses SHA-256 to derive a 256-bit AES key from your string for maximum security.

```bash
# Generate a random secure key
openssl rand -hex 32
```

#### 2. Create the Configuration File

Create a `.env` file in the `Electron-Dashboard` directory and paste your generated keys:

```bash
cd Electron-Dashboard
cat <<EOF > .env
# Mandatory AES-256 Security Keys
GATEKEEPER_KEY=your_generated_secure_key_here
MONITOR_KEY=your_generated_secure_key_here

# Backend Binary Paths
GATEKEEPER_PATH=../API-project/gatekeeper
DEEPGUARD_PATH=../Health-Monitoring-Service/deepguard
EOF
cd ..
```

### Step 3: Run the Automated Build

The production script compiles the C++ services with OpenSSL linking and sets the required Linux Network Capabilities (`cap_net_raw`).

```bash
chmod +x setup_production.sh
./setup_production.sh
```

### Step 4: Deploy as a Background Service (Optional)

```bash
# Move the service file to systemd
sudo cp dashboard.service /etc/systemd/system/dashboard.service
sudo systemctl daemon-reload
sudo systemctl enable dashboard
sudo systemctl start dashboard
```

---

## 🏗️ Real-World Project Integration

Monitor **any** real-life project (Express.js, Flask, Nginx) without changing a single line of its code.

### 1. Launch Your Real Project

Run your existing web application on any port (e.g., 8080).

```bash
python3 API-project/real_world_app.py 8080
```

### 2. Configure the Dashboard

1. Open the **Specialized Dashboard**.
2. Go to the **Gatekeeper** tab.
3. Enter `8080` in the Port input.
4. Click **"Start Sniffer"**.

### 3. Generate Real Traffic

Visit `http://localhost:8080` in your browser. The dashboard will instantly track the requests using AES-encrypted data storage.

---

## 🚀 Performance Benchmarks (at Scale)

Verified with **150,000 unique users**.

| Component      | Metric          | Value             |
| :------------- | :-------------- | :---------------- |
| **Gatekeeper** | **Throughput**  | **280,111 req/s** |
| Gatekeeper     | **Avg Latency** | **0.0031 ms**     |
| Gatekeeper     | **Encryption**  | **AES-256-CBC**   |
| **DeepGuard**  | **Encryption**  | **AES-256-CBC**   |

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE.txt](LICENSE.txt) file for details.

Copyright (c) 2026 Deepesh Kumar Pandey.
