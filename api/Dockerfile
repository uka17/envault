# syntax=docker/dockerfile:1
FROM node:19-alpine as build
#ENV ENV="PROD"
WORKDIR /app
COPY ["package.json", "package-lock.json*", "./"]
RUN npm install
COPY . .  
#RUN npm run init
RUN npm run swagger
RUN npx tsc
CMD ["node", "out/index.js"] 

