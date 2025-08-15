# Phase 4 Self‑Critique — Request Routing System

Agent: self-critic-agent-mebe99xv-fvl7p (self-critic)
Date: 2025-08-14

## Summary

Phase 4 introduces a more resilient routing layer centered on five components: RequestRouter, RouteRegistry, CircuitBreaker, RetryHandler, and LoadBalancer. The overall architecture is clean and composable, integrates with Phase 2 auth and Phase 3 aggregation, and is mostly cross‑platform friendly. However, I identified two critical correctness issues in circuit breaker integration that can materially impact reliability under failure: (1) double‑counting circuit state updates on success/failure, and (2) side‑effects in route resolution that prematurely toggle breakers to half‑open.

Beyond these, the system lacks instance‑level failover within a single request, does not observe Retry‑After, and has a few type/runtime mismatches and security hardening gaps. These are fixable within Phase 4’s design, but they should be addressed before raising traffic.

## 1) Architecture Quality

- Strengths: Clear separation of responsibilities.
  - RequestRouter: request shaping, auth header integration, invokes retry and breaker.
  - RouteRegistry: instance discovery, resolution caching, health nudging.
  - CircuitBreaker/RetryHandler/LoadBalancer: self‑contained policies, easy to reason about.
  - CapabilityAggregator: coherent name mapping across tools/resources.
- Concerns: Coupling and side‑effects.
  - RouteRegistry uses CircuitBreaker.canExecute to filter, which mutates breaker state (open→half_open); selection should be side‑effect free.
  - RequestRouter calls CircuitBreaker.execute and RouteRegistry.markSuccess/markFailure, double‑updating breaker state (see Robustness section).
  - Failover policy (try another instance when one fails) is embedded neither in RetryHandler nor RequestRouter; retriable transport errors need multi‑instance awareness.

## 2) Implementation Robustness

- Circuit breaker logic: Solid state machine (closed/open/half_open) with single in‑flight probe; per‑instance keys are correct.
- Critical bug A: Double counting success/failure.
  - RequestRouter wraps the upstream call in `circuit.execute(key, ...)` which internally calls `onSuccess`/`onFailure`.
  - After that, it also calls `registry.markSuccess/markFailure`, which call breaker again.
  - Impact: A half‑open circuit with `successThreshold=2` may close after a single success because it’s incremented twice.
- Critical bug B: Side effects during routing.
  - RouteRegistry calls `circuit.canExecute(key)` while scanning instances; that method transitions `open → half_open` and sets `halfOpenInProgress=true`.
  - Multiple instances can be toggled during a single resolution even if never selected, starving future probes and causing inconsistent gating.
- Retry mechanisms: Good exponential backoff with jitter and policy controls; missing per‑attempt timeout (AbortController) and Retry‑After handling.
- Error handling: Consistent non‑OK results throw to trigger retry; errors surfaced as `{ isError: true }` or plain text for resources. Shapes are inconsistent between tools/resources.

## 3) Performance & Scalability

- Routing efficiency: O(1) on cache hit; O(n) scanning instances otherwise. TTL (default 5s) reduces churn and offers stickiness.
- Load balancing: RR, weighted, and health strategies are simple and fast; weighted is probabilistic (acceptable). Health nudging on outcomes is lightweight.
- Bottlenecks: Resolution cache can pin to a bad instance for up to TTL even after failures; without per‑request instance fallback, this increases error rates.
- Caching strategies: No negative‑cache of failing instances during a request; no warmup or decay beyond simple nudges.

## 4) Cross‑Platform Compatibility

- Positives: Router/routing components rely on `fetch`, `URL`, and Maps; logging checks env safely. Worker build excludes Node‑only files via tsconfig.
- Issues:
  - Node tsconfig lacks DOM types while RequestRouter uses `RequestInit`/`Response` types; this can break strict Node builds.
  - Crypto/token storage (used by auth) are Node‑only; they’re excluded in worker build, but downstream usage must remain optional in worker paths.

## 5) Security Considerations

- Request shaping: Limited validation of tool names/resource URIs beyond aggregator lookup; dot‑split fallback is permissive. Arguments are forwarded verbatim.
- Header forwarding: `getAuthHeaders` can return arbitrary headers; hop‑by‑hop header stripping is not enforced; Accept header not normalized.
- OAuth delegation: Router returns `OAuthDelegation` details in error payload. This may expose provider metadata to clients; consider a standardized delegation response type.
- Token handling: Router does not log tokens (good). Upstream endpoints are derived with `ensureTrailingSlash` (good) but origin policy and redirects are not configured.

## 6) Reliability

- Strengths: Breaker and retry reduce tail‑latency and cascading failures; health scoring nudges LB toward healthier instances over time.
- Gaps:
  - No per‑request multi‑instance failover. If the chosen instance fails after retries, the router doesn’t try a different instance immediately.
  - TTL caching may keep routing to a degraded instance until expiry.
  - No explicit request timeouts; slow upstreams tie up resources and prevent timely breaker feedback.

