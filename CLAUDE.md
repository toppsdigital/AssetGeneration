# AssetGeneration — Claude Code Instructions

## Project Overview
Next.js frontend for the asset generation pipeline. Paired with the `ContentPipeline` Python Lambda backend (`toppsdigital/ContentPipeline`).

## Key File Locations
- **Proxy**: `app/api/content-pipeline-proxy/route.ts` — operation switch + `available_operations` array
- **API client**: `web/utils/contentPipelineApi.ts` — `ContentPipelineAPI` class (singleton export)
- **Pages**: `app/<page-name>/page.tsx`
- **Home page**: `app/page.tsx`
- **Components**: `components/`
- **Styles**: `styles/Home.module.css`

## Coding Conventions
- Frontend proxy extracts params via `searchParams.get('operation')`, `searchParams.get('id')`, etc.
- GET proxy cases: set `apiMethod = 'GET'` and `apiBody = {}`
- POST proxy cases: set `apiMethod = 'POST'` (body passthrough from request)
- API client methods return parsed data (not raw `Response`)
- **Always update the `available_operations` array** when adding new proxy cases

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
