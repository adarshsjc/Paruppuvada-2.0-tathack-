import os
import sys
import time
import socket
import urllib.request
import json
import subprocess
import webbrowser
import tkinter as tk
from tkinter import messagebox

# Hide root tkinter window
root = tk.Tk()
root.withdraw()

def show_error(title, message):
    messagebox.showerror(title, message)
    sys.exit(1)

def show_info(title, message):
    try:
        log_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "launcher_log.txt")
        if getattr(sys, 'frozen', False):
            log_path = os.path.join(os.path.dirname(sys.executable), "launcher_log.txt")
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] [{title}] {message}\n")
    except Exception:
        pass

def is_port_in_use(port):
    for host in ('127.0.0.1', 'localhost'):
        try:
            with socket.create_connection((host, port), timeout=0.8):
                return True
        except Exception:
            pass
    return False

def wait_for_port(port, timeout=30):
    start = time.time()
    while time.time() - start < timeout:
        if is_port_in_use(port):
            return True
        time.sleep(0.5)
    return False

def check_ollama():
    try:
        req = urllib.request.Request("http://127.0.0.1:11434/api/tags")
        with urllib.request.urlopen(req, timeout=3) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                models = [m.get("name") for m in data.get("models", [])]
                return True, models
    except Exception:
        pass
    return False, []

def main():
    # 1. Locate project directories
    base_dir = os.path.dirname(os.path.abspath(__file__))
    if getattr(sys, 'frozen', False):
        base_dir = os.path.dirname(sys.executable)
    else:
        # If running from launcher/ folder, point to parent
        if os.path.basename(base_dir).lower() == "launcher":
            base_dir = os.path.dirname(base_dir)
        
    backend_dir = os.path.join(base_dir, "backend")
    frontend_dir = os.path.join(base_dir, "frontend")
    
    if not os.path.exists(backend_dir) or not os.path.exists(frontend_dir):
        show_error("Project Not Found", f"Could not find backend or frontend folders in:\n{base_dir}")
        
    # 2 & 3. Check Ollama API
    ollama_ready, models = check_ollama()
    if not ollama_ready:
        show_info("Startup", "Attempting to start Ollama daemon...")
        try:
            subprocess.Popen(["ollama", "serve"], shell=True, creationflags=0x08000000)
            start = time.time()
            while time.time() - start < 15:
                ollama_ready, models = check_ollama()
                if ollama_ready:
                    break
                time.sleep(1)
            
            if not ollama_ready:
                show_error("Ollama Startup Failed", "Ollama is installed but not responding at http://localhost:11434.\nPlease launch Ollama from your Start menu or terminal.")
        except FileNotFoundError:
            show_error("Ollama Missing", "Ollama does not appear to be installed on your PATH.\nPlease install Ollama from https://ollama.com/")
            
    # 4. Check Qwen2.5:3B model
    target_model = "qwen2.5:3b"
    if target_model not in models:
        if not any(m.startswith(target_model) for m in models):
            show_error("Model Missing", f"The required model '{target_model}' is not installed in Ollama.\nPlease open a terminal and run:\nollama pull {target_model}")

    # 5. Start Backend
    backend_port = 8000
    if not is_port_in_use(backend_port):
        show_info("Startup", "Starting FastAPI Backend...")
        venv_python = os.path.join(backend_dir, "venv", "Scripts", "python.exe")
        if not os.path.exists(venv_python):
            show_error("Backend Error", "Python virtual environment not found in backend/venv.\nPlease run setup first.")
        
        # Start uvicorn with explicit host 127.0.0.1
        subprocess.Popen(
            [venv_python, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(backend_port)],
            cwd=backend_dir,
            creationflags=0x08000000
        )
        if not wait_for_port(backend_port, timeout=20):
            show_error("Backend Error", f"Backend failed to start on port {backend_port}.")
    else:
        show_info("Startup", "Backend is already running on port 8000.")

    # 6. Start Frontend
    frontend_port = 5173
    if not is_port_in_use(frontend_port):
        show_info("Startup", "Starting React Frontend...")
        cmd = ["npm.cmd", "run", "dev", "--", "--host", "127.0.0.1", "--port", str(frontend_port), "--strictPort"]
        try:
            subprocess.Popen(cmd, cwd=frontend_dir, shell=True, creationflags=0x08000000)
            if not wait_for_port(frontend_port, timeout=25):
                show_error("Frontend Error", f"Frontend failed to start on port {frontend_port}.")
        except Exception as e:
            show_error("NPM Error", f"Failed to start frontend process:\n{e}\nPlease ensure Node.js is installed.")
    else:
        show_info("Startup", "Frontend is already running on port 5173.")
        
    # 7. Open Browser
    webbrowser.open(f"http://localhost:{frontend_port}")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        err_msg = traceback.format_exc()
        show_error("Fatal Error", f"An unexpected error occurred:\n\n{err_msg}")
