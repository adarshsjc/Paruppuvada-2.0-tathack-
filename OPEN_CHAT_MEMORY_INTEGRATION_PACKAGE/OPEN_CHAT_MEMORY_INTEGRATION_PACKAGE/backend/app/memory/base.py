from abc import ABC, abstractmethod
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timezone

class MemoryItem(BaseModel):
    id: Optional[str] = None
    project_id: Optional[str] = None
    type: str
    content: str
    source: str
    tags: List[str] = []
    timestamp: Optional[datetime] = None

class Project(BaseModel):
    id: str
    name: str

class MemoryProvider(ABC):
    @abstractmethod
    def create_project(self, name: str) -> Project: pass
    
    @abstractmethod
    def list_projects(self) -> List[Project]: pass
    
    @abstractmethod
    def add_memory(self, item: MemoryItem) -> MemoryItem: pass
    
    @abstractmethod
    def search_memory(self, query: str, project_id: Optional[str], type: Optional[str] = None) -> List[MemoryItem]: pass
    
    @abstractmethod
    def list_memory(self, project_id: Optional[str], type: Optional[str] = None) -> List[MemoryItem]: pass
    
    @abstractmethod
    def get_memory(self, memory_id: str) -> Optional[MemoryItem]: pass
    
    @abstractmethod
    def update_memory(self, memory_id: str, content: str, tags: List[str]) -> bool: pass
    
    @abstractmethod
    def delete_memory(self, memory_id: str) -> bool: pass
