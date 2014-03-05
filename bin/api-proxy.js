var path = require('path');
var connect = require('connect');
var proxy = require('../lib/proxy');

var argv = require('minimist')(process.argv.slice(2), {
  string: ['debug', 'host', 'port', 'proxyhost', 'proxyport', 'static', 'config'],
  default: {
    host: 'localhost',
    port: '9000',
    proxyhost: 'localhost',
    proxyport: '3000',
    debug: 'proxy',
    static: null,
    config: null
  }
});

var server = proxy.get({
  debug: argv.debug,
  hostname: argv.host,
  port: argv.port,
  proxy: {
    hostname: argv.proxyhost,
    port: argv.proxyport
  },
  middleware: function(connect) {
    var middleware = [];
    if (argv.static) {
      middleware.push(connect.static(path.resolve(__dirname, argv.static)));
    }
    return middleware;
  }
});

if (argv.config) {
  var config, responder, item;
  try {
    config = require(path.resolve(__dirname, argv.config));
    if (!config) {
      throw new Error('config returns no value');
    }
  } catch (e) {
    console.error('config file is invalid: should be json or require()-able.');
    console.error(e);
    process.exit(1);
  }

  for (item in config) {
    responder = proxy.when(item.method, item.url);
    if (item.data) {
      responder.send(item.data, item.status, item.options);
    }
    if (item.once) {
      responder.once();
    }
    if (item.delay) {
      responder.proxy().delay(item.delay);
    }
  }
}

server.listen(function(address) {
  console.log('listening at %s', address);
});
