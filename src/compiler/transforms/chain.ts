/// <reference path="../factory.ts" />
/// <reference path="../transform.ts" />
/// <reference path="es5.ts" />
/// <reference path="es6.ts" />
/// <reference path="es5generator.ts" />
/// <reference path="es5modules.ts" />
/// <reference path="es6.ts" />
namespace ts.transform {
    export function getTransformationChain(options: CompilerOptions): Transformation {
        if ((options.target || ScriptTarget.ES3) < ScriptTarget.ES6) {
            switch (options.module) {
                case ModuleKind.UMD: 
                    return chainTransformations(toES6, toES5, toUMD);
                
                case ModuleKind.AMD: 
                    return chainTransformations(toES6, toES5, toAMD);
                
                case ModuleKind.System: 
                    return chainTransformations(toES6, toES5, toSystemJS);
                
                case ModuleKind.CommonJS:
                case ModuleKind.None:
                default:
                    return chainTransformations(toES6, toES5, toCommonJS); 
            }
        }
        
        return toES6;
    }
    
    export function chainTransformations(...transformations: Transformation[]): Transformation {
        switch (transformations.length) {
            case 0: return identityTransformation;
            case 1: return createUnaryTransformationChain(transformations[0]);
            case 2: return createBinaryTransformationChain(transformations[0], transformations[1]);
            case 3: return createTrinaryTransformationChain(transformations[0], transformations[1], transformations[2]);
            default: return createNaryTransformationChain(transformations);
        }
    }
    
    function createUnaryTransformationChain(only: Transformation) {
        return function (resolver: TransformResolver, statements: NodeArray<Statement>) {
            if (only) statements = only(resolver, statements);
            return statements;
        };
    }
    
    function createBinaryTransformationChain(first: Transformation, second: Transformation) {
        return function (resolver: TransformResolver, statements: NodeArray<Statement>) {
            if (first) statements = first(resolver, statements);
            if (second) statements = second(resolver, statements);
            return statements;
        };
    }
    
    function createTrinaryTransformationChain(first: Transformation, second: Transformation, third: Transformation) {
        return function (resolver: TransformResolver, statements: NodeArray<Statement>) {
            if (first) statements = first(resolver, statements);
            if (second) statements = second(resolver, statements);
            if (third) statements = third(resolver, statements);
            return statements;
        };
    }
    
    function createNaryTransformationChain(transformations: Transformation[]) {
        return function (resolver: TransformResolver, statements: NodeArray<Statement>) {
            for (let transformation of transformations) {
                if (transformation) statements = transformation(resolver, statements);
            }
            return statements;
        };
    }
    
    function identityTransformation(resolver: TransformResolver, statements: NodeArray<Statement>): NodeArray<Statement> {
        return statements;
    }
}