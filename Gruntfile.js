module.exports = function (grunt) {

  grunt.loadNpmTasks('grunt-mocha-test');
  grunt.loadNpmTasks('grunt-contrib-watch');

  grunt.initConfig({
    mochaTest: {
      test: {
        src: 'tests/jobs.js',
        options: {
          reporter: 'spec',
          slow: 1000,
          timeout: 3000
        }
      }
    },
    watch: {
      test: {
        files: ['jobs/*.js', 'tests/*.js'],
        tasks: ['mochaTest']
      },
    }
  });

  grunt.registerTask('default', ['mochaTest', 'watch']);



};