/// <reference path="factory.ts" />
/// <reference path="transform.generated.ts" />
namespace ts.transform {
    export type Transformation = (resolver: TransformResolver, statements: NodeArray<Statement>) => NodeArray<Statement>;

    export const enum TransformerScope {
    	None,
    	Function
    }
    
    export class Transformer {
    	public scope: TransformerScope;
    	public previous: Transformer;
    	public transformResolver: TransformResolver;
    	public emitResolver: EmitResolver;
    
    	constructor(resolver: TransformResolver, previous?: Transformer, scope?: TransformerScope) {
    		this.transformResolver = resolver;
    		this.emitResolver = resolver.getEmitResolver();
    		this.previous = previous;
    		this.scope = scope;
    	}
    	
    	public transformNode(node: Node): Node {
    		return this.previous ? this.previous.transformNode(node) : node; 
    	}	
    	
    	public cacheNode(node: Node): Node { 
    		return this.previous ? this.previous.cacheNode(node) : node; 
    	}
    	
    	public shouldTransformNode(node: Node): boolean { 
    		return this.previous ? this.previous.shouldTransformNode(node) : true; 
    	}
    	
    	public shouldTransformChildrenOfNode(node: Node): boolean { 
    		return this.previous ? this.previous.shouldTransformChildrenOfNode(node) : false; 
    	}
    	
    	public shouldCachePreviousNodes(node: Node): boolean { 
    		return this.previous ? this.previous.shouldCachePreviousNodes(node) : false; 
    	}
    	
    	public shouldRemoveMissingNodes(): boolean {
    		return this.previous ? this.previous.shouldRemoveMissingNodes() : false;
    	}
        
        public shouldPopTransformerScope(node: Node): boolean {
            return this.scope === TransformerScope.Function 
                && isFunctionLike(node);
        }
    }    

    export interface TransformResolver {
        getGeneratedNameForNode(node: Node): string;
        makeTempVariableName(): string;
        makeUniqueName(baseName: string): string;
        getEmitResolver(): EmitResolver;
    }

    export function visit<TNode extends Node>(node: TNode, transformer: Transformer): TNode {
        if (!node || !transformer) {
            return node;
        }
        
        if (transformer.shouldPopTransformerScope(node)) {
            transformer = transformer.previous;
        }
        
        let transformed = 
            transformer.shouldTransformNode(node) ? transformer.transformNode(node) :
            transformer.shouldTransformChildrenOfNode(node) ? visitChildren(node, transformer) : 
            node;
        
        // if the transformed node differs from the source node, set the source pointer.
        if (transformed && transformed !== node) {
            transformed.transformSource = node;
        }
        
        return <TNode>transformed;
    }

    export function visitNodes<TNode extends Node>(nodes: NodeArray<TNode>, transformer: Transformer): NodeArray<TNode> {
        if (!nodes || !transformer) {
            return nodes;
        }

        let updatedNodes: TNode[];
        let updatedOffset = 0;
        let cacheOffset = 0;
        let removeMissingNodes = transformer.shouldRemoveMissingNodes();
        
        for (var i = 0; i < nodes.length; i++) {
            let updatedIndex = i - updatedOffset;
            let node = nodes[i];
            if (transformer.shouldCachePreviousNodes(node)) {
                if (!updatedNodes) {
                    updatedNodes = nodes.slice(0, i);
                }

                while (cacheOffset < updatedIndex) {
                    updatedNodes[cacheOffset] = <TNode>transformer.cacheNode(updatedNodes[cacheOffset]);
                    cacheOffset++;
                }

                cacheOffset = updatedIndex;
            }
            
            let updatedNode = visit(node, transformer);
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