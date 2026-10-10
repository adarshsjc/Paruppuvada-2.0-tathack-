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
    # We can use a simple print or a non-blocking toast, but for startup we might just log to a file.
    with open("launcher_log.txt", "a") as f:
        f.write(f"[{title}] {message}\n")

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

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
        with urllib.request.urlopen(req, timeout=2) as response:
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
    # If running as PyInstaller EXE, __file__ might be temp, but sys.executable is the .exe
    if getattr(sys, 'frozen', False):
        base_dir = os.path.dirname(sys.executable)
        
    backend_dir = os.path.join(base_dir, "backend")
    frontend_dir = os.path.join(base_dir, "frontend")
    
    if not os.path.exists(backend_dir) or not os.path.exists(frontend_dir):
        show_error("Project Not Found", f"Could not find backend or frontend folders in: {base_dir}")
        
    # 2 & 3. Check Ollama API
    ollama_ready, models = check_ollama()
    if not ollama_ready:
        show_info("Startup", "Starting Ollama...")
        try:
            # CREATE_NO_WINDOW = 0x08000000
            subprocess.Popen(["ollama", "serve"], creationflags=0x08000000)
            # Wait for it to become ready
            start = time.time()
            while time.time() - start < 15:
                ollama_ready, models = check_ollama()
                if ollama_ready:
                    break
                time.sleep(1)
            
            if not ollama_ready:
                show_error("Ollama Startup Failed", "Ollama is installed but failed to start, or is not responding at http://localhost:11434.\nPlease start Ollama manually.")
        except FileNotFoundError:
            show_error("Ollama Missing", "Ollama does not appear to be installed on your PATH.\nPlease install Ollama from https://ollama.com/")
            
    # 4. Check Qwen2.5:3B model
    target_model = "qwen2.5:3b"
    if target_model not in models:
        # Sometimes tags have ':latest' appended if omitted, check prefixes or exact matches
        if not any(m.startswith(target_model) for m in models):
            show_error("Model Missing", f"The required model '{target_model}' is not installed in Ollama.\nPlease open a terminal and run:\nollama run {target_model}")

    # 5. Start Backend
    backend_port = 8000
    if not is_port_in_use(backend_port):
        show_info("Startup", "Starting FastAPI Backend...")
        venv_python = os.path.join(backend_dir, "venv", "Scripts", "python.exe")
        if not os.path.exists(venv_python):
            show_error("Backend Error", "Python virtual environment not found in backend/venv.\nPlease run setup first.")
        
        # Start uvicorn
        subprocess.Popen([venv_python, "-m", "uvicorn", "app.main:app", "--port", str(backend_port)], cwd=backend_dir, creationflags=0x08000000)
        if not wait_for_port(backend_port, timeout=15):
            show_error("Backend Error", f"Backend failed to start on port {backend_port}.")
    else:
        show_info("Startup", "Backend is already running.")

    # 6. Start Frontend
    frontend_port = 5173
    if not is_port_in_use(frontend_port):
        show_info("Startup", "Starting React Frontend...")
        # Check if dist exists for production build
        dist_dir = os.path.join(frontend_dir, "dist")
        if os.path.exists(dist_dir):
            cmd = ["npm.cmd", "run", "preview", "--", "--port", str(frontend_port), "--strictPort"]
        else:
            cmd = ["npm.cmd", "run", "dev", "--", "--port", str(frontend_port), "--strictPort"]
            
        try:
            subprocess.Popen(cmd, cwd=frontend_dir, creationflags=0x08000000)
            if not wait_for_port(frontend_port, timeout=20):
                show_error("Frontend Error", f"Frontend failed to start on port {frontend_port}.")
        except FileNotFoundError:
            show_error("NPM Missing", "Node.js (npm) is not installed or not in PATH.\nPlease install Node.js to run the frontend.")
    else:
        show_info("Startup", "Frontend is already running.")
        
    # 7. Open Browser
    webbrowser.open(f"http://localhost:{frontend_port}")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        err_msg = traceback.format_exc()
        show_error("Fatal Error", f"An unexpected error occurred:\n\n{err_msg}")

