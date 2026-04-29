/* ── InterviewAI — app.js ── */

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  jd: "",
  resume: "",
  candidateName: "Candidate",
  history: [],          // {role:"assistant"|"user", content: "..."}
  isRecording: false,
  isSpeaking: false,
  exchangeCount: 0,
  recognition: null,
  synth: window.speechSynthesis,
  currentUtterance: null,
};

// ── DOM refs ────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const setupOverlay   = $("setup-overlay");
const startBtn       = $("start-btn");
const setupError     = $("setup-error");
const appEl          = $("app");
const sidebar        = $("sidebar");
const sidebarToggle  = $("sidebar-toggle");
const transcriptEl   = $("transcript-inner");
const voiceBtn       = $("voice-btn");
const liveText       = $("live-text");
const liveTranscript = $("transcript-live");
const typeToggle     = $("type-toggle");
const textInputRow   = $("text-input-row");
const textInput      = $("text-input");
const sendTextBtn    = $("send-text-btn");
const feedbackBtn    = $("feedback-btn");
const restartBtn     = $("restart-btn");
const feedbackModal  = $("feedback-modal");
const closeFeedback  = $("close-feedback");
const feedbackContent= $("feedback-content");
const avatarFace     = $("avatar-face");
const speakingWave   = $("speaking-wave");
const micStatusEl    = $("mic-status-indicator");
const micLabel       = $("mic-label");
const sidebarName    = $("sidebar-name");
const sidebarExchanges= $("sidebar-exchanges");

// ── Setup Speech Recognition ─────────────────────────────────────────────────
function initSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    console.warn("SpeechRecognition not supported — text fallback only.");
    voiceBtn.title = "Speech recognition not supported in this browser. Use text input.";
    return null;
  }
  const r = new SR();
  r.continuous = false;
  r.interimResults = true;
  r.lang = "en-US";

  r.onresult = (e) => {
    let interim = "", final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      e.results[i].isFinal ? (final += t) : (interim += t);
    }
    liveText.textContent = final || interim || "Listening…";
    if (final) state._pendingTranscript = final;
  };

  r.onend = () => {
    setRecording(false);
    const text = state._pendingTranscript?.trim();
    state._pendingTranscript = "";
    if (text) sendUserMessage(text);
    else liveText.textContent = "No speech detected. Try again.";
  };

  r.onerror = (e) => {
    setRecording(false);
    liveText.textContent = e.error === "not-allowed"
      ? "Microphone access denied. Enable mic or use text input."
      : `Error: ${e.error}`;
  };

  return r;
}

// ── Recording State ───────────────────────────────────────────────────────────
function setRecording(val) {
  state.isRecording = val;
  voiceBtn.classList.toggle("recording", val);
  liveTranscript.classList.toggle("recording", val);
  micStatusEl.classList.toggle("recording", val);
  micLabel.textContent = val ? "Recording…" : "Mic ready";
  voiceBtn.querySelector(".voice-label").textContent = val ? "Release to Send" : "Hold to Speak";
  if (!val && liveText.textContent === "Listening…") liveText.textContent = "Press and hold to speak…";
}

// ── Avatar Speaking State ─────────────────────────────────────────────────────
function setAvatarSpeaking(val) {
  state.isSpeaking = val;
  avatarFace.classList.toggle("speaking", val);
  speakingWave.classList.toggle("active", val);
}

