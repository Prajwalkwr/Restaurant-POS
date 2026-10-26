# Restaurant Management & POS System

Full-stack restaurant management, POS, table ordering, and billing system.

## Stack
- Frontend: React + TypeScript + Vite + Tailwind + TanStack Query
- Backend: Node.js + Express + TypeScript + Socket.IO
- Database: MongoDB replica set + Prisma

## Setup

### Prerequisites
- Node.js 20+
- MongoDB 6+ configured as a replica set (transactions require replica-set mode)

### Database
Set `DATABASE_URL` in `server/.env` to your MongoDB replica-set connection string. For a local development replica set, use:

```env
DATABASE_URL="mongodb://127.0.0.1:27017/restaurant_pos?replicaSet=rs0"
```

MongoDB creates the database when Prisma pushes the schema. Do not use `prisma migrate`; MongoDB uses `prisma db push`.

### Backend
```bash
cd server
cp .env.example .env
# edit .env
npm install
npm run prisma:db-push
npm run prisma:seed
npm run prisma:seed:nepali-menu
npm run dev
```

Server runs on http://localhost:4000

The demo seed refuses to run unless `NODE_ENV` is explicitly set to `development` or `test`. It creates only local/demo accounts and must never be used to provision production administrators. Production accounts must be provisioned through a separate trusted bootstrap process with unique credentials.

To configure manager approval for restricted order edits, set a unique 8-12 digit `MANAGER_PIN` in the private `server/.env` file and run `npm run prisma:update-restaurant`. Do not reuse the demo PIN or share this value with staff accounts.

`prisma:seed:nepali-menu` additively creates or refreshes 15 Nepali menu items and their categories for the existing first restaurant. It is safe to rerun and uses the bundled food photos in `client/public/menu-images/photos`. Photo credits and licenses are listed in `client/public/menu-images/photos/CREDITS.md`.

### Frontend
```bash
cd client
npm install
npm run dev
```
Frontend runs on http://localhost:5173 (proxies /api to backend)

### Production build
```bash
cd client && npm run build
cd ../server && npm run build && npm start
```

## Local development demo credentials

These predictable credentials are for local development only. Never deploy a database seeded with these accounts.

- Admin: admin@restaurant.local / Admin@123
- Waiter: waiterA@restaurant.local / Waiter@123
- Biller: biller@restaurant.local / Biller@123
- Kitchen: kitchen@restaurant.local / Kitchen@123

## Environment variables (server/.env)
- DATABASE_URL (MongoDB replica-set URI)
- PORT
- NODE_ENV
- CLIENT_ORIGIN
- CLOUDINARY_URL (`cloudinary://<api_key>:<api_secret>@<cloud_name>`) for menu product image uploads
- MANAGER_PIN (optional; private 8-12 digit manager approval PIN)

Menu product images are uploaded by the authenticated Admin menu form to Cloudinary and saved as secure image URLs. To enable uploads, set `CLOUDINARY_URL` in `server/.env` using credentials from your Cloudinary console, then restart the server. Supported image formats are JPEG, PNG, and WebP, up to 5 MB per image.

## Tests
```bash
cd server && npm test
```
