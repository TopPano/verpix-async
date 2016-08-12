node ('master') {
   stage 'Checkout'
   echo 'Checkout'
   // Get some code from a GitHub repository
   git url: 'git@github.com:uniray7/verpix-async.git', credentialsId:'verpix-async-cred'

   stage 'Build'
   echo 'Build'
   docker.withServer('tcp://dockerd:4243') {
      def img = docker.build("verpix-async")
   }

   stage 'Unittest'
   echo 'Unittest'

   docker.withServer('tcp://dockerd:4243') {
//      def img = sh "docker run laputa-api npm test"
   }
}

