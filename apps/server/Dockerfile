FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

# Prisma's query engine needs libssl at runtime — the slim Debian base doesn't ship it.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Only the pieces @cma/server actually needs — keeps the image lean and avoids pulling in
# apps/web (which isn't part of this workspace glob match since it's never copied in).
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server

RUN npm ci

EXPOSE 4000

# Runs straight off TypeScript source via tsx (already a runtime dependency of @cma/server) —
# no separate compile/dist step needed, which keeps this in sync with how `npm run dev` runs it.
CMD ["npm", "run", "start", "-w", "@cma/server"]
