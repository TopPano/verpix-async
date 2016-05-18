var S3Remover = require('../lib/S3Remover');

var remover = new S3Remover();
// test for deleting an object.
var params0 = {
  Bucket: 'Your target bucket name', /* Required */
  Key: 'Your target object name' /* Requred */
};
// test for deleting multiple objects.
var params1 = {
  Bucket: 'Your target bucket name', /* Required */
  Key: [ /* Requred */
    'Your first target object name',
    'Your second target object name',
    'Your third target object name'
  ]
};

remover.on('success', function(data) {
  console.log('Success Deleting: ', data);
}).on('error', function(err) {
  console.log('Erro occuring while deleting: ', err);
});

remover.remove(params0);
remover.remove(params1);

