FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY seed ./seed
# pass-template is the PKPass model directory; without it Apple Wallet fails at runtime
# the moment the certificates are configured.
COPY pass-template.pass ./pass-template.pass
RUN mkdir -p /app/data
ENV NODE_ENV=production
ENV PORT=3220
EXPOSE 3220
CMD ["node", "src/server.mjs"]
