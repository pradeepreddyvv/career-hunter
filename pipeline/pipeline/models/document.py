from __future__ import annotations

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func

from pipeline.models import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(Integer, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    doc_type = Column(String, nullable=False)  # resume_text, cover_letter, outreach, etc.
    content = Column(Text, nullable=False)
    format = Column(String, default="text")  # text, json, latex, html
    generated_at = Column(DateTime, default=func.now())

    __table_args__ = (UniqueConstraint("job_id", "doc_type", name="uq_job_doc_type"),)

    def __repr__(self) -> str:
        return f"<Document id={self.id} job_id={self.job_id} type={self.doc_type!r}>"
