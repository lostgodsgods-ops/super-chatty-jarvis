#!/bin/sh
set -eu

port="${PORT:-10000}"
case "$port" in
  ''|*[!0-9]*)
    echo "REDULTRON_PHP_CORE_STARTUP_BLOCKED code=PORT_INVALID" >&2
    exit 1
    ;;
esac
if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
  echo "REDULTRON_PHP_CORE_STARTUP_BLOCKED code=PORT_INVALID" >&2
  exit 1
fi

secret="${OWNER_SECRET:-}"
if [ "${#secret}" -lt 32 ]; then
  echo "REDULTRON_PHP_CORE_STARTUP_BLOCKED code=OWNER_SECRET_NOT_CONFIGURED" >&2
  exit 1
fi
unset secret

sed -i "s/^Listen 80$/Listen $port/" /etc/apache2/ports.conf
sed -i "s/<VirtualHost *:80>/<VirtualHost *:$port>/" /etc/apache2/sites-available/000-default.conf
exec apache2-foreground
