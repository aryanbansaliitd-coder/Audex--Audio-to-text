/**
 * VoiceType Local — Frontend Application
 * Uses standard browser AudioContext to capture microphone audio, converts it to
 * 16kHz mono 16-bit WAV format, and sends it to the local whisper.cpp server.
 * 
 * STRICT PRIVACY: 100% of speech recognition is performed locally on this computer.
 * No external cloud APIs, no Web Speech API, zero telemetry.
 */

// 1. DOM Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');
const clearBtn = document.getElementById('clearBtn');
const testMicBtn = document.getElementById('testMicBtn');
const modelSelect = document.getElementById('modelSelect');
const languageSelect = document.getElementById('languageSelect');

const transcriptArea = document.getElementById('transcriptArea');
const systemCard = document.getElementById('systemCard');
const statusDot = document.getElementById('statusDot');
const statusTitle = document.getElementById('statusTitle');
const statusSubtitle = document.getElementById('statusSubtitle');
const noticeBanner = document.getElementById('noticeBanner');
const noticeMessage = document.getElementById('noticeMessage');

const recordingMonitor = document.getElementById('recordingMonitor');
const recordingView = document.getElementById('recordingView');
const transcribingView = document.getElementById('transcribingView');
const recordingTimer = document.getElementById('recordingTimer');

const wordCountEl = document.getElementById('wordCount');
const charCountEl = document.getElementById('charCount');
const lastDurationEl = document.getElementById('lastDuration');
const lastDurationDivider = document.getElementById('lastDurationDivider');
const toastEl = document.getElementById('toast');

// 2. Audio Recording State
let audioContext = null;
let mediaStream = null;
let scriptProcessor = null;
let audioInputNode = null;
let recordedBuffers = [];
let recordingStartTime = 0;
let timerInterval = null;
let isRecording = false;

// 3. Check Backend Engine & Model Status on Load
async function checkBackendStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.engine_ready && data.model_loaded) {
      statusDot.className = 'status-dot ready';
      statusTitle.textContent = 'Local Whisper Engine Ready';
      statusSubtitle.textContent = 'whisper.cpp • Apple Silicon Metal GPU Accelerated • 100% Offline';
      hideNotice();
    } else if (!data.engine_ready) {
      statusDot.className = 'status-dot error';
      statusTitle.textContent = 'Whisper Engine Missing';
      statusSubtitle.textContent = 'Please run the setup script to build whisper.cpp.';
      showNotice('whisper-cli binary is missing. Please ensure whisper.cpp has been compiled.');
    } else if (!data.model_loaded) {
      statusDot.className = 'status-dot error';
      statusTitle.textContent = 'Model Files Missing';
      statusSubtitle.textContent = 'Please download the local Whisper models.';
      showNotice('Whisper model files were not found in whisper.cpp/models/.');
    }
  } catch (err) {
    statusDot.className = 'status-dot error';
    statusTitle.textContent = 'Backend Offline';
    statusSubtitle.textContent = 'Cannot connect to local server at http://localhost:8000.';
    showNotice('VoiceType Local server is not reachable. Run: ./start.sh or python3 server.py');
  }
}

// 4. Microphone Test Button
testMicBtn.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    showToast('Microphone access verified! 🎙️');
    // Stop test tracks immediately
    stream.getTracks().forEach(track => track.stop());
  } catch (err) {
    showNotice(`Microphone error: ${err.message}. Please allow microphone access in your browser settings.`);
  }
});

