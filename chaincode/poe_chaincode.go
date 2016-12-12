
package main


import (
	"encoding/json"
	"fmt"
	"errors"
	"strings"
	"github.com/hyperledger/fabric/core/chaincode/shim"
//	"github.com/op/go-logging"
)

type Time struct {
	Seconds int64
	Nanos	int32
}


type poe struct {
	Name string
	Hash string
	Version string
	Owner string
	hashType string
	TxID string
	Date Time
}

var chaincodeLogger = shim.NewLogger("poe")

// SimpleChaincode example simple Chaincode implementation
type SimpleChaincode struct {
}


func printAsHex(buf []byte, ct int) {
	for i := 0; i + 8 < ct; i += 8 {
 		poeLogger(debugLevel, "0x%2.2X 0x%2.2X 0x%2.2X 0x%2.2X 0x%2.2X 0x%2.2X 0x%2.2X 0x%2.2X\n", buf[i], buf[i+1], buf[i+2], buf[i+3], buf[i+4], buf[i+5], buf[i+6], buf[i+7]);  
	}
}


const criticalLevel = 0x01
const criticalMask = criticalLevel
const errorLevel = 0x02
const errorMask = criticalMask | errorLevel
const warningLevel = 0x04
const warningMask = errorMask | warningLevel
const noticeLevel = 0x08
const noticeMask = warningMask | noticeLevel
const infoLevel = 0x10
const infoMask = noticeMask | infoLevel
const debugLevel = 0x20
const debugMask = infoMask | debugLevel

var loglevelMask = errorMask

func poeLogger(level int, format string, args ...interface{}) {
    	switch level & loglevelMask {
	case criticalLevel:
	  chaincodeLogger.Criticalf(format, args...)
	case errorLevel:
	  chaincodeLogger.Errorf(format, args...)
	case warningLevel:
	  chaincodeLogger.Warningf(format, args...)
	case noticeLevel:
	  chaincodeLogger.Noticef(format, args...)
	case infoLevel:
	  chaincodeLogger.Infof(format, args...)
	case debugLevel:
	  chaincodeLogger.Debugf(format, args...)
	}
}


func poeDebugLogger(format string, args ...interface{}) {
	poeLogger(debugLevel, format, args ...)
}



// args[0] == SETLOGLEVEL
// args[1] == [ CRITICAL, ERROR, WARNING, NOTICE, INFO, DEBUG]


func poeSetLogLevel(arg string) {
	level := shim.LogError
	mask := errorMask
	switch  strings.ToUpper(arg) {
	case "CRITICAL":
	  level = shim.LogCritical
	  mask = criticalMask
	case "ERROR": 
	  level = shim.LogError
	  mask = errorMask
	case "WARNING": 
	  level = shim.LogWarning
	  mask = warningMask
	case "NOTICE": 
	  level = shim.LogNotice
	  mask = noticeMask
	case "INFO": 
	  level = shim.LogInfo
	  mask = infoMask
	case "DEBUG":
	  level = shim.LogDebug
	  mask = debugMask
	default:
	  chaincodeLogger.Errorf("Can NOT set chaincode logger to  level= %s setting to %s instead\n", arg, "ERROR")
	}
	chaincodeLogger.SetLevel(level)
	shim.SetLoggingLevel(level)
	loglevelMask = mask
}


func (t *SimpleChaincode) Init(stub shim.ChaincodeStubInterface) ([]byte, error) {
	_ , args := stub.GetFunctionAndParameters()
	if len(args) >= 2 && strings.ToUpper(args[0]) == "SETLOGLEVEL" {
		poeSetLogLevel(args[1])
	}
	return nil, nil
}


