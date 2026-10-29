# Build context é a raiz do monorepo, para usar o package-lock.json único.

# --- build: gera os arquivos estáticos em apps/web/dist ---
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w @opsboard/web
COPY apps/web apps/web
RUN npm run build -w @opsboard/web

# --- runtime: nginx serve o SPA e repassa /api para o serviço api ---
FROM nginx:1.28-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
