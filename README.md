# GrievanceIQ

Civic grievance portal: React + Vite + Tailwind frontend, Express + SQLite backend.
Requires Node.js 22 or newer.

## Run
1. `npm install`
2. Create an administrator (admin accounts cannot be created from the website):
   `npm run create-admin -- --id ADM-1001 --email you@example.com --name "Your Name" --password "<10+ characters>"`
3. `npm run dev` then open http://localhost:5173
4. Citizens register themselves from the Sign Up button.

## Production
`npm run build` then `npm start` (serves the site and API on port 3001).
Set `JWT_SECRET` and `NODE_ENV=production`, and use HTTPS.

Data is stored in `server/data/` (created on first run). Do not share that folder.
