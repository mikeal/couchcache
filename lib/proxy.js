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
  this.hashmap[key] = args
}
MemoryCache.prototype.setBlob = function () {
  if (!this.hashmap[arguments[0]]) {
    throw "Cannot set blog on an unset key."
  }
  this.blobmap[arguments[0]] = arguments[1];
}
MemoryCache.prototype.getBlob = function (key) {
  return this.blobmap[key]
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

var createProxyServer = function (options) {
  var httpPool = new pool.HttpPool(options.poolOptions);
  
  var requestHandler = function (clientRequest, clientResponse) {
    if (!uri.slice(0,5) === "http") {
      
    }
    
    var uri = url.parse(clientRequest.url);
    if (uri.port == undefined) {
      uri.port = {"http:":80,"https:":443}[uri.protocol]
    }
    var c = httpPool.getClient(uri.port, uri.hostname);
    var proxyRequest = c.request(clientRequest.method, uri.pathname, clientRequest.headers);
    proxyRequest.addListener("response", function (response) {
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
  return http.createServer(requestHandler);
}

exports.createProxyServer = createProxyServer;

var server = createProxyServer();
server.listen(8000);
sys.puts("Server running at http://127.0.0.1:8000/")
