# Proof of Existence App V1.0 (in development)

This project demonstrates using the Hyperledger blockchain to store
a document hash so that its existence can be later proved through
transaction queries.

This branch of the project is targeted toward the 1.0 version of
Hyperledger Fabric which is still under active development.  As
such not all of the capabilites are available or working.


## Installation
Install the latest Node.js version 6.x.x from https://nodejs.org/en/.

To install the poe source and required packages
```
git clone https://github.com/blocledger/poe.git

npm install -g gulp
npm install -g mocha
npm install

npm install -g bower
bower install
```

Install both the Hyperledger fabric and fabric-sdk-node repositories from
https://gerrit.hyperledger.org/

## Setting up a test blockchain


### Vagrant local blockchain
Follow the instructions from the Hyperledger Fabric project to
install Vagrant and the fabric source before continuing.  

In a windows git-bash console, checkout the specified version of fabric and go to the devenv directory.
```
cd $GOPATH/src/github.com/hyperledger/fabric/
git checkout -b sprint5 af5285a4b466de0453790915c4cdce05d4050c1e
cd $GOPATH/src/github.com/hyperledger/fabric/devenv/
```
Make the changes specified in the fabric-sdk-node README to the `Vagrantfile` file.  Namely add the following lines.
```
config.vm.network :forwarded_port, guest: 5151, host: 5151 # orderer service
config.vm.network :forwarded_port, guest: 7056, host: 7056 # Openchain gRPC services
config.vm.network :forwarded_port, guest: 7058, host: 7058 # GRPCCient gRPC services
```
Now build the vagrant environment which can take some time.

`vagrant up`

Once this completes login to the vagrant image.

`vagrant ssh`

Build the images for the Fabric's peers.
```
cd /hyperledger
make images
```
> **Note:** If this is not a fresh install you may need to run
  `make clean` before running `make images`.  Additionally,
  if the fabric source has been updated recently it may be
  necessary to remove all of the old docker containers and images
  before doing the `make images`.

### SDK setup
In a second console window checkout the specified version of
fabric-sdk-node and install the required packages.
```
git checkout -b sprint5 bb46f2c7adf2f2823d1a43f86af5442da1cf2fe9
npm install
```
The SDK(hfc) needs to be installed in the poe application from the
fabric-sdk-node source directory instead of installing hfc from
npm repository.  In the poe source directory use the following
command with correct path for your setup.

`npm install (path to the fabric-sdk-node directory)`


In the console window that is logged into vagrant create a
`docker-compose.yml` file in the home directory with the contents
from the `test/fixtures/docker-compose.yml` file from
fabric-sdk-node.

## Starting fabric and the application

While logged into vagrant, create and start the containers.

`docker-compose up --force-recreate`

Now start the node server from the directory the
poe application is installed in.

`node api.js`

At this point you can connect from a browser using http://localhost:3000.

## Restarting fabric
Use a ctrl-c to stop the containers running in the vagrant
window.  Then to restart the previous containers and maintain
the state of the blockchain use

`docker-compose up`

To rebuild the containers and start the blockchain from scratch use

`docker-compose up --force-recreate`

> **Note:** If you rebuild the blockchain containers then the poe
  application's KeyValueStore directory will need to be deleted
  before it is started.

> `rm -rf (path to poe source)/tmp/* `

## Deploying chaincode with the SDK
In order for SDK to deploy chaincode it must be in a directory by itself
under $GOPATH/src/github.com/.  Set the chaincode path in the
application to match this directory and run the deploy.

```
cd $GOPATH/src/github.com/
mkdir chaincode
cd chaincode
cp (path to poe source)/poe/chaincode/poe_chaincode.go .
```

To invoke the deploy from your browser go to URL http://localhost:3000/deploy


## Testing
To run both the linter and code style checker run `gulp` with no
parameters.

To run testing that will generate transactions and exercise all of
the server capabilities run `gulp test`.

## Debugging
Turn additional debug prints and/or GRPC tracing with
```
DEBUG='poe' node api.js
  or
DEBUG='poe' GRPC_TRACE=all node api.js
```

## Docker Commands

To check that the containers are running
```
docker ps
```
To see what version peer you are running
```
docker exec -it hyperledger2_vp0_1 bash
peer --version
exit
```
To display the container's log
```
docker logs --tail 30 hyperledger2_vp0_1
```
To stop containers
```
docker stop hyperledger2_vp0_1
```
To start the containers
```
docker start hyperledger2_vp0_1
```

## Acknowledgement
This project was based on examples and documentation found in the Hyperledger
 [fabric](https://github.com/hyperledger/fabric) project.


##### Markdown formatting examples
 1.  You can put stars on both ends of a word to make it *italics* or
 2.  Two stars to make it **bold**
 3.  Create links to headers with the document like [this](#Setting-up-testing-blockchain)
 4.  Do bullets by putting a star in front of the sentence
*  bullet 1
*  bullet 2


*  bullets outside of the numbered list
*  second bullet
  * tabbed bullet
