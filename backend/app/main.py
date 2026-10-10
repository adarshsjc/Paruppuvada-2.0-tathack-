from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.endpoints import router
from app.api.memory_endpoints import router as memory_router
from app.graph.store import get_graph_store
from app.skills.library import seed_graph


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-seed graph store if empty or on startup so 3D skill graph is always available
    try:
        store = get_graph_store()
        seed_graph(store)
    except Exception as e:
        print(f"Startup graph seeding warning: {e}")
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

