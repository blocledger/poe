var gulp = require('gulp');
var jshint = require('gulp-jshint');
var jscs = require('gulp-jscs');
var mocha = require('gulp-mocha');

// Lint Task
gulp.task('lint', function() {
  return gulp.src(['*.js','public/js/*.js'])
  .pipe(jshint())
  .pipe(jshint.reporter('default'));
});

// jscs task
gulp.task('jscs', function() {
  return gulp.src(['*.js','public/js/*.js'])
  .pipe(jscs())
  .pipe(jscs.reporter());
});

// mocha testing
gulp.task('mocha', function() {
  return gulp.src(['test/*.js'])
  .pipe(mocha({reporter: 'spec', useColors: true}));
});

// Watch Files For Changes
gulp.task('watch', function() {
  gulp.watch(['*.js','public/js/*.js', 'test/**'], ['lint', 'jscs']);
});

// Watch Files For Changes
gulp.task('watchTest', function() {
  gulp.watch(['*.js','public/js/*.js', 'test/**'], ['lint', 'jscs', 'mocha']);
});

// Testing Task
gulp.task('test', ['lint', 'jscs', 'mocha', 'watchTest']);

// Default Task
gulp.task('default', ['lint', 'jscs', 'watch']);
