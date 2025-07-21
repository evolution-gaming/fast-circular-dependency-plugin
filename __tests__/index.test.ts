import path from 'path';
import MemoryFS from 'memory-fs';
import webpack, { OutputFileSystem, WebpackError } from 'webpack';
import FastCircularDependencyPlugin from '../index.ts';

function wrapRun(run: typeof webpack.Compiler.prototype.run): () => Promise<webpack.StatsCompilation> {
    return () => new Promise((resolve, reject) => {
        run((err, result) => {
            if (err) {
                return reject(err);
            }

            return resolve(result!.toJson());
        });
    });
}

const getWarningMessage = (stats: webpack.StatsCompilation) => getStatsMessage(stats, 'warnings');

const getErrorsMessage = (stats: webpack.StatsCompilation) => getStatsMessage(stats, 'errors');

const getStatsMessage = (stats: webpack.StatsCompilation, type: 'errors' | 'warnings') => stats[type]?.[0]?.message || null;

describe('circular dependency', () => {
    it('detects circular dependencies from a -> b -> c -> b', async () => {
        const fs = new MemoryFS();
        const compiler = webpack({
            mode: 'development',
            entry: path.join(__dirname, 'deps/a.js'),
            output: { path: __dirname },
            plugins: [new FastCircularDependencyPlugin()],
        });
        compiler.outputFileSystem = fs as unknown as OutputFileSystem;

        const runAsync = wrapRun(compiler.run.bind(compiler));
        const stats = await runAsync();

        const msg = getWarningMessage(stats);
        expect(msg).toContain('__tests__/deps/b.js -> __tests__/deps/c.js -> __tests__/deps/b.js');
    });

    it('detects circular dependencies from d -> e -> f -> g -> e', async () => {
        const fs = new MemoryFS();
        const compiler = webpack({
            mode: 'development',
            entry: path.join(__dirname, 'deps/d.js'),
            output: { path: __dirname },
            plugins: [new FastCircularDependencyPlugin()],
        });
        compiler.outputFileSystem = fs as unknown as OutputFileSystem;

        const runAsync = wrapRun(compiler.run.bind(compiler));
        const stats = await runAsync();

        const msg = getWarningMessage(stats);
        expect(msg).toContain('__tests__/deps/e.js -> __tests__/deps/f.js -> __tests__/deps/g.js -> __tests__/deps/e.js');
    });

    it('uses errors instead of warnings with failOnError', async () => {
        const fs = new MemoryFS();
        const compiler = webpack({
            mode: 'development',
            entry: path.join(__dirname, 'deps/d.js'),
            output: { path: __dirname },
            plugins: [new FastCircularDependencyPlugin({
                failOnError: true,
            })],
        });
        compiler.outputFileSystem = fs as unknown as OutputFileSystem;

        const runAsync = wrapRun(compiler.run.bind(compiler));
        const stats = await runAsync();

        const msg = getErrorsMessage(stats);
        expect(msg).toContain('__tests__/deps/e.js -> __tests__/deps/f.js -> __tests__/deps/g.js -> __tests__/deps/e.js');
    });

    it('includes all cyclical deps in the output even if some are excluded', async () => {
        const fs = new MemoryFS();
        const compiler = webpack({
            mode: 'development',
            entry: path.join(__dirname, 'deps/d.js'),
            output: { path: __dirname },
            plugins: [
                new FastCircularDependencyPlugin({
                    exclude: /f\.js/,
                }),
            ],
        });
        compiler.outputFileSystem = fs as unknown as OutputFileSystem;

        const runAsync = wrapRun(compiler.run.bind(compiler));
        const stats = await runAsync();

        const msg = getWarningMessage(stats);
        expect(msg).toContain('__tests__/deps/e.js -> __tests__/deps/f.js -> __tests__/deps/g.js -> __tests__/deps/e.js');
    });

    it('does not report errors for cycles where all files are excluded', async () => {
        const fs = new MemoryFS();
        const compiler = webpack({
            mode: 'development',
            entry: path.join(__dirname, 'deps/d.js'),
            output: { path: __dirname },
            plugins: [
                new FastCircularDependencyPlugin({
                    exclude: /(e|f|g)\.js/,
                }),
            ],
        });
        compiler.outputFileSystem = fs as unknown as OutputFileSystem;

        const runAsync = wrapRun(compiler.run.bind(compiler));
        const stats = await runAsync();
        const msg = getWarningMessage(stats);
        expect(msg).toEqual(null);
    });

    it('can handle context modules that have an undefined resource h -> i -> a -> i', async () => {
        const fs = new MemoryFS();
        const compiler = webpack({
            mode: 'development',
            entry: path.join(__dirname, 'deps/h.js'),
            output: { path: __dirname },
            plugins: [
                new FastCircularDependencyPlugin(),
            ],
        });
        compiler.outputFileSystem = fs as unknown as OutputFileSystem;

        const runAsync = wrapRun(compiler.run.bind(compiler));
        const stats = await runAsync();
        expect(stats.warnings!.length).toEqual(0);
        expect(stats.errors!.length).toEqual(0);
    });

    it('allows hooking into detection cycle', async () => {
        const fs = new MemoryFS();
        const compiler = webpack({
            mode: 'development',
            entry: path.join(__dirname, 'deps/nocycle.js'),
            output: { path: __dirname },
            plugins: [
                new FastCircularDependencyPlugin({
                    onStart({ compilation }) {
                        compilation.warnings.push(new WebpackError('started'));
                    },
                    onEnd({ compilation }) {
                        compilation.errors.push(new WebpackError('ended'));
                    },
                }),
            ],
        });
        compiler.outputFileSystem = fs as unknown as OutputFileSystem;

        const runAsync = wrapRun(compiler.run.bind(compiler));
        const stats = await runAsync();

        expect(stats.warnings![0].message).toEqual('started');
        expect(stats.errors![0].message).toEqual('ended');
    });

    it('allows overriding all behavior with onDetected', async () => {
        let cyclesPaths;
        const fs = new MemoryFS();
        const compiler = webpack({
            mode: 'development',
            entry: path.join(__dirname, 'deps/d.js'),
            output: { path: __dirname },
            plugins: [
                new FastCircularDependencyPlugin({
                    onDetected({ paths }) {
                        cyclesPaths = paths;
                        throw new Error('No cycles allowed!');
                    },
                }),
            ],
        });
        compiler.outputFileSystem = fs as unknown as OutputFileSystem;

        const runAsync = wrapRun(compiler.run.bind(compiler));
        const stats = await runAsync();
        expect(cyclesPaths).toEqual([
            '__tests__/deps/e.js',
            '__tests__/deps/f.js',
            '__tests__/deps/g.js',
            '__tests__/deps/e.js',
        ]);
        const msg = getErrorsMessage(stats);
        expect(msg).toContain('No cycles allowed!');
    });

    it('detects circular dependencies from d -> e -> f -> g -> e', async () => {
        const fs = new MemoryFS();
        const compiler = webpack({
            mode: 'development',
            entry: path.join(__dirname, 'deps/d.js'),
            output: { path: __dirname },
            plugins: [
                new FastCircularDependencyPlugin({
                    onDetected({ paths, compilation }) {
                        compilation.warnings.push(new WebpackError(paths.join(' -> ')));
                    },
                }),
            ],
        });
        compiler.outputFileSystem = fs as unknown as OutputFileSystem;

        const runAsync = wrapRun(compiler.run.bind(compiler));
        const stats = await runAsync();

        const msg0 = getWarningMessage(stats);
        expect(msg0).toContain('__tests__/deps/e.js -> __tests__/deps/f.js -> __tests__/deps/g.js -> __tests__/deps/e.js');
    });

    it('can detect circular dependencies when the ModuleConcatenationPlugin is used', async () => {
        const fs = new MemoryFS();
        const compiler = webpack({
            mode: 'development',
            entry: path.join(__dirname, 'deps/module-concat-plugin-compat/index.js'),
            output: { path: __dirname },
            plugins: [
                new webpack.optimize.ModuleConcatenationPlugin(),
                new FastCircularDependencyPlugin(),
            ],
        });
        compiler.outputFileSystem = fs as unknown as OutputFileSystem;

        const runAsync = wrapRun(compiler.run.bind(compiler));
        const stats = await runAsync();

        const msg0 = getWarningMessage(stats);
        expect(msg0).toContain('__tests__/deps/module-concat-plugin-compat/a.js -> __tests__/deps/module-concat-plugin-compat/b.js -> __tests__/deps/module-concat-plugin-compat/a.js');
    });

    describe('ignores self referencing webpack internal dependencies', () => {
        it('ignores this references', async () => {
            const fs = new MemoryFS();
            const compiler = webpack({
                mode: 'development',
                entry: path.join(__dirname, 'deps', 'self-referencing', 'uses-this.js'),
                output: { path: __dirname },
                plugins: [new FastCircularDependencyPlugin()],
            });
            compiler.outputFileSystem = fs as unknown as OutputFileSystem;

            const runAsync = wrapRun(compiler.run.bind(compiler));
            const stats = await runAsync();

            expect(stats.errors!.length).toEqual(0);
            expect(stats.warnings!.length).toEqual(0);
        });

        it('ignores module.exports references', async () => {
            const fs = new MemoryFS();
            const compiler = webpack({
                mode: 'development',
                entry: path.join(__dirname, 'deps', 'self-referencing', 'uses-exports.js'),
                output: { path: __dirname },
                plugins: [new FastCircularDependencyPlugin()],
            });
            compiler.outputFileSystem = fs as unknown as OutputFileSystem;

            const runAsync = wrapRun(compiler.run.bind(compiler));
            const stats = await runAsync();

            expect(stats.errors!.length).toEqual(0);
            expect(stats.warnings!.length).toEqual(0);
        });

        it('ignores self references', async () => {
            const fs = new MemoryFS();
            const compiler = webpack({
                mode: 'development',
                entry: path.join(__dirname, 'deps', 'self-referencing', 'imports-self.js'),
                output: { path: __dirname },
                plugins: [new FastCircularDependencyPlugin()],
            });
            compiler.outputFileSystem = fs as unknown as OutputFileSystem;

            const runAsync = wrapRun(compiler.run.bind(compiler));
            const stats = await runAsync();

            expect(stats.warnings!.length).toEqual(0);
            expect(stats.errors!.length).toEqual(0);
        });

        it('works with typescript', async () => {
            const fs = new MemoryFS();
            const compiler = webpack({
                mode: 'development',
                entry: path.join(__dirname, 'deps', 'ts', 'a.tsx'),
                output: { path: __dirname },
                module: {
                    rules: [
                        {
                            test: /\.tsx?$/,
                            use: [{
                                loader: 'ts-loader',
                                options: {
                                    configFile: path.resolve(path.join(__dirname, 'deps', 'ts', 'tsconfig.json')),
                                },
                            }],
                            exclude: /node_modules/,
                        },
                    ],
                },
                plugins: [new FastCircularDependencyPlugin()],
            });
            compiler.outputFileSystem = fs as unknown as OutputFileSystem;

            const runAsync = wrapRun(compiler.run.bind(compiler));
            const stats = await runAsync();

            expect(stats.errors!.length).toEqual(0);
            expect(stats.warnings!.length).toEqual(0);
        });
    });
});
