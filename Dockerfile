FROM node:20-alpine

WORKDIR /app

# Native build dependencies for bcrypt and Prisma musl compatibility
RUN apk add --no-cache openssl libc6-compat python3 make g++

# Nodemon for container hot-reload
RUN npm install -g nodemon

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV CHOKIDAR_USEPOLLING=true
ENV NODEMON_LEGACY_WATCH=true
ENV PORT=5002

EXPOSE 5002

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "start"]
