var sys = require("sys"),
    http = require("http"),
    url = require("url"),
    pool = require('./pool');

binaryContentTypes = ['application/octet-stream', 'application/ogg', 'application/zip', 'application/pdf',
                      'image/gif', 'image/jpeg', 'image/png', 'image/tiff', 'image/vnd.microsoft.icon',
                      'multipart/encrypted', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
                      'application/msword', 'application/x-dvi', 'application/x-shockwave-flash', 
                      'application/x-stuffit', 'application/x-rar-compressed', 'application/x-tar']

var guessEncoding = function (contentEncoding, contentType) {
  var encoding = "ascii";
  if (contentEncoding == 'gzip') {
    encoding = "binary";
  } else if (contentType) {
    if (contentType.slice(0,6) == 'video/' || contentType.slice(0,6) == 'audio/') {
      encoding = "binary";
    } else if (binaryContentTypes.indexOf(contentType) != -1) {
      encoding = "binary";
    }
  }
  return encoding;
}

var argumentsToArray = function(args) {
  var argsArray = []
  for (i=0;i<args.length;i+=1) {
    argsArray.push(args[i]);
  }
  return argsArray;
}

// This cache interface is a litte obscure because it's partly a stub
// for a more efficient hybrid memory/ondisk cache in the future
var MemoryCache = function () {
  this.hashmap = {};
  this.blobmap = {};
}
MemoryCache.prototype.get = function (key) {
  return this.hashmap[key];
}
MemoryCache.prototype.set = function () {
  var args = argumentsToArray(arguments);
  var key = args.shift();
  var callback = args.pop();
  this.hashmap[key] = args
  callback(undefined);
}
MemoryCache.prototype.setBlob = function () {
  var key = arguments[0];
  var self = this;
  this.unSet(key);
  this.blobmap[key] = ''
  var e = new process.EventEmitter();
  e.addListener("data", function (data) {
    this.blobmap[key] += data;
  })
  e.addListener("end", function () {
    var args = argumentsToArray(arguments);
    args.unshift(key);
    this.set.apply(self, args)
  })
  return e;
}
MemoryCache.prototype.getBlob = function (key) {
  var e = new process.EventEmitter();
  setTimeout(function () {
    e.emit("data", this.blobmap[key])
    e.emit("end")
  }, 0)
  return e;
}
MemoryCache.prototype.hasBlob = function (key) {
  if (this.hashmap[key] && this.blobmap[key]) {
    return true;
  }
  return false;
}
MemoryCache.prototype.hasKey = function (key) {
  if (this.hashmap[key]) {
    return true;
  }
  return false;
}
MemoryCache.prototype.keyIsBusy = function (key) {
  return false;
}

var CacheMachine = function (cache, options) {
  this.cache = cache;
  this.options = options;
  this.httpPool = new pool.HttpPool(options.poolOptions);
}
CacheMachine.prototype.resolve = function (request, response) {
  var self = this;
  var uri = url.parse(clientRequest.url);
  uri.hostname = this.options.uri.hostname;
  uri.port = this.options.uri.port;
  if (uri.port == undefined) {
    uri.port = {"http:":80,"https:":443}[uri.protocol]
  }
  if (clientRequest.method != "GET") {
    // Can only cache GET requests
    this.proxyRequest(request, response, uri, function () {});
    return;
  }
  
  var key = this.getKey(pathname);
  if (key && this.cache.hasKey(key)) {
    var info = this.cache.get(key);
    response.writeHeaders(200, info.headers);
    if (this.cache.hasBlob(key)) {
      var blog = this.cache.getBlob(key);
      blob.addListener("data", function (data, encoding) {response.write(data, encoding)});
      blob.addListener("end", function () {response.close()});
    } else {
      response.close();
    }
  } else if (key) {
    this.proxyRequest(request, response, uri, function (response) {
      var blob = self.getBlob(key);
      response.addListener("data", function (data) {
        blob.emit("data", data);
      })
      response.addListener("end", function () {
        blob.emit("end", {headers:response.headers, 
                          encoding:guessEncoding(response.headers['content-encoding'], 
                                                 response.headers['content-type'])
                          });
      })
    })
  }
}
CacheMachine.prototype.getKey = function (pathname) {
  
}
CacheMachine.prototype.proxyRequest = function (clientRequest, clientResponse, uri, responseCallback) {
  var c = this.httpPool.getClient(uri.port, uri.hostname);
  var proxyRequest = c.request(clientRequest.method, uri.pathname, clientRequest.headers);
  proxyRequest.addListener("response", function (response) {
    responseCallback(response);
    clientResponse.writeHeader(response.statusCode, response.headers);
    var encoding = guessEncoding(response.headers['content-encoding'], response.headers['content-type']);
    response.setBodyEncoding(encoding)
    response.addListener("data", function (chunk) {
      clientResponse.write(chunk, encoding);
    })
    response.addListener("end", function () {
      clientResponse.close();
      c.busy = false;
    })
  })

  var encoding = guessEncoding(clientRequest.headers['content-encoding'], clientRequest.headers['content-type']);
  clientRequest.addListener("data", function (chunk) {
    proxyRequest.write(chunk, encoding);
  })
  clientRequest.addListener("end", function () {
    proxyRequest.close();
  })
  
}


var createProxyServer = function (options) {
  var cache = new MemoryCache(options);
  var cacheMachine = new CacheMachine(cache, options);
  var requestHandler = function (request, response) {
    cacheMachine(request, response)
  }
  return http.createServer(requestHandler);
}

exports.createProxyServer = createProxyServer;

var server = createProxyServer();
server.listen(8000);
sys.puts("Server running at http://127.0.0.1:8000/")
