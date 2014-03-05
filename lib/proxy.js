var os = require('os');
var http = require('http');
var https = require('https');

var connect = require('connect');
var _ = require('lodash');
var httpProxy = require('http-proxy');
var body = require('body/any');

var defaults = {
  protocol: 'http',
  port: '9000',
  hostname: '127.0.0.1',
  middleware: function(connect, options) {},
  proxy: {},
  debug: 'none',
  ssl: false
};

var defaultProxy = {
  hostname: '127.0.0.1',
  port: '3000'
};

var getIpAddress = function() {
  // adapted from http://stackoverflow.com/a/8440736
  var interfaces = os.networkInterfaces();
  var deviceKey;
  var ipAddress = null;
  var checkListener = function(listener) {
    if (!ipAddress && !listener.internal && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(listener.address)) {
      ipAddress = listener.address;
    }
  };
  for (deviceKey in interfaces) {
    if (!interfaces.hasOwnProperty(deviceKey)) {
      continue;
    }
    interfaces[deviceKey].forEach(checkListener);
  }
  return ipAddress;
};

var server = null;

var Responder = function(method, url) {
  this.method = typeof method === 'string' ? new RegExp('^' + method + '$') : method;
  this.url = typeof url === 'string' ? new RegExp('^' + url + '$') : url;
  this.handler = null;
};

Responder.prototype = {
  isMatch: function(req) {
    return this.handler && this.method.test(req.method) && this.url.test(req.url);
  },
  respond: function(req, res, next) {
    if (this.handler) {
      this.handler.call(this, req, res, next);
    }
  },
  log: function(data, status) {
    data = data || '';
    status = status || 200;
    this.handler = function(req, res) {
      body(req, function(err, data) {
        console.log(req.method, req.url, err || data);
      });
      res.statusCode = status;
      res.write(data);
      res.end();
    };
  },
  proxy: function(enable) {
    if (this.handler && (typeof enable === 'boolean' && enable) || typeof enableProxy !== 'boolean') {
      var handler = this.handler;
      this.handler = function(req, res, next) {
        var fakeResponse, _end, _write, _writeHead, statusCode, data;

        if (!handler) {
          return next();
        }

        _end = res.end;
        _write = res.write;
        _writeHead = res.writeHead;
        data = '';
        res.writeHead = function() {};
        res.write = res.end = function(_data) {
          if (typeof _data !== 'undefined') {
            data += _data;
          }
        };
        handler.apply(this, arguments);
        statusCode = res.statusCode;

        // proxy the request, sending faked response when real response completes
        res.writeHead = function() { console.dir(arguments); };
        res.setHeader = function() { console.dir(arguments); };
        res.writeContinue = function() {};
        res.addTrailers = function() {};
        res.write = function(_data) { console.dir(arguments); };
        res.end = function() {
          _writeHead.call(res, statusCode, {
            'Content-Length': data.length,
            'Content-Type': 'application/json'
          });
          _write.call(res, data);
          _end.call(res);
        };
        next();
      };
    }
  },
  send: function(data, status, options) {
    status = status || 200;
    options = options || {};
    options.delay = options.delay || 0;
    if (data === null) {
      this.handler = function(req, res) {
        res.statusCode = status;
        res.writeHead(status, {
          'Content-Length': 0
        });
        res.write(null);
        res.end();
      };
    } else {
      data = typeof data === 'string' ? data : JSON.stringify(data);
      this.handler = function(req, res) {
        res.statusCode = status;
        res.writeHead(status, {
          'Content-Length': data.length
        });
        res.write(data);
        res.end();
      };
    }
    if (options.delay > 0) {
      var handler = this.handler;
      this.handler = function(req, res) {
        setTimeout(function() {
          handler.call(this, req, res);
        }, options.delay);
      };
    }
    return this;
  },
  delay: function(ms) {
    var self, handler;
    if (this.handler) {
      self = this;
      handler = this.handler;
      this.handler = function(req) {
        req.delay = ms;
        handler.apply(this, arguments);
      };
    } else {
      this.handler = function(req, res, next) {
        req.delay = ms;
        next();
      };
    }
    return this;
  },
  once: function() {
    if (this.handler) {
      var self, handler;
      self = this;
      handler = this.handler;
      this.handler = function() {
        handler.apply(this, arguments);
        self.handler = null;
      };
    }
    return this;
  }
};

