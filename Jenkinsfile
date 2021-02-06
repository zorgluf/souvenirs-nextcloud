pipeline {
  agent any
  stages {
    stage('build') {
      steps {
        sh 'make'
      }
    }

    stage('package') {
      steps {
        sh 'make dist'
      }
    }

    stage('deploy') {
      steps {
        sh 'tar zxvf build/artifacts/appstore/souvenirs.tar.gz -C build/artifacts/appstore/'
        ftpPublisher(masterNodeName: 'master', paramPublish: [parameterName: ''], alwaysPublishFromMaster: true, continueOnError: true, failOnError: true, publishers: [[configName: 'souvenirs-deploy', transfers: [[asciiMode: false, cleanRemote: true, excludes: '', flatten: false, makeEmptyDirs: false, noDefaultExcludes: false, patternSeparator: '[, ]+', remoteDirectory: 'souvenirs', remoteDirectorySDF: false, removePrefix: 'build/artifacts/appstore/souvenirs', sourceFiles: 'build/artifacts/appstore/souvenirs/**']], usePromotionTimestamp: false, useWorkspaceInPromotion: false, verbose: true]])
      }
    }

  }
}
