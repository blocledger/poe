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
var Q = require('q');
var hfc = require('hfc');
var debug = require('debug')('poe');
var rest = require('rest');
var mime = require('rest/interceptor/mime');
var errorCode = require('rest/interceptor/errorCode');
var restClient = rest.wrap(mime).wrap(errorCode, {code: 400});

var  chainHeight = 1;
var blockList = [];

// Configure test users
// Set the values required to register a user with the certificate authority.
user1 = {
  name: 'WebApp_user1',
  role: 1, // Client
  account: 'bank_a',
  affiliation: 'bank_a'
  //affiliation: '00001'  //bluemix
};

var userMember1;
var userMember2;

// Path to the local directory containing the chaincode project under $GOPATH
var chaincodePath = 'github.com/chaincode/';  //local config

var chaincodeID;
var proposedChaincodeID;

// Confidentiality setting
var confidentialSetting = false;

// Create a client chain.
// The name can be anything as it is only used internally.
var chain = hfc.newChain('targetChain');

// Configure the KeyValueStore which is used to store sensitive keys
// check that the ./tmp directory existsSync
if (!fs.existsSync('./tmp')) {
  fs.mkdirSync('./tmp');
}
if (!fs.existsSync('./tmp')) {
  throw new Error('Could not create the ./tmp directory');
}
chain.setKeyValueStore(hfc.newKeyValueStore({
  path: './tmp/keyValStore'
}));
var store = chain.getKeyValueStore();

store.getValue('chaincodeID')
.then(
  function(value) {
    chaincodeID = value.trim();
    debug('chaincodeID = ' + chaincodeID);
  }, function(err) {
    console.log('error getting chaincodeID ' + err);
  }
)
.catch(function(err) {
  console.log(err);
});

// jscs:disable requireCamelCaseOrUpperCaseIdentifiers
//  local config no TLS
var cred = require('./cred-local.json');

var grpc = 'grpc://';

var restUrl = cred.peers[0].api_url;

// Set the URL for member services
chain.setMemberServicesUrl(grpc + cred.ca.url);

// set orderer
chain.setOrderer(grpc + cred.orderer.url);

// Get a peer object
var peerUrl = grpc +
              cred.peers[0].discovery_host + ':' +
              cred.peers[0].discovery_port;
var peer = hfc.getPeer(peerUrl);
debug(peerUrl);
// jscs:enable requireCamelCaseOrUpperCaseIdentifiers

// search the user list for WebAppAdmin and return the password
var credUser = cred.users.find(function(u) {
  return u.username == 'WebAppAdmin';
});
debug(credUser.secret);

