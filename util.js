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
var util = require('util');

var ProtoBuf = require('protobufjs');
// needed proto files
//    chaincode.proto - chaincodeID
var builder = ProtoBuf.loadProtoFile('./protos/common/common.proto');    // Creates the Builder
ProtoBuf.loadProtoFile('./protos/peer/fabric_transaction.proto', builder);    // Add a second proto file to the Builder
ProtoBuf.loadProtoFile('./protos/peer/chaincode_proposal.proto', builder);
ProtoBuf.loadProtoFile('./protos/peer/chaincode_transaction.proto', builder);

var COMMON = builder.build('common');                            // Returns just the 'js' namespace if that's all we need
var PROTOS = builder.build('protos');
var rest = require('rest');
var mime = require('rest/interceptor/mime');
var errorCode = require('rest/interceptor/errorCode');
var restClient = rest.wrap(mime).wrap(errorCode, {code: 400});
// var cred = require('./cred-blockchain-ma.json');
var cred = require('./cred-local.json');
// var cred = require('./cred-docker.json');
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

var decodeBlockOld = function(block) {
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

//jscs:disable maximumLineLength
var decodeBlock = function(response) {
  console.log('============  Start decoding buffer =================');
  var block = response.Block.Data.Data[0];
  console.log(block);
  var newBlock = response.Block;
  newBlock.Header.PreviousHash = response.Block.Header.PreviousHash.toString('hex');
  newBlock.Header.DataHash = response.Block.Header.DataHash.toString('hex');
  var payload = newBlock.Data.Data[0].payload;
  console.log(payload);
  if (payload.header.chainHeader.type != 3) {
    return newBlock;
  }

  var transaction = PROTOS.Transaction2.decode(payload.data);
  console.log(transaction);
  console.log(transaction.actions[0].payload.chaincodeProposalPayload);

  newBlock.Data.Data[0].payload.data = transaction;

  console.log('============  Stop decoding transactions =================');
  return newBlock;
};

var decodeBlockTemp = function(response) {
  var block = COMMON.Envelope.decode(response.Block.Data.Data[0]);
  console.log(block);
  var newBlock = response.Block;
  newBlock.Data.Data[0] = block;
  console.log('============  Start decoding buffer =================');
  console.log(response.Block.Header.PreviousHash);
  console.log('PreviousHash is a Buffer: ' + Buffer.isBuffer(response.Block.Header.PreviousHash));
  newBlock.Header.PreviousHash = response.Block.Header.PreviousHash.toString('hex');
  newBlock.Header.DataHash = response.Block.Header.DataHash.toString('hex');
  console.log(newBlock.Header.PreviousHash);
  console.log('=============  Data  =============');
  console.log(newBlock.Data.Data);
  var payload = COMMON.Payload.decode(newBlock.Data.Data[0].payload);
  console.log(payload);
  newBlock.Data.Data[0].payload = payload;
  //  skip decoding the rest if it is a configuration transaction
  if (payload.header.chainHeader.type != 3) {
    return newBlock;
  }
  newBlock.Data.Data[0].payload.header.chainHeader.chainID = payload.header.chainHeader.chainID.toBuffer().toString();
  console.log(newBlock.Data.Data[0].payload.header.chainHeader);
  console.log('--------');
  console.log(payload.data.toBuffer());
  console.log('============  Stop decoding buffer =================');
  var transaction = PROTOS.Transaction2.decode(payload.data);
  console.log(transaction);
  console.log(transaction.actions[0].header.toBuffer());
  console.log(transaction.actions[0].payload.toBuffer());
  transaction.actions[0].payload = PROTOS.ChaincodeActionPayload.decode(transaction.actions[0].payload);
  console.log(transaction.actions[0].payload);
  console.log(transaction.actions[0].payload.chaincodeProposalPayload.toBuffer());
  transaction.actions[0].payload.chaincodeProposalPayload = PROTOS.ChaincodeProposalPayload.decode(transaction.actions[0].payload.chaincodeProposalPayload);
  transaction.actions[0].payload.chaincodeProposalPayload.Input = PROTOS.ChaincodeInvocationSpec.decode(transaction.actions[0].payload.chaincodeProposalPayload.Input);
  console.log(transaction.actions[0].payload.chaincodeProposalPayload.Input.chaincodeSpec);
  var args = transaction.actions[0].payload.chaincodeProposalPayload.Input.chaincodeSpec.ctorMsg.args;
  for (var i = 0; i < args.length; i++) {
    args[i] = args[i].toBuffer().toString();
  }
  transaction.actions[0].payload.chaincodeProposalPayload.Input.chaincodeSpec.ctorMsg.args = args;

  newBlock.Data.Data[0].payload.data = transaction;
  console.log('============  Stop decoding transactions =================');
  return newBlock;
};
//jscs:enable maximumLineLength

var updateChain = function(height) {
  // debug('Calling the REST endpoint GET /chain/');
  return restClient(restUrl + '/chain/')
  .then(function(response) {
    // debug(response.entity);
    // debug('Returning height of ' + response.entity.height);
    return response.entity.height;
  }, function(response) {
    //console.log(response);
    if (response && response.error) {
      console.log('Error: failed getting the chain_stats for updateChain: ' +
                  response.error);
    }
  });
};

var getFormattedBlock = function(id) {
  return restClient(restUrl + '/chain/blocks/' + id)
  .then(function(response) {
    debug('getFormattedBlock: got block ' + id);
    var value = response.entity;
    value = decodeBlock(value);
    // debug(value);
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

var checkUser = function(user) {
  var errorCode = 10;
  var errorMsg = 'msg not set yet';
  if (!user) {
    errorCode = 1;
    errorMsg = 'User does not exist.';
  } else if (!user.isRegistered()) {
    errorCode = 2;
    errorMsg = 'User is not properly registered.';
  } else if (!user.isEnrolled()) {
    errorCode = 3;
    errorMsg = 'User is not properly enrolled.';
  } else {
    errorCode = 0;
    errorMsg = util.format('User %s is registered and enrolled.',
                            user.getName());
  }
  return {err: errorCode, msg: errorMsg};
};

exports.decodePayload = decodePayload;
exports.decodeChaincodeID = decodeChaincodeID;
exports.decodeType = decodeType;
exports.decodeBlock = decodeBlock;
exports.updateChain = updateChain;
exports.initialBlockList = initialBlockList;
exports.buildBlockList = buildBlockList;
exports.calcBalance = calcBalance;
exports.checkUser = checkUser;
