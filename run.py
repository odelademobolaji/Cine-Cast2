"""Launcher for the full CineCast stack."""
from __future__ import annotations
import os, signal, socket, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
BACKEND_HOST = "localhost"
BACKEND_PORT = 8030
FRONTEND_PORT = 3002

def port_is_free(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.25)
        return sock.connect_ex((host, port)) != 0

def next_free_port(preferred_port: int, host: str = "127.0.0.1") -> int:
    port = preferred_port
    while not port_is_free(port, host):
        port += 1
    return port

def check_prereqs() -> None:
    try:
        import fastapi, uvicorn, httpx, yaml
    except ImportError as e:
        print(f"Missing Python dependency: {e.name}")
        print(f" Run: pip install -r {BACKEND / 'requirements.txt'}")
        sys.exit(1)
    try:
        subprocess.run(["node", "--version"], check=True, capture_output=True, text=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("Node.js not found. Install LTS from https://nodejs.org/")
        sys.exit(1)
    if not (FRONTEND / "node_modules").exists():
        print("Installing frontend dependencies...")
        npm = "npm.cmd" if os.name == "nt" else "npm"
        if subprocess.run([npm, "install"], cwd=FRONTEND).returncode != 0:
            print("npm install failed.")
            sys.exit(1)

def main() -> None:
    check_prereqs()
    backend_port = next_free_port(BACKEND_PORT)
    frontend_port = next_free_port(FRONTEND_PORT)
    backend_url = f"http://{BACKEND_HOST}:{backend_port}"
    frontend_url = f"http://localhost:{frontend_port}"

    print("Starting CineCast...")
    if backend_port != BACKEND_PORT:
        print(f" Backend port {BACKEND_PORT} is busy; using {backend_port}.")
    if frontend_port != FRONTEND_PORT:
        print(f" Frontend port {FRONTEND_PORT} is busy; using {frontend_port}.")
    print(f" Backend: {backend_url}")
    print(f" Frontend: {frontend_url}")
    print(f" Config: {ROOT / 'config.yaml'}")
    print(" Press Ctrl+C to stop both\n")
    backend_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--reload", "--port", str(backend_port)],
        cwd=BACKEND, env={**os.environ, "PYTHONUNBUFFERED": "1"})
    time.sleep(1.5)
    npm = "npm.cmd" if os.name == "nt" else "npm"
    frontend_proc = subprocess.Popen(
        [npm, "run", "dev", "--", "-p", str(frontend_port)], cwd=FRONTEND,
        env={**os.environ, "BACKEND_URL": backend_url, "NEXT_PUBLIC_API_URL": backend_url})
    def shutdown(*_):
        print("\nShutting down...")
        for p in (frontend_proc, backend_proc):
            try: p.terminate()
            except: pass
        for p in (frontend_proc, backend_proc):
            try: p.wait(timeout=5)
            except subprocess.TimeoutExpired: p.kill()
        sys.exit(0)
    signal.signal(signal.SIGINT, shutdown)
    if hasattr(signal, "SIGTERM"): signal.signal(signal.SIGTERM, shutdown)
    while True:
        if backend_proc.poll() is not None: shutdown()
        if frontend_proc.poll() is not None: shutdown()
        time.sleep(0.5)

if __name__ == "__main__": main()
