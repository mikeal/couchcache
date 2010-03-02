var sys = require('sys');

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
  var args = Array.prototype.slice.call(arguments);
  var key = args.shift();
  var callback = args.pop();
  this.hashmap[key] = args
  if (callback) {
    callback(undefined)
  }
}
MemoryCache.prototype.unSet = function (key) {
  delete this.hashmap[key];
  delete this.blobmap[key];
}
MemoryCache.prototype.setBlob = function () {
  var key = arguments[0];
  var callback = arguments[arguments.length  - 1];
  var self = this;
  this.unSet(key);
  this.blobmap[key] = ''
  
  var e = new process.EventEmitter();
  e.addListener("data", function (data) {
    self.blobmap[key] += data;
  })
  e.addListener("end", function () {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(key);
    args.push(callback);
    self.set.apply(self, args)
  })
  return e;
}
MemoryCache.prototype.getBlob = function (key) {
  var e = new process.EventEmitter();
  var self = this;
  setTimeout(function () {
    e.emit("data", self.blobmap[key])
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

exports.MemoryCache = MemoryCache
