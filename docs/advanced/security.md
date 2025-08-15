---
title: Security Hardening
---

# Security Hardening

- Rotate secrets regularly (`security.rotation_days`).
- Use `security.audit` for config change logging.
- Lock down OAuth redirect URIs and audiences.
- Enforce strict TLS and CSP in hosting platform.
- Validate inputs and sanitize logs (see `utils/security` patterns).

