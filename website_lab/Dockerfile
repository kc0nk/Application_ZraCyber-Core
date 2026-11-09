# Tujuan file: Membangun container untuk menjalankan website lab lokal.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json server.cjs styles.css ./
USER node
EXPOSE 3000
CMD ["node", "server.cjs"]
