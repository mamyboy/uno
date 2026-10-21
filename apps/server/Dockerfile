FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm ci && npm run build -w @cma/shared && npm run build -w @cma/server

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/package.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/apps/server/dist ./apps/server/dist
COPY --from=base /app/apps/server/prisma ./prisma
EXPOSE 4000
CMD ["node", "apps/server/dist/index.js"]