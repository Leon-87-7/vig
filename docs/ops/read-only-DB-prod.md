```powershell
ssh root@185.162.125.82 "docker compose exec -T api sqlite3 -header -csv /app/data/jobs.db ""SELECT tg_id, username, first_name, last_name, email, status, created_at, updated_at FROM users ORDER BY created_at DESC;""" > prod-users.csv
```
