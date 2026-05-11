"""Document retrieval and export service."""
from __future__ import annotations

import io
import json
import logging
import zipfile
from typing import Optional

log = logging.getLogger(__name__)


class DocumentService:
    def __init__(self, document_repo, job_repo):
        self.doc_repo = document_repo
        self.job_repo = job_repo

    async def get_documents(self, user_id: str, job_id: int) -> list[dict]:
        docs = await self.doc_repo.get_for_job(user_id, job_id)
        return [
            {
                "id": d.id,
                "doc_type": d.doc_type,
                "content": d.content,
                "format": d.format,
                "generated_at": d.generated_at.isoformat() if d.generated_at else None,
            }
            for d in docs
        ]

    async def get_document(self, user_id: str, job_id: int, doc_type: str) -> Optional[dict]:
        doc = await self.doc_repo.get_by_type(user_id, job_id, doc_type)
        if not doc:
            return None
        return {
            "id": doc.id,
            "doc_type": doc.doc_type,
            "content": doc.content,
            "format": doc.format,
            "generated_at": doc.generated_at.isoformat() if doc.generated_at else None,
        }

    async def export_zip(self, user_id: str, job_ids: Optional[list[int]] = None) -> bytes:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            if job_ids:
                jobs_to_export = []
                for jid in job_ids:
                    job = await self.job_repo.get(user_id, jid)
                    if job:
                        jobs_to_export.append(job)
            else:
                jobs_to_export, _ = await self.job_repo.list(user_id, limit=1000)

            for job in jobs_to_export:
                docs = await self.doc_repo.get_for_job(user_id, job.id)
                dirname = f"{job.company}_{job.title}".replace(" ", "_")[:60]
                for doc in docs:
                    ext = {"json": "json", "latex": "tex", "html": "html"}.get(doc.format, "txt")
                    filename = f"{dirname}/{doc.doc_type}.{ext}"
                    content = doc.content
                    if doc.format == "json":
                        try:
                            content = json.dumps(json.loads(content), indent=2)
                        except (json.JSONDecodeError, TypeError):
                            pass
                    zf.writestr(filename, content)

                zf.writestr(f"{dirname}/metadata.json", json.dumps({
                    "title": job.title,
                    "company": job.company,
                    "location": job.location,
                    "score": job.score,
                    "source": job.source,
                    "role_category": job.role_category,
                }, indent=2))

        return buf.getvalue()
