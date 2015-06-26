/// <reference path="../transform.ts" />
namespace ts.transform {
    export function toUMD(resolver: TransformResolver, statements: NodeArray<Statement>): NodeArray<Statement> {
        return statements;
    }

    export function toAMD(resolver: TransformResolver, statements: NodeArray<Statement>): NodeArray<Statement> {
        return statements;
    }

    export function toCommonJS(resolver: TransformResolver, statements: NodeArray<Statement>): NodeArray<Statement> {
        return statements;
    }

    export function toSystemJS(resolver: TransformResolver, statements: NodeArray<Statement>): NodeArray<Statement> {
        return statements;
    }
}