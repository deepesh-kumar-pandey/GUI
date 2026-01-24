#!/bin/bash

# Path to the compiled gatekeeper executable
# Assumes we are running from the 'Electron-Dashboard' directory
GATEKEEPER_EXEC="../API-project/gatekeeper"

# Validate executable exists
if [ ! -f "$GATEKEEPER_EXEC" ]; then
    echo "Error: Gatekeeper executable not found at $GATEKEEPER_EXEC"
    exit 1
fi

echo "Running Load Test for 150 Users..."

# Start Timer (nanoseconds)
start_time=$(date +%s%N)

# Generate Input and pipe to Gatekeeper
(
    echo "10"     # Max Requests
    echo "60"     # Time Window
    for i in {1..150}; do
        echo "check user_$i"
    done
    echo "exit"
) | "$GATEKEEPER_EXEC" > results.txt

# End Timer
end_time=$(date +%s%N)

# Calculate Duration
duration_ns=$((end_time - start_time))
duration_ms=$((duration_ns / 1000000))

# Average latency per request (150 requests)
# Using awk for floating point calculation
avg_latency=$(awk "BEGIN {print $duration_ms / 150}")

# Count results
ALLOWED_COUNT=$(grep -c "\[ALLOWED\]" results.txt)
DENIED_COUNT=$(grep -c "\[DENIED\]" results.txt)

echo "--------------------------------"
echo "Validating Results..."
echo "Total Users Tested: 150"
echo "Total Time:         ${duration_ms} ms"
echo "Average Latency:    ${avg_latency} ms/req"
echo "Requests Allowed:   $ALLOWED_COUNT"
echo "Requests Denied:    $DENIED_COUNT"

if [ "$ALLOWED_COUNT" -eq 150 ]; then
    echo "✅ SUCCESS: All 150 users were granted access."
else
    echo "⚠️  WARNING: Some requests were denied."
fi
echo "--------------------------------"
