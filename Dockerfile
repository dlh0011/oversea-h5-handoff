FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4328
ENV PREVIEW_PORT=4329
ENV HANDOFF_DATA_DIR=/app/data
VOLUME ["/app/data"]
EXPOSE 4328 4329

CMD ["npm", "start"]
