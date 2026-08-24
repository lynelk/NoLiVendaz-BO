#!/usr/bin/env sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_FILE:?BACKUP_FILE must point to a pg_dump custom-format backup}"
tmpdb="nolivendaz_restore_$(date -u +%s)"
base="$(printf '%s' "$DATABASE_URL" | sed -E 's#/[^/?]+([?].*)?$#/postgres\1#')"
createdb --maintenance-db="$base" "$tmpdb"
cleanup(){ dropdb --if-exists --maintenance-db="$base" "$tmpdb" >/dev/null 2>&1 || true; }; trap cleanup EXIT
restore_url="$(printf '%s' "$DATABASE_URL" | sed -E "s#/[^/?]+([?].*)?$#/$tmpdb\\1#")"
pg_restore --dbname="$restore_url" --no-owner --exit-on-error "$BACKUP_FILE"
psql "$restore_url" -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM tenants" -c "SELECT count(*) FROM audit_logs" -c "SELECT count(*) FROM transactions"
echo "Restore smoke test passed for $BACKUP_FILE"
