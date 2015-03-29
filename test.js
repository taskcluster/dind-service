suite("server", function() {
  var assert            = require('assert');
  var createDockerProxy = require('./server');
  var Promise           = require('promise');
  var http              = require('http');
  var debug             = require('debug')('test');
  var validate          = require('./validate');

  // Port to test on
  var port = 52375;
  var host = 'localhost';
  var baseUrl = 'http://' + host + ':' + port;

  // Keep reference to proxy server
  var proxyServer = null;

  // Setup proxy server
  setup(function() {
    return createDockerProxy({
      port:         port
    }).then(function(server) {
      proxyServer = server;
    });
  });
  // Close proxy server
  teardown(function() {
    return new Promise(function(accept) {
      proxyServer.close(accept);
    });
  });

  test("Can list images", function(done) {
    http.get(baseUrl + '/info', function(res) {
      debug("GET /info   %s", res.statusCode);
      debug(res.headers);
      var data = "";
      res.on('data', function(d) {
        data += d.toString();
      });
      res.on('end', function() {
        try {
          debug(JSON.stringify(JSON.parse(data), null, 2));
          done();
        }
        catch(err) {
          done(err);
        }
      });
    }).on('error', done);
  });
});

suite("validate", function() {
  var validate          = require('./validate');
  var assert            = require('assert');

  test("Validate - empty object", function() {
    assert(validate({
    }) === null, "Bug in validate");
  });

  test("Validate - MacAddress (empty string)", function() {
    assert(validate({
      MacAddress:   ""
    }) === null, "Bug in validate");
  });

  test("Validate - !MacAddress (string)", function() {
    assert(validate({
      MacAddress:   "invalid"
    }) !== null, "Bug in validate");
  });

  test("Validate - !MacAddress (object)", function() {
    assert(validate({
      MacAddress:   {}
    }) !== null, "Bug in validate");
  });

  test("Validate - Volumes (object)", function() {
    assert(validate({
      Volumes:   {}
    }) === null, "Bug in validate");
  });

  test("Validate - SecurityOpts (null)", function() {
    assert(validate({
      SecurityOpts:   null
    }) === null, "Bug in validate");
  });

  test("Validate - SecurityOpts (zero)", function() {
    assert(validate({
      SecurityOpts:   0
    }) !== null, "Bug in validate");
  });

  test("Validate - SecurityOpts (object)", function() {
    assert(validate({
      SecurityOpts:   {}
    }) !== null, "Bug in validate");
  });
})