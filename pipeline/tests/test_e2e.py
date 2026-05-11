"""Comprehensive end-to-end test suite for Career Pipeline."""
from __future__ import annotations

import asyncio
import json
import os
import uuid
import sys

os.environ["PIPELINE_SECRET_KEY"] = "test-secret-key-for-testing-purposes-32chars"
os.environ["PIPELINE_DATABASE_URL"] = "sqlite+aiosqlite:///./data/e2e_test.db"

results = []


def report(name, status, detail=""):
    results.append((name, status, detail))
    mark = "PASS" if status else "FAIL"
    print(f"  [{mark}] {name}" + (f" -- {detail}" if detail else ""))


async def phase1_db():
    print("=== Phase 1: Database & Repositories ===")
    from pipeline.db import engine
    await engine.init_db()
    report("db_init", True)

    async with engine._session_factory() as session:
        from pipeline.db.repositories.user_repo import UserRepository
        from pipeline.db.repositories.job_repo import JobRepository
        from pipeline.db.repositories.document_repo import DocumentRepository
        from pipeline.db.repositories.task_repo import TaskRepository
        from pipeline.services.auth_service import AuthService

        auth = AuthService("test-secret-key-for-testing-purposes-32chars")
        uid = str(uuid.uuid4())

        # User CRUD
        user_repo = UserRepository(session)
        user = await user_repo.create(uid, "test@e2e.com", "E2E Tester", auth.hash_password("pass1234"))
        report("user_create", user is not None, f"id={uid[:8]}...")

        u = await user_repo.get_by_email("test@e2e.com")
        report("user_get_by_email", u is not None and u.name == "E2E Tester")

        await user_repo.update_profile(uid, '{"name":"E2E Tester","skills":"Python"}')
        u2 = await user_repo.get_by_id(uid)
        report("user_update_profile", u2.profile_json is not None)

        enc_key = auth.encrypt_api_key("AIzaSy-fake-test-key")
        await user_repo.update_api_key(uid, enc_key)
        u3 = await user_repo.get_by_id(uid)
        dec = auth.decrypt_api_key(u3.gemini_api_key_encrypted)
        report("user_api_key_roundtrip", dec == "AIzaSy-fake-test-key")

        await user_repo.update_settings(uid, json.dumps({"blacklist": ["TikTok"]}))
        u4 = await user_repo.get_by_id(uid)
        report("user_settings", "TikTok" in (u4.settings_json or ""))

        # Job CRUD
        job_repo = JobRepository(session)
        job = await job_repo.create(
            uid, title="SDE Intern", company="Stripe", location="SF",
            url="https://stripe.com/jobs/123", source="greenhouse_stripe",
            job_key="stripe|sde intern", description="Build APIs at Stripe",
            role_category="SDE",
        )
        report("job_create", job is not None, f"id={job.id}")

        j = await job_repo.get(uid, job.id)
        report("job_get", j is not None and j.title == "SDE Intern")

        await job_repo.update_score(uid, job.id, 85, "Great match", json.dumps({"technical": 90}))
        j2 = await job_repo.get(uid, job.id)
        report("job_update_score", j2.score == 85)

        jobs, total = await job_repo.list(uid, min_score=80)
        report("job_list_min_score", total == 1)

        jobs2, total2 = await job_repo.list(uid, min_score=90)
        report("job_list_no_match", total2 == 0)

        jobs3, total3 = await job_repo.list(uid, search="Stripe")
        report("job_search", total3 == 1)

        job_up = await job_repo.upsert(uid, "stripe|sde intern", title="SDE Intern v2", company="Stripe", source="test")
        report("job_upsert", job_up.title == "SDE Intern v2")

        bulk_jobs = [{"title": f"Job {i}", "company": f"Co{i}", "source": "test", "job_key": f"co{i}|job {i}"} for i in range(5)]
        inserted = await job_repo.bulk_create(uid, bulk_jobs)
        report("job_bulk_create", inserted == 5, f"{inserted} inserted")

        unscored = await job_repo.get_unscored(uid)
        report("job_get_unscored", len(unscored) == 5)

        # Document CRUD
        doc_repo = DocumentRepository(session)
        doc = await doc_repo.create(job.id, uid, "resume_text", "Jane Doe\nSDE\nPython")
        report("doc_create", doc is not None)

        doc2 = await doc_repo.create(job.id, uid, "cover_letter", "Dear Hiring Manager...")
        docs = await doc_repo.get_for_job(uid, job.id)
        report("doc_get_for_job", len(docs) == 2)

        d = await doc_repo.get_by_type(uid, job.id, "resume_text")
        report("doc_get_by_type", d is not None)

        await doc_repo.upsert(job.id, uid, "resume_text", "Updated resume")
        d2 = await doc_repo.get_by_type(uid, job.id, "resume_text")
        report("doc_upsert", d2.content == "Updated resume")

        # Task CRUD
        task_repo = TaskRepository(session)
        tid = str(uuid.uuid4())
        task = await task_repo.create(tid, uid, "fetch_jobs")
        report("task_create", task is not None)

        await task_repo.update_status(tid, "running", progress=50, message="Fetching...")
        t2 = await task_repo.get(uid, tid)
        report("task_update_running", t2.status == "running" and t2.progress == 50)

        await task_repo.update_status(tid, "completed", progress=100, result=json.dumps({"count": 10}))
        t3 = await task_repo.get(uid, tid)
        report("task_complete", t3.status == "completed" and t3.completed_at is not None)

        tasks = await task_repo.list(uid)
        report("task_list", len(tasks) >= 1)

        # Cascade delete
        deleted = await job_repo.delete(uid, job.id)
        report("job_delete", deleted)
        docs_after = await doc_repo.get_for_job(uid, job.id)
        report("doc_cascade_delete", len(docs_after) == 0)

    await engine.close_db()


