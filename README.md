# 🎙 InterviewAI — AI Mock Interview Studio

A full-stack Python app that runs realistic AI mock interviews using **voice chat**. Paste a Job Description and your Résumé, then have a natural voice conversation with "Alex," your AI interviewer powered by Ollama.

---

## 🏗 Project Structure

```
mock-interview-app/
├── main.py               # FastAPI backend (API routes + Ollama integration)
├── requirements.txt
├── static/
│   ├── index.html        # App shell
│   ├── style.css         # Dark editorial UI
│   └── app.js            # Voice chat, TTS, API calls
└── README.md
```

---

## ✨ Features

| Feature | Details |
|---|---|
| **AI Interviewer** | Ollama acts as "Alex," a senior interviewer with persona and memory |
| **Voice Input** | Push-to-talk via Web Speech API (Chrome / Edge) |
| **Voice Output** | Browser TTS reads out the interviewer's responses naturally |
| **Live Transcript** | Real-time speech-to-text preview while recording |
| **JD + Resume aware** | Interviewer references your actual experience and role |
| **Interview Feedback** | Post-session AI analysis with scores, strengths, improvements |
| **Text Fallback** | Type your answers if mic unavailable |
| **Collapsible sidebar** | Shows session info, JD preview, résumé preview |

---

## 🚀 Setup & Run

### 1. Install dependencies

```bash
cd mock-interview-app
pip install -r requirements.txt
```

### 2. Configure Ollama

```bash
# Optional if your Ollama server is not local:
export OLLAMA_HOST=http://localhost:11434
```

### 3. Start the server

```bash
python main.py
# or for development with auto-reload:
uvicorn main:app --reload --port 8000
```

### 4. Open the app

Go to **http://localhost:8000** in Chrome or Edge (required for Web Speech API).

---

## 🎤 Voice Chat Tips

- **Push-to-talk**: Hold the "Hold to Speak" button while speaking, release to send
- **Browser**: Use **Chrome** or **Edge** for best speech recognition support
- **Microphone**: Allow mic access when prompted
- **Text fallback**: Click "type your answer" if mic doesn't work

---

## 🔌 API Endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/` | Serves the frontend |
| `POST` | `/api/start-interview` | Returns the interviewer's opening message |
| `POST` | `/api/chat` | Send candidate message → get interviewer response |
| `POST` | `/api/feedback` | Generate full session feedback report |

---

## 🛠 Extending the App

### Add ElevenLabs TTS (higher quality voice)
Replace the `speak()` function in `app.js` with an ElevenLabs API call and add a `/api/tts` endpoint in `main.py`.

### Add Whisper STT (offline / more accurate)
Replace `SpeechRecognition` with OpenAI Whisper by recording audio as a `Blob`, sending it to a `/api/stt` endpoint, and returning the transcript.

### Add session persistence
Store `conversation_history` in a database (SQLite via `databases` + `aiosqlite`) keyed by a session UUID.

### Add multiple interviewer personas
Extend `build_system_prompt()` to accept a persona parameter (technical, behavioral, case-study) and let users choose from the setup screen.

---

## 📦 Dependencies

- `fastapi` — API framework
- `uvicorn` — ASGI server
- Ollama server running model: `cogito-2.1:671b-cloud`
- Browser APIs: `SpeechRecognition`, `SpeechSynthesis` (no extra packages needed)
