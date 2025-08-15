#!/bin/sh
set -e

# Map PaaS-provided PORT to MASTER_HOSTING_PORT if not explicitly set.
if [ -n "${PORT}" ] && [ -z "${MASTER_HOSTING_PORT}" ]; then
  export MASTER_HOSTING_PORT="${PORT}"
fi

# Default to json logs in production if not set
if [ "${NODE_ENV}" = "production" ] && [ -z "${LOG_FORMAT}" ]; then
  export LOG_FORMAT=json
fi

exec "$@"

