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
var debug = require('debug')('poe');
var ProtoBuf = require('protobufjs');

// use the hfc protos once hfc has been released for fabric 0.6
var builder = ProtoBuf.loadProtoFile(
              './node_modules/hfc/lib/protos/fabric.proto');    // Creates the Builder
// jscs:disable maximumLineLength
// var builder = ProtoBuf.loadProtoFile('C:/Users/Eric/Documents/Projects/BlockChain/go/src/github.com/hyperledger/fabric/sdk/node/lib/protos/fabric.proto');
// jscs:enable maximumLineLength
var PROTOS = builder.build('protos');                            // Returns just the 'js' namespace if that's all we need
var rest = require('rest');
var mime = require('rest/interceptor/mime');
var errorCode = require('rest/interceptor/errorCode');
var restClient = rest.wrap(mime).wrap(errorCode, {code: 400});
// var cred = require('./cred-blockchain-ma.json');
// var cred = require('./cred-local.json');
var cred = require('./cred-docker.json');
// jscs:disable requireCamelCaseOrUpperCaseIdentifiers
var restUrl = cred.peers[0].api_url;
// jscs:enable requireCamelCaseOrUpperCaseIdentifiers
var Q = require('q');

/**
* Decodes the payload into a readable ascii
*
* @param  {object} transaction a raw transaction
* @returns {object} payload decoded payload
*/
var decodePayload = function(transaction) {
  var payload;
  switch (transaction.type) {
    case 'CHAINCODE_DEPLOY':
    case 1:
      try {
        var buf = transaction.payload;
        payload = PROTOS.ChaincodeDeploymentSpec.decode64(buf);
      } catch (e) {
        if (e.decoded) { // Truncated
          console.log('payload was truncated');
          payload = e.decoded;
        } else {  // General error
          console.log('Protobuf decode failed returning orig =====> ' + e);
          payload = transaction.payload;
        }
      }
      break;
    case 'CHAINCODE_INVOKE':
    case 2:
      try {
        payload = PROTOS.ChaincodeInvocationSpec.decode64(transaction.payload);
      } catch (e) {
        if (e.decoded) { // Truncated
          console.log('payload was truncated');
          payload = e.decoded;
        } else {  // General error
          console.log('Protobuf decode failed returning orig =====> ' + e);
          payload = transaction.payload;
        }
      }
      break;
    default:
      payload = transaction.payload;

  }

  //console.log('Transacation type ' + transaction.type);
  // console.log('Payload -- ', payload);
  // if (payload && payload.chaincodeSpec) {
  //   console.log('Payload args -- ', payload.chaincodeSpec.ctorMsg.args[1].toString());
  //
  //   // console.log('Is bytebuffer  ', ByteBuffer.isByteBuffer(payload.chaincodeSpec.ctorMsg.args[0]));
  //   // var bb = ByteBuffer();
  //   // bb = payload.chaincodeSpec.ctorMsg.args[0];
  //   payload.chaincodeSpec.ctorMsg.args[0].printDebug();
  //   payload.chaincodeSpec.ctorMsg.args[1].printDebug();
  //   console.log('payload bytebuffer  ', payload.chaincodeSpec.ctorMsg.args[0].toArrayBuffer().toString());
  //   var input = payload.chaincodeSpec.ctorMsg.args;
  //   var output = [];
  //   for (var i = 0; i < input.length; i++) {
  //     console.log(input[i].toBuffer().toString());
  //     output.push(input[i].toBuffer().toString());
  //   }
  //   console.log(output);
  // }

  if (payload && payload.chaincodeSpec) {
    var input = payload.chaincodeSpec.ctorMsg.args;
    var output = [];
    for (var i = 0; i < input.length; i++) {
      output.push(input[i].toBuffer().toString());
    }
    payload.chaincodeSpec.ctorMsg.args = output;
  }
  return payload;
};

var decodeChaincodeID = function(transaction) {
  var id;
  if (!transaction.chaincodeID) {
    return 'chaincodeID not found';
  }
  try {
    id = PROTOS.ChaincodeID.decode64(transaction.chaincodeID);
  } catch (e) {
    if (e.decoded) { // Truncated
      console.log('ChaincodeID was truncated');
      id = e.decoded;
    } else {  // General error
      console.log('decodeChaincodeID: Protobuf decode failed ' + e);
      id = transaction.chaincodeID;
      console.log(id);
    }
  }
  return id;
};

