import path from 'path';
import {
    type Compiler, type Compilation, NormalModule, WebpackError,
} from 'webpack';
import Graph from 'tarjan-graph';

const PLUGIN_NAME = 'FastCircularDependencyPlugin';

export interface IFastCircularDependencyPluginOptions {
    exclude?: RegExp;
    include?: RegExp;
    failOnError?: boolean;
    allowAsyncCycles?: boolean;
    onDetected?: ((options: { module: NormalModule, paths: string[], compilation: Compilation }) => void) | null;
    onStart?: ((options: { compilation: Compilation }) => void) | null;
    onEnd?: ((options: { compilation: Compilation }) => void) | null;
    cwd?: string;
}

class ModulesGraph {
    public modules: NormalModule[];

    private graph = new Graph();

    constructor() {
        this.modules = [];
    }

    addModule(module: NormalModule) {
        const moduleIndex = this.modules.indexOf(module);
        if (moduleIndex === -1) {
            this.modules.push(module);
            return String(this.modules.length - 1);
        }
        return String(moduleIndex);
    }

    registerDependency(moduleIndex: string, dependencyIndices: string[]) {
        this.graph.add(moduleIndex, dependencyIndices);
    }

    getCycles(): number[][] {
        return this.graph.getCycles()
            .reverse()
            .map((path) => path.map((vertex) => Number(vertex.name)).reverse());
    }

    getPath(moduleIds: number[]) {
        return [...moduleIds.map((moduleId) => this.modules[moduleId]), this.modules[moduleIds[0]]];
    }
}

class CycleDependencyError extends WebpackError {
    public paths: string[];

    constructor(paths: string[]) {
        super(`Circular dependency detected:\r\n ${paths.join(' -> ')}`);
        this.paths = paths;
    }
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

                const graph = new ModulesGraph();

                for (const module of modules) {
                    if (!(module instanceof NormalModule)) {
                        continue;
                    }

                    const moduleIndex = graph.addModule(module);
                    const dependencyIndices = [];

                    for (const dependency of module.dependencies) {
                        const dependencyModule = compilation.moduleGraph.getModule(dependency);

                        if (dependencyModule === module) {
                            continue;
                        }

                        if (!dependencyModule || !(dependencyModule instanceof NormalModule)) {
                            continue;
                        }

                        // optionally ignore dependencies that are resolved asynchronously
                        if (this.options.allowAsyncCycles && dependency.weak) {
                            continue;
                        }

                        const dependencyModuleIndex = graph.addModule(dependencyModule);
                        dependencyIndices.push(dependencyModuleIndex);
                    }
                    graph.registerDependency(moduleIndex, dependencyIndices);
                }

                const cycles = graph.getCycles();
                for (const cycle of cycles) {
                    const cycleModules = graph.getPath(cycle);
                    const cycleModuleAbsolutePaths = cycleModules.map((module) => module.resource).filter(Boolean);
                    const everyPartOfCycleIsExcluded = cycleModuleAbsolutePaths.every((path) => (
                        this.options.exclude.test(path) || !this.options.include.test(path)
                    ));
                    if (everyPartOfCycleIsExcluded) {
                        continue;
                    }
                    const cycleModulePaths = cycleModuleAbsolutePaths.map((p) => path.relative(this.options.cwd, p));
                    if (this.options.onDetected) {
                        try {
                            this.options.onDetected({
                                module: graph.modules[cycle[0]],
                                paths: cycleModulePaths,
                                compilation,
                            });
                        } catch (err: unknown) {
                            compilation.errors.push(err as WebpackError);
                        }
                        continue;
                    }

                    const error = new CycleDependencyError(cycleModulePaths);
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
