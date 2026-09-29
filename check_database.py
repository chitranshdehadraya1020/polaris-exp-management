import sqlite3

db = sqlite3.connect("polar_ops.db")

cursor = db.cursor()

cursor.execute("""
    SELECT name
    FROM sqlite_master
    WHERE type='table'
    ORDER BY name
""")

tables = cursor.fetchall()

print("\nPOLAR-OPS TABLES")
print("================")

for table in tables:
    print(table[0])

print("\nTotal tables:", len(tables))

db.close()