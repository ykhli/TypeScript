/// <reference path="factory.ts" />
/// <reference path="transform.generated.ts" />
namespace ts.transform {
    export type Transformation = (resolver: TransformResolver, sourceFile: SourceFile, statements: NodeArray<Statement>) => NodeArray<Statement>;

    export interface Transformer {
        initialize?(resolver: TransformResolver, node: SourceFile): void;
        dispose?(): void;
        transformNode?<TNode extends Node>(node: TNode, transformer?: Transformer): TNode;
        shouldTransformNode?(node: Node, transformer?: Transformer): boolean;
        shouldTransformChildrenOfNode?(node: Node, transformer?: Transformer): boolean;
        shouldCachePreviousNodes?(node: Node, transformer?: Transformer): boolean;
        cacheNode?<TNode extends Node>(node: TNode, transformer?: Transformer): TNode;
        removeMissingNodes?: boolean;
        previous?: Transformer;
    }
    
    export interface TransformResolver {
        getGeneratedNameForNode(node: Node): string;
        getEmitResolver(): EmitResolver;
    }

    function transformerShouldTransformNode(transformer: Transformer, node: Node) {
        return node ? transformer && transformer.shouldTransformNode ? transformer.shouldTransformNode(node, transformer) : true : false;
    }
    
    function transformerShouldTransformChildrenOfNode(transformer: Transformer, node: Node) {
        return node && transformer && transformer.shouldTransformChildrenOfNode ? transformer.shouldTransformChildrenOfNode(node, transformer) : false;
    }
    
    function transformerShouldCachePreviousNodes(transformer: Transformer, node: Node) {
        return node && transformer && transformer.shouldCachePreviousNodes ? transformer.shouldCachePreviousNodes(node, transformer) : false;
    }
    
    function transformerShouldRemoveMissingNodes(transformer: Transformer) {
        return transformer ? transformer.removeMissingNodes : false;
    }
    
    function transformerTransformNode<TNode extends Node>(transformer: Transformer, node: TNode): TNode {
        return node && transformer && transformer.transformNode ? transformer.transformNode(node, transformer) : node;
    }
    
    function transformerCacheNode<TNode extends Node>(transformer: Transformer, node: TNode): TNode {
        return node && transformer && transformer.cacheNode ? transformer.cacheNode(node, transformer) : node;
    }
    
    function transformerInitialize(transformer: Transformer, resolver: TransformResolver, node: SourceFile) {
        if (transformer && transformer.initialize) {
            transformer.initialize(resolver, node);
        }
    }
    
    function transformerDispose(transformer: Transformer) {
        if (transformer && transformer.dispose) {
            transformer.dispose();
        }
    }
    
    export function transformSourceFile(resolver: TransformResolver, sourceFile: SourceFile, statements: NodeArray<Statement>, transformer: Transformer): NodeArray<Statement> {
        transformerInitialize(transformer, resolver, sourceFile);
        statements = visitNodes(statements, transformer);
        transformerDispose(transformer);
        return statements;
    }
    
    export function visit<TNode extends Node>(node: TNode, transformer: Transformer) {
        let transformed = 
            transformerShouldTransformNode(transformer, node) ? transformerTransformNode(transformer, node) : 
            transformerShouldTransformChildrenOfNode(transformer, node) ? visitChildren(node, transformer) : 
            node;
        
        // if the transformed node differs from the source node, set the source pointer.
        if (transformed && transformed !== node) {
            transformed.transformSource = node;
        }
        
        return transformed;
    }

    export function visitNodes<TNode extends Node>(nodes: NodeArray<TNode>, transformer: Transformer): NodeArray<TNode> {
        if (!nodes || !transformer) {
            return nodes;
        }

        let updatedNodes: TNode[];
        let updatedOffset = 0;
        let cacheOffset = 0;
        let removeMissingNodes = transformerShouldRemoveMissingNodes(transformer);
        
        for (var i = 0; i < nodes.length; i++) {
            let updatedIndex = i - updatedOffset;
            let node = nodes[i];
            if (transformerShouldCachePreviousNodes(transformer, node)) {
                if (!updatedNodes) {
                    updatedNodes = nodes.slice(0, i);
                }

                while (cacheOffset < updatedIndex) {
                    updatedNodes[cacheOffset] = transformerCacheNode(transformer, updatedNodes[cacheOffset]);
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
    
    export function chainTransformer(source: Transformer, overrides: Transformer) {
        let transformer = assign(clone(source), overrides);
        transformer.previous = source;
        return transformer;
    }

    function createUnaryTransformationChain(only: Transformation) {
        return function (resolver: TransformResolver, sourceFile: SourceFile, statements: NodeArray<Statement>) {
            if (only) statements = only(resolver, sourceFile, statements);
            return statements;
        };
    }
    
    function createBinaryTransformationChain(first: Transformation, second: Transformation) {
        return function (resolver: TransformResolver, sourceFile: SourceFile, statements: NodeArray<Statement>) {
            if (first) statements = first(resolver, sourceFile, statements);
            if (second) statements = second(resolver, sourceFile, statements);
            return statements;
        };
    }
    
    function createTrinaryTransformationChain(first: Transformation, second: Transformation, third: Transformation) {
        return function (resolver: TransformResolver, sourceFile: SourceFile, statements: NodeArray<Statement>) {
            if (first) statements = first(resolver, sourceFile, statements);
            if (second) statements = second(resolver, sourceFile, statements);
            if (third) statements = third(resolver, sourceFile, statements);
            return statements;
        };
    }
    
    function createNaryTransformationChain(transformations: Transformation[]) {
        return function (resolver: TransformResolver, sourceFile: SourceFile, statements: NodeArray<Statement>) {
            for (let transformation of transformations) {
                if (transformation) statements = transformation(resolver, sourceFile, statements);
            }
            return statements;
        };
    }
    
    function identityTransformation(resolver: TransformResolver, sourceFile: SourceFile, statements: NodeArray<Statement>): NodeArray<Statement> {
        return statements;
    }
}