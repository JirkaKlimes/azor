set dotenv-load
set dotenv-path := ".env"

dev:
    #!/usr/bin/env bash
    set -euo pipefail
    BUILD="$(git rev-parse --short HEAD)$(git diff --quiet || echo '-dirty')" \
    PROFILE=debug docker compose up --build --watch

prod:
    #!/usr/bin/env bash
    set -euo pipefail
    BUILD="$(git rev-parse --short HEAD)$(git diff --quiet || echo '-dirty')" \
    docker compose up --build

migrate name:
    #!/usr/bin/env bash
    set -euo pipefail
    TMPFILE=$(mktemp --suffix=.surql)
    ${EDITOR:-vim} "$TMPFILE"
    if [ -s "$TMPFILE" ]; then
        mv "$TMPFILE" "server/src/db/migrations/$(date +%Y%m%d%H%M%S)_{{name}}.surql"
        echo "Created migration"
    else
        rm -f "$TMPFILE"
        echo "Aborted"
    fi

delete-volumes:
    docker compose down -v
