"""CLI entry point for Career Pipeline."""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys


def main():
    parser = argparse.ArgumentParser(
        description="Career Pipeline — AI-powered job discovery and document generation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Commands:
  serve         Start the API server
  fetch         Fetch jobs from ATS APIs
  sources       List available job sources

Examples:
  career-pipeline serve                     # Start server on port 8000
  career-pipeline serve --port 3001         # Custom port
  career-pipeline fetch --sources greenhouse lever
  career-pipeline sources
        """,
    )

    sub = parser.add_subparsers(dest="command")

    serve_p = sub.add_parser("serve", help="Start the API server")
    serve_p.add_argument("--host", default="0.0.0.0")
    serve_p.add_argument("--port", type=int, default=8000)
    serve_p.add_argument("--reload", action="store_true")
    serve_p.add_argument("--workers", type=int, default=1)

    fetch_p = sub.add_parser("fetch", help="Fetch jobs from ATS sources")
    fetch_p.add_argument("--sources", nargs="+", default=["greenhouse", "lever", "ashby"])
    fetch_p.add_argument("--intern-only", action="store_true")
    fetch_p.add_argument("--output", type=str, default="jobs.json")

    sub.add_parser("sources", help="List available job sources")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(0)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    if args.command == "serve":
        _serve(args)
    elif args.command == "fetch":
        asyncio.run(_fetch(args))
    elif args.command == "sources":
        _sources()


def _serve(args):
    import uvicorn
    uvicorn.run(
        "pipeline.api.app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        workers=args.workers,
        log_level="info",
    )


async def _fetch(args):
    import json
    from pipeline.job_sources.orchestrator import FetchOrchestrator

    print(f"Fetching from: {', '.join(args.sources)}")
    orchestrator = FetchOrchestrator(sources=args.sources)
    jobs = await orchestrator.fetch_all(intern_only=args.intern_only)

    output = {"total": len(jobs), "jobs": jobs}
    with open(args.output, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nFetched {len(jobs)} jobs -> {args.output}")

    by_source = {}
    for j in jobs:
        s = j.get("source", "unknown")
        by_source[s] = by_source.get(s, 0) + 1
    for s, c in sorted(by_source.items(), key=lambda x: -x[1]):
        print(f"  {s}: {c}")


def _sources():
    from pipeline.job_sources.registry import load_companies

    companies = load_companies()
    by_ats = {}
    for c in companies:
        ats = c.get("ats", "unknown")
        if ats not in by_ats:
            by_ats[ats] = []
        by_ats[ats].append(c["name"])

    print("Available job sources:\n")
    for ats, names in sorted(by_ats.items()):
        print(f"  {ats.upper()} ({len(names)} companies):")
        for name in sorted(names):
            print(f"    - {name}")
        print()
    print(f"Total: {len(companies)} companies across {len(by_ats)} ATS platforms")
    print("\nAdditional sources: The Muse, Remotive, LinkedIn (guest), GitHub repos")


if __name__ == "__main__":
    main()
