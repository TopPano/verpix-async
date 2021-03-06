#This dockerfile uses the ubuntu image
FROM toppano/laputa-base:latest

MAINTAINER uniray7 uniray7@gmail.com

# install nodejs
ENV NODE_VERSION 5.11.1
ENV NVM_DIR /home/.nvm

RUN . $NVM_DIR/nvm.sh && nvm install v$NODE_VERSION && nvm alias default v$NODE_VERSION
ENV PATH      $NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

#install pm2
RUN npm install -g pm2

# install python2.7 for sharp, which is node_module of verpix-async
RUN apt-get update
RUN apt-get install -y python
RUN apt-get install -y software-properties-common
RUN add-apt-repository ppa:mc3man/trusty-media
RUN apt-get update
RUN apt-get install -y ffmpeg

RUN apt-get install -y libimage-exiftool-perl

ADD . /home/verpix/verpix-async
RUN chown -R verpix:verpix /home/verpix/verpix-async

USER verpix
WORKDIR /home/verpix/verpix-async
RUN git submodule init
RUN git submodule update
RUN cd object-store && git submodule init && git submodule update
RUN npm install

# add .aws/credentials
ARG AWS_KEY
ARG AWS_SECRET

RUN mkdir ~/.aws
RUN touch ~/.aws/credentials
RUN echo "[default]" >> ~/.aws/credentials
RUN echo "aws_access_key_id=$AWS_KEY" >>  ~/.aws/credentials
RUN echo "aws_secret_access_key=$AWS_SECRET" >> ~/.aws/credentials

# set bucket name
ARG STORE_BKT
ENV STORE_BKT=$STORE_BKT

# set gearman host
ARG GEARMAN_HOST
ENV G_SERVERS='[{"host":"'$GEARMAN_HOST'", "port":4730}]'
CMD npm run docker-start
