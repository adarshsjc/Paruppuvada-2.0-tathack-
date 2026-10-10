from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.endpoints import router
from app.api.memory_endpoints import router as memory_router
from app.graph.store import get_graph_store
from app.rag.ingest import ingest_workspace_csvs
from app.skills.library import seed_graph


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-seed graph store if empty or on startup so 3D skill graph is always available
    try:
        store = get_graph_store()
        seed_graph(store)
    except Exception as e:
        print(f"Startup graph seeding warning: {e}")
    # Mirror the project's workspace CSV files into memory (document -> CONTAINS -> knowledge)
    # so the memory graph is driven by the real project data files, not a hand-authored map.
    try:
        csv_result = ingest_workspace_csvs(get_graph_store())
        if csv_result["ingested"]:
            print(f"[memory] Ingested project CSVs: "
                  f"{', '.join(d['name'] for d in csv_result['ingested'])}")
        if csv_result["scanned"]:
            print(f"[memory] Workspace CSV scan: {csv_result['scanned']} file(s), "
                  f"{len(csv_result['ingested'])} ingested, {len(csv_result['skipped'])} skipped.")
    except Exception as e:
        print(f"Startup CSV ingest warning: {e}")
    yield


app = FastAPI(title="Autonomous AI Agent Platform", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(memory_router)

