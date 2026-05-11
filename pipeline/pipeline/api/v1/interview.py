"""Interview preparation API routes."""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from pipeline.api.deps import get_db, get_current_user
from pipeline.config import settings
from pipeline.db.repositories.interview_repo import InterviewRepository
from pipeline.exceptions import NotFoundError, ValidationError
from pipeline.models.user import User
from pipeline.scoring.gemini_client import GeminiClient
from pipeline.services.auth_service import AuthService

router = APIRouter(prefix="/interview", tags=["interview"])

# Module-level Gemini client (shared across requests)
_gemini = GeminiClient(max_concurrent=settings.gemini_concurrent_limit)


# ── Request / Response Schemas ────────────────────────────────────────


class CreateSessionRequest(BaseModel):
    job_id: Optional[int] = None
    company: str
    role: str
    interview_type: str = Field(
        ..., pattern="^(behavioral|technical|system_design|mixed)$"
    )
    scheduled_at: Optional[datetime] = None
    notes: Optional[str] = None


class UpdateSessionRequest(BaseModel):
    status: Optional[str] = Field(
        None, pattern="^(scheduled|in_progress|completed)$"
    )
    notes: Optional[str] = None
    score: Optional[int] = Field(None, ge=0, le=100)
    feedback_json: Optional[str] = None


class SessionResponse(BaseModel):
    id: str
    user_id: str
    job_id: Optional[int] = None
    company: str
    role: str
    interview_type: str
    status: str
    scheduled_at: Optional[datetime] = None
    notes: Optional[str] = None
    score: Optional[int] = None
    feedback_json: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SessionListResponse(BaseModel):
    sessions: list[SessionResponse]
    total: int
    offset: int
    limit: int


class QuestionResponse(BaseModel):
    id: int
    session_id: str
    question_text: str
    answer_text: Optional[str] = None
    category: str
    score: Optional[int] = None
    feedback: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SessionDetailResponse(SessionResponse):
    questions: list[QuestionResponse] = []


class AddQuestionRequest(BaseModel):
    question_text: str
    category: str = Field(
        ..., pattern="^(behavioral|technical|system_design)$"
    )


class SubmitAnswerRequest(BaseModel):
    answer_text: str


class PracticeRequest(BaseModel):
    company: str
    role: str
    question: str
    answer: str
    category: str = Field(
        default="behavioral",
        pattern="^(behavioral|technical|system_design)$",
    )


class PracticeResponse(BaseModel):
    score: int
    feedback: str
    strengths: list[str]
    improvements: list[str]
    sample_answer: str


class GenerateQuestionsRequest(BaseModel):
    company: str
    role: str
    interview_type: str = Field(
        default="mixed", pattern="^(behavioral|technical|system_design|mixed)$"
    )
    count: int = Field(default=5, ge=1, le=20)
    job_description: Optional[str] = None


class GeneratedQuestion(BaseModel):
    question: str
    category: str
    difficulty: str
    tips: str


class GenerateQuestionsResponse(BaseModel):
    questions: list[GeneratedQuestion]
    company: str
    role: str


# ── Helper ────────────────────────────────────────────────────────────


def _decrypt_gemini_key(user: User) -> str:
    """Decrypt the user's Gemini API key or raise ValidationError."""
    if not user.gemini_api_key_encrypted:
        raise ValidationError("No Gemini API key configured. Set one in your profile.")
    auth = AuthService(settings.secret_key)
    return auth.decrypt_api_key(user.gemini_api_key_encrypted)


# ── Session Endpoints ─────────────────────────────────────────────────


