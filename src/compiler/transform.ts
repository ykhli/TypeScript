/// <reference path="factory.ts" />
/// <reference path="transform.generated.ts" />
namespace ts.transform {
    export interface TransformerCacheControl<TNode extends Node> {
        shouldCachePreviousNodes(node: TNode): boolean;
        cacheNode(node: TNode): TNode;
    }
    
    export class Transformer {
        public previous: Transformer;
        public transformResolver: TransformResolver;
        public emitResolver: EmitResolver;
    
        constructor(resolver: TransformResolver, previous?: Transformer) {
            this.transformResolver = resolver;
            this.emitResolver = resolver.getEmitResolver();
            this.previous = previous;
        }
        
        public transformNode<TNode extends Node>(node: TNode): TNode;
        public transformNode(node: Node): Node;
        public transformNode(node: Node): Node {
            if (this.shouldTransformChildrenOfNode(node)) {
                return visitChildren(node, this);
            }
            
            return this.previous ? this.previous.transformNode(node) : node;
        }
        
        public shouldTransformNode(node: Node): boolean {
            return this.previous ? this.previous.shouldTransformNode(node) : true;
        }
        
        public shouldTransformChildrenOfNode(node: Node): boolean {
            return this.previous ? this.previous.shouldTransformChildrenOfNode(node) : false;
        }
    }
    
    export function visit<TNode extends Node>(node: TNode, transformer: Transformer): TNode {
        if (!node) {
            return node;
        }
        
        // Attempt to transform the node or its children
        let transformed: Node;
        while (transformer) {
            if (transformer.shouldTransformNode(node)) {
                transformed = transformer.transformNode(node);
                break;
            }
            else if (transformer.shouldTransformChildrenOfNode(node)) {
                transformed = transformer.transformNode(node);
                break;
            }
            
            // We couldn't transform the node with this transformer, try a previous transformer.
            transformer = transformer.previous;
        }
        
        // No transformer could transform the node, so return it
        if (!transformer) {
            return node;
        }
        
        // If the transformed node differs from the source node, aggregate any new transform flags and set the source pointer.
        if (transformed && transformed !== node) {
            aggregateTransformFlags(transformed);
            transformed.transformSource = node;
        }
        
        return <TNode>transformed;
    }

