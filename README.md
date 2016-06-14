# Laputa-API

# Getting Started
Install dependent npm modules.
```
$ npm install
```

Install dependent libraries:

1. [GraphicsMagick](http://www.graphicsmagick.org/) or [ImageMagick](http://www.imagemagick.org/)
  * In Mac OS X, you can simply use [Homebrew](http://mxcl.github.io/homebrew/) and do:
```
$ brew install imagemagick
$ brew install graphicsmagick
```

Install dependent modules.
```
$ git submodule init
$ git submodule update
```

Start the server.
```
$ node .
```

Build docker image.
```sh
$ docker build -t IMAGE_NAME ./
```

Run docker container.
```sh
docker run IMAGE_NAME
```
