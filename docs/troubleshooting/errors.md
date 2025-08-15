# Error Reference

## Configuration validation failed

The config did not conform to the schema. The error lists the path and reason. Fix the offending property and reload.

## CircuitOpenError

The circuit breaker is open for the selected upstream instance. Reduce upstream failures or increase `recoveryTimeoutMs`. Calls will resume after a successful half-open trial.

## OAuthError

An upstream OAuth provider response was invalid. Check client credentials, scopes, and redirect URIs.

## Token decryption failed

Persisted token ciphertext could not be decrypted with `TOKEN_ENC_KEY`. Ensure the key has not changed unexpectedly. Clear token storage if necessary and re-authorize.

