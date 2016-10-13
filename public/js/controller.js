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
var myApp = angular.module('myApp', ['ngAnimate', 'ngRoute',
                                      'ngFileUpload', 'ui.bootstrap']);

//var baseUrl = 'http://localhost:5000';
var baseUrl = '.';

myApp.controller('heightCtrl', ['$scope', '$http', '$interval',
function($scope, $http, $interval) {
  console.log('Height Controller');
  getHeight();
  var stopUpdate = $interval(function() {
    getHeight();
  }, 60000);
  function getHeight() {
    $http.get(baseUrl + '/chain').success(function(response) {
      //console.log('got chain_stats');
      $scope.height = response.height;
      $scope.chainStats = response;
    });
  }
  // Copied from the Angular documentation
  // listen on DOM destroy (removal) event, and cancel the next UI update
  // to prevent updating time after the DOM element was removed.
  $scope.$on('$destroy', function() {
    $interval.cancel(stopUpdates);
  });
}]);

myApp.controller('chainCtrl', ['$scope', '$http', '$window',
  function($scope, $http, $window) {
  console.log('Chain Controller');
  $http.get(baseUrl + '/chain').then(function(response) {
    console.log('got chain_stats');
    $scope.chainStats = response.data;
  }, function(response) {
    //$window.alert(response.data);
    $scope.showErrorAlert = true;
    $scope.alertErrorMsg = response.data;

  });
}]).directive('chainStats', function() {
  return {
    controller: 'chainCtrl',
    templateUrl: 'templates/chainStats.html'
  };
});

myApp.controller('transactionListCtrl', ['$scope', '$http',
    function($scope, $http) {
  console.log('Get the last 20 transactions');
  $scope.transactionList = [];
  $http.get(baseUrl + '/chain/transactionList/20000')
  .success(function(response) {
    $scope.transactionList = response;
  });
  $scope.popup = function(index) {
    $scope.popupTransaction = $scope.transactionList[index];
  };
}]).directive('transactionList', function() {
  return {
    controller: 'transactionListCtrl',
    templateUrl: 'templates/transactionList.html'
  };
});

myApp.controller('blockListCtrl', ['$scope', '$http', function($scope, $http) {
  console.log('Get the last 20 blocks');
  $scope.blockList = [];
  $http.get(baseUrl + '/chain/blockList/20000').success(function(response) {
    $scope.blockList = response;
  });
  $scope.popup = function(index) {
    $scope.popupBlock = $scope.blockList[index].block;
  };
}]).directive('blockList', function() {
  return {
    controller: 'blockListCtrl',
    templateUrl: 'templates/blockList.html'
  };
});

myApp.directive('transactionAlerts', function() {
  return {
    templateUrl: 'templates/transactionAlerts.html'
  };
});

myApp.directive('blockExplorer', function() {
  return {
    templateUrl: 'templates/blockExplorer.html'
  };
});

