var sys = require("sys"),
    http = require("http"),
    url = require("url"),
    cacheModule = require("./cache"),
    poolModule = require('./pool'),
    couchdb = require('./dep/node-couchdb/couchdb');

binaryContentTypes = ['application/octet-stream', 'application/ogg', 'application/zip', 'application/pdf',
                      'image/gif', 'image/jpeg', 'image/png', 'image/tiff', 'image/vnd.microsoft.icon',
                      'multipart/encrypted', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
                      'application/msword', 'application/x-dvi', 'application/x-shockwave-flash', 
                      'application/x-stuffit', 'application/x-rar-compressed', 'application/x-tar']

var guessEncoding = function (contentEncoding, contentType) {
  var encoding = "utf8";
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

var CacheMachine = function (cache, options) {
  this.cache = cache;
  this.options = options;
  this.listeners = {};
  this.httpPool = new poolModule.HttpPool(options.poolOptions);
}
CacheMachine.prototype.startListener = function (pathname) {
  var self = this;
  if (pathname[0] == '/') {
    dbname = pathname.split('/')[1];
  } else {
    dbname = pathname.split('/')[0]
  }
  if (dbname[0] !== '_') {
    if (!this.listeners[dbname]) {
      var listener = function (change) {
        self.invalidate(dbname, change);
      }
      var db = couchdb.createClient(this.options.uri.port, this.options.uri.hostname).db(dbname)
      db.info(function (error, info) {
        var changes = db.changesStream({since:info.update_seq})
        changes.addListener("data", listener);
        changes.addListener("end", function () {
          delete self.listeners[dbname];
        });
        self.listeners[dbname] = listener;
      })
    }
  }
}

CacheMachine.prototype.invalidate = function (dbname, change) {
  var self = this;
  var key = dbname+'/'+change['id'];
  this.cache.unSet(key)
  if (this.cache.hasKey('index/'+key)) {
    var index = this.cache.get('index/'+key)[0];
    if (index.aliases) {
      index.aliases.forEach(function (a) {self.cache.unSet(a)})
    }
    this.cache.unSet('index/'+key)
  }
}

CacheMachine.prototype.resolve = function (request, response) {
  var self = this;
  var uri = url.parse(request.url);
  uri.hostname = this.options.uri.hostname;
  uri.port = this.options.uri.port;
  if (uri.port == undefined) {
    uri.port = {"http:":80,"https:":443}[uri.protocol]
  }
  if (request.method != "GET") {
    // Can only cache GET requests
    this.proxyRequest(request, response, uri, function () {});
    return;
  }
  var pathname = uri.search ? (uri.pathname + uri.search) : uri.pathname
  var key = this.getKey(pathname);
  if (key && this.cache.hasKey(key)) {
    // sys.puts('Serving from Cache')
    var info = this.cache.get(key);
    response.writeHeader(200, info.headers);
    if (this.cache.hasBlob(key)) {
      var blob = this.cache.getBlob(key);
      blob.addListener("data", function (data, encoding) {response.write(data, encoding)});
      blob.addListener("end", function () {response.close()});
    } else {
      response.close();
    }
  } else if (key) {
    // sys.puts('Creating Cache ' + key);
    this.startListener(pathname);
    this.setAlias(key);
    this.proxyRequest(request, response, uri, function (response) {
      var blob = self.cache.setBlob(key, function () {});
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
  } else {
    // We cannot cache this request
    // sys.puts('Cannot Cache')
    this.proxyRequest(request, response, uri, function () {})
  }
}
CacheMachine.prototype.setAlias = function (key) {
  if (key.indexOf('?') !== -1) {
    if (this.cache.hasKey('index/'+key.split('?')[0])) {
      var index = this.cache.get('index/'+key.split('?')[0])[0]
      index.aliases.push(key); 
      this.cache.set('index/'+key.split('?')[0], index, function () {})
    } else {
      this.cache.set('index/'+key.split('?')[0], {'aliases':[key]}, function () {})
    }
  }
}

CacheMachine.prototype.getKey = function (pathname) {
  var p = pathname.split('/')
  // Remove empty elements
  while (p.indexOf('') != -1) { p.splice(p.indexOf(''), 1) }
  if (p.length == 2) {
    if (p[0][0] !== '_' && p[1][0] !== '_') {
      var key = p[0] + '/' + p[1]; 
      return key;
    }
  }
}
CacheMachine.prototype.proxyRequest = function (clientRequest, clientResponse, uri, responseCallback) {
  var c = this.httpPool.getClient(uri.port, uri.hostname);
  var pathname = uri.search ? (uri.pathname + uri.search) : uri.pathname
  var proxyRequest = c.request(clientRequest.method, pathname, clientRequest.headers);
  proxyRequest.addListener("response", function (response) {
    responseCallback(response);
    clientResponse.writeHeader(response.statusCode, response.headers);
    var encoding = guessEncoding(response.headers['content-encoding'], response.headers['content-type']);
    response.setBodyEncoding(encoding)
    var l = 0
    response.addListener("data", function (chunk) {
      clientResponse.write(chunk, encoding);
      l += chunk.length;
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
  var cache = new cacheModule.MemoryCache(options);
  var cacheMachine = new CacheMachine(cache, options);
  var requestHandler = function (request, response) {
    cacheMachine.resolve(request, response)
  }
  return http.createServer(requestHandler);
}

exports.createProxyServer = createProxyServer;

var server = createProxyServer({uri:url.parse("http://127.0.0.1:5984")});
server.listen(8000);
sys.puts("Server running at http://127.0.0.1:8000/")
