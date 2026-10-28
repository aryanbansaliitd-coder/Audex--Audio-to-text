# VoiceType Local 🎙️
### 100% On-Device, Offline AI Speech Recognition for macOS

VoiceType Local converts spoken audio into text using an actual OpenAI Whisper model running locally on your Mac via **`whisper.cpp`** and hardware-accelerated with **Apple Silicon Metal**.

---

## 🔒 Strict Privacy & Offline Architecture

- **No Cloud APIs or External Servers:** Audio never leaves your computer.
- **No Web Speech API:** Does not use Google/Apple cloud speech recognition or browser `webkitSpeechRecognition`.
- **No API Keys or Accounts:** Completely free, open-source, and unrestricted.
- **Immediate Data Deletion:** Transient audio WAV files captured during recording are deleted immediately after the local Whisper engine finishes transcribing.
- **Works Completely Offline:** After initial model download, internet access can be completely disconnected and transcription continues to work flawlessly.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        YOUR COMPUTER (LOCAL ONLY)                     │
│                                                                        │
│  [ Microphone ] ──> Browser AudioContext ──> Standard 16kHz WAV Blob  │
│                                                          │             │
│                                                          ▼             │
│  [ Web UI ]     <── JSON Transcript     <──  Local Python Backend      │
│  (index.html)                                (server.py on localhost) │
│                                                          │             │
│                                                          ▼             │
│                                                  whisper.cpp           │
│                                             (whisper-cli + Metal GPU)  │
│                                                          │             │
│                                                          ▼             │
│                                              ggml-tiny / ggml-base     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Quick Start (One Command)

Open your Terminal inside this folder and run:

```bash
./start.sh
```

This will automatically start the local backend at **`http://localhost:8000`** and open your default browser.

---

## 🚀 Step-by-Step Usage Guide

1. Run `./start.sh` in Terminal.
2. In the browser interface at `http://localhost:8000`:
   - Pick your **AI Model**:
     - **Whisper Tiny (75MB):** Ultra-fast, low memory (~390MB RAM). Great for standard English.
     - **Whisper Base (142MB):** Higher accuracy for Hindi, regional accents, and specialized vocabulary (~500MB RAM).
   - Select your **Language** (Auto Detect, English, हिन्दी - Hindi, Spanish, French, etc.).
3. Click the large blue **"🎙️ Start Recording"** button and speak into your microphone.
4. Click **"⏹️ Stop & Transcribe"** when you are finished speaking.
5. Watch the local Whisper model transcribe your speech on-device in under 1 second!
6. Click **"📋 Copy"** to copy the text to your clipboard, or **"💾 Download .txt"** to save it to your computer.

---

## 🌐 Testing Offline Mode

To verify that VoiceType Local works without internet:
1. Turn off your Wi-Fi or disconnect your ethernet cable.
2. Open `http://localhost:8000` in your browser.
3. Click **"Start Recording"**, speak a sentence in English or Hindi, and click **"Stop & Transcribe"**.
4. The transcription will succeed immediately because both the binary (`whisper-cli`) and the model file (`ggml-tiny.bin` / `ggml-base.bin`) are stored directly on your computer.

---

## 🧠 Model Accuracy & Tradeoffs

| Model | File Size | Memory (RAM) | Speed (M2) | Recommended For |
| :--- | :---: | :---: | :---: | :--- |
| **Whisper Tiny** | 75 MB | ~390 MB | ~0.7s | Quick notes, clear English speech, minimal resource usage. |
| **Whisper Base** | 142 MB | ~500 MB | ~1.4s | Better accuracy for Hindi, accented speech, and technical terms. |

*(Both models are multilingual and support English, Hindi, and 90+ other languages).*

To download additional models (such as `small`):
```bash
./download_model.sh small
```

---

## 📁 Project Structure

- `server.py` — Zero-dependency multi-threaded Python 3 local backend.
- `index.html` — Modern responsive interface with timer, waveform monitor, model switcher, and language picker.
- `style.css` — Polished design with glowing recording states and dark/light accents.
- `app.js` — Client-side audio recording via `AudioContext`, real-time 16kHz WAV encoding, and API integration.
- `start.sh` — Single-command startup script.
- `whisper.cpp/` — High-performance C/C++ Whisper inference engine compiled with Apple Silicon Metal acceleration.
- `whisper.cpp/models/` — Stored local model weights (`ggml-tiny.bin`, `ggml-base.bin`).
