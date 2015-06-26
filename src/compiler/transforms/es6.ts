/// <reference path="../transform.ts" />
namespace ts.transform {
    let getES6Transformer = memoize(createES6Transformer);

    export function toES6(resolver: TransformResolver, sourceFile: SourceFile, statements: NodeArray<Statement>): NodeArray<Statement> {
        return transformSourceFile(resolver, sourceFile, statements, getES6Transformer());
    }

    function createES6Transformer(): Transformer {
        function transformNode(node: Node): Node {
            return node;
        }
        
        function shouldTransformNode(node: Node) {
            return !!(node.transformFlags & TransformFlags.ThisNodeNeedsES6Transform);
        }

        function shouldTransformChildrenOfNode(node: Node) {
            return !!(node.transformFlags & TransformFlags.ThisNodeOrAnySubNodesNeedsES6TransformMask);
        }
        
        return {
            transformNode,
            shouldTransformNode,
            shouldTransformChildrenOfNode
        };
    }
}