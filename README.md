serve-files
===========

Provides a way to serve static files without a need for any framework.

It is somewhere in between [`serve-static`](https://github.com/expressjs/serve-static) and [`statique`](https://github.com/IonicaBizau/statique):

- it provides a simple function call, 100% compatible with native node "request" event handlers,
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


## Usage

If you install `serve-files` globally, you can use `serve-files` command to quickly start HTTP file server, for example:

```sh
serve-files 8080 ~/Downloads
```

That will start server on port 8080 and will serve files from your "Downloads" directory.

You can pass host name (defaults to none), port number (defaults to random) and/or path to directory (defaults to current working directory) as parameters, in any order.
It will never follow symbolic links, and always serve files with cache headers set to one hour.


## Usage for developers

Example of vastly simplified (not so much for production) use:

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

// Create file response handler
const cfg = serveFiles.createConfiguration({
  followSymbolicLinks: false,
  cacheTimeInSeconds : 3600,
  documentRoot       : process.cwd()
});

http.createServer(app).listen(8080, 'localhost');

app.request.nodeValue('filePath', function (parsedUrl, callback) {
  callback(null, path.join(cfg.documentRoot, (parsedUrl.pathname || '/')));
});

app.request.nodeValue('fileResponse', function (filePath, request, callback) {
  serveFiles.prepareFileResponse(cfg, filePath, request.headers, callback);
});

app.route('GET *', function (fileResponse) {
  // Make sure that there is a `body`, or web-pockets will serve fileResponse as JSON object.
  if (!fileResponse.body) {
    fileResponse.body = '';
  }

  // Workaround web-pockets bug
  fileResponse.headers['content-type'] = fileResponse.headers['Content-Type'];
  delete fileResponse.headers['Content-Type'];

  return fileResponse;
});
```


## Benchmarks

These benchmarks are just to make sure that working with `serve-files` is not slower than working with other, similar modules.
You can re-run benchmarks locally with: `npm run benchmarks`.

```markdown
Running on node v7.3.0 with Intel(R) Core(TM) i7-3537U CPU @ 2.00GHz x 4

Testing:
- serve-static v1.11.1 https://github.com/expressjs/serve-static#readme  
- statique     v3.2.6  https://github.com/IonicaBizau/statique           
- serve-files  v1.0.0  https://github.com/ahwayakchih/serve-files        

Test of serving 1 files in parallel

  3 tests completed.

  statique     x 1,062 ops/sec ±3.09% (76 runs sampled)
  serve-static x   995 ops/sec ±5.27% (76 runs sampled)
  serve-files  x   874 ops/sec ±2.82% (73 runs sampled)

Test of serving 5 files in parallel

  3 tests completed.

  statique     x 258 ops/sec ±2.90% (79 runs sampled)
  serve-files  x 256 ops/sec ±2.81% (78 runs sampled)
  serve-static x 236 ops/sec ±6.13% (76 runs sampled)

Test of serving 10 files in parallel

  3 tests completed.

  statique     x 132 ops/sec ±3.98% (77 runs sampled)
  serve-files  x 131 ops/sec ±2.94% (77 runs sampled)
  serve-static x 114 ops/sec ±14.48% (73 runs sampled)
```