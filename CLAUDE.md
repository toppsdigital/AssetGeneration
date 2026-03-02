# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Next.js 15 (App Router) frontend for the Topps asset generation pipeline. Paired with the `ContentPipeline` Python Lambda backend (`toppsdigital/ContentPipeline`). Authenticated via Okta through NextAuth.

## Build & Dev Commands
- **Dev server**: `npm run dev` (runs on port 5000)
- **Production build**: `npx next build` — must succeed with 0 errors before committing
- **Start production**: `npm start`
- **No lint/test scripts** are configured; there are no project-level tests

## Architecture

### Request Flow
Client component → `contentPipelineApi.method()` → `/api/content-pipeline-proxy?operation=X` → Backend Lambda API → response normalized and returned.

### Key File Locations
- **Proxy route**: `app/api/content-pipeline-proxy/route.ts` — operation switch + `available_operations` array (~59KB, 30+ operations)
- **API client**: `web/utils/contentPipelineApi.ts` — `ContentPipelineAPI` singleton class
- **Pages**: `app/<page-name>/page.tsx` (home, job, new-job, pending-jobs, test-datastore)
- **Auth**: `app/auth/` — Okta provider config, `app/middleware.ts` for auth middleware
- **Root layout**: `app/layout.tsx` — wraps all pages with auth check, QueryProvider, UserSessionHeader

### State Management
- **Server state**: TanStack React Query (`@tanstack/react-query`) for API data caching and refetching
- **Client state**: Zustand (`web/store/psdStore.ts`) for PSD template/layer editing state
- **Data orchestration**: `hooks/useAppDataStore.ts` (~61KB) — comprehensive hook managing jobs, files, assets with polling

### Other API Routes
Besides the main content-pipeline-proxy, there are specialized routes: `s3-proxy`, `s3-upload`, `firefly-proxy`, `pdf-extract`, `upload-pdfs`.

### Environment
- `NEXT_PUBLIC_S3_ENVIRONMENT` controls dev/qa/prod
- `CONTENT_PIPELINE_API_URL` — backend Lambda endpoint
- S3 URL helpers in `utils/environment.ts` (`buildS3PublicUrl`, `buildS3UploadsPath`, etc.)

## Coding Conventions
- Frontend proxy extracts params via `searchParams.get('operation')`, `searchParams.get('id')`, etc.
- GET proxy cases: set `apiMethod = 'GET'` and `apiBody = {}`
- POST proxy cases: set `apiMethod = 'POST'` (body passthrough from request)
- API client methods return parsed data (not raw `Response`)
- **Always update the `available_operations` array** when adding new proxy cases
- CSS Modules for styling (`styles/*.module.css`)

## Adding a New Backend-Proxied Feature
1. Add `searchParams.get()` extractions if new query params are needed
2. Add `case` block in the proxy route switch statement
3. Add `available_operations` entry
4. Add method to `ContentPipelineAPI` class in `contentPipelineApi.ts`
5. Update page component to use the new method

## Verification
- Full build check: `npx next build` — must succeed with 0 errors
- Grep to confirm all new operation names appear in proxy, API client, and page

## Git Workflow
- **Always branch off `main`** unless explicitly told otherwise
- **Always create a new `feature/<name>` branch** — never commit directly to main
- Use matching branch names with the ContentPipeline backend repo
- Commit only relevant files — exclude unrelated working tree changes
- PRs should include `## Summary` and `## Test plan` sections
- **Keep `main` and `topps-dev` in sync** — after merging a PR to main, merge main into topps-dev and push:
  ```
  git checkout topps-dev && git pull origin topps-dev && git merge main && git push origin topps-dev
  ```
