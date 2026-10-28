FROM php:8.3-cli

WORKDIR /app
COPY index.php /app/index.php

ENV HOST=0.0.0.0 PORT=8788
EXPOSE 8788

# Built-in server is local/staging only; use a production-grade PHP server for production traffic.
CMD ["sh", "-c", "php -S ${HOST}:${PORT} /app/index.php"]