var decodeType = function(transaction) {
  var Type = PROTOS.Transaction.Type;
  for (var type in Type) {
    if (Type[type] == transaction.type) {
      return type;
    }
  }
  return transaction.type;
};

var decodeBlock = function(block) {
  var newBlock = block;
  if (!block.transactions) {
    return block;
  }
  var len = block.transactions.length;
  for (var i = 0; i < len; i++) {
    newBlock.transactions[i].type = decodeType(block.transactions[i]);
    newBlock.transactions[i].chaincodeID =
      decodeChaincodeID(block.transactions[i]);
    if (newBlock.transactions[i].payload) {
      newBlock.transactions[i].payload =
        decodePayload(block.transactions[i]);
    }
  }
  return newBlock;
};

var updateChain = function(height) {
  debug('Calling the REST endpoint GET /chain/');
  return restClient(restUrl + '/chain/')
  .then(function(response) {
    debug(response.entity);
    debug('Returning height of ' + response.entity.height);
    return response.entity.height;
  }, function(response) {
    console.log(response);
    console.log('Error path: There was an error getting the chain_stats:',
                response.status.code, response.entity.Error);
  });
};

var getFormattedBlock = function(id) {
  return restClient(restUrl + '/chain/blocks/' + id)
  .then(function(response) {
    debug('getFormattedBlock: got block ' + id);
    var value = response.entity;
    value = decodeBlock(value);
    debug(value);
    return {id: id, block: value};
  });
};

var buildBlockList = function(start, end) {
  var promises = [];
  var max = 120;  //maximum number of blocks to request
  for (var i = start; i < end && i < start + max; i++) {
    promises.push(getFormattedBlock(i));
  }
  return Q.all(promises);
};

var blockListChunk = function(inputObj) {
  debug('Getting blocks from ' + inputObj.start + ' to ' + inputObj.end);
  debug('initialValues length is ' + inputObj.list.length);
  var stop = 0;
  if (inputObj.start + inputObj.chunkSize > inputObj.end) {
    stop = inputObj.end;
  } else {
    stop = inputObj.start + inputObj.chunkSize;
  }
  return buildBlockList(inputObj.start, stop)
  .then(function(values) {
    return {start: inputObj.start + inputObj.chunkSize,
            end: inputObj.end,
            chunkSize: inputObj.chunkSize,
            list: inputObj.list.concat(values)};
  });
};

var initialBlockList = function(height) {
  var values = [];
  var promises = [];
  var chunk = 100;
  for (var i = 1; i < height; i = i + chunk) {
    promises.push(blockListChunk);
  }

  var results = Q({start: 1, end: height, chunkSize: chunk, list: values});
  promises.forEach(function(p) {
    results = results.then(p);
  });
  return results.then(function(inputObj) {return inputObj.list;});
};

var calcBalance = function(transaction, result, user, oldBalance) {
  var ctorMsg = transaction.payload.chaincodeSpec.ctorMsg;
  if (result.errorCode || ctorMsg.args.indexOf(user) == -1) {  //check for an error
    return oldBalance;
  }
  switch (ctorMsg.args[0]) {
    case 'init':
      newBalance = ctorMsg.args[ctorMsg.args.indexOf(user) + 1];
      break;
    case 'new':
      newBalance = ctorMsg.args[2];
      break;
    case 'delete':
      newBalance = 0;
      break;
    case 'transfer':
      if (ctorMsg.args.indexOf(user) === 1) {
        newBalance = Number(oldBalance) - Number(ctorMsg.args[3]);
      } else {
        newBalance = Number(oldBalance) + Number(ctorMsg.args[3]);
      }
      break;
    default:
      newBalance = oldBalance;  //don't change anything if the function is unknown
  }
  return newBalance;
};

exports.decodePayload = decodePayload;
exports.decodeChaincodeID = decodeChaincodeID;
exports.decodeType = decodeType;
exports.decodeBlock = decodeBlock;
exports.updateChain = updateChain;
exports.initialBlockList = initialBlockList;
exports.buildBlockList = buildBlockList;
exports.calcBalance = calcBalance;
