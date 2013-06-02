module.exports = function(grunt) {

  grunt.loadNpmTasks('grunt-simple-mocha');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-bowerful');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('assemble');
  grunt.loadNpmTasks('grunt-contrib-copy');

  grunt.initConfig({
    simplemocha:{
      dev:{
        src:"tests/test.js",
        options:{
          reporter: 'spec',
          slow: 1000,
          timeout: 3000
        }
      }
    },
    bowerful: {
      all : {
        store: 'components',
        include : ['jquery','bootstrap', 'angular', 'font-awesome'],
        dest : 'client/build',
        customtarget : {
          lodash : 'dist/lodash.min.js'
        },
        packages: {
            jquery: '',
            bootstrap: '',
            angular : ''
        },
      }
    },

    copy: {
      all: {
        files: [
          {expand: true, src: ['components/lodash/dist/lodash.min.js'], dest: 'client/js/', flatten: true},
          {expand: true, src: ['components/moment/min/moment.min.js'], dest: 'client/js/', flatten: true},
        ]
      }
    },
    concat: {
      dist: {
        src: ['client/js/*.js', 'client/controllers/*.js'],
        dest: 'client/build/script.js'
      }
    },
    watch:{
      all:{
        files:['*.js','server/*.js', 'models/*.js', 'client/*.js', 'client/controllers/*.js', 'client/js/*.js'],
        tasks:['copy', 'concat', 'simplemocha']
      },
      test:{
        files:['*.js','server/*.js', 'models/*.js'],
        tasks:['simplemocha:dev']

      }
    },
    all: { src: ['test/**/*.js'] }
  });

  grunt.registerTask('default', ['copy', 'concat', 'bowerful', 'watch:all']);
  grunt.registerTask('test', ['watch:test', 'simplemocha:dev']);



};