var path = require('path');
var fs = require('fs');
var proxy = require('../lib/proxy');

var argv = require('minimist')(process.argv.slice(2), {
  string: ['debug', 'host', 'port', 'proxyhost', 'proxyport', 'static', 'config', 'cert', 'key'],
  boolean: ['ssl'],
  default: {
    ssl: false,
    host: 'localhost',
    port: '9000',
    proxyhost: 'localhost',
    proxyport: '3000',
    debug: 'proxy',
    static: null,
    config: null,
    key: null,
    cert: null
  }
});

if (argv.ssl && (!argv.key || !argv.cert)) {
  console.error('must provide --key="..." and --cert="..." for --ssl');
  process.exit(1);
}

if (!argv.proxyhost) {
  console.error('--proxyhost="hostname" is required');
  process.exit(1);
}

if (!argv.proxyport) {
  console.error('--proxyport="80" is required');
  process.exit(1);
}

var options = {
  debug: argv.debug,
  ssl: argv.ssl,
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
};
if (argv.key) {
  options.key = fs.readFileSync(path.resolve(process.cwd(), argv.key), 'utf8');
}
if (argv.cert) {
  options.cert = fs.readFileSync(path.resolve(process.cwd(), argv.cert), 'utf8');
}

var server = proxy.get(options);

if (argv.config) {
  var config, responder, item;
  try {
    config = require(path.resolve(process.cwd(), argv.config));
    if (!config) {
      throw new Error('config returns no value');
    }
  } catch (e) {
    console.error('config file is invalid: should be json or require()-able.');
    console.error(e);
    process.exit(1);
  }

  for (var ix = 0; ix < config.length; ix++) {
    item = config[ix];
    responder = server.when(item.method, item.url);

    if (!item.data) {
      console.error('requires data', item.method, item.url);
      continue;
    }

    // primary response
    console.log(item.method, item.url, item.proxy ? 'proxy' : '', item.once ? 'once' : '');
    responder.send(item.data, item.status, item.options);

    // whether to proxy the request through with ignored response
    if (item.proxy) {
      responder.proxy();
    }

    // modifier
    if (item.once) {
      responder.once();
    }
  }
}

server.listen(function(address) {
  console.log('listening at %s', address);
});
