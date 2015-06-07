FROM node
WORKDIR /usr/src/app
ADD ./package.json /usr/src/app/package.json
RUN ["npm", "install"]
ADD ./index.js /usr/src/app/index.js
ADD ./jobs /usr/src/app/jobs
ADD ./tests /usr/src/app/tests

CMD ["npm", "test"]