# BinCheckNYC Production Readiness Plan

## Executive Summary
5-phase plan to take BinCheckNYC from MVP (3/10 readiness) to production-ready (8/10) for commercial sale to attorneys and title companies.

---

## Phase 1: Foundation & Mobile (Week 1) ✅ IN PROGRESS

### Mobile Responsiveness
- [x] Index.tsx - hamburger menu for mobile nav
- [x] Dashboard.tsx - hamburger menu for mobile nav  
- [x] DDReports.tsx - hamburger menu + responsive tabs
- [ ] Order.tsx - verify form layouts on mobile
- [ ] Settings.tsx - verify mobile layout
- [ ] Admin.tsx - verify mobile layout

### Global Error Handling
- [ ] Create ErrorBoundary component with user-friendly fallback UI
- [ ] Wrap App.tsx with ErrorBoundary
- [ ] Add error recovery actions (reload, go home)

### Security Headers
- [ ] Add Content Security Policy meta tag to index.html
- [ ] Add X-Content-Type-Options, X-Frame-Options headers

---

## Phase 2: Real Payment Processing (Week 2-3) — HARD BLOCKER

### Stripe Integration
- [ ] Enable Stripe connector in Lovable
- [ ] Create checkout edge function for $199 one-time
- [ ] Create subscription edge function for $599/mo professional
- [ ] Handle payment webhooks (payment_intent.succeeded, subscription events)
- [ ] Update Order.tsx to use real Stripe checkout
- [ ] Add payment status tracking to dd_reports table
- [ ] Email confirmation on successful payment

### Order Fulfillment
- [ ] Link paid orders to report generation queue
- [ ] Track order → report → delivery lifecycle
- [ ] Add payment receipts/invoices

---

## Phase 3: Security & Reliability (Week 4)

### Database-Backed Rate Limiting
- [ ] Create rate_limits table (ip, endpoint, count, window_start)
- [ ] Replace in-memory rate limiter in search-property
- [ ] Add rate limiting to generate-dd-report
- [ ] Add rate limiting to all other edge functions

### API Response Validation
- [ ] Add Zod schemas for NYC Open Data responses (DOB, HPD, ECB, OATH, ACRIS)
- [ ] Validate and sanitize all external API data before processing
- [ ] Log validation failures for monitoring

### Error Monitoring
- [ ] Add Sentry integration (or similar)
- [ ] Capture frontend errors with context
- [ ] Capture edge function errors
- [ ] Set up alerts for error spikes

---

## Phase 4: Testing & CI/CD (Week 5-6)

### Test Coverage
- [ ] Unit tests for scoring.ts (risk calculation)
- [ ] Unit tests for violation-utils.ts
- [ ] Integration tests for generate-dd-report edge function
- [ ] E2E tests for critical flows (order → report → download)

### CI/CD Pipeline
- [ ] GitHub Actions for build/test on PR
- [ ] Automated deployment to staging
- [ ] Dependency scanning (npm audit, Snyk)
- [ ] Type checking in CI

---

## Phase 5: Scale & Polish (Week 7-8)

### Performance
- [ ] Add report caching for repeat queries
- [ ] Optimize large building queries (1000+ violations)
- [ ] Add loading skeletons throughout

### Monitoring & Observability
- [ ] Structured logging in edge functions
- [ ] Uptime monitoring
- [ ] Performance metrics dashboard

### Documentation
- [ ] API documentation for edge functions
- [ ] User-facing help center content
- [ ] Internal architecture docs

---

## Current Blockers for Commercial Sale

| Blocker | Phase | Status |
|---------|-------|--------|
| Real payment processing | 2 | Not started |
| Global error boundary | 1 | Not started |
| Rate limiting on report generation | 3 | Not started |
| Basic test coverage | 4 | Not started |

---

## Estimated Timeline

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Phase 1 | 1 week | Week 1 |
| Phase 2 | 2 weeks | Week 3 |
| Phase 3 | 1 week | Week 4 |
| Phase 4 | 2 weeks | Week 6 |
| Phase 5 | 2 weeks | Week 8 |

**Total: 8 weeks to production-ready**