// ── TTS ───────────────────────────────────────────────────────────────────────
function speak(text) {
  if (!state.synth) return;
  state.synth.cancel();

  // Strip markdown formatting for speech
  const clean = text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/[_#>`]/g, "").trim();

  const utter = new SpeechSynthesisUtterance(clean);
  utter.rate  = 0.92;
  utter.pitch = 1.0;
  utter.volume = 1;

  // Try to pick a good voice
  const voices = state.synth.getVoices();
  const preferred = voices.find(v =>
    v.name.toLowerCase().includes("google") && v.lang.startsWith("en")
  ) || voices.find(v => v.lang.startsWith("en-US")) || voices[0];
  if (preferred) utter.voice = preferred;

  utter.onstart = () => setAvatarSpeaking(true);
  utter.onend   = () => { setAvatarSpeaking(false); enableVoiceBtn(); };
  utter.onerror = () => { setAvatarSpeaking(false); enableVoiceBtn(); };

  state.currentUtterance = utter;
  state.synth.speak(utter);
}

function enableVoiceBtn() {
  voiceBtn.disabled = false;
}

// ── Message Helpers ───────────────────────────────────────────────────────────
function timeStr() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function addMessage(role, content, opts = {}) {
  if (opts.typing) {
    // Remove existing typing bubble
    document.querySelector(".typing-bubble")?.remove();
  }

  const wrap = document.createElement("div");
  wrap.className = `message ${role}`;
  if (opts.typing) wrap.classList.add("typing-bubble");

  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  avatar.textContent = role === "ai" ? "🎙" : "👤";

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";

  if (opts.typing) {
    bubble.innerHTML = "<span class='dot'></span><span class='dot'></span><span class='dot'></span>";
  } else {
    bubble.textContent = content;
  }

  const time = document.createElement("div");
  time.className = "msg-time";
  time.textContent = timeStr();

  const inner = document.createElement("div");
  inner.style.maxWidth = "72%";
  inner.appendChild(bubble);
  if (!opts.typing) inner.appendChild(time);

  wrap.appendChild(avatar);
  wrap.appendChild(inner);
  transcriptEl.appendChild(wrap);

  // Scroll to bottom
  wrap.scrollIntoView({ behavior: "smooth", block: "end" });
  return wrap;
}

function removeTypingBubble() {
  document.querySelector(".typing-bubble")?.remove();
}

// ── API Calls ─────────────────────────────────────────────────────────────────
async function startInterview() {
  const res = await fetch("/api/start-interview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_description: state.jd,
      resume: state.resume,
      candidate_name: state.candidateName,
    }),
  });
  if (!res.ok) throw new Error("Failed to start interview");
  return res.json();
}

async function sendChat(userMessage) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: "local",
      user_message: userMessage,
      conversation_history: state.history,
      job_description: state.jd,
      resume: state.resume,
      candidate_name: state.candidateName,
    }),
  });
  if (!res.ok) throw new Error("Chat request failed");
  return res.json();
}

async function fetchFeedback() {
  const res = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_description: state.jd,
      resume: state.resume,
      conversation_history: state.history,
      candidate_name: state.candidateName,
    }),
  });
  if (!res.ok) throw new Error("Feedback request failed");
  return res.json();
}

// ── Core Flow ─────────────────────────────────────────────────────────────────
async function sendUserMessage(text) {
  if (!text || state.isSpeaking) return;

  // Show user message
  addMessage("user", text);
  state.history.push({ role: "user", content: text });
  liveText.textContent = "Press and hold to speak…";

  // Show typing
  voiceBtn.disabled = true;
  addMessage("ai", "", { typing: true });

  try {
    const data = await sendChat(text);
    removeTypingBubble();
    const reply = data.interviewer_message;

    state.history.push({ role: "assistant", content: reply });
    state.exchangeCount++;
    $("sidebar-exchanges").textContent = state.exchangeCount;

    addMessage("ai", reply);
    speak(reply);
  } catch (e) {
    removeTypingBubble();
    addMessage("ai", "Sorry, I had a connection issue. Please try again.");
    voiceBtn.disabled = false;
    console.error(e);
  }
}

// ── Voice Button (Push-to-talk) ───────────────────────────────────────────────
voiceBtn.addEventListener("mousedown", startListening);
voiceBtn.addEventListener("touchstart", e => { e.preventDefault(); startListening(); });
voiceBtn.addEventListener("mouseup", stopListening);
voiceBtn.addEventListener("mouseleave", stopListening);
voiceBtn.addEventListener("touchend", e => { e.preventDefault(); stopListening(); });

function startListening() {
  if (!state.recognition || state.isSpeaking || state.isRecording) return;
  state._pendingTranscript = "";
  liveText.textContent = "Listening…";
  setRecording(true);
  try { state.recognition.start(); } catch (e) { setRecording(false); }
}

function stopListening() {
  if (!state.isRecording) return;
  try { state.recognition.stop(); } catch (e) {}
}

// ── Text fallback ─────────────────────────────────────────────────────────────
typeToggle.addEventListener("click", () => {
  textInputRow.classList.toggle("hidden");
  typeToggle.textContent = textInputRow.classList.contains("hidden") ? "type your answer" : "hide text input";
  if (!textInputRow.classList.contains("hidden")) textInput.focus();
});

sendTextBtn.addEventListener("click", () => {
  const t = textInput.value.trim();
  if (t) { sendUserMessage(t); textInput.value = ""; }
});

textInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const t = textInput.value.trim();
    if (t) { sendUserMessage(t); textInput.value = ""; }
  }
});

// ── Sidebar Collapsibles ──────────────────────────────────────────────────────
$("jd-toggle").addEventListener("click", () => {
  $("jd-toggle").closest(".expandable").classList.toggle("collapsed");
});
$("resume-toggle").addEventListener("click", () => {
  $("resume-toggle").closest(".expandable").classList.toggle("collapsed");
});