func  (t *SimpleChaincode) addDoc(stub shim.ChaincodeStubInterface, key string, arg string) ([]byte, error) {
	var err error
	var proof poe
	
	poeLogger(errorLevel, "addDoc: level = 0x%X mask = 0x%X", errorLevel, loglevelMask)
	value , err := stub.GetState(key)
	if value != nil {
		jsonResp := "{\"Error\":\"File already exists for key: " + key + "\"}"
		poeLogger(errorLevel, "Error: File already exists for key: %s", key)
		return nil, errors.New(jsonResp)
	}
	err = json.Unmarshal([]byte(arg), &proof)
	if err != nil {
		poeLogger(errorLevel, "addDoc: Can NOT Unmarshal arg")
		return nil, errors.New("addDoc: Can NOT Unmarshal arg")
	}
	proof.Version = "1.0"
	proof.Hash = key;
	proof.TxID = stub.GetTxID()
	time , err := stub.GetTxTimestamp()
	if err != nil {
		poeLogger(errorLevel, "addDoc: Can NOT GetTxTimestamp")
		return nil, errors.New("addDoc: Can NOT GetTxTimestamp")
	}
	proof.Date.Seconds = time.Seconds
	proof.Date.Nanos = time.Nanos
	b, err := json.Marshal(proof)
	if err != nil {
		poeLogger(errorLevel, "addDoc: Can NOT Marshal arg")
		return nil, errors.New("addDoc: Can NOT Marshal arg")
	}
	poeLogger(debugLevel, "addDoc: level = 0x%X mask = 0x%X", debugLevel, loglevelMask)

	// Write the state to the ledger
	err = stub.PutState(key, b)
	if err != nil {
		poeLogger(errorLevel, "%s", err)
		return nil, err
	}
	return nil, nil
}

func  (t *SimpleChaincode) transferDoc(stub shim.ChaincodeStubInterface, key string, arg string) ([]byte, error) {
	var err error
	var proof poe

	poeLogger(debugLevel, "transferDoc: key = %s newowner = %s\n", key, arg)
	value, err := stub.GetState(key)
	if err != nil {
		jsonResp := "{\"Error\":\"Failed to get state for " + key + "\"}"
		poeLogger(errorLevel, "Error: Failed to get state for key: %s", key)
		return nil, errors.New(jsonResp)
	}
	err = json.Unmarshal(value, &proof)
	if err != nil {
		poeLogger(errorLevel, "addDoc: Can NOT unMarshal arg")
		return nil, errors.New("addDoc: Can NOT unMarshal arg")
	}
	proof.Owner = arg
	b, err := json.Marshal(proof)
	if err != nil {
		poeLogger(errorLevel, "addDoc: Can NOT Marshal arg")
		return nil, errors.New("addDoc: Can NOT Marshal arg")
	}
	chaincodeLogger.Debugf("addDoc: arg after Marshal: %s\n", b)

	// Write the state to the ledger
	err = stub.PutState(key, b)
	if err != nil {
		poeLogger(errorLevel, "%s", err)
		return nil, err
	}
	return nil, nil
}

func  (t *SimpleChaincode) readDoc(stub shim.ChaincodeStubInterface, key string) ([]byte, error) {
	var err error

	poeLogger(errorLevel, "readDoc: key = %s\n", key)
	value, err := stub.GetState(key)
	if err != nil {
		jsonResp := "{\"Error\":\"Failed to get state for " + key + "\"}"
		poeLogger(errorLevel, "Error: Failed to get state for key: %s", key)
		return nil, errors.New(jsonResp)
	}
	return value, nil
}

func (t *SimpleChaincode) listDoc(stub shim.ChaincodeStubInterface) ([]byte, error) {
	//  This code was copied from the map.go chaincode
	keysIter, err := stub.RangeQueryState("", "")
	if err != nil {
		poeLogger(errorLevel, "keys operation failed. Error accessing state: %s", err)
		return nil, fmt.Errorf("keys operation failed. Error accessing state: %s", err)
	}
	defer keysIter.Close()
	keys := map[string]string{}
	for keysIter.HasNext() {
		key, _, iterErr := keysIter.Next()
		if iterErr != nil {
			poeLogger(errorLevel, "keys operation failed. Error accessing state: %s", err)
			return nil, fmt.Errorf("keys operation failed. Error accessing state: %s", err)
		}
		value, err := stub.GetState(key)
		if err != nil {
			jsonResp := "{\"Error\":\"Failed to get state for " + key + "\"}"
			poeLogger(errorLevel, "Error: Failed to get state for key: %s", key)
			return nil, errors.New(jsonResp)
		}
		if value == nil {
			jsonResp := "{\"Error\":\"Nil amount for " + key + "\"}"
			poeLogger(errorLevel, "Error: Nil value for key: %s", key)
			return nil, errors.New(jsonResp)
		}
		keys[key] = string(value)
	}
	jsonKeys, err := json.Marshal(keys)
	if err != nil {
		poeLogger(errorLevel, "keys operation failed. Error marshaling JSON: %s", err)
		return nil, fmt.Errorf("keys operation failed. Error marshaling JSON: %s", err)
	}
	return jsonKeys, nil
}

