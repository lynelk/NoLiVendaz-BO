#!/usr/bin/env sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_S3_URI:?BACKUP_S3_URI is required}"
ts="$(date -u +%Y%m%dT%H%M%SZ)"; dir="${BACKUP_TMP_DIR:-/tmp/nolivendaz-backups}"; mkdir -p "$dir"; file="$dir/nolivendaz-$ts.dump"
pg_dump --dbname="$DATABASE_URL" --format=custom --compress=9 --no-owner --file="$file"
sha256sum "$file" > "$file.sha256"
aws s3 cp "$file" "$BACKUP_S3_URI/$(basename "$file")" --only-show-errors
aws s3 cp "$file.sha256" "$BACKUP_S3_URI/$(basename "$file.sha256")" --only-show-errors
rm -f "$file" "$file.sha256"
echo "Backup uploaded: $BACKUP_S3_URI/nolivendaz-$ts.dump"