    export function visitNodes<TNode extends Node>(nodes: NodeArray<TNode>, transformer: Transformer, cache?: TransformerCacheControl<TNode>, removeMissingNodes?: boolean): NodeArray<TNode> {
        if (!nodes || !transformer) {
            return nodes;
        }

        let updatedNodes: TNode[];
        let updatedOffset = 0;
        let cacheOffset = 0;
        
        for (var i = 0; i < nodes.length; i++) {
            let updatedIndex = i - updatedOffset;
            let node = nodes[i];
            if (cache && cache.shouldCachePreviousNodes(node)) {
                if (!updatedNodes) {
                    updatedNodes = nodes.slice(0, i);
                }

                while (cacheOffset < updatedIndex) {
                    updatedNodes[cacheOffset] = cache.cacheNode(updatedNodes[cacheOffset]);
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
            return factory.setTextRange(
                factory.createNodeArray(updatedNodes),
                nodes
            );
        }

        return nodes;
    }

    /* @internal */
    export function debugPrintTransformFlags(node: Node) {
        let writer = createTextWriter(sys.newLine);
        visit(node);
        console.log(writer.getText()); 
        function visit(node: Node) {
            writer.write(`${(<any>ts).SyntaxKind[node.kind]}: ${formatFlags(node.transformFlags)}`);
            writer.writeLine();
            writer.increaseIndent();
            forEachChild(node, visit);
            writer.decreaseIndent();
        }
        function formatFlags(flags: TransformFlags) {
            let result = "";
            if (flags & TransformFlags.TypeScript) appendFlag("TypeScript");
            if (flags & TransformFlags.ContainsTypeScript) appendFlag("ContainsTypeScript");
            if (flags & TransformFlags.ES7) appendFlag("ES7");
            if (flags & TransformFlags.ContainsES7) appendFlag("ContainsES7");
            if (flags & TransformFlags.ES6) appendFlag("ES6");
            if (flags & TransformFlags.CaptureThis) appendFlag("CaptureThis");
            if (flags & TransformFlags.HoistedDeclarationInGenerator) appendFlag("HoistedDeclarationInGenerator");
            if (flags & TransformFlags.CompletionStatementInGenerator) appendFlag("CompletionStatementInGenerator");
            if (flags & TransformFlags.ContainsES6) appendFlag("ContainsES6");
            if (flags & TransformFlags.ContainsYield) appendFlag("ContainsYield");
            if (flags & TransformFlags.ContainsBindingPattern) appendFlag("ContainsBindingPattern");
            if (flags & TransformFlags.ContainsRestArgument) appendFlag("ContainsRestArgument");
            if (flags & TransformFlags.ContainsInitializer) appendFlag("ContainsInitializer");
            if (flags & TransformFlags.ContainsSpreadElement) appendFlag("ContainsSpreadElement");
            if (flags & TransformFlags.ContainsLetOrConst) appendFlag("ContainsLetOrConst");
            if (flags & TransformFlags.ContainsCapturedThis) appendFlag("ContainsCapturedThis");
            if (flags & TransformFlags.ContainsLexicalThis) appendFlag("ContainsLexicalThis");
            if (flags & TransformFlags.ContainsHoistedDeclarationInGenerator) appendFlag("ContainsHoistedDeclarationInGenerator");
            if (flags & TransformFlags.ContainsCompletionStatementInGenerator) appendFlag("ContainsCompletionStatementInGenerator");
            return result;
            
            function appendFlag(name: string) {
                if (result) {
                    result += " | ";
                }
                
                result += name;
            }
        }
    }

    let transformFlags: TransformFlags;

    function aggregateChildTransformFlags(node: Node) {
        let saveTransformFlags = transformFlags;
        aggregateTransformFlags(node);
        transformFlags |= saveTransformFlags & ~TransformFlags.ThisNodeFlags;
    }

    export function aggregateTransformFlags(node: Node) {
        transformFlags = node.transformFlags;
        if (transformFlags === undefined) {
            forEachChild(node, aggregateChildTransformFlags);

            let containsCapturedThis: boolean;
            let containsLexicalThis: boolean;
            switch (node.kind) {
                case SyntaxKind.SourceFile:
                    containsCapturedThis = needsTransform(TransformFlags.ContainsCapturedThis);
                    excludeTransform(TransformFlags.ModuleScopeExcludes);
                    if (containsCapturedThis) {
                        markTransform(TransformFlags.ThisNodeNeedsToCaptureThis);
                    } 
                    break;
                
                case SyntaxKind.ComputedPropertyName:
                    markTransform(TransformFlags.ThisNodeIsES6ComputedPropertyName);
                    break;
                    
                case SyntaxKind.TemplateExpression:
                    markTransform(TransformFlags.ThisNodeIsES6TemplateExpression);
                    break;
                    
                case SyntaxKind.NoSubstitutionTemplateLiteral:
                    markTransform(TransformFlags.ThisNodeIsES6NoSubstitutionTemplateLiteral);
                    break;
                    
                // case SyntaxKind.NumericLiteral:
                //     let sourceFile = getSourceFileOfNode(node);
                //     let firstChar = sourceFile.text.charCodeAt(node.pos);
                //     if (firstChar === CharacterCodes.b 
                //         || firstChar === CharacterCodes.B 
                //         || firstChar === CharacterCodes.o
                //         || firstChar === CharacterCodes.O) {
                //         markTransform(TransformFlags.ThisNodeIsES6BinaryOrOctalLiteralExpression);
                //     }
                //     break;
                    
                case SyntaxKind.Parameter:
                    if ((<ParameterDeclaration>node).initializer) {
                        markTransform(TransformFlags.ThisNodeIsES6Initializer);
                    }
                    if ((<ParameterDeclaration>node).dotDotDotToken) {
                        markTransform(TransformFlags.ThisNodeIsES6RestArgument);
                    }
                    break;
                
                case SyntaxKind.YieldExpression:
                    markTransform(TransformFlags.ThisNodeIsES6Yield);
                    break;
                    
                case SyntaxKind.ArrowFunction:
                    containsLexicalThis = needsTransform(TransformFlags.ContainsLexicalThis);
                    excludeTransform(TransformFlags.ArrowFunctionScopeExcludes);
                    markTransform(TransformFlags.ThisNodeIsES6ArrowFunction);
                    if (containsLexicalThis) {
                        markTransform(TransformFlags.ThisNodeCapturesLexicalThis);
                    }
                    break;
                    
                case SyntaxKind.BinaryExpression:
                    if ((<BinaryExpression>node).operatorToken.kind === SyntaxKind.EqualsToken
                        && ((<BinaryExpression>node).left.kind === SyntaxKind.ObjectLiteralExpression
                            || (<BinaryExpression>node).left.kind === SyntaxKind.ArrayLiteralExpression)) {
                        markTransform(TransformFlags.ThisNodeIsES6DestructuringAssignment);
                    }
                    break;
                    
                case SyntaxKind.TaggedTemplateExpression:
                    markTransform(TransformFlags.ThisNodeIsES6TaggedTemplateExpression);
                    break;
                
                case SyntaxKind.ThisKeyword:
                    markTransform(TransformFlags.ThisNodeIsThisKeyword);
                    break;
                    
                case SyntaxKind.SpreadElementExpression:
                    markTransform(TransformFlags.ThisNodeIsES6SpreadElement);
                    break;
                    
                case SyntaxKind.ShorthandPropertyAssignment:
                    markTransform(TransformFlags.ThisNodeIsES6ShorthandPropertyAssignment);
                    break;
                    
                case SyntaxKind.FunctionExpression:
                    containsCapturedThis = needsTransform(TransformFlags.ContainsCapturedThis); 
                    excludeTransform(TransformFlags.FunctionScopeExcludes);
                    if ((<FunctionExpression>node).asteriskToken) {
                        markTransform(TransformFlags.ThisNodeIsES6GeneratorFunction);
                    }
                    if (containsCapturedThis) {
                        markTransform(TransformFlags.ThisNodeNeedsToCaptureThis);
                    }
                    break;
                
                case SyntaxKind.FunctionDeclaration:
                    containsCapturedThis = needsTransform(TransformFlags.ContainsCapturedThis);
                    excludeTransform(TransformFlags.FunctionScopeExcludes);
                    if (node.parserContextFlags & ParserContextFlags.Yield) {
                        markTransform(TransformFlags.ThisNodeIsHoistedDeclarationInGenerator);
                    }
                    if (node.flags & NodeFlags.Export) {
                        markTransform(TransformFlags.ThisNodeIsES6Export);
                    }
                    if ((<FunctionDeclaration>node).asteriskToken) {
                        markTransform(TransformFlags.ThisNodeIsES6GeneratorFunction);
                    }
                    if (containsCapturedThis) {
                        markTransform(TransformFlags.ThisNodeNeedsToCaptureThis);
                    }
                    break;
                
                case SyntaxKind.Constructor:
                    containsCapturedThis = needsTransform(TransformFlags.ContainsCapturedThis); 
                    excludeTransform(TransformFlags.FunctionScopeExcludes);
                    markTransform(TransformFlags.ThisNodeIsES6ClassConstructor);
                    if (containsCapturedThis) {
                        markTransform(TransformFlags.ThisNodeNeedsToCaptureThis);
                    }
                    break;

                case SyntaxKind.MethodDeclaration:
                    containsCapturedThis = needsTransform(TransformFlags.ContainsCapturedThis); 
                    excludeTransform(TransformFlags.FunctionScopeExcludes);
                    markTransform(TransformFlags.ThisNodeIsES6Method);
                    if (containsCapturedThis) {
                        markTransform(TransformFlags.ThisNodeNeedsToCaptureThis);
                    }
                    break;

                case SyntaxKind.ForOfStatement:
                    markTransform(TransformFlags.ThisNodeIsES6ForOfStatement);
                    break;
                    
                case SyntaxKind.BreakStatement:
                case SyntaxKind.ContinueStatement:
                case SyntaxKind.ReturnStatement:
                    if (node.parserContextFlags & ParserContextFlags.Yield) {
                        markTransform(TransformFlags.ThisNodeIsCompletionStatementInGenerator);
                    }
                    break;
                    
                case SyntaxKind.ObjectBindingPattern:
                case SyntaxKind.ArrayBindingPattern:
                    markTransform(TransformFlags.ThisNodeIsES6BindingPattern);
                    break;
                
                case SyntaxKind.VariableDeclarationList:
                    if (node.parserContextFlags & ParserContextFlags.Yield) {
                        markTransform(TransformFlags.ThisNodeIsHoistedDeclarationInGenerator);
                    }
                    if (node.flags & (NodeFlags.Let | NodeFlags.Const)) {
                        markTransform(TransformFlags.ThisNodeIsES6LetOrConst);
                    }
                    break;
                
                case SyntaxKind.VariableStatement:
                    if (node.flags & NodeFlags.Export) {
                        markTransform(TransformFlags.ThisNodeIsES6Export);
                    }
                    break;
                
                case SyntaxKind.PropertyDeclaration:
                    markTransform(TransformFlags.ThisNodeIsTypeScriptPropertyDeclaration);
                    break;
                    
                case SyntaxKind.Decorator:
                    markTransform(TransformFlags.ThisNodeIsTypeScriptDecorator);
                    break;
                    
                case SyntaxKind.ClassDeclaration:
                    markTransform(TransformFlags.ThisNodeIsES6ClassDeclaration);
                    break;
                    
                case SyntaxKind.ClassExpression:
                    markTransform(TransformFlags.ThisNodeIsES6ClassExpression);
                    break;
                    
                case SyntaxKind.EnumDeclaration:
                    markTransform(TransformFlags.ThisNodeIsTypeScriptEnumDeclaration);
                    break;
                    
                case SyntaxKind.ImportEqualsDeclaration:
                    markTransform(TransformFlags.ThisNodeIsTypeScriptImportEqualsDeclaration);
                    break;
                    
                case SyntaxKind.ImportDeclaration:
                    markTransform(TransformFlags.ThisNodeIsES6ImportDeclaration);
                    break;
                    
                case SyntaxKind.ExportAssignment:
                    markTransform(TransformFlags.ThisNodeIsTypeScriptExportAssignmentDeclaration);
                    break;
                    
                case SyntaxKind.ExportDeclaration:
                    markTransform(TransformFlags.ThisNodeIsES6ExportDeclaration);
                    break;
            }
            
            node.transformFlags = transformFlags;
        }
    }
    
    function needsTransform(mask: TransformFlags) {
        return !!(transformFlags & mask);
    }
    
    function excludeTransform(mask: TransformFlags) {
        transformFlags &= ~mask;
    }
    
    function markTransform(flags: TransformFlags) {
        transformFlags |= flags;
    }
}