sidebarToggle.addEventListener("click", () => {
  sidebar.classList.toggle("collapsed");
});

// ── Setup → Start ─────────────────────────────────────────────────────────────
startBtn.addEventListener("click", async () => {
  const jd   = $("jd-input").value.trim();
  const res  = $("resume-input").value.trim();
  const name = $("candidate-name").value.trim() || "Candidate";

  if (!jd || !res) {
    setupError.textContent = "Please provide both the job description and your résumé.";
    return;
  }

  setupError.textContent = "";
  startBtn.textContent = "Setting up…";
  startBtn.disabled = true;

  state.jd   = jd;
  state.resume = res;
  state.candidateName = name;

  try {
    const data = await startInterview();
    const opening = data.interviewer_message;

    // Populate sidebar
    sidebarName.textContent = name;
    $("jd-preview").textContent = jd.slice(0, 400) + (jd.length > 400 ? "…" : "");
    $("resume-preview").textContent = res.slice(0, 400) + (res.length > 400 ? "…" : "");

    // Show app
    setupOverlay.classList.remove("active");
    appEl.classList.remove("hidden");

    // Init speech
    state.recognition = initSpeechRecognition();

    // Open interviewer message
    state.history.push({ role: "assistant", content: opening });
    addMessage("ai", opening);

    // Wait for voices to load then speak
    const trySpeak = () => {
      if (state.synth.getVoices().length > 0) speak(opening);
      else window.speechSynthesis.onvoiceschanged = () => speak(opening);
    };
    setTimeout(trySpeak, 300);

  } catch (e) {
    setupError.textContent = "Failed to connect to server. Is the backend running?";
    startBtn.textContent = "Begin Interview";
    startBtn.disabled = false;
    console.error(e);
  }
});

// ── Feedback ──────────────────────────────────────────────────────────────────
feedbackBtn.addEventListener("click", async () => {
  feedbackModal.classList.remove("hidden");
  feedbackContent.innerHTML = "<div class='loading-spinner'>Analyzing your interview…</div>";

  try {
    const fb = await fetchFeedback();
    renderFeedback(fb);
  } catch (e) {
    feedbackContent.innerHTML = `<p style="color:var(--red)">Error: ${e.message}</p>`;
  }
});

closeFeedback.addEventListener("click", () => feedbackModal.classList.add("hidden"));
$("feedback-modal").querySelector(".modal-backdrop").addEventListener("click", () => {
  feedbackModal.classList.add("hidden");
});

function renderFeedback(fb) {
  feedbackContent.innerHTML = `
    <div class="overall-score-card">
      <div class="overall-num">${fb.overall_score}<span style="font-size:1.2rem;color:var(--text-muted)">/10</span></div>
      <div class="overall-label">Overall Score</div>
    </div>
    <p class="feedback-summary">${fb.summary}</p>
    <div class="score-grid">
      <div class="score-card">
        <div class="score-num">${fb.communication_score}</div>
        <div class="score-label">Communication</div>
      </div>
      <div class="score-card">
        <div class="score-num">${fb.technical_score}</div>
        <div class="score-label">Technical</div>
      </div>
      <div class="score-card">
        <div class="score-num">${fb.confidence_score}</div>
        <div class="score-label">Confidence</div>
      </div>
    </div>
    <div class="feedback-section">
      <h4>Strengths</h4>
      <ul class="feedback-list">${fb.strengths.map(s => `<li>${s}</li>`).join("")}</ul>
    </div>
    <div class="feedback-section">
      <h4>Areas to Improve</h4>
      <ul class="feedback-list improvements">${fb.improvements.map(i => `<li>${i}</li>`).join("")}</ul>
    </div>
    <div class="feedback-section">
      <h4>Key Moments</h4>
      <ul class="feedback-list">${fb.key_moments.map(m => `<li>${m}</li>`).join("")}</ul>
    </div>
    <div class="feedback-section">
      <h4>Next Steps</h4>
      <ul class="feedback-list next">${fb.next_steps.map(n => `<li>${n}</li>`).join("")}</ul>
    </div>
  `;
}

// ── Restart ───────────────────────────────────────────────────────────────────
restartBtn.addEventListener("click", () => {
  if (!confirm("Start a new session? Current interview will be cleared.")) return;
  state.history = [];
  state.exchangeCount = 0;
  transcriptEl.innerHTML = "";
  state.synth?.cancel();
  $("sidebar-status").className = "value status-badge ended";
  $("sidebar-status").textContent = "Ended";
  setupOverlay.classList.add("active");
  appEl.classList.add("hidden");
  $("start-btn").textContent = "Begin Interview";
  $("start-btn").disabled = false;
});
