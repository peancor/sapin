# CLAUDE.md - Sapin Project Guide

## Project Overview

**Sapin** (Sistema de Aprendizaje e Innovación Interactiva) is a full-stack EdTech platform that enables educators to create interactive courses with AI-powered conversational activities. Students interact with configurable AI "roles" (tutors, experts, simulated patients, etc.) for practice and feedback.

**Version:** 0.99.1
**Primary users:** Administrators, Teachers, Students (+ Assistant role)

## Tech Stack

- **Framework:** SvelteKit 2.50 (fullstack, adapter-node) with Svelte 5
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS 4 + Flowbite Svelte
- **Database:** SQLite via better-sqlite3
- **ORM:** Drizzle ORM with drizzle-kit for migrations
- **AI:** Vercel AI SDK v6 + OpenAI / OpenRouter / Anthropic / Google / LMStudio providers
- **Vector DB:** Qdrant (for embeddings/RAG)
- **Auth:** Custom session-based auth (Argon2 + SHA256 session tokens + HTTP-only cookies)
- **i18n:** Inlang Paraglide JS (Spanish base locale, English)
- **Icons:** lucide-svelte
- **Rich text:** TipTap 3
- **Anti-bot:** Cloudflare Turnstile
- **Email:** Nodemailer
- **Notifications:** In-app + Telegram + Email channels

## Project Structure

```
src/
├── app.d.ts                 # App types (Locals, Turnstile)
├── hooks.server.ts          # Session loading, user injection into locals
├── lib/
│   ├── constants.ts         # interactiveLearningTypes, ACTIVITY_COMPLETION_MIN_MESSAGES
│   ├── components/          # Svelte UI components (PascalCase)
│   │   ├── insights/        # Analytics/insights components
│   │   ├── notifications/   # NotificationBell, NotificationDropdown
│   │   └── charts/          # ECharts wrappers
│   ├── helpers/             # dateUtils.ts, system prompt templates (.txt/.md)
│   ├── stores/              # Svelte stores (analytics, insights, breadcrumb, theme...)
│   ├── types/               # TypeScript types (email, insights, navigation)
│   ├── utils/               # Client/shared utilities
│   ├── paraglide/           # Generated i18n module (do not edit)
│   └── server/              # Server-only code
│       ├── auth.ts          # Session management (generateSessionToken, validateSessionToken)
│       ├── roles.ts         # ROLE_LEVELS, ROLE_NAMES, hasMinRoleLevel(), isAdmin()...
│       ├── turnstile.ts     # Cloudflare Turnstile verification
│       ├── ai/              # AI integration
│       │   ├── AIUtils.ts           # Main facade: streamTextFromPrompt/Messages, checkQuota
│       │   ├── AIModelService.ts    # Provider/model CRUD
│       │   ├── AIImageUtils.ts      # Image generation
│       │   ├── InsightsUtils.ts     # AI-powered analytics
│       │   └── services/            # ModelResolver, RagService, SystemPromptBuilder, UsageTracker
│       ├── analytics/       # AnalyticsService, aggregation
│       ├── db/
│       │   ├── index.ts     # DB connection (better-sqlite3)
│       │   ├── schema/      # Drizzle table definitions (index.ts re-exports all)
│       │   └── DB*Utils.ts  # Query helpers per domain
│       ├── email/           # EmailService, nodemailer
│       ├── files/           # FileStorageService, ImageProcessor, FilePermissionMiddleware
│       ├── integrations/    # moodle/MoodleClient.ts
│       ├── logging/         # AuditService, logger
│       ├── notifications/   # NotificationService, NotificationTypes
│       ├── notifier/        # TelegramNotifier, VoidNotifier
│       ├── qdrant/          # documentProcessor, embeddings
│       ├── rag/             # config
│       ├── sn/              # Server-side utilities
│       ├── students/        # moodleImport
│       └── utils/           # moderation, openRouter, publicUrl
├── routes/
│   ├── (app)/               # All protected routes
│   │   ├── admin/           # System admin (users, AI models, analytics, files, settings...)
│   │   ├── course/[cid]/    # Course pages (admin panel + student run)
│   │   ├── dashboard/       # User dashboard
│   │   ├── interactive-chat/# Chat interface
│   │   ├── student/         # Student-specific pages
│   │   ├── login/ logout/ register/ profile/ notifications/
│   │   └── (misc)/          # Static pages (about, privacy, cookies...)
│   └── api/                 # REST API endpoints
│       ├── admin/           # Admin APIs (files, qdrant, model-playground...)
│       ├── ai/insights/     # AI insights per activity
│       ├── analytics/       # Session, events, stats, realtime
│       ├── course/[cid]/activity/  # Start/end/complete activity
│       ├── courses/         # Course CRUD + progress + Moodle import
│       ├── files/           # Upload, retrieve, thumbnail
│       ├── interactive-chat/# Chat create + ask + messages
│       ├── interactive/     # Export/import interactives
│       └── notifications/   # CRUD + read-all + unread-count
├── drizzle/                 # DB migrations
├── messages/                # es.json (base), en.json
└── uploads/                 # File storage (files/, temp/, deleted/)
```

