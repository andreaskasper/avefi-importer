FROM php:8.4-cli

LABEL org.opencontainers.image.authors="Andreas Kasper <andreas.kasper@goo1.de>"

RUN apt-get update -y \
    && apt-get install -y git zlib1g-dev libzip-dev libjpeg-dev libpng-dev libwebp-dev libicu-dev libpq-dev libonig-dev imagemagick \
    && sed -i 's/policy domain="coder" rights="none" pattern="PDF"/policy domain="coder" rights="read | write" pattern="PDF"/g' /etc/ImageMagick-6/policy.xml \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/*

RUN docker-php-ext-configure gd --with-webp --with-jpeg \
    && docker-php-ext-install pdo_pgsql pgsql bcmath gd zip sockets intl mbstring

#RUN apt-get update \
#    && apt-get install php-xdebug \
#    && apt-get clean