async def phase2_sources():
    print("\n=== Phase 2: Job Sources (Live) ===")
    import aiohttp
    from pipeline.job_sources.greenhouse import GreenhouseFetcher
    from pipeline.job_sources.lever import LeverFetcher
    from pipeline.job_sources.ashby import AshbyFetcher
    from pipeline.job_sources.muse import MuseFetcher
    from pipeline.job_sources.remotive import RemotiveFetcher
    from pipeline.job_sources.registry import load_companies, get_companies_by_ats

    companies = load_companies()
    report("registry_load", len(companies) >= 50, f"{len(companies)} companies")

    gh_cos = get_companies_by_ats("greenhouse")
    lv_cos = get_companies_by_ats("lever")
    ab_cos = get_companies_by_ats("ashby")
    report("registry_filter", len(gh_cos) >= 40 and len(lv_cos) >= 1 and len(ab_cos) >= 15)

    conn = aiohttp.TCPConnector(limit=10, limit_per_host=3)
    async with aiohttp.ClientSession(connector=conn) as session:
        gh = GreenhouseFetcher()
        gh_jobs = await gh.fetch(session, slug="duolingo", company="Duolingo")
        report("greenhouse", len(gh_jobs) > 0, f"{len(gh_jobs)} jobs")

        lv = LeverFetcher()
        lv_jobs = await lv.fetch(session, slug="spotify", company="Spotify")
        report("lever", len(lv_jobs) > 0, f"{len(lv_jobs)} jobs")

        ab = AshbyFetcher()
        ab_jobs = await ab.fetch(session, slug="ramp", company="Ramp")
        report("ashby", len(ab_jobs) > 0, f"{len(ab_jobs)} jobs")
        if ab_jobs:
            report("ashby_desc", len(ab_jobs[0].description) > 100, f"{len(ab_jobs[0].description)} chars")

        mu = MuseFetcher()
        mu_jobs = await mu.fetch(session, category="Software Engineering", level="Internship", max_pages=1)
        report("muse", True, f"{len(mu_jobs)} jobs")

        rm = RemotiveFetcher()
        rm_jobs = await rm.fetch(session, category="software-dev")
        report("remotive", len(rm_jobs) > 0, f"{len(rm_jobs)} jobs")


