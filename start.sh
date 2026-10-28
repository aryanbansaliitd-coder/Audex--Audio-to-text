#!/bin/bash
# ==============================================================================
# VoiceType Local — Startup Script
# Starts the local Python Whisper backend and opens the web application.
# ==============================================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=========================================================="
echo "🎙️  Starting VoiceType Local (100% Offline AI)"
echo "=========================================================="

WHISPER_BIN="$DIR/whisper.cpp/build/bin/whisper-cli"
TINY_MODEL="$DIR/whisper.cpp/models/ggml-tiny.bin"

# 1. Verify that whisper-cli is compiled
if [ ! -f "$WHISPER_BIN" ]; then
    echo "⚠️  whisper-cli binary not found."
    echo "Compiling whisper.cpp using local cmake..."
    if [ -f "$DIR/.venv/bin/cmake" ]; then
        "$DIR/.venv/bin/cmake" -B "$DIR/whisper.cpp/build" -S "$DIR/whisper.cpp" -DWHISPER_BUILD_EXAMPLES=ON
        "$DIR/.venv/bin/cmake" --build "$DIR/whisper.cpp/build" --config Release -j4
    else
        echo "❌ Error: cmake not found in .venv. Please run setup first."
        exit 1
    fi
fi

# 2. Verify model files
if [ ! -f "$TINY_MODEL" ]; then
    echo "⚠️  Tiny model file missing. Downloading ggml-tiny.bin..."
    bash "$DIR/whisper.cpp/models/download-ggml-model.sh" tiny "$DIR/whisper.cpp/models"
fi

# 3. Open browser after brief delay
(
    sleep 1.2
    if command -v open >/dev/null 2>&1; then
        open "http://localhost:8000"
    fi
) &

# 4. Start the local server
echo "Starting backend server at http://localhost:8000 ..."
python3 "$DIR/server.py" 8000
