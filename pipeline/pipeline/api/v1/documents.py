"""Document retrieval and export API routes."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from pipeline.api.deps import get_db, get_current_user
from pipeline.db.repositories.document_repo import DocumentRepository
from pipeline.db.repositories.job_repo import JobRepository
from pipeline.exceptions import NotFoundError
from pipeline.models.user import User
from pipeline.services.document_service import DocumentService

router = APIRouter(prefix="/documents", tags=["documents"])


class DocumentResponse(BaseModel):
    id: int
    doc_type: str
    content: str
    format: str
    generated_at: Optional[str] = None


@router.get("/{job_id}")
async def get_documents(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = DocumentService(DocumentRepository(db), JobRepository(db))
    docs = await svc.get_documents(user.id, job_id)
    if not docs:
        job_repo = JobRepository(db)
        job = await job_repo.get(user.id, job_id)
        if not job:
            raise NotFoundError(f"Job {job_id} not found")
    return {"job_id": job_id, "documents": docs}


@router.get("/{job_id}/{doc_type}")
async def get_document(
    job_id: int,
    doc_type: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = DocumentService(DocumentRepository(db), JobRepository(db))
    doc = await svc.get_document(user.id, job_id, doc_type)
    if not doc:
        raise NotFoundError(f"Document '{doc_type}' not found for job {job_id}")
    return doc


class ExportRequest(BaseModel):
    job_ids: Optional[list[int]] = None


@router.post("/export")
async def export_zip(
    req: ExportRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = DocumentService(DocumentRepository(db), JobRepository(db))
    zip_bytes = await svc.export_zip(user.id, job_ids=req.job_ids)
    return StreamingResponse(
        iter([zip_bytes]),
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=career_docs.zip"},
    )
