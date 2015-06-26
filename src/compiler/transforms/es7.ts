/// <reference path="../transform.ts" />
namespace ts.transform {
    export function toES7(resolver: TransformResolver, statements: NodeArray<Statement>): NodeArray<Statement> {
        return visitNodes(statements, new ES7Transformer(resolver));
    }
    
    /* @internal */
    export class ES7Transformer extends Transformer {
        public shouldTransformNode(node: Node) {
            return false;
            // return !!(node.transformFlags & TransformFlags.ThisNodeNeedsTransfomToES7);
        }

        public shouldTransformChildrenOfNode(node: Node) {
            // return !!(node.transformFlags & TransformFlags.SubtreeNeedsTransformToES7);
            return false;
        }
    }
}