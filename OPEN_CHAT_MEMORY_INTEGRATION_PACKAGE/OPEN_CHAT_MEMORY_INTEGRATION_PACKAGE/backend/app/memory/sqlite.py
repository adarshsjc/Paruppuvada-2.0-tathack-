import sqlite3
import uuid
import json
from datetime import datetime, timezone
from typing import List, Optional
from app.memory.base import MemoryProvider, MemoryItem, Project

class SQLiteMemoryProvider(MemoryProvider):
    def __init__(self, db_path: str = "memory.db"):
        self.db_path = db_path
        self._init_db()
        
    def _get_conn(self):
        if self.db_path.startswith("file:"):
            return sqlite3.connect(self.db_path, uri=True)
        return sqlite3.connect(self.db_path)

    def _init_db(self):
        with self._get_conn() as conn:
            conn.execute('''CREATE TABLE IF NOT EXISTS projects
                            (id TEXT PRIMARY KEY, name TEXT UNIQUE)''')
            conn.execute('''CREATE TABLE IF NOT EXISTS memories
                            (id TEXT PRIMARY KEY, project_id TEXT, type TEXT, content TEXT, 
                             source TEXT, tags TEXT, timestamp TEXT)''')
            
    def create_project(self, name: str) -> Project:
        project_id = str(uuid.uuid4())
        with self._get_conn() as conn:
            try:
                conn.execute("INSERT INTO projects (id, name) VALUES (?, ?)", (project_id, name))
            except sqlite3.IntegrityError:
                raise ValueError("Project with this name already exists")
        return Project(id=project_id, name=name)

    def list_projects(self) -> List[Project]:
        with self._get_conn() as conn:
            rows = conn.execute("SELECT id, name FROM projects").fetchall()
        return [Project(id=r[0], name=r[1]) for r in rows]

    def add_memory(self, item: MemoryItem) -> MemoryItem:
        if not item.id:
            item.id = str(uuid.uuid4())
        if not item.timestamp:
            item.timestamp = datetime.now(timezone.utc)
        with self._get_conn() as conn:
            conn.execute("INSERT INTO memories (id, project_id, type, content, source, tags, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
                         (item.id, item.project_id, item.type, item.content, item.source, json.dumps(item.tags), item.timestamp.isoformat()))
        return item
        
    def search_memory(self, query: str, project_id: Optional[str], type: Optional[str] = None) -> List[MemoryItem]:
        query = f"%{query}%"
        with self._get_conn() as conn:
            sql = "SELECT id, project_id, type, content, source, tags, timestamp FROM memories WHERE content LIKE ?"
            params = [query]
            
            if project_id:
                sql += " AND (project_id = ? OR project_id IS NULL OR type = 'global')"
                params.append(project_id)
            else:
                sql += " AND (project_id IS NULL OR type = 'global')"
                
            if type:
                sql += " AND type = ?"
                params.append(type)
                
            rows = conn.execute(sql, params).fetchall()
        
        return [MemoryItem(id=r[0], project_id=r[1], type=r[2], content=r[3], source=r[4], tags=json.loads(r[5]), timestamp=datetime.fromisoformat(r[6])) for r in rows]

    def list_memory(self, project_id: Optional[str], type: Optional[str] = None) -> List[MemoryItem]:
        with self._get_conn() as conn:
            sql = "SELECT id, project_id, type, content, source, tags, timestamp FROM memories WHERE 1=1"
            params = []
            if project_id:
                sql += " AND project_id = ?"
                params.append(project_id)
            else:
                sql += " AND project_id IS NULL"
            if type:
                sql += " AND type = ?"
                params.append(type)
            rows = conn.execute(sql, params).fetchall()
        return [MemoryItem(id=r[0], project_id=r[1], type=r[2], content=r[3], source=r[4], tags=json.loads(r[5]), timestamp=datetime.fromisoformat(r[6])) for r in rows]

    def get_memory(self, memory_id: str) -> Optional[MemoryItem]:
        with self._get_conn() as conn:
            row = conn.execute("SELECT id, project_id, type, content, source, tags, timestamp FROM memories WHERE id = ?", (memory_id,)).fetchone()
        if not row: return None
        return MemoryItem(id=row[0], project_id=row[1], type=row[2], content=row[3], source=row[4], tags=json.loads(row[5]), timestamp=datetime.fromisoformat(row[6]))

    def update_memory(self, memory_id: str, content: str, tags: List[str]) -> bool:
        with self._get_conn() as conn:
            cur = conn.execute("UPDATE memories SET content = ?, tags = ? WHERE id = ?", (content, json.dumps(tags), memory_id))
            return cur.rowcount > 0

    def delete_memory(self, memory_id: str) -> bool:
        with self._get_conn() as conn:
            cur = conn.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
            return cur.rowcount > 0

# Singleton provider
_provider = None
def get_memory_provider(db_path="memory.db") -> MemoryProvider:
    global _provider
    if not _provider or _provider.db_path != db_path:
        _provider = SQLiteMemoryProvider(db_path)
    return _provider