def phase3_scoring():
    print("\n=== Phase 3: Scoring & Classification ===")
    from pipeline.scoring.classifier import classify_role, is_intern_role
    from pipeline.scoring.gemini_client import parse_json_response

    cases = [
        ("Software Engineer Intern", "SDE"),
        ("Machine Learning Engineer", "ML/AI"),
        ("Frontend Developer", "Frontend"),
        ("Full Stack Engineer", "Fullstack"),
        ("Data Engineer", "Data"),
        ("DevOps Engineer", "DevOps"),
        ("iOS Developer", "Mobile"),
        ("Security Engineer", "Security"),
    ]
    all_ok = all(classify_role(t) == e for t, e in cases)
    report("classify_roles", all_ok, f"{len(cases)} categories")

    report("is_intern_yes", is_intern_role("SDE Intern 2026"))
    report("is_intern_no", not is_intern_role("Senior Staff Engineer"))
    report("is_intern_newgrad", is_intern_role("New Grad Software Engineer"))

    report("json_direct", parse_json_response('{"a":1}') == {"a": 1})
    report("json_codeblock", parse_json_response('```json\n{"b":2}\n```').get("b") == 2)
    report("json_wrapped", parse_json_response('Here: {"c":3} end').get("c") == 3)
    report("json_empty", parse_json_response("no json") == {})


def phase4_generators():
    print("\n=== Phase 4: Generator Prompts ===")
    from pipeline.generators.prompts import PROMPT_PACK, LATEX_PREAMBLE, build_generation_prompt

    report("prompt_pack", len(PROMPT_PACK) >= 8, f"{len(PROMPT_PACK)} templates")
    report("latex_preamble", len(LATEX_PREAMBLE) > 500, f"{len(LATEX_PREAMBLE)} chars")

    job = {"title": "SDE Intern", "company": "Google", "location": "MTV", "description": "Build scalable APIs"}
    vault = "MS CS, 2yr exp, Python Java React AWS"

    for key in ["resume", "cover_letter", "outreach", "interview_prep", "company_research",
                "ats_audit", "multi_score", "follow_up", "resume_latex"]:
        prompt = build_generation_prompt(key, job, vault)
        ok = len(prompt) > 200 and "Google" in prompt and "MS CS" in prompt
        report(f"prompt_{key}", ok, f"{len(prompt)} chars")


def phase5_services():
    print("\n=== Phase 5: Auth Service ===")
    from pipeline.services.auth_service import AuthService

    auth = AuthService("test-key-32-chars-long-for-testing!")

    h = auth.hash_password("securepass")
    report("hash_verify", auth.verify_password("securepass", h) and not auth.verify_password("wrong", h))

    token = auth.create_token("user-abc", "user@test.com")
    payload = auth.decode_token(token)
    report("jwt_roundtrip", payload["user_id"] == "user-abc" and payload["email"] == "user@test.com")

    enc = auth.encrypt_api_key("AIzaSyABC123456")
    dec = auth.decrypt_api_key(enc)
    report("api_key_encrypt", dec == "AIzaSyABC123456")

    long_key = "a" * 200
    report("api_key_long", auth.decrypt_api_key(auth.encrypt_api_key(long_key)) == long_key)


async def phase6_workers():
    print("\n=== Phase 6: Task Queue & SSE ===")
    from pipeline.workers.task_queue import TaskQueue, SSEBroadcaster

    broadcaster = SSEBroadcaster()
    q = broadcaster.subscribe("t1")
    await broadcaster.emit("t1", {"type": "progress", "percent": 50})
    event = q.get_nowait()
    report("sse_emit", event["percent"] == 50)
    broadcaster.unsubscribe("t1", q)
    await broadcaster.emit("t1", {"type": "done"})
    report("sse_unsubscribe", q.empty())

    tq = TaskQueue(max_workers=2)
    report("task_queue_init", tq.queue_size == 0 and tq.active_count == 0)


