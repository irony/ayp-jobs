FROM irony/ayp-base
ADD . /usr/src/app
WORKDIR /usr/src/app
RUN ["npm", "install"]
CMD ["npm", "test"]