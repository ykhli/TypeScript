/// <reference path="scanner.ts"/>
/// <reference path="factory.generated.ts" />
namespace ts {
    let nodeConstructors = new Array<new () => Node>(SyntaxKind.Count);
    
    export function getNodeConstructor(kind: SyntaxKind): new () => Node {
        return nodeConstructors[kind] || (nodeConstructors[kind] = objectAllocator.getNodeConstructor(kind));
    }

    export namespace factory {
        export function createNode<T extends Node>(kind: SyntaxKind): T {
            return <T>new (getNodeConstructor(kind))();
        }

        export function createNodeArray<TNode extends Node>(elements?: TNode[]) {
            let nodes = <NodeArray<TNode>>(elements || []);
            if (nodes.pos === undefined) {
                nodes.pos = -1;
                nodes.end = -1;
            }
            
            return nodes;
        }
        
        export function createModifiersArray(elements?: Node[]) {
            let modifiers = <ModifiersArray>(elements || []);
            if (modifiers.flags === undefined) {
                let flags = 0;
                for (let modifier of modifiers) {
                    flags |= modifierToFlag(modifier.kind);
                }
                
                modifiers.flags = flags;
            }
            
            return modifiers;
        }
        
        export function createSourceFile(): SourceFile {
            let node = <SourceFile>createNode(SyntaxKind.SourceFile);
            return node;
        }
    }
    
    export interface Transformer {
        transform<TNode extends Node>(node: TNode): TNode;
        shouldTransformNode?(node: Node): boolean;
        shouldTransformChildrenOfNode?(node: Node): boolean;
        shouldCachePreviousNodes?(node: Node): boolean;
        cacheNode? <TNode extends Node>(node: TNode): TNode;
        removeMissingNodes?: boolean;
    }
    
    export function transform<TNode extends Node>(node: TNode, transformer: Transformer) {
        return shouldTransformNode(node, transformer) ? transformNode(node, transformer) 
            : shouldTransformChildrenOfNode(node, transformer) ? transformFallback(node, transformer)
            : node;
    }

    /* @internal */
    export function shouldTransformNode(node: Node, transformer: Transformer) {
        return node ? transformer && transformer.shouldTransformNode ? transformer.shouldTransformNode(node) : true : false;
    }
    
    /* @internal */
    export function shouldTransformChildrenOfNode(node: Node, transformer: Transformer) {
        return node && transformer && transformer.shouldTransformChildrenOfNode ? transformer.shouldTransformChildrenOfNode(node) : false;
    }
    
    function shouldCachePreviousNodes(node: Node, transformer: Transformer) {
        return node && transformer && transformer.shouldCachePreviousNodes ? transformer.shouldCachePreviousNodes(node) : false;
    }
    
    function transformNode<TNode extends Node>(node: TNode, transformer: Transformer): TNode {
        return node && transformer && transformer.transform ? transformer.transform(node) : node;
    }
    
    function cacheNode<TNode extends Node>(node: TNode, transformer: Transformer): TNode {
        return node && transformer && transformer.cacheNode ? transformer.cacheNode(node) : node;
    }
    
    export function transformNodes<TNode extends Node>(nodes: NodeArray<TNode>, transformer: Transformer): NodeArray<TNode> {
        if (!nodes || !transformer) {
            return nodes;
        }

        let updatedNodes: TNode[];
        let updatedOffset = 0;
        let cacheOffset = 0;
        let removeMissingNodes = transformer.removeMissingNodes;
        
        for (var i = 0; i < nodes.length; i++) {
            let updatedIndex = i - updatedOffset;
            let node = nodes[i];
            if (shouldCachePreviousNodes(node, transformer)) {
                if (!updatedNodes) {
                    updatedNodes = nodes.slice(0, i);
                }

                while (cacheOffset < updatedIndex) {
                    updatedNodes[cacheOffset] = cacheNode(updatedNodes[cacheOffset], transformer);
                    cacheOffset++;
                }

                cacheOffset = updatedIndex;
            }
            
            let updatedNode = transform(node, transformer);
            if ((updatedNodes || updatedNode !== node || (!updatedNode && removeMissingNodes))) {
                if (!updatedNodes) {
                    updatedNodes = nodes.slice(0, i);
                }
                if (!updatedNode && removeMissingNodes) {
                    updatedOffset++;
                }
                else {
                    updatedNodes[i - updatedOffset] = updatedNode;
                }
            }
        }

        if (updatedNodes) {
            (<NodeArray<TNode>>updatedNodes).pos = nodes.pos;
            (<NodeArray<TNode>>updatedNodes).end = nodes.end;
            return <NodeArray<TNode>>updatedNodes;
        }

        return nodes;
    }
}
