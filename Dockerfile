#This dockerfile uses the ubuntu image
FROM ubuntu:14.04

MAINTAINER uniray7 uniray7@gmail.com

# install basic packages
RUN apt-get update
RUN apt-get install -y curl
RUN apt-get install -y git
RUN apt-get update
RUN apt-get install -y build-essential

# install nodejs
ENV NODE_VERSION 5.11.1
ENV NVM_DIR /home/.nvm

RUN curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.31.1/install.sh | bash
RUN . $NVM_DIR/nvm.sh && nvm install v$NODE_VERSION && nvm alias default v$NODE_VERSION

ENV PATH      $NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

ADD . /verpix-async
WORKDIR /verpix-async
RUN git submodule init
RUN git submodule update
RUN npm install

ENV G_SERVERS='{"host":"gearmand", "port":4730}'
CMD S3_BKT=verpix-img-development-base node src/index.js
