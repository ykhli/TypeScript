/// <reference path="../transform.ts" />
namespace ts.transform {
    export function toDeclarationFile(resolver: TransformResolver, sourceFile: SourceFile, statements: NodeArray<Statement>): NodeArray<Statement> {
        return statements;
    }
}