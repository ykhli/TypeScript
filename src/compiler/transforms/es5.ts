/// <reference path="../transform.ts" />

namespace ts.transform {
    let getES5Transformer = memoize(createES5Transformer);
    
    export function toES5(resolver: TransformResolver, sourceFile: SourceFile, statements: NodeArray<Statement>): NodeArray<Statement> {
        return transformSourceFile(resolver, sourceFile, statements, getES5Transformer());
    }
    
    function createES5Transformer(): Transformer {
        let transformResolver: TransformResolver;
        let emitResolver: EmitResolver;
        let sourceFile: SourceFile;
        let transformer = {
            initialize,
            transformNode,
            shouldTransformNode,
            shouldTransformChildrenOfNode,
            dispose,
        };
        
        return transformer;
        
        function initialize(_resolver: TransformResolver, _sourceFile: SourceFile) {
            transformResolver = _resolver;
            emitResolver = transformResolver.getEmitResolver();
            sourceFile = _sourceFile;
        }
        
        function dispose() {
            transformResolver = undefined;
            emitResolver = undefined;
            sourceFile = undefined;
        }

        function shouldTransformNode(node: Node) {
            return !!(node.transformFlags & TransformFlags.ThisNodeNeedsES5Transform);
        }
        
        function shouldTransformChildrenOfNode(node: Node) {
            return !!(node.transformFlags & TransformFlags.ThisNodeOrAnySubNodesNeedsES5TransformMask);
        }
        
        function transformNode(node: Node, transformer: Transformer): Node {
            // switch (node.kind) {
            //     case SyntaxKind.ArrowFunction:
            //         return transformArrowFunction(<ArrowFunction>node, transformer);
                    
            //     case SyntaxKind.FunctionExpression:
            //     case SyntaxKind.FunctionDeclaration:
            //     case SyntaxKind.MethodDeclaration:
            //         return transformFunctionLikeDeclaration(<FunctionLikeDeclaration>node, transformer);
            // }
            return visitChildren(node, transformer);
        }
        
        function transformArrowFunction(node: ArrowFunction, transformer: Transformer) {
            return factory.createFunctionExpression3(
                visitNodes(node.parameters, transformer),
                transformArrowFunctionBody(node.body, transformer));
        }
        
        function transformArrowFunctionBody(body: Block | Expression, transformer: Transformer) {
            if (body.kind === SyntaxKind.Block) {
                return visit(<Block>body, transformer);
            }
            
            let node = factory.createBlock([
                factory.createReturnStatement(
                    visit(<Expression>body, transformer)
                )
            ]);
            
            node.transformSource = body;
            return node;
        }
        
        function transformFunctionLikeDeclaration(node: FunctionLikeDeclaration, transformer: Transformer) {
            if ((<FunctionLikeDeclaration>node).asteriskToken) {
            }
            if (node.transformFlags & TransformFlags.ThisNodeNeedsCapturedThis) {
            }
            return visitChildren(node, transformer);
        }
    }
}