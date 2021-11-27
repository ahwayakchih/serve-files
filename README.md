serve-files
===========

Provides a way to serve static files without a need for any framework.

It is somewhere in between [`serve-static`](https://github.com/expressjs/serve-static) and [`statique`](https://github.com/IonicaBizau/statique):

- it provides a simple function call, 100% compatible with native node's "request" event handlers,
- it is easy to use with other frameworks, like [`web-pockets`](https://github.com/grncdr/web-pockets),
- it allows to build own file request handlers on top of its exported functions,
- it supports bytes range requests (e.g., media streaming),
- it does not have dependencies,
- it does not support path overrides (you have to add that on top of this module yourself).
 
If you're looking for file serving with all bells and whistles, `serve-static` is probably better for you (or use `send` module directly).
If you're looking for simpler module, without tons of dependencies, try this one and see if it's enough for you.
And if you don't care about media streaming (bytes range requests), and/or easy way for cherry-picking of needed functionality, try `statique` module.


## Installation

```sh
npm install serve-files
```

or:

```sh
npm install https://github.com/ahwayakchih/serve-files
```


## Usage (CLI)

If you install `serve-files` globally, you can use `serve-files` command to quickly start HTTP file server, for example:

```sh
serve-files 8080 ~/Downloads
```

That will start server on port 8080 and will serve files from your "Downloads" directory.

You can pass host name (defaults to none), port number (defaults to random) and/or path to directory (defaults to current working directory) as parameters, in any order.
It will never follow symbolic links, it will keep file stats cached and always serve files with cache headers set to one hour.


## Usage (API)

Example of vastly simplified (not advised for production) use:

```javascript
const http = require('http');
const serveFiles = require('serve-files');

// Create file response handler
const fileResponse = serveFiles.createFileResponseHandler({
	followSymbolicLinks: false,
	cacheTimeInSeconds : 3600,
	documentRoot       : process.cwd()
});

// Create server
http.createServer(fileResponse).listen(8080, 'localhost');
```

Example of use with `web-pockets`:

```javascript
const http = require('http');
const path = require('path');
const app = require('web-pockets')();
const serveFiles = require('serve-files');

http.createServer(app).listen(8080, 'localhost');

app.nodeValue('cfg', function () {
	return serveFiles.createConfiguration({
		followSymbolicLinks: false,
		cacheTimeInSeconds : 3600,
		documentRoot       : process.cwd()
	});
});

app.request.nodeValue('filePath', function (cfg, parsedUrl, callback) {
	// We can do some additional "redirects" at file path level.
	callback(null, path.join(cfg.documentRoot, (parsedUrl.pathname || '/')));
});

app.request.nodeValue('fileStats', function (cfg, filePath, callback) {
	// We can add some file cache at fileStats level...
	cfg.getFileInfo(cfg, filePath, function (cfg, request, response, filePath, fileStats) {
		return !fileStats || fileStats instanceof Error ? callback(fileStats) : callback(null, fileStats);
	});
});

app.request.nodeValue('fileResponse', function (cfg, filePath, fileStats, request, response, callback) {
	// ... and/or add cache at file data level.
	callback(null, cfg.prepareResponseData(cfg, request, response, filePath, fileStats));
});

app.route('GET *', function (fileResponse, response) {
	return {
		// Make sure that there is a `body`, or web-pockets will serve fileResponse as JSON object.
		body      : fileResponse || '',
		// Make sure we pass statusCode, or web-pockets will assume some default.
		statusCode: response.statusCode,
		// Make sure we pass content-type (using small-caps), or web-pockets will assume default.
		headers   : {
			'content-type': response.getHeader('content-type')
		}
	};
});
```

## API Documentation

To generate documentation for this module, clone module from repository (package does not include required files) and use:

```sh
npm run doc
```

## Testing

To run tests, clone module (see [API Dcoumentation](#API-Documentation)) and use:

```sh
npm test
```

## Benchmarks

These benchmarks are just to make sure that `serve-files` speed is comparable (not much slower at least ;) with other, similar modules.
You can re-run benchmarks locally with: `npm run benchmarks`.

```
Running inside Podman (Alpine Linux v3.14) with Node v16.13.0 and Intel(R) Core(TM) i7-3537U CPU @ 2.00GHz x 2.
Testing 8 servers, with 60 seconds of 100 simultaneous connections each.
Test will take approximately 8 minute(s).
✔ node-static
✔ serve-files
✔ serve-files-fs-cache
✔ serve-static
✔ sirv
✔ st
✔ st-full-cache
✔ statique
┌─────────┬────────────────────────┬──────────┬─────────┬──────────┬──────────┬────────┬────────┐
│ (index) │         title          │ requests │ latency │  bytes   │ timeouts │ errors │ non2xx │
├─────────┼────────────────────────┼──────────┼─────────┼──────────┼──────────┼────────┼────────┤
│    0    │    'st-full-cache'     │  10511   │   31    │ 68222975 │    0     │   0    │   0    │
│    1    │ 'serve-files-fs-cache' │   6879   │   41    │ 44007423 │    0     │   0    │   0    │
│    2    │          'st'          │   6859   │   48    │ 44400639 │    0     │   0    │   0    │
│    3    │     'serve-static'     │   5903   │   59    │ 37584895 │    0     │   0    │   0    │
│    4    │         'sirv'         │   5383   │   60    │ 34045951 │    0     │   0    │   0    │
│    5    │     'node-static'      │   5159   │   57    │ 32948223 │    0     │   0    │   0    │
│    6    │     'serve-files'      │   4495   │   71    │ 28753919 │    0     │   0    │   0    │
│    7    │       'statique'       │   2887   │   91    │ 18431999 │    0     │   0    │   0    │
└─────────┴────────────────────────┴──────────┴─────────┴──────────┴──────────┴────────┴────────┘
```

`st` is a bit of a cheater there, because even with cache fully disabled, it still caches file descriptors (which is easy to check: repeat benchmark for it, but with enabled `cache.fd` and disabled other `cache.*` options for it). Caching them gives huge speed up.
