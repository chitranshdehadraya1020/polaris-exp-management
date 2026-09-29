"""
serializers.py
----------------
One generic helper to turn any SQLAlchemy model instance (from models.py)
into a plain JSON-serializable dict, so we don't have to hand-write a
to_dict() method for all 17 tables.
"""

from datetime import datetime, date
from sqlalchemy import inspect


def model_to_dict(obj) -> dict:
    if obj is None:
        return None
    result = {}
    for column in inspect(obj.__class__).columns:
        value = getattr(obj, column.name)
        if isinstance(value, (datetime, date)):
            value = value.isoformat()
        result[column.name] = value
    return result


def models_to_list(objs) -> list:
    return [model_to_dict(o) for o in objs]
