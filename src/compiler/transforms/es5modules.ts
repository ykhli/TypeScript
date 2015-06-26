/// <reference path="../transform.ts" />
namespace ts.transform {
    export function toUMD(resolver: TransformResolver, sourceFile: SourceFile, statements: NodeArray<Statement>): NodeArray<Statement> {
        return statements;
    }

    export function toAMD(resolver: TransformResolver, sourceFile: SourceFile, statements: NodeArray<Statement>): NodeArray<Statement> {
        return statements;
    }

    export function toCommonJS(resolver: TransformResolver, sourceFle: SourceFile, statements: NodeArray<Statement>): NodeArray<Statement> {
        return statements;
    }

    export function toSystemJS(resolver: TransformResolver, sourceFile: SourceFile, statements: NodeArray<Statement>): NodeArray<Statement> {
        return statements;
    }
}