## Common Commands

```bash
npm run dev              # Start dev server (localhost:5173)
npm run build            # Production build
npm run check            # TypeScript/Svelte type checking
npm run lint             # ESLint + Prettier check
npm run format           # Format code with Prettier
npm run db:push          # Sync schema to DB (dev only)
npm run db:migrate       # Run migrations
npm run db:studio        # Open Drizzle Studio (DB GUI)
npm run machine-translate # Auto-translate with Inlang
```

## Code Conventions

### File Naming
- **Svelte components:** `PascalCase.svelte` (e.g., `CourseCard.svelte`)
- **Server utilities:** `camelCase` + `Utils` suffix (e.g., `DBCourseUtils.ts`)
- **Schema files:** `lowercase.ts` (e.g., `courses.ts`, `users.ts`)
- **Types:** `lowercase.ts` in `src/lib/types/`

### Svelte 5 Patterns
```typescript
// Props
interface Props { courseId: string; title?: string; }
let { courseId, title = 'Default' }: Props = $props();

// State
let isLoading = $state(false);
let items = $state<Item[]>([]);

// Derived
let filtered = $derived(items.filter(i => i.active));

// Effects
$effect(() => { /* runs when dependencies change */ });
```

### API Endpoints (+server.ts)

Every endpoint must enforce auth and role checks explicitly — **do not rely on layout protection for API routes**.

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import { ROLE_LEVELS } from '$lib/server/roles';

// Authenticated user (any role)
export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) return new Response('Unauthorized', { status: 401 });
    // ...
};

// Admin only (level >= 90)
export const POST: RequestHandler = async ({ locals, request }) => {
    if (!locals.user) return new Response('Unauthorized', { status: 401 });
    if (locals.user.highestRoleLevel < ROLE_LEVELS.ADMIN)
        return new Response('Forbidden', { status: 403 });

    const body = await request.json();
    const result = schema.safeParse(body);
    if (!result.success) return json({ error: 'Invalid input' }, { status: 400 });

    return json({ success: true });
};

// Teacher or above (level >= 50)
export const PUT: RequestHandler = async ({ locals, request }) => {
    if (!locals.user) return new Response('Unauthorized', { status: 401 });
    if (locals.user.highestRoleLevel < ROLE_LEVELS.TEACHER)
        return new Response('Forbidden', { status: 403 });
    // ...
};
```

### Database Queries (Drizzle ORM)
```typescript
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

const [course] = await db.select().from(table.course).where(eq(table.course.id, courseId));

await db.update(table.course).set({ name: 'New Name', updatedAt: new Date() }).where(eq(table.course.id, courseId));

await db.insert(table.course).values({ id: nanoid(), name: 'Course', createdAt: new Date(), updatedAt: new Date() });
```

### Type Definitions
```typescript
// Prefer const objects over enums
export const courseStatus = { DRAFT: 'draft', PUBLISHED: 'published', ARCHIVED: 'archived' } as const;
export type CourseStatusType = (typeof courseStatus)[keyof typeof courseStatus];

