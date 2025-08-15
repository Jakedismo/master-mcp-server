# Performance Troubleshooting

## Symptoms

- Elevated latency on tool calls
- Increased error rates or timeouts

## Checks

- Inspect `/metrics` (Node) and platform dashboards (Workers, Koyeb)
- Verify backends’ `/health` and logs
- Confirm load-balancing strategy is appropriate for your topology

## Tuning

- Increase `retry.maxRetries` and `baseDelayMs` judiciously
- Switch to `health` strategy and feed health scores when available
- Tighten circuit breaker thresholds to fail fast on unhealthy instances

## Environment

- Run Node with adequate CPU/memory; consider horizontal scaling
- Use KV-backed tokens in Workers to reduce token cache misses

