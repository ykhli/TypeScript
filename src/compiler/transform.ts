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
    
    export function getTransformationChain(options: CompilerOptions): Transformation {
        if ((options.target || ScriptTarget.ES3) < ScriptTarget.ES6) {
            switch (options.module) {
                case ModuleKind.UMD: 
                    return chainTransformations(toES6, toES5, toUMD);
                
                case ModuleKind.AMD: 
                    return chainTransformations(toES6, toES5, toAMD);
                
                case ModuleKind.System: 
                    return chainTransformations(toES6, toES5, toSystemJS);
                
                case ModuleKind.CommonJS:
                case ModuleKind.None:
                default:
                    return chainTransformations(toES6, toES5, toCommonJS); 
            }
        }
        
        return toES6;
    }
    
    export function chainTransformations(...transformations: Transformation[]): Transformation {
        switch (transformations.length) {
            case 0: return identityTransformation;
            case 1: return createUnaryTransformationChain(transformations[0]);
            case 2: return createBinaryTransformationChain(transformations[0], transformations[1]);
            case 3: return createTrinaryTransformationChain(transformations[0], transformations[1], transformations[2]);
            default: return createNaryTransformationChain(transformations);
        }
    }
    
    function createUnaryTransformationChain(only: Transformation) {
        return function (resolver: TransformResolver, statements: NodeArray<Statement>) {
            if (only) statements = only(resolver, statements);
            return statements;
        };
    }
    
    function createBinaryTransformationChain(first: Transformation, second: Transformation) {
        return function (resolver: TransformResolver, statements: NodeArray<Statement>) {
            if (first) statements = first(resolver, statements);
            if (second) statements = second(resolver, statements);
            return statements;
        };
    }
    
    function createTrinaryTransformationChain(first: Transformation, second: Transformation, third: Transformation) {
        return function (resolver: TransformResolver, statements: NodeArray<Statement>) {
            if (first) statements = first(resolver, statements);
            if (second) statements = second(resolver, statements);
            if (third) statements = third(resolver, statements);
            return statements;
        };
    }
    
    function createNaryTransformationChain(transformations: Transformation[]) {
        return function (resolver: TransformResolver, statements: NodeArray<Statement>) {
            for (let transformation of transformations) {
                if (transformation) statements = transformation(resolver, statements);
            }
            return statements;
        };
    }
    
    function identityTransformation(resolver: TransformResolver, statements: NodeArray<Statement>): NodeArray<Statement> {
        return statements;
    }
}