chain.enroll('WebAppAdmin', credUser.secret)
.then(
  function(webAppAdmin) {
    chain.setRegistrar(webAppAdmin);
    return chain.getUser(user1.name);
  },
  function(err) {
    console.log('ERROR: failed to register webAppAdmin', err);
  }
).then(
  function(user) {
    if (user.isEnrolled()) {
      debug('user is already enrolled');
      // Since user is already enrolled we can return it synchornously to the
      // next .then vs. calling the async registerAndEnroll
      return user;
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
    return user.registerAndEnroll(registrationRequest);
  },
  function(err) {
    console.log('getUser error: ' + err);
  }
).then(
  function(user) {
    userMember1 = user;
    debug('userMember1 has been set');
  },
  function(err) {
    console.log('registerAndEnroll error: ' + err);
  }
);

app.use(morgan('dev'));
app.use(require('express').static(__dirname + '/public'));
app.use(bodyparser.json());

app.get('/', function(req, res) {
  debug('Display basic home page.');
  res.sendfile('./public/menu.html');
});

// provide an endpoint that will deploy the chaincode
app.get('/deploy', function(req, res) {
  // Construct the deploy request
  var deployRequest = {
    target: peer,
    chaincodePath: chaincodePath,
    fcn: 'init',
    args: [],
    //confidential: confidentialSetting,
    //certificatePath: '/certs/blockchain-cert.pem'  //added for bluemix
  };
  debug('Deployment request %j ', deployRequest);

  // check to see if the user is enrolled
  var result = util.checkUser(userMember1);
  if (result.err !== 0) {
    console.log('Deploy failed. ' + result.msg);
    return res.status(500).send('Deploy failed. ' + result.msg);
  }

  userMember1.sendDeploymentProposal(deployRequest)
  .then(
    function(results) {
      debug('received proposal results');
      console.log(results);
      var proposalResponse = results[0];
      var proposal = results[1];
      if (proposalResponse &&
        proposalResponse.response &&
        proposalResponse.response.status === 200) {
        console.log('Successfully sent Proposal and received ' +
        'ProposalResponse: Status - %s, message - "%s", metadata - "%s", ' +
        'endorsement signature: %s', proposalResponse.response.status,
        proposalResponse.response.message, proposalResponse.response.payload,
        proposalResponse.endorsement.signature);
        proposedChaincodeID = proposalResponse.chaincodeId;
        return userMember1.sendTransaction(proposalResponse, proposal);
      } else {
        console.log('sendDeploymentProposal failed');
        console.log(proposalResponse);
        console.log(proposalResponse.response);
        console.log(proposalResponse.response.status);
        return res.status(500).send('Deploy proposal failed. ');
      }
    },
    function(err) {
      // Deploy proposal failed
      console.log('Error getting deploy proposol for the chaincode ' + err);
      debug('Failed to get the chaincode deploy proposal: request/error %j ',
            err);
      debug(err);
      res.json(err);
    }
  ).catch(
    function(err) {
      console.log('Depoly failed');
      console.log(err);
      return res.status(500).send('Deploy failed. ' + err);
    }
  ).then(
    function(response) {
      if (response.Status == 'SUCCESS') {
        console.log(response);
        chaincodeID = proposedChaincodeID;
        store.setValue('chaincodeID', chaincodeID)
        .then(function(response) {
          debug('setValue response from storing chaincodeID is ' + response);
        }, function(err) {
          if (err) {
            console.log('error saving chaincodeid. ' + err);
          }
        })
        .catch(function(err) {
          console.log(err);
        });
      }
      res.json(response);  //return response reguardless of success or not
    },
    function(err) {
      console.log('Error sending the deploy transaction');
      return res.status(500).send('Deploy transaction failed. ' + err);
    }
  );

});

app.get('/member', function(req, res) {
  // check to see if the user is enrolled
  var result = util.checkUser(userMember1);
  if (result.err !== 0) {
    console.log(result.msg);
    return res.status(500).send(result.msg);
  }
  console.log(result.msg);
  res.send(result.msg);
});

// Add support for the Applicaion specific REST calls
// addDoc, listDoc, transferDoc, verifyDoc, and delDoc

// invoke function
function invoke(user, invokeRequest, res) {
  // check to see if the user is enrolled
  var result = util.checkUser(user);
  if (result.err !== 0) {
    console.log(result.msg);
    return res.status(500).send(result.msg);
  }
  user.sendTransactionProposal(invokeRequest)
  .then(function(results) {
    debug('received proposal results');
    console.log(results);
    var proposalResponse = results[0];
    var proposal = results[1];
    if (proposalResponse &&
      proposalResponse.response &&
      proposalResponse.response.status === 200) {
      console.log('Successfully sent Proposal and received ProposalResponse: ' +
                   'Status - %s, message - "%s", metadata - "%j", ' +
                   'endorsement signature: %s',
                   proposalResponse.response.status,
                   proposalResponse.response.message,
                   proposalResponse.response.payload,
                   proposalResponse.endorsement.signature);
      return user.sendTransaction(proposalResponse, proposal);
    } else {
      console.log('sendTransactionProposal failed');
      console.log(proposalResponse);
      throw new Error('Proposal failed and returned status ' +
                (proposalResponse.response.status ?
                  proposalResponse.response.status : 'other than 200'));
    }
  }).then(function(response) {
    return res.json(response);
  }).catch(function(err) {    // The rejections from all of the promises are handled here
    console.log(err);
    console.log('invoke failed: ' + err);
    return res.status(500).send(err.toString());
  });
}

// query
function query(user, queryRequest, res) {
  // check to see if the user is enrolled
  var result = util.checkUser(user);
  if (result.err !== 0) {
    console.log(result.msg);
    return res.status(500).send(result.msg);
  }
  user.queryByChaincode(queryRequest)
  .then(function(results) {
    if (results.result.length !== 0) {
      var params = JSON.parse(results.result);
      console.log(params);
      res.json(params);
    } else {
      console.log('Query failed');
      throw new Error('Query failed');
    }
  }).catch(function(err) {
    console.log(err);
    console.log('query failed: ' + err);
    return res.status(500).send(err.toString());
  });
}

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
    target: peer,
    chaincodeId: chaincodeID,
    fcn: 'addDoc',
    args: [hash, JSON.stringify(params)],
  };
  debug('The invoke args = ', invokeRequest.args);
  debug(invokeRequest);

  invoke(userMember1, invokeRequest, res);
});