myApp.controller('poeAppCtrl', ['$scope', '$http', function($scope, $http) {
  $scope.hash = 'file hash';
  $scope.fileName = 'file name';

  $scope.hashFile = function(file) {
    var reader = new FileReader();
    console.log(file);
    if (!file) {
      $scope.hash = 'file hash';
      $scope.fileName = 'file name';
    } else {
      $scope.fileName = file.name;
      $scope.hash = 'working...';
      reader.readAsArrayBuffer(file);
      reader.onload = function(evt) {
        console.log(evt);
        // console.log(reader.readyState);
        // console.log(reader.result);
        var newHash = sha256(reader.result);
        $scope.$apply(function() {   //using the $apply will update the hash after the sha256 finishes otherwise it would wait for a mouse click
          $scope.hash = newHash;
        });
        console.log($scope.hash);
      };
    }
  };
  $scope.submit = function() {
    $scope.showAlert = false;
    $scope.alertMsg = '';
    $scope.showErrorAlert = false;
    $scope.alertErrorMsg = '';

    var params = {
      'hash': $scope.hash,
      'name': $scope.fileName,
      'owner': $scope.owner
    };
    $http.post(baseUrl + '/addDoc', params).then(function(response) {
      console.log(response);
      if (response.data) {
        console.log(response.data);
        $scope.showAlert = true;
        $scope.alertMsg = response.data;
      }
    }, function(response) {
      console.log('an error happened on the $http.post');
      console.log(response.data);
      $scope.showErrorAlert = true;
      $scope.alertErrorMsg = response.data;
    });
  };
}]).directive('poeApp', function() {
  return {
    controller: 'poeAppCtrl',
    templateUrl: 'templates/poeApp.html'
  };
});
myApp.controller('verifyDocCtrl', ['$scope', '$http', function($scope, $http) {
  $scope.hash = 'file hash';
  $scope.fileName = 'file name';

  $scope.hashFile = function(file) {
    var reader = new FileReader();
    console.log(file);
    if (!file) {
      $scope.hash = 'file hash';
      $scope.fileName = 'file name';
    } else {
      $scope.fileName = file.name;
      $scope.hash = 'working...';
      reader.readAsArrayBuffer(file);
      reader.onload = function(evt) {
        console.log(evt);
        // console.log(reader.readyState);
        // console.log(reader.result);
        var newHash = sha256(reader.result);
        $scope.$apply(function() {   //using the $apply will update the hash after the sha256 finishes otherwise it would wait for a mouse click
          $scope.hash = newHash;
        });
        console.log($scope.hash);
      };
    }
  };
  $scope.verify = function() {
    console.log('verify button pushed.');
    $scope.showAlert = false;
    $scope.alertMsg = '';
    $scope.showErrorAlert = false;
    $scope.alertErrorMsg = '';

    function verifyHash(hash) {
      var hashValid = true;
      if (!hash) {
        hashValid = false;
        console.log('no hash provided');
      } else if (hash == 'file hash') {
        hashValid = false;
      } else if (hash.length != 64) {
        hashValid = false;
      }

      if (hashValid === false) {
        console.log('Invalid hash entered.');
      }
      return hashValid;
    }
    if (verifyHash($scope.hash) === true) {
      $http.get(baseUrl + '/verifyDoc/' + $scope.hash)
      .then(function(response) {
        console.log(response);
        if (response.data) {
          $scope.showAlert = true;
          $scope.alertMsg = response.data;
        }
      }, function(response) {
        console.log('an error happened on the $http.post');
        console.log(response.data);
        $scope.showErrorAlert = true;
        $scope.alertErrorMsg = response.data;
      });
    }
  };
}]).directive('verifyDoc', function() {
  return {
    controller: 'verifyDocCtrl',
    templateUrl: 'templates/verifyDoc.html'
  };
});

myApp.controller('listDocCtrl', ['$scope', '$http', '$uibModal',
function($scope, $http, $uibModal) {
  console.log('Get the document list');
  $scope.docList = [];
  $http.get(baseUrl + '/listDoc')
  .then(function(response) {
    console.log(response);
    // convert the doc info from string to object
    for (var hash in response.data) {
      var doc = JSON.parse(response.data[hash]);
      response.data[hash] = doc;
    }
    $scope.docList = response.data;
  });

  $scope.delete = function(doc) {
    var modalInstance = $uibModal.open({
      templateUrl: 'templates/confirmModal.html',
      controller: 'confirmModalCtrl',
      size: 'sm',
    });
    modalInstance.result.then(function () {  //Do this if the user selects the OK button
      var params = {
        'hash': doc.Hash,
      };
      $http.post(baseUrl + '/delDoc', params)
      .then(function(response) {
        console.log('document %s deleted', doc.Hash);
        //  refresh the list...
        var newList = $scope.docList;
        delete newList[doc.Hash];
        $scope.doclist = newList;
      });
    }, function () {
      console.log('Modal dismissed at: ' + new Date());
    });
    // $scope.cancel = function() {
    //   console.log('cancel button pressed');
    //   $uibModalInstance.dismiss();
    // };
    // $scope.ok = function() {
    //   console.log('ok button pressed');
    //   $uibModalInstance.close();
    // };

  };
}]).directive('listDoc', function() {
  return {
    controller: 'listDocCtrl',
    templateUrl: 'templates/listDoc.html'
  };
});

myApp.controller('confirmModalCtrl',['$scope', '$uibModalInstance', function($scope, $uibModalInstance) {
  console.log('In confirmModalCtrl');
  $scope.cancel = function() {
    console.log('cancel button pressed');
    $uibModalInstance.dismiss();
  };
  $scope.ok = function() {
    console.log('ok button pressed');
    $uibModalInstance.close();
  };
}]);
