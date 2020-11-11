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
        sh 'tar zxvf build/artifacts/appstore/souvenir.tar.gz -C build/artifacts/appstore/'
        ftpPublisher(masterNodeName: 'master', paramPublish: [parameterName: ''], alwaysPublishFromMaster: true, continueOnError: true, failOnError: true, publishers: [[configName: 'lutze-nuage', transfers: [[asciiMode: false, cleanRemote: true, excludes: '', flatten: false, makeEmptyDirs: false, noDefaultExcludes: false, patternSeparator: '[, ]+', remoteDirectory: 'souvenir', remoteDirectorySDF: false, removePrefix: 'build/artifacts/appstore/souvenir', sourceFiles: 'build/artifacts/appstore/souvenir/**']], usePromotionTimestamp: false, useWorkspaceInPromotion: false, verbose: true]])
      }
    }

  }
}