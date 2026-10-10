from app.memory.sqlite import SQLiteMemoryProvider
from app.memory.base import MemoryItem
import pytest
import uuid

@pytest.fixture
def mem_db():
    db_name = f"file:memdb_{uuid.uuid4().hex}?mode=memory&cache=shared"
    provider = SQLiteMemoryProvider(db_name)
    yield provider

def test_project_isolation(mem_db):
    p1 = mem_db.create_project("p1")
    p2 = mem_db.create_project("p2")
    
    mem_db.add_memory(MemoryItem(project_id=p1.id, type="project", content="p1 secret", source="test"))
    mem_db.add_memory(MemoryItem(project_id=p2.id, type="project", content="p2 data", source="test"))
    mem_db.add_memory(MemoryItem(project_id=None, type="global", content="global info", source="test"))
    
    p1_results = mem_db.search_memory("", p1.id)
    assert any("p1 secret" in m.content for m in p1_results)
    assert any("global info" in m.content for m in p1_results)
    assert not any("p2 data" in m.content for m in p1_results)

def test_memory_deletion(mem_db):
    item = mem_db.add_memory(MemoryItem(type="global", content="delete me", source="test"))
    assert mem_db.get_memory(item.id) is not None
    mem_db.delete_memory(item.id)
    assert mem_db.get_memory(item.id) is None
