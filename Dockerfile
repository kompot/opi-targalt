FROM node:16.13.1-bullseye AS base

RUN apt-get update -y && apt-get install -y --no-install-recommends vim && \
    ln -s /usr/local/bin/nodejs /usr/bin/nodejs && \
    corepack enable && \
    corepack prepare pnpm@6.24.4 --activate && \
    pnpm config set store-dir /tmp/cache && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY ["package.json","pnpm-lock.yaml","/www/opi-targalt/"]
COPY ["src/","/www/opi-targalt/src/"]

WORKDIR /www/opi-targalt
RUN pnpm install --frozen-lockfile --prefer-offline --package-import-method copy
ENTRYPOINT []
