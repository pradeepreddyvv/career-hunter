from __future__ import annotations

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func

from pipeline.models import Base


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id = Column(String, primary_key=True)  # UUID
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True)
    company = Column(String, nullable=False)
    role = Column(String, nullable=False)
    interview_type = Column(String, nullable=False)  # behavioral, technical, system_design, mixed
    status = Column(String, default="scheduled")  # scheduled, in_progress, completed
    scheduled_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    score = Column(Integer, nullable=True)
    feedback_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:
        return f"<InterviewSession id={self.id!r} company={self.company!r} role={self.role!r}>"


class InterviewQuestion(Base):
    __tablename__ = "interview_questions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(
        String,
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_text = Column(Text, nullable=False)
    answer_text = Column(Text, nullable=True)
    category = Column(String, nullable=False)  # behavioral, technical, system_design
    score = Column(Integer, nullable=True)
    feedback = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())

    def __repr__(self) -> str:
        return f"<InterviewQuestion id={self.id} session={self.session_id!r} category={self.category!r}>"