## 7) Code Quality

- TypeScript: Generally strong typing and clear interfaces; cohesive modules with low cyclomatic complexity.
- Minor issues: Use of DOM types in Node build; some `any` escapes for error `.status`; inconsistent result shapes between tools/resources.
- Maintainability: Components are modular and testable; configuration surfaces are sensible and documented in types.

## 8) Integration (Phase 2/3)

- Auth (Phase 2): Router accepts an auth provider (e.g., MultiAuthManager). MasterServer discovery avoids delegation by falling back to pass‑through for capability fetches.
- Module loading (Phase 3): RouteRegistry gracefully handles single‑endpoint servers and optional multi‑instance arrays; health scoring ties into status on startup.
- Fit: Integration points are adequate; circuit and retry are not exposed at MasterServer level, but routing config types exist.

## 9) Testing Readiness

- Good: CircuitBreaker supports pluggable storage; RetryHandler is pure; LoadBalancer is deterministic under RR.
- Usable: RouteRegistry accepts a server map; RequestRouter allows `getAuthHeaders` injection; global `fetch` can be stubbed in tests.
- Harder areas: Time‑dependent logic (breaker/TTL) relies on `Date.now()`; consider injecting a clock or shimming `Date.now` in tests. No tests exist yet.

## 10) Gap Analysis / Technical Debt

- P0: Breaker state double‑counting and side‑effects during resolution (correctness bugs).
- P1: No per‑request instance fallback; no AbortController timeouts; no Retry‑After support.
- P2: Error payload harmonization; header sanitation; audit logging and correlation IDs; configurable cache TTL per server; weighted‑RR option.
- P3: Health model is simplistic; consider decay over time and latency/error‑rate based scoring; optional rolling‑window breaker.

---

## Observed Critical Issues (with examples)

1) Double breaker updates:
   - In `RequestRouter.routeCallTool` and `.routeReadResource`, the upstream call is wrapped with `circuit.execute(key, ...)`.
   - Afterwards, `registry.markSuccess/markFailure` call breaker again. This prematurely closes half‑open circuits and resets failure counters more than intended.

2) Side‑effects in instance filtering:
   - `RouteRegistry.resolve` filters candidates with `circuit.canExecute(key)`. That method mutates state (`open → half_open`, sets `halfOpenInProgress`).
   - Multiple instances can be toggled despite only one being selected, interfering with proper half‑open probing and future gating.

## Prioritized Recommendations

- P0 (Fix before Phase 5):
  - Remove breaker updates from `RouteRegistry.markSuccess/markFailure` calls in RequestRouter when using `circuit.execute`, or refactor so only one component updates the breaker per attempt. Preferred: let `circuit.execute` own state updates; have `RouteRegistry` only update health scores.
  - Make route resolution side‑effect free. Replace `canExecute` filtering with a read‑only availability check (new `peek` method) or select first, then gate with `circuit.canExecute/execute` on the chosen instance only.

- P1 (Hardening):
  - Add per‑attempt timeouts with `AbortController` and configurable `timeoutMs` in routing config; propagate timeout as a retryable error and breaker failure.
  - Respect `Retry-After` for 429/503; cap total retry budget; emit structured retry logs.
  - Implement per‑request instance fallback: on failure after retries, attempt the next eligible instance in the pool before returning error.
  - Normalize error shapes across tools/resources; include `code`, `message`, and optional `retryAfterMs` when breaker is open.

- P2 (Security & DX):
  - Sanitize forwarded headers and set explicit `accept: application/json`; consider `redirect: 'manual'` and disabling credentials.
  - Standardize OAuth delegation response type (not as an error) and document client handling.
  - Add correlation IDs on routed calls and structured logs for observability.

- P3 (Perf/Resilience):
  - Add latency‑aware or EWMA health scoring; expose weighted round‑robin.
  - Allow per‑server cache TTL and optional stickiness.
  - Optional rolling‑window breaker based on error rate.

## Risk Assessment for Phase 5

- High risk (must fix): Incorrect breaker state management can lead to premature reopening/closing, unstable traffic patterns, and elevated error rates during partial outages.
- Medium risk: Lack of per‑request failover amplifies the impact of instance‑level failures; missing timeouts increases tail latency and resource exhaustion risk.
- Low/Medium: Type mismatches for Node DOM types can break strict builds; security hardening gaps could surface in certain deployments.

Mitigation: Address P0 items immediately and schedule P1 within early Phase 5. The remaining items can be tackled incrementally without large architectural changes.

## Overall Quality Score: 7/10

- Justification: Strong architecture and clean implementations provide a solid base. However, the two breaker integration bugs are correctness issues that materially affect reliability under failure. With those fixed and basic hardening (timeouts, failover, Retry‑After), the system would score 8.5–9.