// 5. Start Recording
startBtn.addEventListener('click', async () => {
  hideNotice();
  try {
    // Request microphone access
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      }
    });

    // Initialize AudioContext
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
    
    audioInputNode = audioContext.createMediaStreamSource(mediaStream);
    recordedBuffers = [];

    // Script processor collects PCM audio chunks
    // Buffer size 4096 gives smooth streaming capture
    scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    scriptProcessor.onaudioprocess = (e) => {
      if (!isRecording) return;
      const channelData = e.inputBuffer.getChannelData(0);
      recordedBuffers.push(new Float32Array(channelData));
    };

    audioInputNode.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);

    // Update UI for recording
    isRecording = true;
    startBtn.disabled = true;
    startBtn.classList.add('is-recording');
    stopBtn.disabled = false;
    stopBtn.classList.add('is-active');

    statusDot.className = 'status-dot recording';
    statusTitle.textContent = 'Recording Microphone Audio...';
    statusSubtitle.textContent = 'Speak clearly. When done, click Stop & Transcribe.';

    recordingMonitor.classList.remove('hidden');
    recordingView.classList.remove('hidden');
    transcribingView.classList.add('hidden');

    // Start live timer
    recordingStartTime = Date.now();
    updateTimerDisplay();
    timerInterval = setInterval(updateTimerDisplay, 500);

  } catch (err) {
    console.error('Recording initialization error:', err);
    showNotice(`Could not access microphone: ${err.message}. Ensure permissions are enabled in your browser.`);
  }
});

// 6. Stop Recording & Transcribe
stopBtn.addEventListener('click', async () => {
  if (!isRecording) return;
  isRecording = false;

  // Stop timer
  clearInterval(timerInterval);

  // Stop audio capture nodes
  if (scriptProcessor && audioInputNode) {
    scriptProcessor.disconnect();
    audioInputNode.disconnect();
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
  }

  // Switch UI to "Transcribing"
  startBtn.disabled = true;
  stopBtn.disabled = true;
  stopBtn.classList.remove('is-active');

  statusDot.className = 'status-dot recording';
  statusTitle.textContent = 'Transcribing Speech...';
  statusSubtitle.textContent = 'Processing locally with whisper.cpp on your device...';

  recordingView.classList.add('hidden');
  transcribingView.classList.remove('hidden');

  // Check if any audio was captured
  if (recordedBuffers.length === 0) {
    resetRecordingUI('No audio was captured. Please try speaking again.', true);
    return;
  }

  // Merge and downsample audio to 16kHz mono 16-bit WAV
  try {
    const wavBlob = processAudioToWav(recordedBuffers, audioContext.sampleRate, 16000);
    
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close();
    }

    // Minimum duration check (~0.4s)
    if (wavBlob.size < 13000) {
      resetRecordingUI('Recording was too short. Speak for at least 1-2 seconds.', true);
      return;
    }

    // Send audio to local Python Whisper server
    await sendForTranscription(wavBlob);

  } catch (err) {
    console.error('Audio processing error:', err);
    resetRecordingUI(`Audio processing failed: ${err.message}`, true);
  }
});

// 7. Send WAV to Local Server API
async function sendForTranscription(wavBlob) {
  const selectedLang = languageSelect.value;
  const selectedModel = modelSelect.value;

  try {
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'audio/wav',
        'X-Language': selectedLang,
        'X-Model': selectedModel
      },
      body: wavBlob
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server returned HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.success) {
      const newText = (result.text || '').trim();
      
      if (newText.length > 0) {
        // Append newly recognized sentence without deleting existing text
        let current = transcriptArea.value.trim();
        if (current.length > 0) {
          transcriptArea.value = current + ' ' + newText;
        } else {
          transcriptArea.value = newText;
        }

        // Auto-scroll to end of textarea
        transcriptArea.scrollTop = transcriptArea.scrollHeight;
        updateCounts();

        // Show inference timing
        if (result.duration_seconds !== undefined) {
          lastDurationEl.textContent = `Inference: ${result.duration_seconds}s (${result.model_used || selectedModel})`;
          lastDurationEl.style.display = 'inline';
          lastDurationDivider.style.display = 'inline';
        }

        showToast('Transcription completed! ✨');
      } else {
        showToast('No speech detected in recording.');
      }
      resetRecordingUI();
    } else {
      throw new Error(result.error || 'Transcription failed');
    }

  } catch (err) {
    console.error('Transcription request error:', err);
    resetRecordingUI(`Transcription error: ${err.message}`, true);
  }
}

// 8. Reset UI after Recording/Transcribing
function resetRecordingUI(errorMessage = null, isError = false) {
  startBtn.disabled = false;
  startBtn.classList.remove('is-recording');
  stopBtn.disabled = true;
  stopBtn.classList.remove('is-active');

  recordingMonitor.classList.add('hidden');
  recordingView.classList.remove('hidden');
  transcribingView.classList.add('hidden');

  if (isError && errorMessage) {
    statusDot.className = 'status-dot error';
    statusTitle.textContent = 'Notice';
    statusSubtitle.textContent = errorMessage;
    showNotice(errorMessage);
  } else {
    statusDot.className = 'status-dot ready';
    statusTitle.textContent = 'Local Whisper Engine Ready';
    statusSubtitle.textContent = 'Apple Silicon Metal Accelerated • Ready for next recording';
  }
}

