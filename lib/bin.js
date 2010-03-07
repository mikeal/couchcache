#!/usr/bin/env node

var proxy = require('./proxy'),
    url = require('url'),
    sys = require('sys'),
    optionparser = require('./dep/optionparser');

var opts = new optionparser.OptionParser();
opts.addOption('-c', '--couch', 'string', 'couch', "http://localhost:5984", 
               "Url to couchdb to proxy all requests. Default is http://localhost:5984");
opts.addOption('-p', '--port', 'number', 'port', 80, 
               "Port to run the caching proxy on. Default is 80");

var options = opts.parse(true);

var server = proxy.createProxyServer({uri:url.parse(options.couch)});
server.listen(options.port);
sys.puts("Server running at http://127.0.0.1:"+options.port)