app.get('/verifyDoc/:hash', function(req, res) {
  debug('received /verifyDoc with hash = %s', req.params.hash);
  var queryRequest = {
    target: peer,
    chaincodeId: chaincodeID,
    fcn: 'readDoc',
    args: [req.params.hash]
  };

  query(userMember1, queryRequest, res);
});

// list document
// returns a list of all of the documents
app.get('/listDoc', function(req, res) {
  debug('received /listDoc');
  var queryRequest = {
    target: peer,
    chaincodeId: chaincodeID,
    fcn: 'listDoc',
    args: []
  };

  query(userMember1, queryRequest, res);
});

// delDoc  Add a new document to the block chain

app.post('/delDoc', function(req, res) {
  debug('/delDoc request body %j', req.body);

  debug('hash equals %s', req.body.hash);
  var hash = req.body.hash;

  var invokeRequest = {
    target: peer,
    chaincodeId: chaincodeID,
    fcn: 'delDoc',
    args: [hash],
  };
  debug('The invoke args = ', invokeRequest.args);

  invoke(userMember1, invokeRequest, res);
});

// editDoc  changes the owner of the doc but may be enhanced to include other parameters
app.post('/editDoc', function(req, res) {
  debug('/editDoc request body %j', req.body);
  var hash = req.body.hash;

  var invokeRequest = {
    target: peer,
    chaincodeId: chaincodeID,
    fcn: 'transferDoc',
    args: [req.body.hash, req.body.owner],
  };
  debug('The invoke args = ', invokeRequest.args);

  invoke(userMember1, invokeRequest, res);
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
  // var blockListUpdateEvents = eventHub.registerBlockEvent(function(event) {
  if (startUpdates === true) {
    util.updateChain(chainHeight).then(function(height) {
      // debug('Block chain height is ' + height);
      var last = 0;
      if (blockList.length > 0) {
        last = blockList[blockList.length - 1].id;
      }
      // debug('The end of the block list is ' + last);
      if (height > last + 1) {
        util.buildBlockList(last + 1, height).then(function(values) {
          debug('There are additional blocks of length ' + values.length);
          Array.prototype.push.apply(blockList, values);  //adds the new blocks to the end of the block list
        }, function(response) {
          console.log(response);
        });
      }
      chainHeight = height;
      // debug('The new chain height is ' + chainHeight);
    }, function(response) {
      //console.log(response);
      console.log('Error updating the chain height ' + response.error);
    }).catch(function(err) {
      console.log('The updateChain function has failed.');
      console.log(err);
    });
  }
  // });
}, 600000);

app.get('/chain', function(req, res) {
  // debug('Display chain stats');
  restClient(restUrl + '/chain/')
  .then(function(response) {
    // debug(response.entity);
    res.json(response.entity);
  }, function(response) {
    //console.log(response);
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
    //console.log(response);
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
    //console.log(response);
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