func (t *SimpleChaincode) delDoc(stub shim.ChaincodeStubInterface, key string) ([]byte, error) {
	poeLogger(debugLevel, "delDoc: key = %s\n", key)
	err := stub.DelState(key)
	if err != nil {
		poeLogger(errorLevel, "delDoc:Failed to delete state")
		return nil, errors.New("delDoc:Failed to delete state")
	}
	return nil, nil
}

func (t *SimpleChaincode) Invoke(stub shim.ChaincodeStubInterface) ([]byte, error) {
	function, args := stub.GetFunctionAndParameters()
	switch  function {
	case "setLogLevel":
		if len(args) != 1 {
			poeLogger(errorLevel, "addDoc: Incorrect number of arguments for function: %s  Expecting 1", function)
			return nil, errors.New("addDoc: Incorrect number of arguments. Expecting 1")
		}
		poeSetLogLevel(args[0])
		return nil, nil
	case "addDoc":
		if len(args) != 2 {
			poeLogger(errorLevel, "addDoc: Incorrect number of arguments for function: %s  Expecting 2", function)
			return nil, errors.New("addDoc: Incorrect number of arguments. Expecting 2")
		}
		return t.addDoc(stub, args[0], args[1])
	case "delDoc":
		if len(args) != 1 {
			poeLogger(errorLevel, "delDoc: Incorrect number of arguments for function: %s  Expecting 1", function)
			return nil, errors.New("delDoc: Incorrect number of arguments. Expecting 1")
		}
		return t.delDoc(stub, args[0])
	case "transferDoc":
		if len(args) != 2 {
			poeLogger(errorLevel, "transferDoc: Incorrect number of arguments for function: %s  Expecting 2", function)
			return nil, errors.New("transferDoc: Incorrect number of arguments. Expecting 2")
		}
		return t.transferDoc(stub, args[0], args[1])
	case "listDoc":
		if len(args) != 0 {
			poeLogger(errorLevel, "listDoc: Incorrect number of arguments for function: %s  Expecting 0", function)
			return nil, errors.New("listDoc: Incorrect number of arguments. Expecting 0")
		}
		return t.listDoc(stub)
	case "readDoc":
		if len(args) != 1 {
			poeLogger(errorLevel, "readDoc: Incorrect number of arguments for function: %s  Expecting 1", function)
			return nil, errors.New("readDoc: Incorrect number of arguments. Expecting 1")
		}
		return t.readDoc(stub, args[0])
	default:
		poeLogger(errorLevel, "Invalid Invoke function name: %s",function)
		return nil, fmt.Errorf("Invalid Invoke function name: %s",function)
	}
	return nil, nil
}


// Query callback representing the query of a chaincode
func (t *SimpleChaincode) Query(stub shim.ChaincodeStubInterface) ([]byte, error) {
	function, args := stub.GetFunctionAndParameters()

	switch  function {
	case "listDoc":
		if len(args) != 0 {
			poeLogger(errorLevel, "listDoc: Incorrect number of arguments for function: %s  Expecting 0", function)
			return nil, errors.New("listDoc: Incorrect number of arguments. Expecting 0")
		}
		return t.listDoc(stub)
	case "readDoc":
		if len(args) != 1 {
			poeLogger(errorLevel, "readDoc: Incorrect number of arguments for function: %s  Expecting 1", function)
			return nil, errors.New("readDoc: Incorrect number of arguments. Expecting 1")
		}
		return t.readDoc(stub, args[0])
	default:
		poeLogger(errorLevel, "Invalid Query function name: %s",function)
		return nil, fmt.Errorf("Invalid Query function name: %s",function)
	}
}


func main() {
	err := shim.Start(new(SimpleChaincode))
	if err != nil {
		fmt.Printf("Error starting Simple chaincode: %s", err)
	}
}

