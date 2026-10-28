FROM php:8.3-cli

RUN apt-get update \
    && apt-get install -y --no-install-recommends libonig-dev \
    && docker-php-ext-install mbstring \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY index.php /app/index.php

ENV HOST=0.0.0.0 PORT=8788
EXPOSE 8788

# Local/staging sidecar only. Put behind HTTPS ingress and a production PHP web server before production traffic.
CMD ["sh", "-c", "php -S ${HOST}:${PORT} /app/index.php"]
