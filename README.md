## Fast Circular Dependency Plugin

Detect modules with circular dependencies when bundling with webpack.

Circular dependencies are often a necessity in complex software, the presence of a circular dependency doesn't always imply a bug, but in case you think there is a bug, this module can help find it.

**Note**: this is a drop-in replacement for `CircularDependencyPlugin` which uses a faster algorithm drastically improving performance. All options and callbacks are the same, but this plugin requires `webpack` >= 5. See below for a slightly edited original readme.

### Basic Usage

```js
// webpack.config.js
const FastCircularDependencyPlugin = require('fast-circular-dependency-plugin').default;
// or import FastCircularDependencyPlugin from 'fast-circular-dependency-plugin'

module.exports = {
  entry: "./src/index",
  plugins: [
    new FastCircularDependencyPlugin({
      // exclude detection of files based on a RegExp
      exclude: /a\.js|node_modules/,
      // include specific files based on a RegExp
      include: /dir/,
      // add errors to webpack instead of warnings
      failOnError: true,
      // allow import cycles that include an asynchronous import,
      // e.g. via import(/* webpackMode: "weak" */ './file.js')
      allowAsyncCycles: false,
      // set the current working directory for displaying module paths
      cwd: process.cwd(),
    })
  ]
}
```

### Advanced Usage

```js
// webpack.config.js
const FastCircularDependencyPlugin = require('fast-circular-dependency-plugin').default;
// or import FastCircularDependencyPlugin from 'fast-circular-dependency-plugin'

module.exports = {
  entry: "./src/index",
  plugins: [
    new FastCircularDependencyPlugin({
      // `onStart` is called before the cycle detection starts
      onStart({ compilation }) {
        console.log('start detecting webpack modules cycles');
      },
      // `onDetected` is called for each module that is cyclical
      onDetected({ module: webpackModuleRecord, paths, compilation }) {
        // `paths` will be an Array of the relative module paths that make up the cycle
        // `module` will be the module record generated by webpack that caused the cycle
        compilation.errors.push(new Error(paths.join(' -> ')))
      },
      // `onEnd` is called before the cycle detection ends
      onEnd({ compilation }) {
        console.log('end detecting webpack modules cycles');
      },
    })
  ]
}
```

If you have some number of cycles and want to fail if any new ones are
introduced, you can use the life cycle methods to count and fail when the
count is exceeded. (Note if you care about detecting a cycle being replaced by
another, this won't catch that.)

```js
// webpack.config.js
const FastCircularDependencyPlugin = require('fast-circular-dependency-plugin').default;
// or import FastCircularDependencyPlugin from 'fast-circular-dependency-plugin'

const MAX_CYCLES = 5;
let numCyclesDetected = 0;

module.exports = {
  entry: "./src/index",
  plugins: [
    new FastCircularDependencyPlugin({
      onStart({ compilation }) {
        numCyclesDetected = 0;
      },
      onDetected({ module: webpackModuleRecord, paths, compilation }) {
        numCyclesDetected++;
        compilation.warnings.push(new Error(paths.join(' -> ')))
      },
      onEnd({ compilation }) {
        if (numCyclesDetected > MAX_CYCLES) {
          compilation.errors.push(new Error(
            `Detected ${numCyclesDetected} cycles which exceeds configured limit of ${MAX_CYCLES}`
          ));
        }
      },
    })
  ]
}
```
