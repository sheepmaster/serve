var fs = require('fs');
var http = require('http');
var Path = require('path');
var Q = require('q');

var pretty_print = true;

function error(res, status, msg) {
  res.writeHead(status, {'Content-Type': 'text/plain'});
  if (msg)
    res.write(msg + '\n');
  res.end();
}

function cat(path, res) {
  var stream = fs.createReadStream(path);
  stream.on('error', function(err) {
    if (err.code == 'ENOENT') {
      error(res, 404, 'File not found: \'' + path + '\'');
      return;
    }
    error(res, 500, JSON.stringify(err))
  })
  stream.on('open', function() {
    res.writeHead(200, {'Content-Type': 'text/plain'});
  });
  stream.pipe(res);
}

function ls(dir, res) {
  Q.ncall(fs.readdir, fs, dir).then(function(files) {
    return Q.all(files.map(function(file) {
      return Q.ncall(fs.stat, fs, file).then(function(stat) {
        stat.file = file;
        return stat;
      });
    }));
  }).then(function(stats) {
    res.writeHead(200, {'Content-Type': 'application/json'});
    var listing = stats.map(function(stat) {
      return {
        'file': stat.file,
        'is_dir': stat.isDirectory()
      };
    });
    res.end(pretty_print ? JSON.stringify(listing, null, '  ') :
                           JSON.stringify(listing));
  }, function(err) {
    error(res, 500, err);
  });
}

function echo(path, req, res) {
  var stream = fs.createWriteStream(path);
  stream.on('error', function(err) {
    if (err.code == 'ENOENT') {
      error(res, 404, 'File not found: \'' + path + '\'');
      return;
    }
    error(res, 500, JSON.stringify(err));
  });
  stream.on('open', function() {
    res.writeHead(200, {'Content-Type': 'text/plain'});
  });
  req.on('end', function() {
    // If we haven't thrown an error, end the response.
    if (res.writable)
      res.end();
  });
  req.pipe(stream);
}

var base_dir = process.argv[2] || process.cwd();

http.createServer(function (req, res) {
  var is_dir = req.url.charAt(req.url.length - 1) == '/';
  var path = Path.resolve(base_dir, req.url.substr(1));
  // console.log(path + ' is dir: ' + is_dir);
  if (path.substr(0, base_dir.length) != base_dir) {
    error(res, 403, 'Permission denied: \'' + path + '\'');
    return;
  }

  var method = req.method;
  switch (method) {
    case 'GET': {
      if (is_dir) {
        ls(path, res);
      } else {
        cat(path, res);
      }
      break;
    }
    case 'PUT': {
      echo(path, req, res);
      break;
    }
    default: {
      error(res, 400, 'Unknown method \'' + method + '\'');
      return;
    }
  }
}).listen(1337, '127.0.0.1');