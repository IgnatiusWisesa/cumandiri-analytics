FROM node:21.7.1

WORKDIR /groapi-main

COPY package.json yarn.lock ./

RUN yarn install

COPY . .

RUN yarn build

COPY . .

EXPOSE 2119

CMD ["yarn", "run", "start"]
