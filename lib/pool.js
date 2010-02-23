var sys = require("sys"),
    http = require("http"),
    url = require("url");

var HttpPool = function (options) {
  this.options = options;
  this.clients = {};
}
HttpPool.prototype.getClient = function (port, hostname) {
  if (!this.clients[hostname+':'+port]) {
    var clients = [];
    this.clients[hostname+':'+port] = clients;
  } else {
    var clients = this.clients[hostname+':'+port];
  }
  for (i=0;i<clients.length;i+=1) {
    // TODO: Make this work
    if (clients[i].busy === false) {
      return clients[i];
    }
  }
  var c = http.createClient(port, hostname);
  c.busy = true;
  clients.push(c);
  return c;
}

exports.HttpPool = HttpPool;
