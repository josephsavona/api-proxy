api-proxy
=========

HTTP proxy with response modification - for use in stubbing APIs during dev/testing

## Install

Install via

    npm install api-proxy --save

Require as

    require('api-proxy');

## Command-line usage

Install via `npm install -g api-proxy`.

Options:
- `--debug="FLAG"` flag can be 'proxy' or 'verbose'
- `--host="hostname"` hostname to listen on, eg 'localhost'
- `--port="port"` port to listen on, eg '9000'
- `--proxyhost="hostname"` hostname to proxy to, eg 'project.dev'
- `--proxyport="port"` port to proxy to, eg 3000
- `--static="dir/path/"` (optional) path to serve as static files
- `--config="config/path.json"` (optional) path to a configuration file specifying stubbed responses

## API Usage

Documentation coming soon, see `api-proxy/bin/api-proxy.js` for ideas.