@router.post("/sessions", response_model=SessionResponse, status_code=201)
async def create_session(
    req: CreateSessionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new interview preparation session."""
    repo = InterviewRepository(db)
    session = await repo.create_session(
        id=str(uuid.uuid4()),
        user_id=user.id,
        job_id=req.job_id,
        company=req.company,
        role=req.role,
        interview_type=req.interview_type,
        scheduled_at=req.scheduled_at,
        notes=req.notes,
    )
    return SessionResponse.model_validate(session)


@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = None,
    interview_type: Optional[str] = None,
    company: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all interview sessions for the current user."""
    repo = InterviewRepository(db)
    sessions, total = await repo.list_sessions(
        user.id,
        offset=offset,
        limit=limit,
        status=status,
        interview_type=interview_type,
        company=company,
    )
    return SessionListResponse(
        sessions=[SessionResponse.model_validate(s) for s in sessions],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.get("/sessions/{session_id}", response_model=SessionDetailResponse)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get a session with all its questions."""
    repo = InterviewRepository(db)
    session = await repo.get_session(user.id, session_id)
    if not session:
        raise NotFoundError(f"Interview session {session_id} not found")

    questions = await repo.get_questions(session_id)

    resp = SessionDetailResponse.model_validate(session)
    resp.questions = [QuestionResponse.model_validate(q) for q in questions]
    return resp


@router.put("/sessions/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: str,
    req: UpdateSessionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update session fields (notes, status, score, feedback)."""
    repo = InterviewRepository(db)

    existing = await repo.get_session(user.id, session_id)
    if not existing:
        raise NotFoundError(f"Interview session {session_id} not found")

    updated = await repo.update_session(
        user.id,
        session_id,
        status=req.status,
        notes=req.notes,
        score=req.score,
        feedback_json=req.feedback_json,
    )
    return SessionResponse.model_validate(updated)


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a session and all its questions."""
    repo = InterviewRepository(db)
    deleted = await repo.delete_session(user.id, session_id)
    if not deleted:
        raise NotFoundError(f"Interview session {session_id} not found")
    return {"ok": True}


# ── Question Endpoints ────────────────────────────────────────────────


@router.post(
    "/sessions/{session_id}/questions",
    response_model=QuestionResponse,
    status_code=201,
)
async def add_question(
    session_id: str,
    req: AddQuestionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Add a question to an existing session."""
    repo = InterviewRepository(db)

    session = await repo.get_session(user.id, session_id)
    if not session:
        raise NotFoundError(f"Interview session {session_id} not found")

    question = await repo.add_question(
        session_id=session_id,
        question_text=req.question_text,
        category=req.category,
    )
    return QuestionResponse.model_validate(question)


@router.put("/questions/{question_id}/answer", response_model=QuestionResponse)
async def submit_answer(
    question_id: int,
    req: SubmitAnswerRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Submit or update an answer for a question."""
    repo = InterviewRepository(db)

    # Verify the question exists and belongs to a session owned by this user
    question = await _get_owned_question(repo, user.id, question_id)

    updated = await repo.update_question_answer(question_id, req.answer_text)
    return QuestionResponse.model_validate(updated)


# ── AI Endpoints ──────────────────────────────────────────────────────


@router.post("/practice", response_model=PracticeResponse)
async def practice_interview(
    req: PracticeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """AI mock interview: submit a question + answer, get scored feedback via Gemini."""
    api_key = _decrypt_gemini_key(user)

    prompt = _build_practice_prompt(req)
    result = await _gemini.generate_json(api_key, prompt, temperature=0.4)

    return PracticeResponse(
        score=int(result.get("score", 0)),
        feedback=result.get("feedback", "No feedback generated."),
        strengths=result.get("strengths", []),
        improvements=result.get("improvements", []),
        sample_answer=result.get("sample_answer", ""),
    )


@router.post("/generate-questions", response_model=GenerateQuestionsResponse)
async def generate_questions(
    req: GenerateQuestionsRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate interview questions for a company/role using Gemini."""
    api_key = _decrypt_gemini_key(user)

    prompt = _build_generate_questions_prompt(req)
    result = await _gemini.generate_json(api_key, prompt, temperature=0.6)

    raw_questions = result.get("questions", [])
    questions = []
    for q in raw_questions:
        questions.append(
            GeneratedQuestion(
                question=q.get("question", ""),
                category=q.get("category", "behavioral"),
                difficulty=q.get("difficulty", "medium"),
                tips=q.get("tips", ""),
            )
        )

    return GenerateQuestionsResponse(
        questions=questions,
        company=req.company,
        role=req.role,
    )


# ── Private Helpers ───────────────────────────────────────────────────


async def _get_owned_question(
    repo: InterviewRepository,
    user_id: str,
    question_id: int,
) -> None:
    """Verify a question exists and its session belongs to the user.

    Raises NotFoundError if the question or session is missing / not owned.
    """
    from sqlalchemy import select

    from pipeline.models.interview import InterviewQuestion, InterviewSession

    # Get the question
    result = await repo.session.execute(
        select(InterviewQuestion).where(InterviewQuestion.id == question_id)
    )
    question = result.scalar_one_or_none()
    if not question:
        raise NotFoundError(f"Question {question_id} not found")

    # Verify session ownership
    result = await repo.session.execute(
        select(InterviewSession).where(
            InterviewSession.id == question.session_id,
            InterviewSession.user_id == user_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise NotFoundError(f"Question {question_id} not found")

    return question


def _build_practice_prompt(req: PracticeRequest) -> str:
    """Build the Gemini prompt for mock interview practice scoring."""
    return f"""You are an expert interview coach specializing in tech industry interviews.

A candidate is practicing for a {req.category} interview at {req.company} for the role of {req.role}.

INTERVIEW QUESTION:
{req.question}

CANDIDATE'S ANSWER:
{req.answer}

Evaluate the answer thoroughly and return a JSON object with exactly these fields:

{{
    "score": <integer 0-100>,
    "feedback": "<detailed paragraph explaining the overall quality of the answer, what worked and what didn't>",
    "strengths": ["<strength 1>", "<strength 2>", ...],
    "improvements": ["<specific actionable improvement 1>", "<specific actionable improvement 2>", ...],
    "sample_answer": "<a strong sample answer the candidate can learn from, tailored to {req.company}>"
}}

SCORING RUBRIC:
- 90-100: Exceptional answer. Clear structure, specific examples, strong metrics, directly relevant.
- 75-89: Strong answer. Good structure and examples but could be more specific or impactful.
- 60-74: Adequate answer. Has the right idea but lacks specifics, structure, or relevance.
- 40-59: Weak answer. Vague, missing structure, or doesn't address the question well.
- 0-39: Poor answer. Off-topic, no examples, or fundamentally misunderstands the question.

For behavioral questions, evaluate STAR format (Situation, Task, Action, Result) usage.
For technical questions, evaluate correctness, depth, and clarity of explanation.
For system design questions, evaluate scalability thinking, trade-off analysis, and component design.

Be specific and actionable in your feedback. Reference the company and role in your sample answer."""


def _build_generate_questions_prompt(req: GenerateQuestionsRequest) -> str:
    """Build the Gemini prompt for generating interview questions."""
    jd_section = ""
    if req.job_description:
        jd_section = f"""
JOB DESCRIPTION:
{req.job_description}

Use the job description to tailor questions to the specific requirements and technologies mentioned."""

    type_instruction = ""
    if req.interview_type == "behavioral":
        type_instruction = "Generate ONLY behavioral questions (leadership, teamwork, conflict resolution, problem-solving, culture fit)."
    elif req.interview_type == "technical":
        type_instruction = "Generate ONLY technical questions (coding, algorithms, data structures, system concepts, language-specific)."
    elif req.interview_type == "system_design":
        type_instruction = "Generate ONLY system design questions (architecture, scalability, distributed systems, database design, API design)."
    else:
        type_instruction = f"Generate a mix of behavioral, technical, and system design questions. Aim for roughly equal distribution across categories, totaling {req.count} questions."

    return f"""You are an expert tech interviewer who has conducted thousands of interviews at top companies.

Generate {req.count} interview questions for a candidate interviewing at {req.company} for the role of {req.role}.

{type_instruction}
{jd_section}

Return a JSON object with exactly this structure:

{{
    "questions": [
        {{
            "question": "<the full interview question>",
            "category": "<behavioral|technical|system_design>",
            "difficulty": "<easy|medium|hard>",
            "tips": "<1-2 sentence tip on how to approach this question well>"
        }}
    ]
}}

GUIDELINES:
- Make questions specific to {req.company}'s domain, products, and engineering culture.
- For behavioral questions, frame them around real scenarios a {req.role} would face at {req.company}.
- For technical questions, focus on technologies and patterns {req.company} is known to use.
- For system design questions, reference systems or products similar to what {req.company} builds.
- Vary difficulty levels across easy, medium, and hard.
- Each question should be self-contained and clearly worded.
- Tips should be concise and actionable, not give away the answer.
- Generate exactly {req.count} questions."""
