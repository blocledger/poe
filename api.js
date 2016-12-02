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

var grpc = require('grpc');
var insecure = grpc.credentials.createInsecure();
console.log(insecure);

var abProto = grpc.load(__dirname + '/protos/orderer/ab.proto').orderer;
var commonProto = grpc.load(__dirname + '/protos/common/common.proto').common;

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

// This is probably a temp setting to override the default key size of 384
hfc.setConfigSetting('crypto-keysize', 256);
hfc.setConfigSetting('crypto-hash-algo', 'SHA2');

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
    if (value) {
      chaincodeID = value.trim();
      debug('chaincodeID = ' + chaincodeID);
    }
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
chain.setMemberServicesUrl('http://' + cred.ca.url);

// set orderer
chain.setOrderer(grpc + cred.orderer.url);

// Build the array of peers
var peers = [];
cred.peers.forEach(function(peer) {
  var peerUrl = grpc + peer.discovery_host + ':' + peer.discovery_port;
  peers.push(hfc.getPeer(peerUrl));
});
debug(peers);
// jscs:enable requireCamelCaseOrUpperCaseIdentifiers

// The registration function is not implimented in COP or hfc.FabricCOPImpl.js
// so we will need to use admin for everything for now.
chain.enroll('admin', 'adminpw')
.then(
  function(admin) {
    chain.setRegistrar(admin);
    userMember1 = admin;
  },
  function(err) {
    console.log('ERROR: failed to register admin', err);
  }
);

/* comment out the old user registration until it is implimented by COP
// search the user list for WebAppAdmin and return the password
var credUser = cred.users.find(function(u) {
  return u.username == 'admin';
});
debug(credUser.secret);

chain.enroll('admin', credUser.secret)
.then(
  function(admin) {
    chain.setRegistrar(admin);
    return chain.getUser(user1.name);
  },
  function(err) {
    console.log('ERROR: failed to register admin', err);
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
      registrar: 'admin',
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
*/

app.use(morgan('dev'));
app.use(require('express').static(__dirname + '/public'));
app.use(bodyparser.json());

app.get('/', function(req, res) {
  debug('Display basic home page.');
  res.sendfile('./public/menu.html');
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

// provide an endpoint that will deploy the chaincode
app.get('/deploy', function(req, res) {
  // Construct the deploy request
  var deployRequest = {
    targets: peers,
    chaincodePath: chaincodePath,
    chaincodeId: 'poe_chaincode5',
    fcn: 'init',
    args: [],
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
      var proposalResponses = results[0];
      var proposal = results[1];
      var goodProposals = handleProposalResponses(proposalResponses);
      if (goodProposals == proposalResponses.length) {
        return userMember1.sendTransaction(proposalResponses, proposal);
      } else {
        console.log('%d out of %d of the Endorsing peers approved the ' +
                    'deploy proposal.',
                    goodProposals, proposalResponses.length);
        throw new Error('The endorsement policy was not met. ');
      }
    }
  ).then(
    function(response) {
      if (response.Status == 'SUCCESS') {
        console.log(response);
        chaincodeID = deployRequest.chaincodeId;
        store.setValue('chaincodeID', chaincodeID)
        .then(function(response) {
          debug('setValue response from storing chaincodeID is ' + response);
        }, function(err) {
          if (err) {
            console.log('error saving chaincodeid. ' + err);
          }
        })
        .catch(function(err) {
          console.log('error saving chaincodeid. ' + err);
        });
      }
      res.json(response);  //return response reguardless of success or not
    }
  ).catch(
    function(err) {
      console.log('Error sending the deploy transaction');
      console.log(err);
      return res.status(500).send('Deploy transaction failed. ' + err);
    }
  );
});

// This function processes the proposal responses for invokes and deployRequest
// returns the number of good proposals
function handleProposalResponses(proposalResponses) {
  var goodProposals = 0;
  proposalResponses.forEach(function(proposalResponse) {
    if (proposalResponse &&
      proposalResponse.response &&
      proposalResponse.response.status === 200) {
      goodProposals++;
      console.log('Successfully sent Proposal and received ' +
                 'ProposalResponse: Status - %s, message - "%s", ' +
                 'metadata - "%j", endorsement signature: %s',
                 proposalResponse.response.status,
                 proposalResponse.response.message,
                 proposalResponse.response.payload,
                 proposalResponse.endorsement.signature);
    } else {
      console.log('Send Proposal failed');
      debug(proposalResponse);
      if (proposalResponse instanceof Error) {
        console.log('Proposal error message: ' + proposalResponse.message);
      } else {
        console.log('Proposal failed and returned status ' +
                  (proposalResponse.response.status ?
                    proposalResponse.response.status : 'other than 200'));
      }
    }
  });
  return goodProposals;
}

/* invoke function
This function will send a transaction proposal which will return an array of
either Errors or proposal responses.  For now we will use an endorsement policy
that requires all of the proposols to return without error before sending
the transaction request.  The SDK used promise-settled to send the proposols
to all of the peers and receive the results but then it pulls the values and Errors
out of the return from settled and puts them into an array.  This function needs
to go through the array and look for any errors.  It one is found it should
throw an Error that can be caught at the end of the function and returned to
the browser.

*/
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
    var proposalResponses = results[0];
    var proposal = results[1];
    var goodProposals = handleProposalResponses(proposalResponses);
    if (goodProposals == proposalResponses.length) {
      return user.sendTransaction(proposalResponses, proposal);
    } else {
      console.log('%d out of %d of the Endorsing peers approved the ' +
                  'transaction proposal.',
                  goodProposals, proposalResponses.length);
      throw new Error('The endorsement policy was not met. ');
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
    debug(results);
    if (results) {
      var params = results.toString();
      console.log(params);
      res.json(JSON.parse(params));
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
    targets: peers,
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
    targets: peers[0],   //just query the first peer for now
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
    targets: peers[0], //just query the first peer for now
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
    targets: peers,
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
    targets: peers,
    chaincodeId: chaincodeID,
    fcn: 'transferDoc',
    args: [req.body.hash, req.body.owner],
  };
  debug('The invoke args = ', invokeRequest.args);

  invoke(userMember1, invokeRequest, res);
});

