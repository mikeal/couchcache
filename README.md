## Description

[![Greenkeeper badge](https://badges.greenkeeper.io/mikeal/couchcache.svg)](https://greenkeeper.io/)

CouchDB is awesome! One of the best parts of CouchDB is that it's all HTTP so you just need to use a reverse caching proxy that does etag checking to serve as an efficient cache.

CouchCache goes a step further, it listens to the _changes feed on any database it caches and intelligently invalidates effected caches when the documents change. This should allow CouchCache to be the most efficient cache for CouchDB with the lowest latency. 

## Warning

This is alpha, you probably don't want to use this in production. No REALLY, don't use this in production, it's still quite experimental.

## Installation

Install node http://wiki.github.com/ry/node/

pull down this source

<pre>
  $ lib/bin.js help
  -c,  --couch :: Url to couchdb to proxy all requests. Default is http://localhost:5984
  -p,  --port :: Port to run the caching proxy on. Default is 80
</pre>

The default port is 80 so you'll need to run as root on most operating systems if you want to using the default settings.

Once it's running point all your CouchDB queries at it.

Currently only /dbname/docid requests will be cached. Requests with query strings will also be cached (ie /dbname/docid?revs_info=true).

# TODO

* Cache _show (referenced to docid but also invalidated on ddoc change)
* Cache view queries (cache until db change, after a change do an etag check on the full query)
* Cache _list (same semantics as view queries but invalidate on ddoc change)
* Allow custom functions to override caching.
* Reverse map _rewrite on design docs (invalidate all on ddoc change)
* Reverse map [vhost] definitions

# Bugs

* Just realized headers aren't working.

