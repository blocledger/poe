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

//jscs:disable maximumLineLength
var decodeBlock = function(response) {
  console.log('============  Start decoding buffer =================');
  console.log(response.Block);
  var newBlock = response.Block;
  newBlock.Header.PreviousHash = response.Block.Header.PreviousHash.toString('hex');
  newBlock.Header.DataHash = response.Block.Header.DataHash.toString('hex');
  if (response.Block.Metadata) {
    console.log(response.Block.Metadata.Metadata[0].toString());
  }
  for (var i = 0; i < newBlock.Data.Data.length; i++) {
    var payload = newBlock.Data.Data[i].payload;
    console.log(payload);
    if (payload.header.chainHeader.type != 3) {
      continue;
    }
    payload.header.signatureHeader.creator = payload.header.signatureHeader.creator.toString('hex');
    payload.header.signatureHeader.nonce = payload.header.signatureHeader.nonce.toString('hex');
    var transaction = PROTOS.Transaction2.decode(payload.data);
    console.log(transaction);
    console.log(transaction.actions[0].payload.chaincodeProposalPayload);
    console.log('---------------');
    for (var j = 0; j < transaction.actions.length; j++) {
      transaction.actions[j].header.chainHeader.chainID = transaction.actions[j].header.chainHeader.chainID.toBuffer().toString('hex');
      transaction.actions[j].header.chainHeader.extension = transaction.actions[j].header.chainHeader.extension.toBuffer().toString('hex');
      transaction.actions[j].header.signatureHeader.creator = transaction.actions[j].header.signatureHeader.creator.toBuffer().toString('hex');
      transaction.actions[j].header.signatureHeader.nonce = transaction.actions[j].header.signatureHeader.nonce.toBuffer().toString('hex');
      transaction.actions[j].payload.action.proposalResponsePayload.proposalHash = transaction.actions[j].payload.action.proposalResponsePayload.proposalHash.toBuffer().toString('hex');
      transaction.actions[j].payload.action.proposalResponsePayload.extension.results = transaction.actions[j].payload.action.proposalResponsePayload.extension.results.toBuffer().toString('hex');
      transaction.actions[j].payload.action.proposalResponsePayload.extension.events = transaction.actions[j].payload.action.proposalResponsePayload.extension.events.toBuffer().toString('hex');
      for (var k = 0; k < transaction.actions[j].payload.action.endorsements.length; k++) {
        transaction.actions[j].payload.action.endorsements[k].endorser = transaction.actions[j].payload.action.endorsements[k].endorser.toBuffer().toString('base64');
        transaction.actions[j].payload.action.endorsements[k].signature = transaction.actions[j].payload.action.endorsements[k].signature.toBuffer().toString('base64');
      }
    }
    /* results encoding
    { results: '
    \u0001\u000e poe_chaincode4
    \u0001@ 7fa2dd21aa8ddda570b1e421778ed3768106572dd7b396b0eb49bcb0b9ff487e
    \t\u0001@ 7fa2dd21aa8ddda570b1e421778ed3768106572dd7b396b0eb49bcb0b9ff487e
    \u0000�\u0001 {"Name":"1098.pdf","Hash":"7fa2dd21aa8ddda570b1e421778ed3768106572dd7b396b0eb49bcb0b9ff487e","Version":"1.0","Owner":"Eric","TxID":"ba71ca67-4696-4ae3-a296-d8961a169206","Date":{"Seconds":1480280268,"Nanos":929606753}}'

    results: '
    010e 706f655f636861696e636f646534
    0140 37666132646432316161386464646135373062316534323137373865643337363831303635373264643762333936623065623439626362306239666634383765
    09 0140 37666132646432316161386464646135373062316534323137373865643337363831303635373264643762333936623065623439626362306239666634383765
    00 da01 7b224e616d65223a22313039382e706466222c2248617368223a2237666132646432316161386464646135373062316534323137373865643337363831303635373264643762333936623065623439626362306239666634383765222c2256657273696f6e223a22312e30222c224f776e6572223a2245726963222c2254784944223a2262613731636136372d343639362d346165332d613239362d643839363161313639323036222c2244617465223a7b225365636f6e6473223a313438303238303236382c224e616e6f73223a3932393630363735337d7d',
 events: '' }
    */

    console.log(transaction.actions[0].header.chainHeader);
    console.log('---------------');
    console.log(transaction.actions[0].header.chainHeader.chainID);
    console.log(transaction.actions[0].header.chainHeader.extension);
    console.log('---------------');
    console.log('---------------');
    console.log(transaction.actions[0].payload.chaincodeProposalPayload);
    console.log('---------------');
    console.log(transaction.actions[0].payload.action.proposalResponsePayload.extension);
    console.log('---------------');
    newBlock.Data.Data[i].payload.data = transaction;
  }

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
  // } else if (!user.isRegistered()) {       comment out until registration is supported
  //   errorCode = 2;
  //   errorMsg = 'User is not properly registered.';
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
