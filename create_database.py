from database import Base, engine
import models  # noqa: F401

Base.metadata.create_all(bind=engine)
print('POLAR database is ready.')
