# syntax=docker/dockerfile:1

# Универсальный образ без Nginx: собираем и обслуживаем статику через Vite preview
FROM node:20-alpine

WORKDIR /app

# Устанавливаем зависимости по lock-файлу
COPY package*.json ./
RUN npm ci

# Копируем исходники и собираем
COPY . .
RUN npm run build

# Открываем порт, на котором будет слушать Vite preview
EXPOSE 18111

# Запускаем встроенный сервер предпросмотра Vite для раздачи dist
# Важно: 0.0.0.0, чтобы принимать соединения извне контейнера
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "18111"]
