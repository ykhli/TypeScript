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
    
    export type Transformer = <TNode extends Node>(node: TNode, state?: any) => TNode;
    
    export function transform<TNode extends Node>(node: TNode, cbNode: Transformer, state?: any) {
        if (!node || !transform) {
            return node;
        }

        return cbNode(node, state);
    }

    export interface TransformNodesOptions<TNode extends Node> {
        shouldCacheNode?(node: TNode, state?: any): boolean;
        cacheNode?(node: TNode, state?: any): TNode;
        removeMissingNodes?: boolean;
    }
    
    export function transformNodes<TNode extends Node>(nodes: NodeArray<TNode>, cbNode: Transformer, state?: any, options?: TransformNodesOptions<TNode>): NodeArray<TNode> {
        if (!nodes || !cbNode) {
            return nodes;
        }

        let updatedNodes: TNode[];
        let updatedOffset = 0;
        let cacheOffset = 0;
        let removeMissingNodes: boolean;
        let shouldCacheNode: (node: TNode, state?: any) => boolean;
        let cacheNode: (node: TNode, state?: any) => TNode;
        
        if (options) {
            removeMissingNodes = options.removeMissingNodes;
            shouldCacheNode = options.shouldCacheNode;
            cacheNode = options.cacheNode;
        }

        for (var i = 0; i < nodes.length; i++) {
            let updatedIndex = i - updatedOffset;
            let node = nodes[i];
            if (shouldCacheNode && shouldCacheNode(node, state)) {
                if (!updatedNodes) {
                    updatedNodes = nodes.slice(0, i);
                }

                while (cacheOffset < updatedIndex) {
                    updatedNodes[cacheOffset] = cacheNode(updatedNodes[cacheOffset], state);
                    cacheOffset++;
                }

                cacheOffset = updatedIndex;
            }
            
            let updatedNode = node ? cbNode(node, state) : undefined;
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
