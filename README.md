# Kangrow AI Backend

> AI-powered E-commerce Co-Founder Platform API

Built with **Node.js + TypeScript + Express + Firebase Firestore + OpenAI**.

---

## Quick Start

### 1. Install dependencies
```bash
cd backend
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```

Then edit `.env` with:
- **FIREBASE_PROJECT_ID**, **FIREBASE_CLIENT_EMAIL**, **FIREBASE_PRIVATE_KEY** — from Firebase Console → Project Settings → Service Accounts → Generate new private key
- **OPENAI_API_KEY** — your OpenAI API key

### 3. Run dev server
```bash
npm run dev
```

Server starts at **http://localhost:3000**

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/auth/verify` | Verify Firebase ID token, create/get user |
| POST | `/api/v1/auth/logout` | Logout |

### Users & Profile
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/users/me` | Get current user |
| PATCH | `/api/v1/users/me` | Update user |
| GET | `/api/v1/profile` | Get business profile |
| POST | `/api/v1/profile` | Create/update business profile |

### Onboarding
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/onboarding/next-question` | Get AI-generated next question |
| POST | `/api/v1/onboarding/complete` | Complete onboarding |

### Chat (Main AI)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/chat/sessions` | List chat sessions |
| POST | `/api/v1/chat/sessions` | Create new session |
| GET | `/api/v1/chat/sessions/:id/messages` | Get messages |
| POST | `/api/v1/chat/sessions/:id/messages` | **Send message → AI responds** |

### E-commerce Engines
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/ecommerce/ideas/generate` | Generate product ideas |
| GET | `/api/v1/ecommerce/ideas/saved` | Get saved ideas |
| POST | `/api/v1/ecommerce/validate/product` | Validate a product |
| POST | `/api/v1/ecommerce/validate/competitors` | Competitor analysis |
| POST | `/api/v1/ecommerce/business-plan/generate` | Generate business plan |
| POST | `/api/v1/ecommerce/business-plan/roadmap` | Generate roadmap |

### Workspace & Notifications
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/workspace` | Get workspace items |
| POST | `/api/v1/workspace` | Save item |
| DELETE | `/api/v1/workspace/:itemId` | Delete item |
| GET | `/api/v1/notifications` | Get notifications |
| PATCH | `/api/v1/notifications/read-all` | Mark all as read |

---

## Authentication

All endpoints (except `/health`) require:
```
Authorization: Bearer <Firebase_ID_Token>
```

The Flutter app gets this token after Google/Apple sign-in via Firebase Auth.

---

## Firestore Data Model

```
users/{uid}                    → User account
profiles/{uid}                 → Business profile
users/{uid}/memory/            → Business memory facts
users/{uid}/chatSessions/      → Chat sessions
users/{uid}/chatSessions/{id}/messages/  → Messages
users/{uid}/workspace/         → Saved ideas, plans, roadmaps
users/{uid}/notifications/     → In-app alerts
onboardingState/{uid}          → Onboarding answers
```

---

## Architecture

```
Request
  ↓
Auth Middleware (Firebase token verify)
  ↓
Rate Limiter
  ↓
Route → Controller
  ↓
Service Layer
  ↓
AI Router (intent detection)
  ↓
Context Builder (profile + memory → system prompt)
  ↓
OpenAI GPT-4o
  ↓
Response + usedModules → Flutter UI badges
```
