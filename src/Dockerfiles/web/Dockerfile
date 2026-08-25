FROM php:8-apache

LABEL org.opencontainers.image.authors="Andreas Kasper <andreas.kasper@goo1.de>"
LABEL org.opencontainers.image.title="AVefi Importer — Web"

ADD ./php.ini /usr/local/etc/php/php.ini
ADD ./000-default.conf /etc/apache2/sites-enabled/000-default.conf

RUN apt-get update -y \
    && apt-get upgrade -y \
    && apt-get install -y git zlib1g-dev libzip-dev libjpeg-dev libpng-dev libwebp-dev libicu-dev libpq-dev libonig-dev \
    && rm -rf /var/lib/apt/lists/*

RUN pecl install apcu \
    && docker-php-ext-enable apcu

RUN a2enmod headers rewrite \
    && docker-php-ext-configure gd --with-webp --with-jpeg \
    && docker-php-ext-install pdo_pgsql pgsql bcmath gd zip intl mbstring

# Composer-Abhängigkeiten (PhpSpreadsheet für Excel) liegen unter
# app/code/vendor und sind NICHT im Git. Der Code kommt zur Laufzeit per Volume,
# ein Build-Schritt hilft hier also nicht — einmalig nach dem Hochfahren:
#   docker compose exec web sh -c "cd app/code && php composer install"
# Fehlt vendor/, lehnt der Importer Excel-Uploads mit klarem Hinweis ab.

# Upload-Ablage (siehe FILES_PATH). Das Named-Volume /mnt/files erbt beim ersten
# Anlegen diese Rechte, sodass Apache (www-data) hineinschreiben darf.
RUN mkdir -p /mnt/files && chown -R www-data:www-data /mnt/files

# Beim Start /mnt/files chownen (fängt auch ein bereits vorhandenes, root-owned
# Volume ab), danach Apache im Vordergrund.
CMD ["sh", "-c", "chown -R www-data:www-data /mnt/files 2>/dev/null || true; exec apache2-foreground"]
