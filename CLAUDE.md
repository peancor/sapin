# CLAUDE.md - Sapin Project Guide

## Project Overview

**Sapin** (Sistema de Aprendizaje e Innovación Interactiva) is a full-stack EdTech platform that enables educators to create interactive courses with AI-powered conversational activities. Students interact with configurable AI "roles" (tutors, experts, simulated patients, etc.) for practice and feedback.

**Primary users:** Administrators, Teachers, Students

## Tech Stack

- **Framework:** SvelteKit 2.50 (fullstack) with Svelte 5
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS 4 + Flowbite Svelte
- **Database:** SQLite via better-sqlite3
- **ORM:** Drizzle ORM with drizzle-kit for migrations
- **AI:** Vercel AI SDK + OpenAI/OpenRouter providers
- **Vector DB:** Qdrant (for embeddings/RAG)
- **Auth:** Custom Lucia implementation (Argon2 + session cookies)
- **i18n:** Inlang Paraglide JS (Spanish/English)
- **Icons:** lucide-svelte

## Project Structure

```
src/
├── lib/
│   ├── components/          # Svelte UI components (PascalCase)
│   ├── server/              # Server-only code
│   │   ├── ai/              # AI integration (AIUtils, AIModelService)
│   │   ├── db/              # Database layer
│   │   │   ├── schema/      # Drizzle table definitions
│   │   │   └── *Utils.ts    # Query helpers (DBCourseUtils, etc.)
│   │   ├── analytics/       # Analytics service
│   │   ├── auth.ts          # Authentication logic
│   │   └── ...
│   ├── helpers/             # Utility functions
│   ├── types/               # TypeScript type definitions
│   ├── stores/              # Svelte stores
│   └── paraglide/           # i18n messages
├── routes/
│   ├── (app)/               # Protected app routes
│   │   ├── admin/           # Admin pages
│   │   ├── teacher/         # Teacher pages
│   │   ├── student/         # Student pages
│   │   └── ...
│   └── api/                 # REST API endpoints
├── drizzle/                 # DB migrations
├── messages/                # Translation files (es.json, en.json)
└── uploads/                 # File storage
```

## Common Commands

```bash
npm run dev          # Start dev server (localhost:5173)
npm run build        # Production build
npm run check        # TypeScript/Svelte type checking
npm run lint         # ESLint + Prettier check
npm run format       # Format code with Prettier
npm run db:push      # Sync schema to database
npm run db:studio    # Open Drizzle Studio (DB GUI)
npm run db:migrate   # Run migrations
```

## Code Conventions

### File Naming
- **Svelte components:** `PascalCase.svelte` (e.g., `CourseCard.svelte`)
- **Utility files:** `camelCase` + `Utils` suffix (e.g., `DBCourseUtils.ts`)
- **Schema files:** `lowercase.ts` (e.g., `courses.ts`, `users.ts`)
- **Types:** `lowercase.ts` in `src/lib/types/`

### Svelte 5 Patterns
```typescript
// Props with TypeScript
interface Props {
    courseId: string;
    title?: string;
}
let { courseId, title = 'Default' }: Props = $props();

// State
let isLoading = $state(false);
let items = $state<Item[]>([]);

// Derived state
let filteredItems = $derived(items.filter(i => i.active));

// Effects
$effect(() => {
    // Runs when dependencies change
});
```

### API Endpoints (+server.ts)
```typescript
import { json, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ params, locals, request }) => {
    // Auth check
    if (!locals.user?.id) {
        return new Response('Unauthorized', { status: 401 });
    }

    // Validate input with Zod
    const body = await request.json();
    const result = schema.safeParse(body);
    if (!result.success) {
        return json({ error: 'Invalid input' }, { status: 400 });
    }

    // Business logic...
    return json({ success: true });
};
```

### Database Queries (Drizzle ORM)
```typescript
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

// Select
const [course] = await db
    .select()
    .from(table.course)
    .where(eq(table.course.id, courseId));

// Update
await db
    .update(table.course)
    .set({ name: 'New Name', updatedAt: new Date() })
    .where(eq(table.course.id, courseId));

// Insert
await db.insert(table.course).values({
    id: nanoid(),
    name: 'Course Name',
    createdAt: new Date(),
    updatedAt: new Date()
});
```

### Type Definitions
```typescript
// Use const objects for enums
export const courseStatus = {
    DRAFT: 'draft',
    PUBLISHED: 'published',
    ARCHIVED: 'archived'
} as const;

export type CourseStatusType = (typeof courseStatus)[keyof typeof courseStatus];

// Infer types from Drizzle schema
export type Course = typeof course.$inferSelect;
export type NewCourse = typeof course.$inferInsert;
```

### Error Handling
```typescript
try {
    // Operation
    return result;
} catch (error) {
    console.error('Error in functionName:', error);
    throw error;
}
```

## Key Architectural Patterns

### Authentication & Authorization
- Session-based auth with 30-day rolling expiration
- Role hierarchy: Admin > Teacher > Student
- Check `locals.user` and `locals.user.highestRoleLevel` in routes
- Role levels defined in `ROLE_LEVELS` constant

### Database Schema Organization
Key tables in `src/lib/server/db/schema/`:
- `users.ts` - User accounts, preferences
- `courses.ts` - Courses with lifecycle (draft/published/archived)
- `interactive.ts` - Interactive learning activities
- `chat.ts` - Chat sessions and messages
- `roles.ts` - RBAC system
- `analytics.ts` - Event tracking
- `ai.ts` - AI providers, models, usage logs

### AI Integration
- Models configured via `AIModelService.ts`
- Chat streaming via `AIUtils.ts`
- Supports multiple providers (OpenAI, OpenRouter)
- Usage tracking and quotas

### i18n
- Translation files in `messages/` (es.json, en.json)
- Use Paraglide functions for translations
- Run `npm run machine-translate` to auto-translate

## Important Notes

- **Node.js 22.14.0+** required
- Database file: `local.db` (SQLite)
- Environment config: copy `.env.example` to `.env`
- No test suite currently configured
- Streaming responses use Server-Sent Events (SSE)

## Common Import Paths

```typescript
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import DBCourseUtils from '$lib/server/db/DBCourseUtils';
import { ROLE_LEVELS } from '$lib/constants';
import type { Course } from '$lib/server/db/schema';
```
