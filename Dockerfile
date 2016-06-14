#This dockerfile uses the ubuntu image
FROM ubuntu:14.04

MAINTAINER uniray7 uniray7@gmail.com

# install nodejs
RUN apt-get update
RUN apt-get install -y curl
RUN curl -sL https://deb.nodesource.com/setup_5.x | sudo -E bash -
RUN apt-get install -y nodejs
RUN apt-get install -y build-essential

ADD . /verpix-async
WORKDIR /verpix-async
RUN npm install

ENV G_SERVERS='{"host":"52.196.81.49", "port":6400}'
CMD S3_BKT=verpix-img-development-base node src/index.js
