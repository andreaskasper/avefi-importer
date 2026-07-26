FROM php:8-cli

LABEL org.opencontainers.image.authors="Andreas Kasper <andreas.kasper@goo1.de>"

RUN apt-get update -y \
    && apt-get install -y libpq-dev libonig-dev \
    && rm -rf /var/lib/apt/lists/* \
    && docker-php-ext-install pdo_pgsql pgsql mbstring