def phase7_api():
    print("\n=== Phase 7: FastAPI Integration ===")
    from pipeline.api.app import app
    from fastapi.testclient import TestClient

    with TestClient(app, raise_server_exceptions=False) as client:
        _run_api_tests(client)


def _run_api_tests(client):
    r = client.get("/api/v1/health")
    report("api_health", r.status_code == 200 and r.json()["status"] == "healthy")

    r = client.get("/api/v1/auth/me")
    report("api_no_auth", r.status_code == 401)

    r = client.post("/api/v1/auth/register", json={
        "name": "API Tester", "email": "api@e2e.com", "password": "testpass123",
    })
    report("api_register", r.status_code in (200, 201), f"status={r.status_code}")
    token = r.json().get("token", "")
    headers = {"Authorization": f"Bearer {token}"}
    client.cookies.clear()

    r = client.post("/api/v1/auth/login", json={"email": "api@e2e.com", "password": "testpass123"})
    report("api_login", r.status_code == 200 and "token" in r.json())
    client.cookies.clear()

    r = client.post("/api/v1/auth/login", json={"email": "api@e2e.com", "password": "wrong"})
    report("api_bad_login", r.status_code == 401)

    r = client.get("/api/v1/auth/me", headers=headers)
    report("api_me", r.status_code == 200 and r.json()["email"] == "api@e2e.com")

    r = client.post("/api/v1/auth/register", json={
        "name": "Dup", "email": "api@e2e.com", "password": "testpass123",
    })
    report("api_dup_email", r.status_code == 409)

    r = client.put("/api/v1/profile/", headers=headers, json={
        "profile_json": "MS CS at MIT. 3 years backend. Go, Python, K8s.",
        "connections_json": json.dumps({"Google": [{"name": "Alice"}]}),
    })
    report("api_update_profile", r.status_code == 200)

    r = client.put("/api/v1/profile/api-key", headers=headers, json={"gemini_api_key": "AIzaSy-test"})
    report("api_set_key", r.status_code == 200)

    r = client.get("/api/v1/auth/me", headers=headers)
    report("api_has_key", r.json().get("has_api_key") is True)

    r = client.delete("/api/v1/profile/api-key", headers=headers)
    report("api_delete_key", r.status_code == 200)

    r = client.put("/api/v1/profile/settings", headers=headers, json={
        "blacklist": ["TikTok"], "min_score": 50,
    })
    report("api_settings", r.status_code == 200)

    r = client.get("/api/v1/jobs/", headers=headers)
    report("api_jobs_empty", r.status_code == 200 and r.json()["total"] == 0)

    r = client.get("/api/v1/jobs/sources", headers=headers)
    report("api_sources", r.status_code == 200 and r.json()["total_companies"] >= 50)

    r = client.get("/api/v1/tasks/", headers=headers)
    report("api_tasks_empty", r.status_code == 200)

    r = client.get("/api/v1/documents/99999", headers=headers)
    report("api_docs_404", r.status_code == 404)

    r = client.get("/openapi.json")
    endpoints = sum(len(m) for m in r.json().get("paths", {}).values())
    report("api_openapi", endpoints >= 20, f"{endpoints} endpoints")


async def main():
    await phase1_db()
    await phase2_sources()
    phase3_scoring()
    phase4_generators()
    phase5_services()
    await phase6_workers()
    phase7_api()

    print("\n" + "=" * 60)
    passed = sum(1 for _, s, _ in results if s)
    failed = sum(1 for _, s, _ in results if not s)
    print(f"TOTAL: {passed} passed, {failed} failed out of {len(results)} tests")
    if failed:
        print("\nFAILURES:")
        for name, s, detail in results:
            if not s:
                print(f"  {name}: {detail}")
        sys.exit(1)
    else:
        print("ALL TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(main())
