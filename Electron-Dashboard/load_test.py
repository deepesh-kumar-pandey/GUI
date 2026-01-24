import subprocess
import time
import threading

# Path to the Gatekeeper executable
GATEKEEPER_PATH = "../API-project/gatekeeper"

def run_test():
    print("Starting Load Test for 100 Users...")
    
    try:
        # Spawn Gatekeeper process
        # Gatekeeper reads from stdin: MAX_REQUESTS, TIME_WINDOW, then commands
        process = subprocess.Popen(
            [GATEKEEPER_PATH],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd="../API-project"
        )

        # Configure Gatekeeper
        # Max Requests: 10
        # Time Window: 60 seconds
        process.stdin.write("10\n")
        process.stdin.write("60\n")
        process.stdin.flush()

        time.sleep(1) # Wait for startup

        # Simulate 100 users
        results = {"allowed": 0, "denied": 0}
        lock = threading.Lock()

        def test_user(user_id):
            cmd = f"check user_{user_id}\n"
            # Since we are sharing one process stdin, we need to be careful.
            # However, the CLI is sequential. 
            # Ideally we'd spawn a process per user if we wanted PARALLEL access testing,
            # but Gatekeeper is a single process app handling requests.
            # In a real scenario, this might be behind a server. 
            # Here we just pump commands into stdin.
            
            # Note: Writing to stdin from multiple threads is risky for partial writes, 
            # but short strings are usually atomic. We'll use a lock to be safe.
            with lock:
                process.stdin.write(cmd)
                process.stdin.flush()
                # Reading stdout is tricky because we don't know exactly when *our* response comes back 
                # if we have multiple threads writing.
                # For this simple CLI, a single threaded loop for 100 users is safer to verify functionality.
        
        # Sequential Test for 100 different users
        print("Testing 100 unique users sequentially...")
        for i in range(1, 101):
            with lock:
                process.stdin.write(f"check user_{i}\n")
                process.stdin.flush()
                
        # Now we read 100 responses (plus startup text)
        # We'll read line by line
        
        for i in range(100):
            line = process.stdout.readline()
            while "Request allowed" not in line and "Rate limit exceeded" not in line and line:
                # print("Skipping:", line.strip()) # Debug
                line = process.stdout.readline()
            
            if "Request allowed" in line:
                results["allowed"] += 1
            elif "Rate limit exceeded" in line:
                results["denied"] += 1
                
        print(f"\nTest Complete.")
        print(f"Total Users Tested: 100")
        print(f"Allowed Requests: {results['allowed']}")
        print(f"Denied Requests: {results['denied']}")
        
        if results['allowed'] == 100:
            print("SUCCESS: All 100 users were granted access (as expected for fresh users).")
        else:
            print("FAILURE: Some users were denied unexpectedly.")

        # Cleanup
        process.kill()

    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    run_test()
