import path from 'path';
import {
    type Compiler, type Compilation, type NormalModule, type WebpackError,
} from 'webpack';
import Graph from 'tarjan-graph';

const PLUGIN_NAME = 'FastCircularDependencyPlugin';

export interface IFastCircularDependencyPluginOptions {
    /** if provided, cycles where every module path matches this regex will not be reported */
    exclude?: RegExp;
    /** if provided, only cycles where at least one module path matches this regex will be reported */
    include?: RegExp;
    /** if true, the plugin will cause the build to fail if a circular dependency is detected */
    failOnError?: boolean;
    /** if true, the plugin will not report cycles that include an async dependency, e.g. via import(/* webpackMode: "weak" / './file.js') */
    allowAsyncCycles?: boolean;
    /** called when a cycle is detected, any exception thrown by this callback will be added to compilation errors */
    onDetected?: ((options: { module: NormalModule, paths: string[], compilation: Compilation }) => void) | null;
    /** called before the cycle detection starts */
    onStart?: ((options: { compilation: Compilation }) => void) | null;
    /** called after the cycle detection ends */
    onEnd?: ((options: { compilation: Compilation }) => void) | null;
    /** current working directory for displaying module paths */
    cwd?: string;
}

export default class FastCircularDependencyPlugin {
    private options: Required<IFastCircularDependencyPluginOptions>;

    constructor(options?: IFastCircularDependencyPluginOptions) {
        this.options = {
            exclude: /$^/,
            include: /.*/,
            failOnError: false,
            allowAsyncCycles: false,
            onDetected: null,
            onStart: null,
            onEnd: null,
            cwd: process.cwd(),
            ...options,
        };
    }

    apply(compiler: Compiler) {
        compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
            compilation.hooks.optimizeModules.tap(PLUGIN_NAME, (modules) => {
                this.options.onStart?.({ compilation });

                const graph = new Graph();
                const hasOnDetectedCallback = !!this.options.onDetected;
                const resourceToModuleMapping = hasOnDetectedCallback ? new Map<string, NormalModule>() : null;

                for (const module of modules) {
                    if (!(module instanceof compiler.webpack.NormalModule) || !module.resource) {
                        continue;
                    }

                    resourceToModuleMapping?.set(module.resource, module);
                    const dependencyResources = [];

                    for (const dependency of module.dependencies) {
                        const dependencyModule = compilation.moduleGraph.getModule(dependency);

                        if (dependencyModule === module) {
                            continue;
                        }

                        if (!dependencyModule || !(dependencyModule instanceof compiler.webpack.NormalModule) || !dependencyModule.resource) {
                            continue;
                        }

                        // optionally ignore dependencies that are resolved asynchronously
                        if (this.options.allowAsyncCycles && dependency.weak) {
                            continue;
                        }

                        resourceToModuleMapping?.set(module.resource, module);
                        dependencyResources.push(dependencyModule.resource);
                    }
                    graph.add(module.resource, dependencyResources);
                }

                const cycles = graph.getCycles().map((cycle) => [...cycle.reverse(), cycle[0]]);
                for (const cycle of cycles) {
                    const everyPartOfCycleIsExcluded = cycle.every((vertex) => (
                        this.options.exclude.test(vertex.name) || !this.options.include.test(vertex.name)
                    ));
                    if (everyPartOfCycleIsExcluded) {
                        continue;
                    }

                    const cycleModulePaths = cycle.map((vertex) => path.relative(this.options.cwd, vertex.name));
                    if (this.options.onDetected) {
                        try {
                            this.options.onDetected({
                                module: resourceToModuleMapping!.get(cycle[0].name)!,
                                paths: cycleModulePaths,
                                compilation,
                            });
                        } catch (err: unknown) {
                            compilation.errors.push(err as WebpackError);
                        }
                        continue;
                    }

                    const errorMessage = `Circular dependency detected:\r\n ${cycleModulePaths.join(' -> ')}`;
                    const error = new compiler.webpack.WebpackError(errorMessage);
                    if (this.options.failOnError) {
                        compilation.errors.push(error);
                    } else {
                        compilation.warnings.push(error);
                    }
                }

                this.options.onEnd?.({ compilation });
            });
        });
    }
}