// Infer types from Drizzle schema
export type Course = typeof course.$inferSelect;
export type NewCourse = typeof course.$inferInsert;
```

## Key Architectural Patterns

### Authentication & Authorization

**Session mechanics:**
- Session-based auth: 30-day rolling expiration, renewed when 15+ days old
- Tokens: SHA256(base64url random bytes), stored hashed in DB
- `locals.user` and `locals.session` injected by `hooks.server.ts` on every request

**Role hierarchy (system-wide):**

| Role | Level | Constant |
|------|-------|----------|
| SUPER_ADMIN | 100 | `ROLE_LEVELS.SUPER_ADMIN` |
| ADMIN | 90 | `ROLE_LEVELS.ADMIN` |
| TEACHER | 50 | `ROLE_LEVELS.TEACHER` |
| ASSISTANT | 40 | `ROLE_LEVELS.ASSISTANT` |
| STUDENT | 10 | `ROLE_LEVELS.STUDENT` |

Use `locals.user.highestRoleLevel` for numeric comparisons. Helpers in `$lib/server/roles.ts`: `hasMinRoleLevel(user, level)`, `isAdmin(user)`, `isTeacher(user)`, `isAssistant(user)`, `isStudent(user)`.

**Course-level roles:**
Beyond system roles, courses have their own role assignments (`courseRole` table). Use `CourseRoleUtils.getUserHighestCourseRole(userId, courseId)` to check if a user is owner/teacher/assistant/student within a specific course. A system admin bypasses course-level checks.

**Authorization rules by area:**

| Area | Minimum requirement |
|------|-------------------|
| Any authenticated page | `locals.user` exists |
| System admin pages/APIs | `highestRoleLevel >= 90` (ADMIN) |
| Course admin panel | system ADMIN **or** course role >= assistant |
| Teacher actions (create course, manage interactives) | `highestRoleLevel >= 50` (TEACHER) |
| Student chat/activity access | authenticated + `InteractiveChatAuthUtils.userCanAccessChat()` |
| Notifications, profile | any authenticated user (own data only) |

**Enforcement layers:**
- **Page routes:** `+layout.server.ts` checks auth/role and throws `error(401/403)` or `redirect`. Pages within the layout inherit this protection.
- **API routes:** Must check auth inline — layout protection does NOT cover API endpoints. Always validate `locals.user` and `highestRoleLevel` at the top of each handler.
- **Resource ownership:** For user-scoped data (notifications, chats), filter by `userId` in the query — never trust a client-supplied ID without verifying it belongs to `locals.user.id`.

### Database Schema (`src/lib/server/db/schema/`)
| File | Key Tables |
|------|-----------|
| `users.ts` | `user`, `session` |
| `courses.ts` | `course`, `invite`, `courseFile`, `courseRole` |
| `interactive.ts` | `interactiveLearning`, `courseInteractiveLearning`, `interactiveLearningChat`, `userInteractiveLearningChat` |
| `chat.ts` | `chat`, `message` |
| `roles.ts` | `role`, `userRoleAssignment`, `roleAuditLog` |
| `progress.ts` | `learningActivityProgress`, `learningProgressEvent`, `courseProgressSummary` |
| `ai.ts` | `aiProvider`, `aiModel`, `aiUsageLog`, `aiQuota`, `aiUsageDailyStats` |
| `analytics.ts` | `analyticsSession`, `analyticsEvent`, `analyticsDailyStats` |
| `notifications.ts` | `notification` |
| `files.ts` | `fileStorage`, `fileAccessLog`, `fileSystemSetting` |
| `audit.ts` | `auditLog` |
| `system.ts` | `appSetting` |

### AI Integration
- Multi-provider: OpenAI, OpenRouter, Anthropic, Google, LMStudio, custom
- Models stored in DB and resolved at runtime via `ModelResolver.ts`
- Main facade: `AIUtils.ts` → `streamTextFromPrompt()`, `streamTextFromMessages()`, `checkQuota()`, `logUsage()`
- RAG: `RagService.ts` + Qdrant vector DB + embeddings
- System prompts built by `SystemPromptBuilder.ts` using Handlebars templates in `src/lib/helpers/`
- Usage tracked per user/model with daily quotas

### i18n
- Base locale: Spanish (`es.json`). Secondary: English (`en.json`)
- Use Paraglide generated functions from `$lib/paraglide/`
- Run `npm run machine-translate` to auto-translate new keys

## Important Notes

- **Node.js 22.14.0+** required
- Database file: `local.db` (SQLite, local to repo root)
- Environment config: copy `.env.example` to `.env`
- `ORIGIN` env var required for absolute URLs and HTTP-Referer headers
- `FILES_STORAGE_PATH`, `FILES_TEMP_PATH`, `FILES_DELETED_PATH` control upload directories
- Cloudflare Turnstile keys required for registration/login anti-bot
- No test suite currently configured
- Streaming responses use Server-Sent Events (SSE) via Vercel AI SDK

## Common Import Paths

```typescript
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { ROLE_LEVELS, isAdmin, hasMinRoleLevel } from '$lib/server/roles';
import { interactiveLearningTypes } from '$lib/constants';
import AIUtils from '$lib/server/ai/AIUtils';
```
