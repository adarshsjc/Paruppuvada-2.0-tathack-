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

def test_project_recycle_bin(mem_db):
    p = mem_db.create_project("recycle-me")
    mem_db.add_memory(MemoryItem(project_id=p.id, type="project", content="workspace data", source="test"))

    # Active by default
    assert any(proj.id == p.id for proj in mem_db.list_projects())
    assert mem_db.get_project(p.id) is not None
    assert mem_db.get_project(p.id).deleted is False

    # Soft delete -> moves to the recycle bin (hidden from active list)
    assert mem_db.delete_project(p.id) is True
    assert mem_db.get_project(p.id).deleted is True
    assert not any(proj.id == p.id for proj in mem_db.list_projects())
    assert any(proj.id == p.id for proj in mem_db.list_projects(include_deleted=True))

    # Memories of a recycled workspace are hidden
    assert mem_db.search_memory("workspace", p.id) == []
    assert mem_db.list_memory(p.id) == []

    # Restore -> workspace and its memories come back
    assert mem_db.restore_project(p.id) is True
    assert mem_db.get_project(p.id).deleted is False
    assert any(proj.id == p.id for proj in mem_db.list_projects())
    assert any("workspace data" in m.content for m in mem_db.search_memory("workspace", p.id))

    # Purge -> permanently gone (project + all its memories)
    assert mem_db.purge_project(p.id) is True
    assert mem_db.get_project(p.id) is None
    assert not any(proj.id == p.id for proj in mem_db.list_projects(include_deleted=True))
    assert mem_db.list_memory(p.id) == []

    # Operations on a missing project return False
    assert mem_db.delete_project("missing-id") is False
    assert mem_db.restore_project("missing-id") is False
    assert mem_db.purge_project("missing-id") is False
