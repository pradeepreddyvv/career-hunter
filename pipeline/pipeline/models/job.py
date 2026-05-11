from __future__ import annotations

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func

from pipeline.models import Base


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    job_key = Column(String, nullable=False)  # dedup key
    url = Column(String)
    title = Column(String, nullable=False)
    company = Column(String, nullable=False)
    location = Column(String, default="")
    description = Column(Text, default="")
    posted_at = Column(String)
    source = Column(String, nullable=False)  # greenhouse_stripe, lever_spotify
    role_category = Column(String, default="")  # SDE, ML/AI, Fullstack
    score = Column(Integer, default=0)
    score_summary = Column(Text)
    multi_score_json = Column(Text)
    fetched_at = Column(DateTime, default=func.now())

    __table_args__ = (UniqueConstraint("user_id", "job_key", name="uq_user_job_key"),)

    def __repr__(self) -> str:
        return f"<Job id={self.id} company={self.company!r} title={self.title!r}>"
