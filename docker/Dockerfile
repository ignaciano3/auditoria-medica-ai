FROM oven/bun:1.3.14

WORKDIR /app

COPY package.json bun.lock ./
COPY apps ./apps
COPY packages ./packages

RUN bun install --frozen-lockfile

CMD ["bun", "run", "apps/worker/src/index.ts"]
