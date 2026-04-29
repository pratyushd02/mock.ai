"""
Mock Interview App - FastAPI Backend
Uses Ollama as the AI interviewer with voice chat support.
"""

import os
import json
from urllib import error, request
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="AI Mock Interviewer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Ollama settings
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = "cogito-2.1:671b-cloud"


def ollama_chat(system_prompt: str, messages: list[dict]) -> str:
    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "messages": [{"role": "system", "content": system_prompt}, *messages],
    }
    req = request.Request(
        f"{OLLAMA_HOST}/api/chat",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data["message"]["content"].strip()
    except error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"Ollama connection failed: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Ollama chat error: {exc}") from exc


def ollama_generate_json(prompt: str) -> dict:
    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "format": "json",
        "prompt": prompt,
    }
    req = request.Request(
        f"{OLLAMA_HOST}/api/generate",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return json.loads(data["response"])
    except error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"Ollama connection failed: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to parse feedback JSON: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Ollama generate error: {exc}") from exc


# ── Models ────────────────────────────────────────────────────────────────────

class SessionSetup(BaseModel):
    job_description: str
    resume: str
    candidate_name: Optional[str] = "Candidate"


class ChatMessage(BaseModel):
    session_id: str
    user_message: str
    conversation_history: list[dict]
    job_description: str
    resume: str
    candidate_name: Optional[str] = "Candidate"


class FeedbackRequest(BaseModel):
    job_description: str
    resume: str
    conversation_history: list[dict]
    candidate_name: Optional[str] = "Candidate"


# ── Prompt Builder ─────────────────────────────────────────────────────────────

def build_system_prompt(job_description: str, resume: str, candidate_name: str) -> str:
    return f"""You are **Alex**, a senior technical interviewer at a top-tier company. You are conducting a real mock job interview.

## Your Persona
- Professional yet warm and encouraging
- Ask ONE clear, focused question at a time — never multiple questions at once
- Listen actively; reference what the candidate says in follow-ups
- Use natural interview language: "That's interesting, tell me more about...", "Great, let's dig into..."
- Vary question types: behavioral (STAR format), technical, situational, culture-fit
- Keep responses concise and conversational — max 3 sentences before you ask your question

## Interview Flow
1. Start with a warm welcome and a brief intro of yourself
2. Begin with an easy opener ("Walk me through your background...")
3. Progress naturally: background → technical skills → behavioral → situational → candidate questions
4. After ~8-10 exchanges, offer to wrap up and ask if they have questions for you

## Context
**Job Description:**
{job_description}

**Candidate Resume:**
{resume}

**Candidate Name:** {candidate_name}

## Rules
- NEVER break character or mention you are an AI unless directly asked
- NEVER give feedback mid-interview — save it for after
- Ask follow-up questions based on the candidate's actual answers
- Reference specific details from their resume naturally
- If an answer is vague, gently probe: "Can you give me a concrete example?"
- Keep the interview realistic and professional
"""


def build_opening_message(candidate_name: str, job_description: str) -> str:
    # Extract job title hint from JD
    lines = job_description.strip().split("\n")
    first_line = lines[0][:80] if lines else "this role"
    return f"""Hi {candidate_name}, thanks for taking the time today! I'm Alex, and I'll be your interviewer for this session. We're looking to fill a position in — {first_line}. 

Before we dive in, I want this to feel like a real conversation, so please relax and take your time with answers. 

To start off, could you give me a quick overview of your background and what drew you to apply for this role?"""


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def root():
    return FileResponse("static/index.html")


@app.post("/api/start-interview")
async def start_interview(setup: SessionSetup):
    """Returns the opening message from the interviewer."""
    if not setup.job_description.strip() or not setup.resume.strip():
        raise HTTPException(status_code=400, detail="Job description and resume are required.")

    opening = build_opening_message(setup.candidate_name, setup.job_description)
    return {
        "interviewer_message": opening,
        "candidate_name": setup.candidate_name,
    }


@app.post("/api/chat")
async def chat(msg: ChatMessage):
    """Send a candidate message and receive the interviewer's response."""
    system = build_system_prompt(msg.job_description, msg.resume, msg.candidate_name)

    # Build messages list
    messages = []
    for turn in msg.conversation_history:
        messages.append({"role": turn["role"], "content": turn["content"]})

    # Append latest user message
    messages.append({"role": "user", "content": msg.user_message})

    reply = ollama_chat(system, messages)
    return {"interviewer_message": reply}


@app.post("/api/feedback")
async def get_feedback(req: FeedbackRequest):
    """Generate detailed interview feedback after the session."""
    if len(req.conversation_history) < 4:
        raise HTTPException(status_code=400, detail="Not enough conversation history for feedback.")

    convo_text = "\n".join(
        f"{'Interviewer' if t['role'] == 'assistant' else req.candidate_name}: {t['content']}"
        for t in req.conversation_history
    )

    prompt = f"""You are an expert career coach. Review this mock interview and provide structured feedback.

**Job Description:**
{req.job_description}

**Resume:**
{req.resume}

**Interview Transcript:**
{convo_text}

Provide feedback in this exact JSON format (no markdown, raw JSON only):
{{
  "overall_score": <number 1-10>,
  "summary": "<2-3 sentence overall assessment>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "improvements": ["<area 1>", "<area 2>", "<area 3>"],
  "communication_score": <1-10>,
  "technical_score": <1-10>,
  "confidence_score": <1-10>,
  "key_moments": ["<notable moment 1>", "<notable moment 2>"],
  "next_steps": ["<actionable tip 1>", "<actionable tip 2>", "<actionable tip 3>"]
}}"""

    return ollama_generate_json(prompt)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
