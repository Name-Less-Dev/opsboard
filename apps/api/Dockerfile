# Build context é a raiz do monorepo, para usar o package-lock.json único.
# O npm ci repete uma vez: já houve download interrompido por erro de rede (ECONNRESET).

# --- build: instala tudo (inclusive devDependencies) e compila ---
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w @opsboard/api || (sleep 10 && npm ci -w @opsboard/api)
COPY apps/api apps/api
RUN npm run build -w @opsboard/api

# --- migrate: job de uso único do compose. Reaproveita o build, que já tem o CLI do
# Prisma, o schema e as migrations. `migrate deploy` só aplica o que já existe.
FROM build AS migrate
WORKDIR /app/apps/api
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# --- runtime (último estágio = alvo padrão do docker build): só dependências de produção + código compilado ---
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w @opsboard/api --omit=dev || (sleep 10 && npm ci -w @opsboard/api --omit=dev)
COPY --from=build /app/apps/api/dist apps/api/dist
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
