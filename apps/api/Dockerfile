# Build from the repo root (railway.json sets the context) so the workspace
# install can see the vendored engine tarballs and the shared puzzle package.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY vendor ./vendor
COPY packages/puzzle/package.json ./packages/puzzle/package.json
COPY apps/api/package.json ./apps/api/package.json
RUN npm ci --ignore-scripts
COPY packages/puzzle ./packages/puzzle
COPY apps/api ./apps/api
RUN npx tsc --build apps/api

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/vendor ./vendor
COPY --from=build /app/packages/puzzle/package.json ./packages/puzzle/package.json
COPY --from=build /app/packages/puzzle/dist ./packages/puzzle/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY apps/api/migrations ./apps/api/migrations
COPY puzzles ./puzzles
CMD ["node", "apps/api/dist/index.js"]
