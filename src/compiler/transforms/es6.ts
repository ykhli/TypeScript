/// <reference path="../transform.ts" />
namespace ts.transform {
    export function toES6(resolver: TransformResolver, statements: NodeArray<Statement>): NodeArray<Statement> {
        return visitNodes(statements, new ES6Transformer(resolver));
    }
    
    /* @internal */
    export class ES6Transformer extends Transformer {
        shouldTransformNode(node: Node) {
            return !!(node.transformFlags & TransformFlags.ThisNodeNeedsES6Transform);
        }

        shouldTransformChildrenOfNode(node: Node) {
            return !!(node.transformFlags & TransformFlags.ThisNodeOrAnySubNodesNeedsES6TransformMask);
        }
    }
}