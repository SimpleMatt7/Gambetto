# Fase 1: compila l'app (le pagine) con tutte le dipendenze di sviluppo.
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Fase 2: immagine finale, con solo il server e ciò che gli serve.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data TRUST_PROXY=1
COPY package.json ./
# Il server usa due sole librerie, entrambe senza altre dipendenze.
COPY --from=build /app/node_modules/ws ./node_modules/ws
COPY --from=build /app/node_modules/chess.js ./node_modules/chess.js
COPY --from=build /app/dist ./dist
COPY server ./server
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8787/api/me || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.ts"]
