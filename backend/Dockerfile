# ---------- build stage ----------
ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE} AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- runtime stage ----------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# если у тебя есть какие-то статические файлы/шаблоны - добавишь сюда
# COPY --from=builder /app/some_folder ./some_folder

EXPOSE 3000
CMD ["node", "dist/main.js"]
