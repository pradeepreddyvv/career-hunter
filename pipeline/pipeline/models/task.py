from __future__ import annotations

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func

from pipeline.models import Base


class BackgroundTask(Base):
    __tablename__ = "background_tasks"

    id = Column(String, primary_key=True)  # UUID
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    task_type = Column(String, nullable=False)  # fetch_jobs, run_pipeline, generate_docs
    status = Column(String, default="queued")  # queued, running, completed, failed, cancelled
    params_json = Column(Text)
    result_json = Column(Text)
    progress = Column(Integer, default=0)  # 0-100
    progress_message = Column(String, default="")
    created_at = Column(DateTime, default=func.now())
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    error_message = Column(Text)

    def __repr__(self) -> str:
        return f"<BackgroundTask id={self.id!r} type={self.task_type!r} status={self.status!r}>"


class ProcessingStatus(Base):
    __tablename__ = "processing_status"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(Integer, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    step = Column(String, nullable=False)  # company_research, resume_text, etc.
    status = Column(String, default="pending")
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    error_message = Column(Text)
    retry_count = Column(Integer, default=0)

    __table_args__ = (UniqueConstraint("job_id", "step", name="uq_job_step"),)

    def __repr__(self) -> str:
        return f"<ProcessingStatus job_id={self.job_id} step={self.step!r} status={self.status!r}>"
