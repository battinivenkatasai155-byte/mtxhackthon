<<<<<<< HEAD
# GrievanceIQ

Civic grievance portal: React + Vite + Tailwind frontend, Express + PostgreSQL backend.
Requires Node.js 22 or newer and a PostgreSQL 13+ database.

## Run
1. Create a database (e.g. `createdb grievanceiq`) and set `DATABASE_URL=postgres://user:password@localhost:5432/grievanceiq` (or the standard `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`). Tables are created automatically on first start.
2. `npm install`
3. Create an administrator (admin accounts cannot be created from the website):
   `npm run create-admin -- --id ADM-1001 --email you@example.com --name "Your Name" --password "<10+ characters>"`
4. `npm run dev` then open http://localhost:5173
5. Citizens register themselves from the Sign Up button.

## Production
`npm run build` then `npm start` (serves the site and API on port 3001).
Set `JWT_SECRET` and `NODE_ENV=production`, and use HTTPS.

Records are stored in PostgreSQL; uploaded attachments and the generated JWT secret live in `server/data/` (or `DATA_DIR`). Do not share that folder.
=======
# mtxhackthon
>>>>>>> origin/main
