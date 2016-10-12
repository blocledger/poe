
package main


import (
	"encoding/json"
	"fmt"
	"errors"
//	"strconv"

	"github.com/hyperledger/fabric/core/chaincode/shim"
)

type poe struct {
	Name string
	Hash string
	Version string
	Owner string
	hashType string
}


// SimpleChaincode example simple Chaincode implementation
type SimpleChaincode struct {
}

/*

func printAsHex(buf []byte, ct int) {
	for i := 0; i + 8 < ct; i += 8 {
 		fmt.Printf("0x%2.2X 0x%2.2X 0x%2.2X 0x%2.2X 0x%2.2X 0x%2.2X 0x%2.2X 0x%2.2X\n", buf[i], buf[i+1], buf[i+2], buf[i+3], buf[i+4], buf[i+5], buf[i+6], buf[i+7]);  
	}
}

*/


func (t *SimpleChaincode) Init(stub shim.ChaincodeStubInterface, function string, args []string) ([]byte, error) {
/*
	var A, B string    // Entities
	var Aval, Bval int // Asset holdings
	var err error

	if len(args) != 4 {
		return nil, errors.New("Incorrect number of arguments. Expecting 4")
	}

	// Initialize the chaincode
	A = args[0]
	Aval, err = strconv.Atoi(args[1])
	if err != nil {
		return nil, errors.New("Expecting integer value for asset holding")
	}
	B = args[2]
	Bval, err = strconv.Atoi(args[3])
	if err != nil {
		return nil, errors.New("Expecting integer value for asset holding")
	}
	fmt.Printf("Aval = %d, Bval = %d\n", Aval, Bval)

	// Write the state to the ledger
	err = stub.PutState(A, []byte(strconv.Itoa(Aval)))
	if err != nil {
		return nil, err
	}

	err = stub.PutState(B, []byte(strconv.Itoa(Bval)))
	if err != nil {
		return nil, err
	}
*/
	return nil, nil
}


func  (t *SimpleChaincode) addDoc(stub shim.ChaincodeStubInterface, key string, arg string) ([]byte, error) {
	var err error
	var proof poe

	fmt.Printf("addDoc: key = %s value = %s\n", key, arg)
	value, err := stub.GetState(key)
	if err != nil {
		jsonResp := "{\"Error\":\"Failed to get state for " + key + "\"}"
		return nil, errors.New(jsonResp)
	}
	err = json.Unmarshal([]byte(arg), &proof)
	if err != nil {
		return nil, errors.New("addDoc: Can NOT Unmarshal arg")
	}
	fmt.Println(proof)
	proof.Version = "1.0"
	proof.Hash = key;
	b, err := json.Marshal(proof)
	if err != nil {
		return nil, errors.New("addDoc: Can NOT Marshal arg")
	}
	fmt.Printf("addDoc: arg after Marshal: %s\n", b)

	// Write the state to the ledger
	err = stub.PutState(key, b)
	if err != nil {
		return nil, err
	}
	return nil, nil
}

func  (t *SimpleChaincode) transferDoc(stub shim.ChaincodeStubInterface, key string, arg string) ([]byte, error) {
	var err error
	var proof poe

	fmt.Printf("transferDoc: key = %s newowner = %s\n", key, arg)
	value, err := stub.GetState(key)
	if err != nil {
		jsonResp := "{\"Error\":\"Failed to get state for " + key + "\"}"
		return nil, errors.New(jsonResp)
	}
	err = json.Unmarshal(value, &proof)
	if err != nil {
		return nil, errors.New("addDoc: Can NOT unMarshal arg")
	}
	fmt.Println(proof)
	proof.Owner = arg
	b, err := json.Marshal(proof)
	if err != nil {
		return nil, errors.New("addDoc: Can NOT Marshal arg")
	}
	fmt.Printf("addDoc: arg after Marshal: %s\n", b)

	// Write the state to the ledger
	err = stub.PutState(key, b)
	if err != nil {
		return nil, err
	}
	return nil, nil
}

func  (t *SimpleChaincode) readDoc(stub shim.ChaincodeStubInterface, key string) ([]byte, error) {
	var err error

	fmt.Printf("readDoc: key = %s\n", key)
	value, err := stub.GetState(key)
	if err != nil {
		jsonResp := "{\"Error\":\"Failed to get state for " + key + "\"}"
		return nil, errors.New(jsonResp)
	}
	return value, nil
}

func (t *SimpleChaincode) listDoc(stub shim.ChaincodeStubInterface) ([]byte, error) {
	//  This code was copied from the map.go chaincode
	keysIter, err := stub.RangeQueryState("", "")
	if err != nil {
		return nil, fmt.Errorf("keys operation failed. Error accessing state: %s", err)
	}
	defer keysIter.Close()
	keys := map[string]string{}
	for keysIter.HasNext() {
		key, _, iterErr := keysIter.Next()
		if iterErr != nil {
			return nil, fmt.Errorf("keys operation failed. Error accessing state: %s", err)
		}
		value, err := stub.GetState(key)
		if err != nil {
			jsonResp := "{\"Error\":\"Failed to get state for " + key + "\"}"
			return nil, errors.New(jsonResp)
		}
		if value == nil {
			jsonResp := "{\"Error\":\"Nil amount for " + key + "\"}"
			return nil, errors.New(jsonResp)
		}
		keys[key] = string(value)
	}
	jsonKeys, err := json.Marshal(keys)
	if err != nil {
		return nil, fmt.Errorf("keys operation failed. Error marshaling JSON: %s", err)
	}
	fmt.Printf("Keys operation succeeded. marshaled JSON: %s", jsonKeys)
	return jsonKeys, nil
}

func (t *SimpleChaincode) delDoc(stub shim.ChaincodeStubInterface, key string) ([]byte, error) {
	fmt.Printf("delDoc: key = %s\n", key)
	err := stub.DelState(key)
	if err != nil {
		return nil, errors.New("delDoc:Failed to delete state")
	}
	return nil, nil
}


func (t *SimpleChaincode) Invoke(stub shim.ChaincodeStubInterface, function string, args []string) ([]byte, error) {
	switch  function {
	case "addDoc":
		if len(args) != 2 {
			return nil, errors.New("addDoc: Incorrect number of arguments. Expecting 2")
		}
		return t.addDoc(stub, args[0], args[1])
	case "delDoc":
		if len(args) != 1 {
			return nil, errors.New("delDoc: Incorrect number of arguments. Expecting 1")
		}
		return t.delDoc(stub, args[0])
	case "transferDoc":
		if len(args) != 2 {
			return nil, errors.New("transferDoc: Incorrect number of arguments. Expecting 2")
		}
		return t.transferDoc(stub, args[0], args[1])
	default:
		return nil, fmt.Errorf("Invalid Invoke function name: %s",function)
	}
	return nil, nil
}


// Query callback representing the query of a chaincode
func (t *SimpleChaincode) Query(stub shim.ChaincodeStubInterface, function string, args []string) ([]byte, error) {

	switch  function {
	case "listDoc":
		if len(args) != 0 {
			return nil, errors.New("listDoc: Incorrect number of arguments. Expecting 0")
		}
		return t.listDoc(stub)
	case "readDoc":
		if len(args) != 1 {
			return nil, errors.New("readDoc: Incorrect number of arguments. Expecting 1")
		}
		return t.readDoc(stub, args[0])
	default:
		return nil, fmt.Errorf("Invalid Query function name: %s",function)
	}
}


func main() {
	err := shim.Start(new(SimpleChaincode))
	if err != nil {
		fmt.Printf("Error starting Simple chaincode: %s", err)
	}
}

