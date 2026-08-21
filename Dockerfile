FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build-db

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