var Proxy = function(options) {
  var self, proxy;
  self = this;
  this.options = options = _.defaults(options || {}, defaults);
  this.options.proxy = _.defaults(this.options.proxy, defaultProxy);

  // listen all interfaces
  if (options.hostname === '*') {
    options.hostname = '0.0.0.0';
  }
  if (options.hostname === 'localhost') {
    options.hostname = getIpAddress() || '127.0.0.1';
  }

  this.options.middleware = this.options.middleware ? this.options.middleware.call(this, connect, this.options) : [];

  if (this.options.debug === 'verbose') {
    // log all requests
    this.options.middleware.unshift(connect.logger('tiny'));
  } else if (this.options.debug === 'proxy') {
    // log anything not handled by custom middleware (aka anything proxied)
    this.options.middleware.push(connect.logger('tiny'));
  }

  // handle any custom responses
  this.options.middleware.push(function(req, res, next) {
    var responder = null;
    responder = _.find(self.responders, function(responder) {
      return responder.isMatch(req);
    });
    if (responder) {
      return responder.respond(req, res, next);
    }
    return next();
  });

  // append proxy to middleware
  if (options.ssl) {
    proxy = httpProxy.createProxyServer({
      ssl: {
        key: options.key,
        cert: options.cert
      },
      secure: true,
      target: 'https://' + options.proxy.hostname + ':' + options.proxy.port
    });
  } else {
    proxy = httpProxy.createProxyServer({
      target: 'http://' + options.proxy.hostname + ':' + options.proxy.port
    });
  }
  this.options.middleware.push(function(req, res) {
    var proxyOptions;
    proxyOptions = {
      host: options.proxy.hostname,
      port: options.proxy.port,
    };
    if ('https' in options.proxy) {
      proxyOptions.changeOrigin = true;
      proxyOptions.target = {
        https: true
      };
    }
    if (typeof req.delay === 'number' && req.delay > 0) {
      setTimeout(function() {
        return proxy.web(req, res);
      }, req.delay);
      return;
    }

    return proxy.web(req, res);
  });

  // display errors for test debugging
  this.options.middleware.push(function(err, req, res) {
    if (err) {
      console.log(req.method, req.url, res.statusCode, err.message, err.stack);
    }
  });

  this.app = connect.apply(null, this.options.middleware);
  if (options.ssl) {
    this.server = https.createServer({
      key: this.options.key,
      cert: this.options.cert
    }, this.app);
  } else {
    this.server = http.createServer(this.app);
  }
  this.responders = [];
};

Proxy.prototype = {
  listen: function(cb) {
    var self, server, options;
    cb = cb || function() {};
    self = this;
    server = this.server;
    options = this.options;
    server.listen(this.options.port, this.options.hostname)
    .on('listening', function() {
      var address = server.address();
      var hostname = options.hostname || address.address || 'localhost';
      var target = options.protocol + '://' + hostname + ':' + address.port;

      cb(target);
    })
    .on('error', function(err) {
      if (err.code === 'EADDRINUSE') {
        console.warn('connect error: port ' + options.port + ' is already in use by another process.');
      } else {
        console.warn('connect error: ' + err);
      }
    });
    this._listen = this.listen;
    delete this.listen;
  },
  when: function(method, url) {
    var responder;
    responder = new Responder(method, url);
    this.responders.push(responder);
    return responder;
  },
  clear: function() {
    this.responders = [];
  }
};

module.exports = {
  get: function(options) {
    if (server) {
      return server;
    }
    server = new Proxy(options);
    return server;
  }
};