//try using the Deliver gRPC method to get the blocks....
console.log('creating abClient');
var abClient = new abProto.AtomicBroadcast('localhost:5151', insecure);
console.log('creating deliver');
var deliver = abClient.deliver();

deliver.on('data', function(response) {
  debug('received a new block');
  debug(response);
  //save the block and send the acknowledge...
  if (response && response.Type == 'Block') {
    var blockNum = response.Block.Header.Number;
    var block = util.decodeBlock(response);
    console.log(block);
    blockList.push(block);
    //Array.prototype.push.apply(blockList, response.Block);  //adds the new blocks to the end of the block list
    chainHeight = blockNum + 1;
    console.log('acknowledge block number ' + blockNum);
    deliver.write({Acknowledgement: {Number: blockNum}});
  } else {
    console.log(response.Error);
  }
});
deliver.on('error', function(err) {
  console.log(err);
});
deliver.on('end', function(response) {
  console.log(response);
});

var deliverUpdate = {Seek: {Start: 'OLDEST', WindowSize: 2}};

deliver.write(deliverUpdate);

app.get('/chain', function(req, res) {
  debug('Display chain stats');

  // //var insecure = grpc.credentials.createInsecure();
  // debug('create grpcClient');
  // var grpcClient = new apiProto.Openchain('localhost:7051', insecure);
  // debug('grpcClient created');
  // // console.log(grpcClient);
  // debug('calling getBlockchainInfo');
  // try {
  //   grpcClient.getBlockchainInfo(empty, function(err, response) {
  //     console.log('====================>  gRPC callback  <=======================');
  //     if (err) {
  //       console.log(err);
  //     }
  //     if (response) {
  //       console.log(response);
  //     }
  //   });
  // } catch (e) {
  //   console.log(e);
  // } finally {
  //   debug('finished the getBlockchainInfo grpc call');
  // }
  // //  Lets try some dummy code just to see if the grpc call is going to work
  // try {
  //   grpcClient.getBlockByNumber(4, function(err, response) {
  //     console.log('====================>  gRPC callback  <=======================');
  //     if (err) {
  //       console.log(err);
  //     }
  //     if (response) {
  //       console.log(response);
  //     }
  //   });
  // } catch (e) {
  //   console.log(e);
  // } finally {
  //   debug('finished the GetBlockByNumber grpc call');
  // }

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

app.get('/blockCount', function(req, res) {
  // debug('get blockCount ', blockList.length);
  res.send(String(blockList.length));
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
  for (var i = 0; i < len && count < req.params.id; i++) {
    var block = blockList[i];
    if (block.Data.Data.length === 0) {  // skip blocks with no transactions
      continue;
    }
    var blocks = block.Data.Data;
    for (var j = 0; j < blocks.length; j++) {
      console.log(blocks[j]);
      if (blocks[j].payload.header.chainHeader.type != 3) {
        continue;
      }
      if (blocks[j].payload.data.actions.length === 0) {
        continue;
      }

      console.log(blocks[j].payload.data.actions);
      for (var k = 0; k < blocks[j].payload.data.actions.length; k++) {
        var transaction = blocks[j].payload.data.actions[k]
                          .payload.chaincodeProposalPayload.Input;
        list.push(transaction);
        count++;
      }
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
