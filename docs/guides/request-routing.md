# Request Routing & Resilience

Requests are routed by `RequestRouter`, which uses a `RouteRegistry`, `LoadBalancer`, `RetryHandler`, and `CircuitBreaker` to provide resilient upstream calls.

## Endpoints

- Tools: `POST /mcp/tools/call` with `{ name, arguments }`
- Resources: `POST /mcp/resources/read` with `{ uri }`

Names and URIs may be prefixed by server id when aggregated.

## Load Balancing

Configure strategy under `routing.loadBalancer.strategy`:

- `round_robin` (default)
- `weighted`
- `health`

## Retries

`routing.retry` controls attempts with backoff and jitter:

- `maxRetries`, `baseDelayMs`, `maxDelayMs`, `backoffFactor`, `jitter` (`full` or `none`)
- `retryOn.httpStatuses`, `retryOn.httpStatusClasses`, `retryOn.networkErrors`

## Circuit Breaker

`routing.circuitBreaker` manages failure thresholds and recovery:

- `failureThreshold`, `successThreshold`, `recoveryTimeoutMs`

When open, requests fail fast with a retry-after hint.

