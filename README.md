# Verpix-Async

The job worker for handling the jobs that created by the API backend.

## Installation
Install dependent npm modules.

```
$ npm install
```

Install dependent modules.

```
$ git submodule init
$ git submodule update
```

Install dependent system libraries:

* [GraphicsMagick](http://www.graphicsmagick.org/) or [ImageMagick](http://www.imagemagick.org/)
  * In Mac OS X, you can simply use [Homebrew](http://mxcl.github.io/homebrew/) and do:

```
$ brew install imagemagick
$ brew install graphicsmagick
```

Install [Gearman](http://gearman.org/getting-started/#installing).

* Install Gearman on [Mac](http://richardsumilang.com/server/gearman/install-gearman-on-os-x/)

## Usage

Set up a [Gearman job server](http://gearman.org/getting-started/#starting) before starting the application.

### Environment Variables
* `S3_BKT` The bucket name of the AWS S3 service (no default setting for production mode)
* `G_SERVERS` The server list of the gearman job servers (default: [ { host: 'localhost', port: 4370 } ])

### Developement Mode

```
$ npm run dev
```

### Production Mode

#### To start the server:

There is no default setting for `S3_BKT` in production mode, so do remember to specify it manually.

```
$ S3_BKT='verpix-img-production' npm start
```

To specify Gearman job servers:

```
$ G_SERVERS='[ { "host": "192.0.0.1", "port": 1234 }, { "host": "192.0.0.2", "port": 1235 } ]' S3_BKT='verpix-img-production' npm start
```

#### To check the server status by pm2:

```
$ pm2 show verpix-async
$ pm2 status
```

#### To stop the server:

```
$ npm stop
```