// 9. Process Audio & Encode Standard 16kHz 16-bit Mono WAV
function processAudioToWav(buffers, inputSampleRate, targetSampleRate = 16000) {
  // Merge Float32 chunks
  let totalLength = 0;
  for (const b of buffers) totalLength += b.length;
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const b of buffers) {
    merged.set(b, offset);
    offset += b.length;
  }

  // Downsample to 16000 Hz if needed
  let downsampledSamples = merged;
  if (inputSampleRate !== targetSampleRate) {
    const ratio = inputSampleRate / targetSampleRate;
    const newLength = Math.round(merged.length / ratio);
    downsampledSamples = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const idx = Math.round(i * ratio);
      downsampledSamples[i] = merged[idx] || 0;
    }
  }

  // Encode to 16-bit PCM WAV
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = targetSampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = downsampledSamples.length * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);             // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);              // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);    // Mono = 1
  view.setUint32(24, targetSampleRate, true);// 16000 Hz
  view.setUint32(28, byteRate, true);       // Byte rate
  view.setUint16(32, blockAlign, true);     // Block align
  view.setUint16(34, bitsPerSample, true);  // 16 bits

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write PCM audio samples
  let sampleOffset = 44;
  for (let i = 0; i < downsampledSamples.length; i++, sampleOffset += 2) {
    let s = Math.max(-1, Math.min(1, downsampledSamples[i]));
    view.setInt16(sampleOffset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// 10. Timer helper
function updateTimerDisplay() {
  const elapsedSeconds = Math.floor((Date.now() - recordingStartTime) / 1000);
  const mins = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
  const secs = String(elapsedSeconds % 60).padStart(2, '0');
  recordingTimer.textContent = `${mins}:${secs}`;
}

// 11. Word and Character Counts
transcriptArea.addEventListener('input', updateCounts);

function updateCounts() {
  const text = transcriptArea.value.trim();
  const charCount = text.length;
  const wordCount = text ? text.split(/\s+/).filter(w => w.length > 0).length : 0;

  wordCountEl.textContent = `${wordCount} word${wordCount === 1 ? '' : 's'}`;
  charCountEl.textContent = `${charCount} character${charCount === 1 ? '' : 's'}`;
}

// 12. Copy Button
copyBtn.addEventListener('click', async () => {
  const text = transcriptArea.value.trim();
  if (!text) {
    showToast('Nothing to copy yet!');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied transcript to clipboard! 📋');
  } catch (err) {
    transcriptArea.select();
    document.execCommand('copy');
    showToast('Copied to clipboard! 📋');
  }
});

// 13. Download as .txt File
downloadBtn.addEventListener('click', () => {
  const text = transcriptArea.value.trim();
  if (!text) {
    showToast('Nothing to download yet!');
    return;
  }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().slice(0, 10);
  const timeStr = new Date().toTimeString().slice(0, 5).replace(':', '-');
  const filename = `voicetype-local-${dateStr}-${timeStr}.txt`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Downloaded ${filename} 💾`);
});

// 14. Clear Button
clearBtn.addEventListener('click', () => {
  if (!transcriptArea.value.trim()) return;
  if (confirm('Are you sure you want to clear the entire transcript?')) {
    transcriptArea.value = '';
    updateCounts();
    lastDurationEl.style.display = 'none';
    lastDurationDivider.style.display = 'none';
    showToast('Transcript cleared 🗑️');
  }
});

// 15. Toast & Notice Helpers
let toastTimeout = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toastEl.classList.add('hidden'), 3000);
}

function showNotice(msg) {
  noticeMessage.textContent = msg;
  noticeBanner.classList.remove('hidden');
}

function hideNotice() {
  noticeBanner.classList.add('hidden');
}

// Initialize on page load
checkBackendStatus();
updateCounts();
