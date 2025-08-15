# Performance & Tuning

Tune routing and runtime to handle your workload.

## Routing

- Prefer `health` strategy to route to instances with better health scores (when provided)
- Increase `retry.maxRetries` for flaky networks, but cap `maxDelayMs`
- Use `jitter: full` to avoid thundering herds
- Adjust `circuitBreaker` thresholds based on observed upstream reliability

## Node Runtime

- Use `NODE_ENV=production`
- Run behind a reverse proxy (nginx, Cloudflare) for TLS termination
- Set `LOG_LEVEL=info` or `warn`

## Workers Runtime

- Bind KV storage for token persistence to avoid in-memory losses across isolates
- Avoid large responses; stream when possible

## Observability

- Use `/metrics` to scrape basic system stats in Node
- Add platform logs/metrics (Cloudflare, Koyeb dashboards)

