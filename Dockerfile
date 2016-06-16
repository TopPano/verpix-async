#This dockerfile uses the ubuntu image
FROM toppano/laputa-base:latest

MAINTAINER uniray7 uniray7@gmail.com

# install nodejs
ENV NODE_VERSION 5.11.1
ENV NVM_DIR /home/.nvm

RUN . $NVM_DIR/nvm.sh && nvm install v$NODE_VERSION && nvm alias default v$NODE_VERSION
ENV PATH      $NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

ADD . /home/verpix/verpix-async
RUN chown -R verpix:verpix /home/verpix/verpix-async

USER verpix
WORKDIR /home/verpix/verpix-async
RUN git submodule init
RUN git submodule update
RUN npm install

ENV G_SERVERS='{"host":"gearmand", "port":4730}'
#CMD S3_BKT=verpix-img-development-base node src/index.js
