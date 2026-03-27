# shopnew_

Real-time multi-user Kanban task board built with Node.js/TypeScript (backend) and React/Vite (frontend).

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL

### Install Dependencies
```bash
cd backend && npm install
cd ../frontend && npm install
```

### Environment Setup
```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your database credentials
```

### Database Migration
```bash
# Run from the repo root (delegates to backend/src/db/migrate.ts)
npm run db:migrate
```

### Development
```bash
# Terminal 1 - backend (port 3001)
npm run dev:backend

# Terminal 2 - frontend (port 5173)
npm run dev:frontend
```

### Build
```bash
npm run build
```

### Tests
```bash
npm run test:unit          # unit tests (no DB required)
npm run test:integration   # integration tests (requires DB)
```

See [DESIGN.md](DESIGN.md) for architecture and conflict-resolution strategy.