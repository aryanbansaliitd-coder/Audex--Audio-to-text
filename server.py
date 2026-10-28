#!/usr/bin/env python3
"""
VoiceType Local — Backend Server
Zero-external-dependency local HTTP server connecting the web frontend to whisper.cpp.
Runs 100% locally on your computer with Apple Silicon hardware acceleration.
"""

import http.server
import socketserver
import json
import os
import sys
import tempfile
import subprocess
import time
from urllib.parse import urlparse, parse_qs

# Configuration & Paths
PORT = 8000
HOST = "127.0.0.1"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WHISPER_BIN = os.path.join(BASE_DIR, "whisper.cpp", "build", "bin", "whisper-cli")
MODELS_DIR = os.path.join(BASE_DIR, "whisper.cpp", "models")
TEMP_DIR = os.path.join(BASE_DIR, "temp")

# Ensure temp directory exists for transient audio files
os.makedirs(TEMP_DIR, exist_ok=True)

AVAILABLE_MODELS = {
    "tiny": {
        "name": "Whisper Tiny (Multilingual)",
        "file": "ggml-tiny.bin",
        "size_mb": 75,
        "description": "Fastest inference, ultra-low memory (~390MB RAM). Great for quick notes."
    },
    "base": {
        "name": "Whisper Base (Multilingual)",
        "file": "ggml-base.bin",
        "size_mb": 142,
        "description": "Higher accuracy for Hindi, regional accents, and complex vocab (~500MB RAM)."
    }
}


def get_installed_models():
    """Detect which model files exist on disk."""
    installed = []
    for model_id, info in AVAILABLE_MODELS.items():
        path = os.path.join(MODELS_DIR, info["file"])
        installed.append({
            "id": model_id,
            "name": info["name"],
            "size_mb": info["size_mb"],
            "description": info["description"],
            "installed": os.path.isfile(path),
            "file": info["file"]
        })
    return installed


def transcribe_audio(audio_bytes, model_id="tiny", language="auto"):
    """
    Transcribes audio bytes using the local whisper-cli binary.
    Zero audio is sent outside this computer.
    Audio and text files are deleted immediately after transcription.
    """
    if not os.path.isfile(WHISPER_BIN):
        raise FileNotFoundError(
            f"whisper-cli binary not found at '{WHISPER_BIN}'. Please build whisper.cpp first."
        )

    model_info = AVAILABLE_MODELS.get(model_id, AVAILABLE_MODELS["tiny"])
    model_path = os.path.join(MODELS_DIR, model_info["file"])
    if not os.path.isfile(model_path):
        raise FileNotFoundError(
            f"Model file '{model_info['file']}' is not downloaded. Please download it via the setup script."
        )

    # Create transient temporary files
    temp_wav = tempfile.NamedTemporaryFile(dir=TEMP_DIR, suffix=".wav", delete=False)
    temp_wav_path = temp_wav.name
    temp_out_base = temp_wav_path[:-4] + "_out"
    temp_out_txt = temp_out_base + ".txt"

    try:
        # Write received audio WAV bytes
        temp_wav.write(audio_bytes)
        temp_wav.flush()
        temp_wav.close()

        # Build whisper-cli command
        # -np: no info prints (clean output)
        # -nt: no timestamps
        # -otxt: write clean output text to file
        cmd = [
            WHISPER_BIN,
            "-m", model_path,
            "-f", temp_wav_path,
            "-l", language,
            "--no-timestamps",
            "-otxt",
            "-of", temp_out_base
        ]

        start_time = time.time()
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        duration = round(time.time() - start_time, 2)

        transcribed_text = ""
        if os.path.isfile(temp_out_txt):
            with open(temp_out_txt, "r", encoding="utf-8") as f:
                transcribed_text = f.read().strip()
        else:
            # Fallback to stdout if text file was not produced
            transcribed_text = result.stdout.strip()

        return {
            "success": True,
            "text": transcribed_text,
            "duration_seconds": duration,
            "model_used": model_id,
            "language": language
        }

    finally:
        # Privacy & Cleanup: Permanently remove temporary audio and transcript files immediately
        if os.path.exists(temp_wav_path):
            try:
                os.remove(temp_wav_path)
            except Exception:
                pass
        if os.path.exists(temp_out_txt):
            try:
                os.remove(temp_out_txt)
            except Exception:
                pass


class VoiceTypeRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Custom HTTP handler serving the web UI and handling local transcription APIs."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)

        # API: Status check
        if parsed.path == "/api/status":
            engine_ready = os.path.isfile(WHISPER_BIN)
            models = get_installed_models()
            any_model = any(m["installed"] for m in models)

            response_data = {
                "app": "VoiceType Local",
                "version": "2.0.0",
                "engine": "whisper.cpp (Local C/C++ Inference with Metal GPU)",
                "engine_ready": engine_ready,
                "model_loaded": any_model,
                "models": models,
                "offline_ready": engine_ready and any_model,
                "privacy": "100% Local Inference • Zero external cloud requests"
            }
            self.send_json_response(200, response_data)
            return

        # Serve static files as normal
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)

        # API: Transcribe audio
        if parsed.path == "/api/transcribe":
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                self.send_json_response(400, {"success": False, "error": "No audio data received."})
                return

            # Read audio data from request body
            audio_bytes = self.rfile.read(content_length)

            # Get parameters from headers or query string
            query_params = parse_qs(parsed.query)
            language = self.headers.get("X-Language") or query_params.get("lang", ["auto"])[0]
            model_id = self.headers.get("X-Model") or query_params.get("model", ["tiny"])[0]

            try:
                transcription = transcribe_audio(audio_bytes, model_id=model_id, language=language)
                self.send_json_response(200, transcription)
            except FileNotFoundError as fnf_err:
                self.send_json_response(500, {"success": False, "error": str(fnf_err)})
            except Exception as err:
                self.send_json_response(500, {"success": False, "error": f"Transcription error: {str(err)}"})
            return

        # Unknown endpoint
        self.send_json_response(404, {"error": "Endpoint not found"})

    def send_json_response(self, status_code, data):
        """Helper to return JSON response with CORS headers."""
        payload = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Language, X-Model")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        """Handle preflight CORS requests."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Language, X-Model")
        self.end_headers()

    def log_message(self, format, *args):
        """Clean log output."""
        sys.stderr.write(f"[{time.strftime('%H:%M:%S')}] {args[0]} {args[1]}\n")


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    """Multi-threaded HTTP server allowing concurrent non-blocking requests."""
    allow_reuse_address = True
    daemon_threads = True


def run_server(port=PORT):
    server_address = (HOST, port)
    try:
        httpd = ThreadedHTTPServer(server_address, VoiceTypeRequestHandler)
    except OSError as e:
        if e.errno == 48:  # Address already in use
            alt_port = port + 1
            print(f"Port {port} in use, trying {alt_port}...")
            run_server(alt_port)
            return
        raise

    print("=" * 60)
    print("🎙️  VoiceType Local — Server Started")
    print("=" * 60)
    print(f"• Local URL:        http://localhost:{port}")
    print(f"• Inference Engine: whisper.cpp (Native Apple Silicon Metal)")
    print(f"• Models Directory: {MODELS_DIR}")
    print("• Privacy Mode:     100% Local (No cloud calls, zero telemetry)")
    print("• Offline Ready:    Yes (Works without internet)")
    print("=" * 60)
    print(f"Open http://localhost:{port} in your browser to begin.")
    print("Press Ctrl+C to stop the server.")
    print("=" * 60)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping VoiceType Local server...")
        httpd.server_close()
        sys.exit(0)


if __name__ == "__main__":
    port = PORT
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        port = int(sys.argv[1])
    run_server(port)
