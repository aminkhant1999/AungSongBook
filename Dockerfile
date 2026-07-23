FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=3000 DATABASE_URL=/app/data/songbook.db
EXPOSE 3000
CMD ["npm","start"]
