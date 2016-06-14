#This dockerfile uses the ubuntu image
FROM ubuntu:14.04

MAINTAINER uniray7 uniray7@gmail.com

# install basic packages
RUN apt-get update
RUN apt-get install -y curl
RUN apt-get install -y build-essential

# install nodejs
RUN curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.31.1/install.sh | bash
RUN nvm install 5.11.1

ADD . /verpix-async
WORKDIR /verpix-async
RUN npm install

ENV G_SERVERS='{"host":"52.196.81.49", "port":6400}'
CMD S3_BKT=verpix-img-development-base node src/index.js
