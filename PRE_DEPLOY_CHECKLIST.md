# Panel Flow 2.0 - Pre-Deploy Checklist

## Priority 1: Critical (Must Have)

### Environment & Configuration
- [ ] Create production Supabase project (separate from dev)
- [ ] Set up production environment variables
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`
  - [ ] `ANTHROPIC_API_KEY`
- [ ] Run all migrations on production database
- [ ] Verify RLS policies work in production
- [ ] Set up custom domain (if applicable)

### Security
- [ ] Audit API routes for authentication checks
- [ ] Add rate limiting to `/api/chat` endpoint
- [ ] Verify no secrets in client-side code
- [ ] Review Supabase RLS policies one more time
- [ ] Set up CORS properly for production domain

### Error Handling
- [ ] Add global error boundary component
- [ ] Handle Supabase connection failures gracefully
- [ ] Handle AI API failures with user-friendly messages
- [ ] Add retry logic for transient failures

### Data Integrity
- [ ] Test all CRUD operations in production-like environment
- [ ] Verify auto-save doesn't lose data on network issues
- [ ] Test version history restore functionality
- [ ] Verify export generates correct output

---

## Priority 2: Important (Should Have)

### Performance
- [ ] Add database indexes for common queries:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_issues_series_id ON issues(series_id);
  CREATE INDEX IF NOT EXISTS idx_acts_issue_id ON acts(issue_id);
  CREATE INDEX IF NOT EXISTS idx_scenes_act_id ON scenes(act_id);
  CREATE INDEX IF NOT EXISTS idx_pages_scene_id ON pages(scene_id);
  CREATE INDEX IF NOT EXISTS idx_panels_page_id ON panels(page_id);
  ```
- [ ] Test performance with large issues (40+ pages)
- [ ] Consider virtualization for long panel lists
- [ ] Optimize bundle size (check for unused dependencies)

### UI/UX Polish
- [ ] Add loading skeletons for data fetching
- [ ] Add confirmation before closing browser with unsaved changes
- [ ] Test all keyboard shortcuts work
- [ ] Verify toast notifications appear correctly
- [ ] Test drag-and-drop on different browsers

### Monitoring & Logging
- [ ] Set up error tracking (Sentry, LogRocket, etc.)
- [ ] Add basic analytics (Vercel Analytics, Plausible, etc.)
- [ ] Log critical errors server-side
- [ ] Set up uptime monitoring

### CI/CD
- [ ] Create GitHub Actions workflow for:
  - [ ] Type checking (`npm run build`)
  - [ ] Linting (if configured)
  - [ ] Auto-deploy to Vercel on main branch
- [ ] Set up preview deployments for PRs

---

## Priority 3: Nice to Have

### Testing
- [ ] Unit tests for critical utilities:
  - [ ] `src/lib/search.ts`
  - [ ] `src/lib/auto-format.ts`
  - [ ] `src/lib/exportPdf.ts`
  - [ ] `src/lib/exportDocx.ts`
- [ ] Integration tests for:
  - [ ] Panel CRUD operations
  - [ ] Drag-and-drop reordering
  - [ ] Auto-save functionality
- [ ] E2E tests for critical flows:
  - [ ] Login → Create Series → Create Issue → Add Content → Export

### Mobile Responsiveness
- [ ] Test on tablet (iPad)
- [ ] Add responsive breakpoints for smaller screens
- [ ] Consider mobile-specific UI for navigation

### Documentation
- [ ] User guide / getting started
- [ ] Keyboard shortcuts reference
- [ ] API documentation (if exposing)

### Features (Post-Launch)
- [ ] Mobile voice ideation (WhisperFlow integration)
- [ ] Time-of-day productivity heatmap
- [ ] Collaborative editing (future)
- [ ] Offline support (future)

---

## Deployment Steps

### Vercel Deployment

1. **Connect Repository**
   ```bash
   # If not already connected
   vercel link
   ```

2. **Set Environment Variables**
   - Go to Vercel Dashboard → Project → Settings → Environment Variables
   - Add all production env vars

3. **Deploy**
   ```bash
   vercel --prod
   ```

4. **Post-Deploy Verification**
   - [ ] Can log in with Google
   - [ ] Can create/edit series and issues
   - [ ] Can add panels, dialogue, captions
   - [ ] Can export to PDF/DOCX/TXT
   - [ ] AI chat works
   - [ ] Auto-save works
   - [ ] Version history works

### Supabase Production Setup

1. **Create Production Project**
   - New project at supabase.com
   - Note the URL and keys

2. **Run Migrations**
   - Run all SQL migrations in order
   - Verify tables and RLS policies

3. **Configure Auth**
   - Set up Google OAuth provider
   - Add production redirect URLs
   - Set Site URL to production domain

4. **Backup Strategy**
   - Enable Point-in-Time Recovery (if on Pro plan)
   - Or set up daily exports

---

## Quick Sanity Checks

Before deploying, manually test these flows:

1. **Auth Flow**
   - [ ] Fresh login works
   - [ ] Session persists on refresh
   - [ ] Logout works

2. **Core Editing**
   - [ ] Create series → issue → act → scene → page → panel
   - [ ] Add dialogue and captions
   - [ ] Drag to reorder panels
   - [ ] Delete items

3. **Saving**
   - [ ] Auto-save triggers (watch network tab)
   - [ ] Manual Cmd+S works
   - [ ] Undo/Redo works

4. **Export**
   - [ ] PDF generates and downloads
   - [ ] DOCX generates and downloads
   - [ ] TXT generates and downloads

5. **AI Features**
   - [ ] Chat sidebar responds
   - [ ] Outline sync generates proposals
   - [ ] Continuity check runs

---

## Estimated Timeline

| Phase | Tasks | Time |
|-------|-------|------|
| Critical | Env setup, security audit, error handling | 1-2 days |
| Important | Performance, monitoring, CI/CD | 2-3 days |
| Nice to Have | Testing, docs, mobile | 1-2 weeks |

**Minimum viable deploy: 2-3 days of focused work**
