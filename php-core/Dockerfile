FROM php:8.3-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends libonig-dev \
    && docker-php-ext-install mbstring \
    && a2enmod rewrite \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /var/www/html
COPY index.php /var/www/html/index.php
COPY apache-redultron.conf /etc/apache2/conf-enabled/redultron.conf

EXPOSE 80

# HTTPS termination, request rate limiting, and secret injection belong to the hosting platform.
