#!/bin/bash
# ==============================================================================
# VoiceType Local — Model Downloader Helper
# Downloads additional official Whisper models for local inference.
# ==============================================================================

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

MODEL="${1:-base}"
MODELS_DIR="$DIR/whisper.cpp/models"

echo "Downloading Whisper model: '$MODEL' into $MODELS_DIR ..."
bash "$DIR/whisper.cpp/models/download-ggml-model.sh" "$MODEL" "$MODELS_DIR"

echo "Done! The model is saved at: $MODELS_DIR/ggml-$MODEL.bin"
