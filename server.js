var http      = require('http');
var Promise   = require('promise');
var assert    = require('assert');
var debug     = require('debug')('server');
var validate  = require('./validate');

// Path to docker domain socket
var DOCKER_SOCKET_PATH    = '/var/run/docker.sock';

// Pattern matching any call to /containers/create and /vA.B/containers/create
// We try to keep this pattern aggressive, while not catching other potentially
// legitimate calls.
var CREATE_PATH_PATTERN   = /^\/*(v\d*\.\d*\/*)?containers\/*create/;

// Max JSON size for /containers/create calls that we validate.
var MAX_JSON_SIZE         = 10 * 1024 * 1024;

/** Construct head from response */
var buildHTTPHead = function(res) {
  // Start the HTTP head with statusCode and message
  var head = [
    'HTTP/1.1 ' + res.statusCode + ' ' + (res.statusMessage || ''),
  ];
  // Add header entries
  for(var key in res.headers) {
    head.push(key + ': ' + res.headers[key]);
  }
  // Finished with an empty line
  head.push('');
  head.push('');
  return head.join('\r\n');
};

/** Handle requests */
var requestHandler = function(clientReq, clientRes) {
  // If this is a /containers/create path, we can't just forward it, instead
  // we read the input, parse, validate and reject with forbidden or forward.
  // Note, this pattern is a bit aggressive to prevent requests from coming
  // through without validation. We also don't care if what the request method
  // is or if it's content-type is `application/json`. If the request is using
  // a path matching the aggressive pattern we'll force validation.
  if (CREATE_PATH_PATTERN.test(clientReq.url)) {
    // Read input up to MAX_JSON_SIZE bytes
    var size    = 0;
    var buffers = [];
    var aborted = false;
    clientReq.on('data', function(buffer) {
      // Discard request data if it was aborted
      if (aborted) {
        return;
      }

      // Add data
      size += buffer.length;
      buffers.push(buffer);

      // Abort request if it's too large
      if (size > MAX_JSON_SIZE) {
        aborted = true;
        console.log("Client attempted to proxy more than %s bytes with " +
                    "%s %s - Request rejected 413 Request Too Large",
                    MAX_JSON_SIZE, clientReq.method, clientReq.url);
        clientRes.writeHead(413, 'Request Too Large', {
          connection: 'close'
        });
        return clientRes.end();
      }
    });

    // Validate input when there is no more
    clientReq.on('end', function() {
      // Discard request data if it was aborted
      if (aborted) {
        return;
      }

      // Read data and attempt to parse it as JSON
      var data = Buffer.concat(buffers, size);
      try {
        data = JSON.parse(data);
      }
      catch(err) {
        console.log("Client attempted to proxy invalid JSON payload with " +
                    "%s %s - Request rejected 400",
                    clientReq.method, clientReq.url);
        clientRes.writeHead(400, 'Invalid JSON Payload', {
          connection: 'close'
        });
        return clientRes.end();
      }

      // Validate the JSON payload
      debug("Validating: %j", data);
      var errors = validate(data);
      if (errors) {
        clientRes.writeHead(403, 'Forbidden Container Configuration', {
          connection: 'close'
        });
        return clientRes.end(JSON.stringify({
          message:  "Forbidden container configuration",
          errors:   errors
        }, null, 2));
      }

      // Forward request to docker
      var dockerReq = http.request({
        socketPath:   DOCKER_SOCKET_PATH,
        path:         clientReq.url,
        method:       clientReq.method,
        headers:      clientReq.headers
      });

      // Wait for response from docker
      dockerReq.on('response', function(dockerRes) {
        debug("%s: %s (%s)", clientReq.method, clientReq.url,
                             dockerRes.statusCode);

        // Write the exact same header as we were given
        clientRes.writeHead(
          dockerRes.statusCode,
          dockerRes.statusMessage,
          dockerRes.headers
        );

        // Pipe docker response to client response
        dockerRes.pipe(clientRes, {end: true});
      });

      // Handle connection errors by aborting client requests, mostly useful
      // in case of docker daemon bugs
      dockerReq.on('error', function(err) {
        console.warn("Error executing request to docker socket: %s, JSON: %j",
                     err, err, err.stack);
        // Abort client request
        clientRes.abort();
      });

      // End dockerReq by sending the validated JSON payload
      dockerReq.end(JSON.stringify(data));
    });

    // Break control-flow here so we don't run the default proxy code, which
    // is used for all other API requests.
    return;
  }

  // Forward request to docker
  var dockerReq = http.request({
    socketPath:   DOCKER_SOCKET_PATH,
    path:         clientReq.url,
    method:       clientReq.method,
    headers:      clientReq.headers
  });

  // Pipe client request to docker request
  clientReq.pipe(dockerReq, {end: true});

  // Wait for response from docker
  dockerReq.on('response', function(dockerRes) {
    debug("%s: %s (%s)", clientReq.method, clientReq.url,
                         dockerRes.statusCode);
    debug("headers: %j", dockerRes.headers);
    // Write the exact same header as we were given
    clientRes.writeHead(
      dockerRes.statusCode,
      dockerRes.statusMessage,
      dockerRes.headers
    );

    // Pipe docker response to client response
    dockerRes.pipe(clientRes, {end: true});
  });

  // Handle connection errors by aborting client requests, mostly useful in
  // case of docker daemon bugs
  dockerReq.on('error', function(err) {
    console.warn("Error executing request to docker socket: %s, JSON: %j",
                 err, err, err.stack);
    // Abort client request
    clientRes.abort();
  });
};

