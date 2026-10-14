from typing import Generic, TypeVar, Type, Any, Optional
from pydantic import BaseModel
from ..db import get_database

T = TypeVar("T", bound=BaseModel)

class BaseRepository(Generic[T]):
    def __init__(self, model_class: Type[T], collection_name: str):
        self.model_class = model_class
        self.collection_name = collection_name
    
    @property
    def collection(self):
        return get_database()[self.collection_name]
    
    async def get_by_id(self, id_field: str, id_value: str) -> Optional[T]:
        doc = await self.collection.find_one({id_field: id_value})
        if doc:
            return self.model_class(**doc)
        return None

    async def insert(self, document: T) -> T:
        doc_dict = document.model_dump()
        await self.collection.insert_one(doc_dict)
        return document
    
    async def update(self, id_field: str, id_value: str, update_data: dict) -> bool:
        result = await self.collection.update_one(
            {id_field: id_value},
            {"$set": update_data}
        )
        return result.modified_count > 0

    async def delete(self, id_field: str, id_value: str) -> bool:
        result = await self.collection.delete_one({id_field: id_value})
        return result.deleted_count > 0
