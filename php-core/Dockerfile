FROM php:8.3-apache

RUN printf '%s\n' \
    '<Directory /var/www/html>' \
    '    Require all granted' \
    '    Options -Indexes' \
    '    LimitRequestBody 10240' \
    '    FallbackResource /index.php' \
    '</Directory>' > /etc/apache2/conf-available/redultron.conf \
    && a2enconf redultron

WORKDIR /var/www/html
COPY index.php /var/www/html/index.php

EXPOSE 80
