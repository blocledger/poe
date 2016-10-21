/*
Copyright 2016 BlocLedger

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
//process.env['DEBUG'] = 'poe,hfc'  //use this instead of setting DEBUG on the command line
//process.env['GRPC_TRACE'] = 'all'  //turns on grpc tracing
var app = require('express')();
var morgan = require('morgan');
var bodyparser = require('body-parser');
var atob = require('atob');
var fs = require('fs');
var ProtoBuf = require('protobufjs');
var util = require('./util.js');
//var ByteBuffer = require("bytebuffer");
//var hexy = require('hexy');
var Q = require('q');
var hfc = require('hfc');
// jscs:disable maximumLineLength
// var hfc = require('C:/Users/Eric/Documents/Projects/BlockChain/go/src/github.com/hyperledger/fabric/sdk/node/');
// jscs:enable maximumLineLength
var debug = require('debug')('poe');
var rest = require('rest');
var mime = require('rest/interceptor/mime');
var errorCode = require('rest/interceptor/errorCode');
var restClient = rest.wrap(mime).wrap(errorCode, {code: 400});

var  chainHeight = 1;
var blockList = [];

// Configure test users
//
// Set the values required to register a user with the certificate authority.
user1 = {
  name: 'WebApp_user1',
  role: 1, // Client
  account: 'bank_a',
  affiliation: 'bank_a'
  //affiliation: '00001'  //bluemix
};

var userMember1;

// Path to the local directory containing the chaincode project under $GOPATH
var chaincodePath = 'github.com/chaincode/';  //local config
// var chaincodePath = 'github.com/blocks_cc/';  // bluemix config
// var chaincodePath = 'github.com/gerrit/fabric/examples/chaincode/go/chaincode_example02';

var chaincodeID;

// Initializing values for chaincode parameters
var initA = '100';
var initB = '200';
var deltaAB = '1';

// Create a client chain.
// The name can be anything as it is only used internally.
var chain = hfc.newChain('targetChain');

// Configure the KeyValStore which is used to store sensitive keys
// as so it is important to secure this storage.
// The FileKeyValStore is a simple file-based KeyValStore.
// check that the ./tmp directory existsSync
if (!fs.existsSync('./tmp')) {
  fs.mkdirSync('./tmp');
}
if (!fs.existsSync('./tmp')) {
  throw new Error('Could not create the ./tmp directory');
}
chain.setKeyValStore(hfc.newFileKeyValStore('./tmp/keyValStore'));
// chain.setKeyValStore(hfc.newFileKeyValStore('./tmp/bluemixKeyValStore'));
var store = chain.getKeyValStore();

store.getValue('chaincodeID', function(err, value) {
  if (err) {
    console.log('error getting chaincodeID ' + err);
  }
  if (value) {
    chaincodeID = value.trim();
  }
});

// jscs:disable requireCamelCaseOrUpperCaseIdentifiers
// load bluemix credentials from file-based
// var cred = require('./cred-blockchain-ma.json');
// var grpc = 'grpcs://';

//  local config no TLS
// var cred = require('./cred-local.json');
var cred = require('./cred-docker.json');
var grpc = 'grpc://';

// URL for the REST interface to the peer
//var restUrl = 'http://localhost:5000';
var restUrl = cred.peers[0].api_url;

// Set the URL for member services
//chain.setMemberServicesUrl('grpc://localhost:50051');
var caName = Object.keys(cred.ca)[0];
var ca = cred.ca[caName];
debug(caName);
debug(grpc + ca.url);
var cert;
// the next line was recommended in issue #2373
// chain.setECDSAModeForGRPC(true);  //may not be needed anymore

if (fs.existsSync('us.blockchain.ibm.com.cert')) {
  debug('found cert');
  cert = fs.readFileSync('us.blockchain.ibm.com.cert');
}

if (cert) {
  chain.setMemberServicesUrl(grpc + ca.url, cert);
} else {
  chain.setMemberServicesUrl(grpc + ca.url);
}
debug(cert);

// Add a peer's URL
for (var i = 0; i < cred.peers.length; i++) {
  var peer = cred.peers[i];
  var url = grpc + peer.discovery_host + ':' + peer.discovery_port;
  debug(url);
  if (cert) {
    chain.addPeer(url, cert);
  } else {
    chain.addPeer(url);
  }
}
//chain.addPeer('grpc://localhost:30303');
// jscs:enable requireCamelCaseOrUpperCaseIdentifiers

// search the user list for WebAppAdmin and return the password
var credUser = cred.users.find(function(u) {
  return u.username == 'WebAppAdmin';
});
debug(credUser.secret);
// Enroll "WebAppAdmin" which is already registered because it is
// listed in fabric/membersrvc/membersrvc.yaml with it's one time password.
// If "WebAppAdmin" has already been registered, this will still succeed
// because it stores the state in the KeyValStore
// (i.e. in '/tmp/keyValStore' in this sample).
chain.enroll('WebAppAdmin', credUser.secret, function(err, webAppAdmin) {
  if (err) {
    return console.log('ERROR: failed to register webAppAdmin', err);
  }
  // Successfully enrolled WebAppAdmin during initialization.
  // Set this user as the chain's registrar which is authorized to register other users.
  chain.setRegistrar(webAppAdmin);
  // Now begin listening for web app requests
  //listenForUserRequests();
  var theReg = chain.getRegistrar().getName();
  debug('The registrar is ' + theReg);
  //debug(webAppAdmin);

  //  For bluemix use an already defined user and just call enroll
  // var user3 = cred.users[3];
  // chain.enroll(user3.enrollId, user3.enrollSecret, function(err, user) {
  //   if (err) {
  //     return console.log('user_type1 enroll error: ' + err);
  //   }
  //   if (user.isEnrolled()) {
  //     userMember1 = user;
  //     return;
  //   }
  // });
  // the code below is used to register and enroll a user for the local config
  chain.getUser(user1.name, function(err, user) {
    if (err) {
      return console.log('getUser error: ' + err);
    }
    if (user.isEnrolled()) {
      userMember1 = user;
      return;
    }
    debug(user);
    // User is not enrolled yet, so perform both registration and enrollment
    var registrationRequest = {
      registrar: 'WebAppAdmin',
      enrollmentID: user1.name,
      //role: user1.role, // Client
      account: user1.account,
      affiliation: user1.affiliation
    };
    user.registerAndEnroll(registrationRequest, function(err) {
      if (err) {
        return console.log('registerAndEnroll error: ' + err);
      }
      userMember1 = user;
    });
  });
});

app.use(morgan('dev'));
app.use(require('express').static(__dirname + '/public'));
//app.use(require('body-parser').urlencoded({ extended: true }));
app.use(bodyparser.json());

app.get('/', function(req, res) {
  debug('Display basic home page.');
  res.sendfile('./public/menu.html');
});

// provide an endpoint that will deploy the chaincode
//  TODO  This failed when trying to use bluemix and had to deploy using
//  Postman with the REST interface.  Althogh that wasn't smooth either
app.get('/deploy', function(req, res) {
  // Construct the deploy request
  var deployRequest = {
    fcn: 'init',
    args: ['a', initA, 'b', initB],
    //certificatePath: '/certs/blockchain-cert.pem'  //added for bluemix
  };
  debug('Deployment request %j ', deployRequest);

  deployRequest.chaincodePath = chaincodePath;

  // Trigger the deploy transaction
  var deployTx = userMember1.deploy(deployRequest);

  // Print the deploy results
  deployTx.on('complete', function(results) {
    // Deploy request completed successfully
    console.log('deploy results: ' + results);
    // Set the testChaincodeID for subsequent tests
    chaincodeID = results.chaincodeID;
    store.setValue('chaincodeID',
    chaincodeID,
    function(err) {
      if (err) {
        console.log('error saving chaincodeid. ' + err);
      }
    });
    console.log('chaincodeID: ' + chaincodeID);
    debug('Successfully deployed chaincode: request/response ' +
          deployRequest + results);
    debug(results);
    res.json(results);
  });
  deployTx.on('error', function(err) {
    // Deploy request failed
    console.log('there was an error deploying the chaincode ' + err);
    debug('Failed to deploy chaincode: request/error %j ', err);
    debug(err);
    res.json(err);
  });
  //res.send('Chaincode deployed ' + deployRequest);
});

app.get('/member', function(req, res) {
  //lets call all of the get functions and see what we get
  console.log('user is registered ' + userMember1.isRegistered() +
              ' is enrolled ' + userMember1.isEnrolled());
  debug('getName: ');
  debug(userMember1.getName());
  //debug(JSON.stringify(userMember1.getChain()));

  res.send('userMember1.getChain()');
});

// Add support for the Applicaion specific REST calls
// addDoc, listDoc, transferDoc, verifyDoc, and delDoc

// addDoc  Add a new document to the block chain

app.post('/addDoc', function(req, res) {
  debug('/addDoc request body %j', req.body);
  var hashValid = true;
  if (!req.body.hash) {
    hashValid = false;
    console.log('no hash provided');
  } else if (req.body.hash == 'file hash') {
    hashValid = false;
  } else if (req.body.hash.length != 64) {
    hashValid = false;
  }

  if (hashValid === false) {
    console.log('The hash is invalid.');
    return res.status(500).send('Error: invalid hash');
  }

  debug('hash equals %s', req.body.hash);
  var params = req.body;
  var hash = req.body.hash;

  var invokeRequest = {
    chaincodeID: chaincodeID,
    fcn: 'addDoc',
    args: [hash, JSON.stringify(params)]
  };
  debug('The invoke args = ', invokeRequest.args);

  var invokeTx = userMember1.invoke(invokeRequest);
  invokeTx.on('submitted', function(results) {
    // Invoke transaction submitted successfully
    console.log('Successfully submitted chaincode invoke transaction: ',
    invokeRequest, results);
  });
  invokeTx.on('error', function(err) {
    // Invoke transaction submission failed
    debug(err);
    console.log('Failed to invoke addDoc: ' + err.msg);
    res.status(500).send(err.msg);
  });
  invokeTx.on('complete', function(results) {
    console.log('The completion results for /addDoc %j', results.result);
    res.json(results);
  });
});

app.get('/verifyDoc/:hash', function(req, res) {
  debug('received /verifyDoc with hash = %s', req.params.hash);
  var queryRequest = {
    chaincodeID: chaincodeID,
    fcn: 'readDoc',
    args: [req.params.hash]
  };
  var queryTx = userMember1.query(queryRequest);

  // Success document found
  queryTx.on('complete', function(results) {
    debug('Successfully queried an existing document: %j ', results);
    if (results.result.length !== 0) {
      var params = JSON.parse(results.result);
      console.log(params);
      res.json(params);
    } else {
      res.status(500).send('Document not found');
    }
  });

  // Fail document not found
  queryTx.on('error', function(err) {
    debug(err);
    console.log('/verifyDoc query failed:  ', err.msg);
    res.status(500).send(err.msg);
  });
});

// list document
// returns a list of all of the documents
app.get('/listDoc', function(req, res) {
  debug('received /listDoc');
  var queryRequest = {
    chaincodeID: chaincodeID,
    fcn: 'listDoc',
    args: []
  };

  var queryTx = userMember1.query(queryRequest);

  queryTx.on('complete', function(results) {
    debug('successfully queried for the document list.');
    debug(results);
    if (results.result.length !== 0) {
      var list = JSON.parse(results.result);
      res.json(list);
    } else {
      res.status(500).send('Document list invalid');
    }
  });

  queryTx.on('error', function(err) {
    debug(err);
    console.log('/listDoc query failed:  ', err.msg);
    res.status(500).send(err.msg);
  });
});

// delDoc  Add a new document to the block chain

app.post('/delDoc', function(req, res) {
  debug('/delDoc request body %j', req.body);

  debug('hash equals %s', req.body.hash);
  var hash = req.body.hash;

  var invokeRequest = {
    chaincodeID: chaincodeID,
    fcn: 'delDoc',
    args: [hash]
  };
  debug('The invoke args = ', invokeRequest.args);

  var invokeTx = userMember1.invoke(invokeRequest);
  invokeTx.on('submitted', function(results) {
    // Invoke transaction submitted successfully
    console.log('Successfully submitted chaincode invoke transaction: ',
    invokeRequest, results);
  });
  invokeTx.on('error', function(err) {
    // Invoke transaction submission failed
    debug(err);
    console.log('Failed to invoke delDoc: ' + err.msg);
    res.status(500).send(err.msg);
  });
  invokeTx.on('complete', function(results) {
    console.log('The completion results for /delDoc %j', results.result);
    res.json(results);
  });
});

// editDoc  changes the owner of the doc but may be enhanced to include other parameters
app.post('/editDoc', function(req, res) {
  debug('/editDoc request body %j', req.body);
  var hash = req.body.hash;

  var invokeRequest = {
    chaincodeID: chaincodeID,
    fcn: 'transferDoc',
    args: [req.body.hash, req.body.owner]
  };
  debug('The invoke args = ', invokeRequest.args);

  var invokeTx = userMember1.invoke(invokeRequest);
  invokeTx.on('submitted', function(results) {
    // Invoke transaction submitted successfully
    console.log('Successfully submitted chaincode invoke transaction: ',
    invokeRequest, results);
  });
  invokeTx.on('error', function(err) {
    // Invoke transaction submission failed
    debug(err);
    console.log('Failed to invoke transferDoc: ' + err.msg);
    res.status(500).send(err.msg);
  });
  invokeTx.on('complete', function(results) {
    console.log('The completion results for /transferDoc %j', results.result);
    res.json(results);
  });
});

//initialize the block list
var startUpdates = false;
util.updateChain(chainHeight).then(function(height) {
  debug('The initial block chain height is ' + height);
  util.initialBlockList(height).then(function(values) {
    debug('Initializing the block list with a length of ' + values.length);
    blockList = values;
    startUpdates = true;
  }, function(response) {
    console.log(response);
  }).done();
  chainHeight = height;
  debug('The initial chainHeight is set to ' + chainHeight);
}, function(response) {
  console.log(response);
  console.log('Error updating the chain height ' + response.error);
});

// periodically fetch the currnet block height
setInterval(function() {
  if (startUpdates === true) {
    util.updateChain(chainHeight).then(function(height) {
      debug('Block chain height is ' + height);
      var last = blockList[blockList.length - 1].id;
      debug('The end of the block list is ' + last);
      if (height > last + 1) {
        util.buildBlockList(last + 1, height).then(function(values) {
          debug('There are additional blocks of length ' + values.length);
          Array.prototype.push.apply(blockList, values);  //adds the new blocks to the end of the block list
        }, function(response) {
          console.log(response);
        });
      }
      chainHeight = height;
      debug('The new chain height is ' + chainHeight);
    }, function(response) {
      console.log(response);
      console.log('Error updating the chain height ' + response.error);
    });
  }
}, 60000);

app.get('/chain', function(req, res) {
  debug('Display chain stats');
  restClient(restUrl + '/chain/')
  .then(function(response) {
    debug(response.entity);
    res.json(response.entity);
  }, function(response) {
    console.log(response);
    console.log('Error path: There was an error getting the chain_stats:',
                response.status.code, response.entity);
    res.status(response.status.code)
       .send('Error path: There was an error getting the chain stats.  ' +
              response.entity);
  });
});

app.get('/chain/blocks/:id', function(req, res) {
  console.log('Get a block by ID: ' + req.params.id);
  restClient(restUrl + '/chain/blocks/' + req.params.id)
  .then(function(response) {
    // debug(response.entity);
    var block = util.decodeBlock(response.entity);
    if (block) {
      res.json(block);
    } else {
      res.json(response.entity);
    }
  }, function(response) {
    console.log(response);
    console.log('Error path: There was an error getting the block_stats:',
                response.status.code, response.entity.Error);
    res.send('Error path: There was an error getting the block stats.  ' +
              response.entity.Error);
  });
});

//provide payload details for block with id specified
app.get('/payload/:id', function(req, res) {
  restClient(restUrl + '/chain/blocks/' + req.params.id)
  .then(function(response) {
    if (response.status.code != 200) {
      console.log('There was an error getting the block_stats:',
                  response.status.code);
      res.send('There was an error getting the block stats.  ' +
                response.entity.Error);
    } else {
      debug(response.entity);
      payload = util.decodePayload(response.entity.transactions[0]);
      console.log(payload.chaincodeSpec.ctorMsg);
      res.json(payload);
    }
  }, function(response) {
    console.log(response);
    console.log('Error path: There was an error getting the block_stats:',
                response.status.code, response.entity.Error);
    res.send('Error path: There was an error getting the block stats.  ' +
                response.entity.Error);
  });
});

app.get('/chain/blockList/:id', function(req, res) {
  console.log('build a list of n blocks');
  var id = req.params.id;
  if (chainHeight > id) {
    res.json(blockList.slice(-id).reverse());
  } else {
    res.json(blockList.slice(0, chainHeight).reverse());
  }
});

app.get('/chain/transactionList/:id', function(req, res) {
  var list = [];
  var count = 0;
  var len = blockList.length;
  var findUUID = function(r) {
    return r.txid === transaction.txid;
  };
  for (var i = 0; i < len && count < req.params.id; i++) {
    var block = blockList[i].block;
    if (!block.transactions) {  // skip blocks with no transactions
      continue;
    }
    var transLen = block.transactions.length;
    for (var j = 0; j < transLen; j++) {
      var transaction = block.transactions[j];
      // var result = block.nonHashData.transactionResults.find(findUUID);
      var result = 'TBD';   //TODO figure out the results of the new format
      list.push({transaction: transaction, result: result});
      count++;
    }
  }
  if (list.length > req.params.id) {
    res.json(list.slice(0, req.params.id).reverse());
  } else {
    res.json(list.slice().reverse());
  }
});

app.use(function(err, req, res, next) {
  console.log('unhandled error detected: ' + err.message);
  res.type('text/plain');
  res.status(500);
  res.send('500 - server error');
});

app.use(function(req, res) {
  console.log('route not handled');
  res.type('text/plain');
  res.status(404);
  res.send('404 - not found');
});

app.listen(3000, function() {
  console.log('listening on port 3000');
});