/** Handle upgrades to TCP connections (or WebSockets) */
var upgradeHandler = function(clientReq, clientSocket, clientHead) {
  // If this is a /containers/create path, we forbid the upgrade
  if (CREATE_PATH_PATTERN.test(clientReq.url)) {
    console.log("FORBIDDEN: %s %s (upgrade attempted)",
                clientReq.method, clientReq.url);
    clientSocket.write(buildHTTPHead({
      statusCode:       403,
      statusMessage:    'FORBIDDEN',
      headers: {
        connection:     'close'
      }
    }));
    return clientSocket.end();
  }

  // Forward request to docker
  var dockerReq = http.request({
    socketPath:   DOCKER_SOCKET_PATH,
    path:         clientReq.url,
    method:       clientReq.method,
    headers:      clientReq.headers
  });

  // Upgrade if server agrees to do so (this is always client initiated)
  dockerReq.on('upgrade', function(dockerRes, dockerSocket, dockerHead) {
    debug("%s: %s (%s)", clientReq.method, clientReq.url,
                         dockerRes.statusCode);

    // Write HTTP header
    dockerRes.statusMessage = dockerRes.statusMessage || 'UPGRADED';
    clientSocket.write(buildHTTPHead(dockerRes));

    // Splice sockets
    dockerSocket.pipe(clientSocket, {end: true});
    clientSocket.pipe(dockerSocket, {end: true});
  });

  // If we get a response without upgrade from the server we shall return it
  // to the client. It's probably just a rejection for upgrade, only likely
  // to happen for people using the wrong URL... at least considering that
  // we're proxying requests for docker.
  dockerReq.on('response', function(dockerRes) {
    debug("%s: %s (%s)", clientReq.method, clientReq.url,
                         dockerRes.statusCode);
    console.log("Upgrade failed for %s (%s)",
                clientReq.url, dockerRes.statusCode);

    // Write the exact same header as we were given
    dockerSocket.write(buildHTTPHead(dockerRes));

    // Pipe response to request and end the socket
    dockerRes.pipe(dockerSocket, {end: true});
  });

  // Pipe client request to docker request
  clientReq.pipe(dockerReq, {end: true});
};

/** Create docker proxy */
var createDockerProxy = function(target) {
  // Create http server
  var server = http.createServer();

  // Disable timeouts for incoming connections
  server.setTimeout(0);

  // Handle requests
  server.on('request', requestHandler);

  // Handle upgrades to raw TCP sockets
  server.on('upgrade', upgradeHandler);

  // Start listening
  return new Promise(function(accept, reject) {
    server.once('listening', function() {
      debug("Server listening on: %s", target)
      accept(server);
    });
    server.once('error', reject);
    server.listen(target);
  });
};

// If server.js is executed start the server
if (!module.parent) {
  var servers = [];

  // Create server listening on the port, if not disabled
  if (process.env.PORT !== '') {
    var port = parseInt(process.env.PORT);
    servers.push(createDockerProxy(port));
  }

  // Create server listening on unix domain socket, if not disabled
  if (process.env.SOCKET_PATH !== '') {
    servers.push(createDockerProxy(process.env.SOCKET_PATH));
  }

  Promise.all(servers).then(function() {
    console.log("dind-service-proxy is running");
  }).catch(function(err) {
    console.error("Failed to start server, err: %s, as JSON: %j",
                   err, err, err.stack);
    process.exit(1);
  });
}

// Export createDockerProxy for testing
module.exports = createDockerProxy;
