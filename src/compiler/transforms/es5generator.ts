/// <reference path="es5.ts" />

namespace ts.transform {
    interface GeneratedLabel extends LiteralExpression {
        label?: number;
    }
    
    // The kind of generated operation to be written
    const enum OpCode {
        Nop,                    // No operation, used to force a new case in the state machine
        Statement,              // A regular javascript statement
        Assign,                 // An assignment
        Break,                  // A break instruction used to jump to a label
        BreakWhenTrue,          // A break instruction used to jump to a label if a condition evaluates to true
        BreakWhenFalse,         // A break instruction used to jump to a label if a condition evaluates to false
        Yield,                  // A completion instruction for the `yield` keyword
        YieldStar,              // A completion instruction for the `yield*` keyword
        Return,                 // A completion instruction for the `return` keyword
        Throw,                  // A completion instruction for the `throw` keyword
        Endfinally              // Marks the end of a `finally` block
    }

    // Whether a generated code block is opening or closing at the current operation for a FunctionBuilder
    const enum BlockAction {
        Open,
        Close,
    }

    // The kind for a generated code block in a FunctionBuilder
    const enum BlockKind {
        Exception,
        ScriptBreak,
        Break,
        ScriptContinue,
        Continue,
        With
    }

    // The state for a generated code exception block
    const enum ExceptionBlockState {
        Try,
        Catch,
        Finally,
        Done
    }

    // A generated code block
    interface BlockScope {
        kind: BlockKind;
    }

    // A generated exception block, used for 'try' statements
    interface ExceptionBlock extends BlockScope {
        state: ExceptionBlockState;
        startLabel: number;
        catchVariable?: Identifier;
        catchLabel?: number;
        finallyLabel?: number;
        endLabel: number;
    }
    
    function isExceptionBlock(block: BlockScope): block is ExceptionBlock {
        return block && block.kind === BlockKind.Exception;
    }

    // A generated block that tracks the target for a 'break' statement, used for 'switch' and labeled statements
    interface BreakBlock extends BlockScope {
        breakLabel: number;
        labelText?: string[];
        requireLabel?: boolean;
    }
    
    function isBreakBlock(block: BlockScope): block is BreakBlock {
        return block && block.kind === BlockKind.Break;
    }
    
    function isScriptBreak(block: BlockScope): block is BreakBlock {
        return block && block.kind === BlockKind.ScriptBreak;
    }
    
    function supportsBreak(block: BlockScope): block is BreakBlock {
        return isBreakBlock(block)
            || isScriptBreak(block)
            || isContinueBlock(block)
            || isScriptContinueBlock(block);
    }
    
    // A generated block that tracks the targets for 'break' and 'continue' statements, used for iteration statements
    interface ContinueBlock extends BreakBlock {
        continueLabel: number;
    }

    function isContinueBlock(block: BlockScope): block is ContinueBlock {
        return block && block.kind === BlockKind.Continue;
    }
    
    function isScriptContinueBlock(block: BlockScope): block is ContinueBlock {
        return block && block.kind === BlockKind.ScriptContinue;
    }
    
    function supportsContinue(block: BlockScope): block is ContinueBlock {
        return isContinueBlock(block)
            || isScriptContinueBlock(block);
    }

    // A generated block associated with a 'with' statement
    interface WithBlock extends BlockScope {
        expression: Identifier;
        startLabel: number;
        endLabel: number;
    }

    function isWithBlock(block: BlockScope): block is WithBlock {
        return block && block.kind === BlockKind.With;
    }
    
    class ExpressionCacheControl implements TransformerCacheControl<Expression> {
        private transformer: ES5GeneratorBodyTransformer;
        
        constructor(transformer: ES5GeneratorBodyTransformer) {
            this.transformer = transformer;
        }
        
        public shouldCachePreviousNodes(node: Expression) {
            return needsTransform(node, TransformFlags.ContainsYield);
        }
        
        public cacheNode(node: Expression) {
            return this.transformer.cacheExpression(node);
        }
    }
    
    class ObjectLiteralElementCacheControl implements TransformerCacheControl<ObjectLiteralElement> {
        private transformer: ES5GeneratorBodyTransformer;
        
        constructor(transformer: ES5GeneratorBodyTransformer) {
            this.transformer = transformer;
        }
        
        public shouldCachePreviousNodes(node: ObjectLiteralElement) {
            return needsTransform(node, TransformFlags.ContainsYield);
        }
        
        public cacheNode(node: ObjectLiteralElement) {
            return this.transformer.cacheObjectLiteralElement(node);
        }
    }
    
    export class ES5GeneratorBodyTransformer extends Transformer {
        private removeMissingNodes: boolean = true;
        private expressionCacheControl: ExpressionCacheControl;
        private objectLiteralElementCacheControl: ObjectLiteralElementCacheControl;
        
        // generator phase 1 transform state
        private state: Identifier;
        private stateSent: LeftHandSideExpression;
        private stateLabel: LeftHandSideExpression;
        private stateTrys: LeftHandSideExpression;
        private nextOpCode: LiteralExpression;
        private throwOpCode: LiteralExpression;
        private returnOpCode: LiteralExpression;
        private breakOpCode: LiteralExpression;
        private yieldOpCode: LiteralExpression;
        private yieldStarOpCode: LiteralExpression;
        private catchOpCode: LiteralExpression;
        private endFinallyOpCode: LiteralExpression;
        private blocks: BlockScope[];
        private blockStack: BlockScope[];
        private blockActions: BlockAction[];
        private blockOffsets: number[];
        private hasProtectedRegions: boolean;
        private nextLabelId: number = 1;
        private labelNumbers: number[];
        private labels: number[];
        private operations: OpCode[];
        private operationArguments: any[][];
        private operationLocations: TextRange[];
        private hoistedVariables: VariableDeclaration[];
        private hoistedDeclarations: Declaration[];
        private generatedLabels: GeneratedLabel[];
        private pendingLocation: TextRange;
        
        // generator phase 2 transform state
        private operationIndex: number;
        private blockIndex: number = 0;
        private labelNumber: number = 0;
        private lastOperationWasAbrupt: boolean;
        private lastOperationWasCompletion: boolean;
        private caseClauses: CaseClause[] = [];
        private currentStatements: Statement[];
        private exceptionBlockStack: ExceptionBlock[];
        private currentExceptionBlock: ExceptionBlock;
        private withBlockStack: WithBlock[];

        public statements: Statement[];
        
        constructor(previous: Transformer, statements: Statement[]) {
            super(previous.transformResolver, previous);
            this.statements = statements;
            this.state = factory.createIdentifier(this.transformResolver.makeUniqueName("state"));
            this.stateSent = factory.createCallExpression2(factory.createPropertyAccessExpression2(this.state, factory.createIdentifier("sent")));
            this.stateLabel = factory.createPropertyAccessExpression2(this.state, factory.createIdentifier("label"));
            this.stateTrys = factory.createPropertyAccessExpression2(this.state, factory.createIdentifier("trys"));
            this.nextOpCode = factory.createNumericLiteral2(0, "next");
            this.throwOpCode = factory.createNumericLiteral2(1, "throw");
            this.returnOpCode = factory.createNumericLiteral2(2, "return");
            this.breakOpCode = factory.createNumericLiteral2(3, "break");
            this.yieldOpCode = factory.createNumericLiteral2(4, "yield");
            this.yieldStarOpCode = factory.createNumericLiteral2(5, "yieldstar");
            this.catchOpCode = factory.createNumericLiteral2(6, "catch");
            this.endFinallyOpCode = factory.createNumericLiteral2(7, "endfinally");
        }
        
        public transform(body: Block): void {
            debugPrintTransformFlags(body);
            
            let statementOffset = this.statements.length;

            // Phase 1 - Translate the body of the generator function into labels and operations
            this.rewriteBlock(body);
            
            // Phase 2 - Write the operations as statements of the generator body 
            this.writeBodyStatements();

            // Insert the call to __generator
            this.statements.splice(statementOffset, 0,
                factory.createReturnStatement(
                    factory.createCallExpression2(
                        factory.createIdentifier("__generator"),
                        [
                            factory.createFunctionExpression5(
                                [factory.createParameter2(this.state)],
                                this.currentStatements
                            )
                        ]
                    )
                )
            );
        }
        
        public shouldTransformNode(node: Node) {
            return needsTransform(node, TransformFlags.ThisNodeNeedsTransformForES5Generator);
        }
        
        public shouldTransformChildrenOfNode(node: Node) {
            return needsTransform(node, TransformFlags.SubtreeNeedsTransformForES5Generator)
                && !isFunctionLike(node);
        }
        
        public transformNode(node: Node): Node {
            console.log(`transformNode: ${(<any>ts).SyntaxKind[node.kind]}`);
            switch (node.kind) {
                case SyntaxKind.BinaryExpression:
                    return this.transformBinaryExpression(<BinaryExpression>node);
                case SyntaxKind.ConditionalExpression:
                    return this.transformConditionalExpression(<ConditionalExpression>node);
                case SyntaxKind.YieldExpression:
                    return this.transformYieldExpression(<YieldExpression>node);
                case SyntaxKind.ArrayLiteralExpression:
                    return this.transformArrayLiteralExpression(<ArrayLiteralExpression>node);
                case SyntaxKind.ObjectLiteralExpression:
                    return this.transformObjectLiteralExpression(<ObjectLiteralExpression>node);
                case SyntaxKind.ElementAccessExpression:
                    return this.transformElementAccessExpression(<ElementAccessExpression>node);
                case SyntaxKind.CallExpression:
                    return this.transformCallExpression(<CallExpression>node);
                case SyntaxKind.NewExpression:
                    return this.transformNewExpression(<NewExpression>node);
                case SyntaxKind.TaggedTemplateExpression:
                    return this.transformTaggedTemplateExpression(<TaggedTemplateExpression>node);
                case SyntaxKind.TemplateExpression:
                    return this.transformTemplateExpression(<TemplateExpression>node);
                case SyntaxKind.ParenthesizedExpression:
                    return this.transformParenthesizedExpression(<ParenthesizedExpression>node);
                case SyntaxKind.VariableStatement:
                    return this.transformVariableStatement(<VariableStatement>node);
                case SyntaxKind.IfStatement:
                    return this.transformIfStatement(<IfStatement>node);
                case SyntaxKind.DoStatement:
                    return this.transformDoStatement(<DoStatement>node);
                case SyntaxKind.WhileStatement:
                    return this.transformWhileStatement(<WhileStatement>node);
                case SyntaxKind.ForStatement:
                    return this.transformForStatement(<ForStatement>node);
                case SyntaxKind.ForInStatement:
                    return this.transformForInStatement(<ForInStatement>node);
                case SyntaxKind.ContinueStatement:
                    return this.transformContinueStatement(<BreakOrContinueStatement>node);
                case SyntaxKind.BreakStatement:
                    return this.transformBreakStatement(<BreakOrContinueStatement>node);
                case SyntaxKind.ReturnStatement:
                    return this.transformReturnStatement(<ReturnStatement>node);
                case SyntaxKind.WithStatement:
                    return this.transformWithStatement(<WithStatement>node);
                case SyntaxKind.SwitchStatement:
                    return this.transformSwitchStatement(<SwitchStatement>node);
                case SyntaxKind.LabeledStatement:
                    return this.transformLabeledStatement(<LabeledStatement>node);
                case SyntaxKind.TryStatement:
                    return this.transformTryStatement(<TryStatement>node);
                case SyntaxKind.FunctionDeclaration:
                    return this.transformFunctionDeclaration(<FunctionDeclaration>node);
                default:
                    return super.transformNode(node);
            }
        }
        
        private rewriteBlockOrStatement(node: Statement) {
            if (!node) {
                return;
            }
            
            switch (node.kind) {
                case SyntaxKind.Block:
                    this.rewriteBlock(<Block>node);
                    break;
                    
                default:
                    this.rewriteStatement(node);
                    break;
            }
        }

        private rewriteBlock(node: Block): void {
            if (!node) {
                return;
            }
            
            this.rewriteStatements(node.statements);
        }
        
        private rewriteStatements(statements: Statement[]): void {
            for (let statement of statements) {
                this.rewriteStatement(statement);
            }
        }
        
        private rewriteStatement(node: Statement): void {
            if (!node) {
                return;
            }
            
            switch (node.kind) {
                case SyntaxKind.Block:
                    if (node.transformFlags & TransformFlags.ContainsYield) {
                        this.rewriteBlock(<Block>node);
                        return;
                    }
                    break;
                case SyntaxKind.ReturnStatement:
                    this.rewriteReturnStatement(<ReturnStatement>node);
                    return;
                case SyntaxKind.ThrowStatement:
                    this.rewriteThrowStatement(<ThrowStatement>node);
                    return;
                case SyntaxKind.BreakStatement:
                    this.rewriteBreakStatement(<BreakOrContinueStatement>node);
                    return;
                case SyntaxKind.ContinueStatement:
                    this.rewriteContinueStatement(<BreakOrContinueStatement>node);
                    return;
            }
            
            let visited = visit(node, this);
            if (visited) {
                this.writeLocation(node);
                this.emit(OpCode.Statement, visited);
            }
        }
        
        private rewriteThrowStatement(node: ThrowStatement): void {
            let expression = visit(node.expression, this);
            this.writeLocation(node);
            this.emit(OpCode.Throw, expression);
        }
        
        private rewriteReturnStatement(node: ReturnStatement): void {
            let expression = visit(node.expression, this);
            this.writeLocation(node);
            this.emit(OpCode.Return, expression);
        }
        
        private rewriteBreakStatement(node: BreakOrContinueStatement): void {
            let label = this.findBreakTarget(node.label ? node.label.text : undefined);
            Debug.assert(label > 0, "Expected break statement to point to a label.");
            this.writeLocation(node);
            this.emit(OpCode.Break, label);
        }

        private rewriteContinueStatement(node: BreakOrContinueStatement): void {
            let label = this.findContinueTarget(node.label ? node.label.text : undefined);
            Debug.assert(label > 0, "Expected continue statement to point to a label.");
            this.writeLocation(node);
            this.emit(OpCode.Break, label);
        }

        private transformBinaryExpression(node: BinaryExpression): Expression {
            if (isLogicalBinaryOperator(node.operatorToken.kind)) {
                if (needsTransform(node, TransformFlags.ContainsYield)) {
                    return this.transformLogicalBinaryExpression(node);
                }
            }
            else if (isDestructuringAssignment(node)) {
                return this.transformDestructuringAssignment(node);
            }
            else if (isAssignmentOperator(node.operatorToken.kind)) {
                if (needsTransform(node, TransformFlags.ContainsYield)) {
                    return this.transformAssignmentExpression(node);
                }
            }
            else if (node.operatorToken.kind === SyntaxKind.CommaToken) {
                return this.transformCommaExpression(node);
            }
            else if (needsTransform(node, TransformFlags.ContainsYield)) {
                return factory.updateBinaryExpression(
                    node,
                    this.cacheExpression(visit(node.left, this)),
                    visit(node.right, this)
                );
            }

            return <Expression>super.transformNode(node);
        }
        
        private transformLogicalBinaryExpression(node: BinaryExpression) {
            let resumeLabel = this.defineLabel();
            let result = this.declareLocal();
            let code = node.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken 
                ? OpCode.BreakWhenFalse 
                : OpCode.BreakWhenTrue;
            this.writeLocation(node.left);
            this.emit(OpCode.Assign, result, visit(node.left, this));
            this.emit(code, resumeLabel, result);
            this.writeLocation(node.right);
            this.emit(OpCode.Assign, result, visit(node.right, this));
            this.markLabel(resumeLabel);
            return result;
        }
        
        private transformCommaExpression(node: BinaryExpression) {
            let expressions = this.flattenCommaExpression(node);
            let merged: Expression;
            for (let expression of expressions) {
                if (needsTransform(expression, TransformFlags.ContainsYield) && merged) {
                    this.emit(OpCode.Statement, factory.createExpressionStatement(merged));
                    merged = undefined;
                }
                
                let visited = visit(expression, this);
                if (merged) {
                    merged = factory.createBinaryExpression2(
                        SyntaxKind.CommaToken,
                        merged,
                        visited);
                }
                else {
                    merged = visited;
                }
            }
            
            return merged;
        }

        private flattenCommaExpression(node: BinaryExpression): Expression[] {
            let expressions: Expression[] = [];
            function visitExpression(node: Expression): void {
                if (isBinaryExpression(node) 
                    && node.operatorToken.kind === SyntaxKind.CommaToken) {
                    visitExpression(node.left);
                    visitExpression(node.right);
                }
                else {
                    expressions.push(node);
                }
            }
            visitExpression(node);
            return expressions;
        }
        
        private transformDestructuringAssignment(node: BinaryExpression): Expression {
            let destructured = visit(node, this.previous);
            let rewritten = visit(destructured, this);
            if (needsParenthesisForPropertyAccessOrInvocation(node)) {
                return factory.makeLeftHandSideExpression(rewritten);
            }
            return rewritten;
        }

        private transformAssignmentExpression(node: BinaryExpression): Expression {
            return factory.updateBinaryExpression(
                node,
                this.transformLeftHandSideOfAssignmentExpression(node.left),
                visit(node.right, this));
        }

        private transformLeftHandSideOfAssignmentExpression(node: Expression): Expression {
            switch (node.kind) {
                case SyntaxKind.ElementAccessExpression:
                    return this.transformLeftHandSideElementAccessExpressionOfAssignmentExpression(<ElementAccessExpression>node);

                case SyntaxKind.PropertyAccessExpression:
                    return this.transformLeftHandSidePropertyAccessExpressionOfAssignmentExpression(<PropertyAccessExpression>node);

                default:
                    return super.transformNode(node);
            }
        }

        private transformLeftHandSideElementAccessExpressionOfAssignmentExpression(node: ElementAccessExpression): ElementAccessExpression {
            return factory.updateElementAccessExpression(
                node,
                this.cacheExpression(visit(node.expression, this)),
                this.cacheExpression(visit(node.argumentExpression, this)));
        }

        private transformLeftHandSidePropertyAccessExpressionOfAssignmentExpression(node: PropertyAccessExpression): PropertyAccessExpression {
            return factory.updatePropertyAccessExpression(
                node,
                this.cacheExpression(visit(node.expression, this)),
                node.name);
        }

        // function rewriteLeftHandSideOfCallExpression(node: Expression, state: RewriterState): CallBinding {
        //     switch (node.kind) {
        //         case SyntaxKind.PropertyAccessExpression:
        //             return rewriteLeftHandSidePropertyAccessExpressionOfCallExpression(<PropertyAccessExpression>node, state);

        //         case SyntaxKind.ElementAccessExpression:
        //             return rewriteLeftHandSideElementAccessExpressionOfCallExpression(<ElementAccessExpression>node, state);

        //         default:
        //             return { target: cacheExpression(Visitor.visit(node, visitNode, state), state) };
        //     }
        // }

        // function rewriteLeftHandSideElementAccessExpressionOfCallExpression(node: ElementAccessExpression, state: RewriterState): CallBinding {
        //     var builder = state.builder;
        //     var thisArg = cacheExpression(Visitor.visit(node.expression, visitNode, state), state);
        //     var target = GeneratorFunctionBuilder.declareLocal(builder);
        //     var index = Visitor.visit(node.argumentExpression, visitNode, state);
        //     var indexedAccess = Factory.createElementAccessExpression(thisArg, index, node);
        //     var assignExpression = Factory.createBinaryExpression(SyntaxKind.EqualsToken, target, indexedAccess);
        //     GeneratorFunctionBuilder.writeLocation(builder, node);
        //     GeneratorFunctionBuilder.emit(builder, OpCode.Statement, Factory.createExpressionStatement(assignExpression));
        //     return { target, thisArg };
        // }

        // function rewriteLeftHandSidePropertyAccessExpressionOfCallExpression(node: PropertyAccessExpression, state: RewriterState): CallBinding {
        //     var builder = state.builder;
        //     var thisArg = cacheExpression(Visitor.visit(node.expression, visitNode, state), state);
        //     var target = GeneratorFunctionBuilder.declareLocal(builder);
        //     var property = Factory.createIdentifier(node.name.text);
        //     var propertyAccess = Factory.createPropertyAccessExpression(thisArg, property, node);
        //     var assignExpression = Factory.createBinaryExpression(SyntaxKind.EqualsToken, target, propertyAccess);
        //     GeneratorFunctionBuilder.writeLocation(builder, node);
        //     GeneratorFunctionBuilder.emit(builder, OpCode.Statement, Factory.createExpressionStatement(assignExpression));
        //     return { target, thisArg };
        // }
        
        private transformConditionalExpression(node: ConditionalExpression): Expression {
            if (!this.containsYield(node.whenTrue) && !this.containsYield(node.whenFalse)) {
                return super.transformNode(node);
            }
            
            let whenFalseLabel = this.defineLabel();
            let resumeLabel = this.defineLabel();
            let result = this.declareLocal();
            this.emit(OpCode.BreakWhenFalse, whenFalseLabel, visit(node.condition, this));
            this.writeLocation(node.whenTrue);
            this.emit(OpCode.Assign, result, visit(node.whenTrue, this));
            this.emit(OpCode.Break, resumeLabel);
            this.markLabel(whenFalseLabel);
            this.writeLocation(node.whenFalse);
            this.emit(OpCode.Assign, result, visit(node.whenFalse, this));
            this.markLabel(resumeLabel);
            return result;
        }

        private transformYieldExpression(node: YieldExpression): Expression {
            let expression = visit(node.expression, this);
            let resumeLabel = this.defineLabel();
            this.writeLocation(node);
            this.emit(node.asteriskToken ? OpCode.YieldStar : OpCode.Yield, expression);
            this.markLabel(resumeLabel);
            return this.stateSent;
        }

        private transformArrayLiteralExpression(node: ArrayLiteralExpression): LeftHandSideExpression {
            // if (needsTransform(node, TransformFlags.ContainsSpreadElement)) {
            //     let rewritten = visit(node, new SpreadElementTransformer(this.transformResolver));
            //     return visit(rewritten, this);
            // }
            
            return factory.updateArrayLiteralExpression(
                node,
                visitNodes(node.elements, this, this.getExpressionCachingTransform())
            );
        }

        private transformObjectLiteralExpression(node: ObjectLiteralExpression): LeftHandSideExpression {
            // return factory.updateObjectLiteralExpression(
            //     node,
            //     visitNodes(
            //         node.properties,
                    
            //     )
            // )
            // if (hasAwaitOrYield(node)) {
            //     return Factory.updateObjectLiteralExpression(node, Visitor.visitNodes(node.properties, visitNode, state, hasAwaitOrYield, cacheObjectLiteralElement));
            // }
            return super.transformNode(node);
        }

        private transformElementAccessExpression(node: ElementAccessExpression): LeftHandSideExpression {
            // if (hasAwaitOrYield(node.argumentExpression)) {
            //     var object = cacheExpression(Visitor.visit(node.expression, visitNode, state), state);
            //     return Factory.updateElementAccessExpression(node, object, Visitor.visit(node.argumentExpression, visitNode, state));
            // }
            return super.transformNode(node);
        }

        private transformCallExpression(node: CallExpression): LeftHandSideExpression {
            // if (hasAwaitOrYield(node)) {
            //     var binding = rewriteLeftHandSideOfCallExpression(node.expression, state);
            //     var arguments = Visitor.visitNodes(node.arguments, visitNode, state, hasAwaitOrYield, cacheExpression);
            //     var target = binding.target;
            //     var thisArg = binding.thisArg;
            //     if (thisArg) {
            //         var callArguments: NodeArray<Expression> = Factory.createNodeArray([<Expression>thisArg].concat(arguments), node.arguments);
            //         var callProperty = Factory.createPropertyAccessExpression(target, Factory.createIdentifier("call"));
            //         return Factory.updateCallExpression(node, callProperty, callArguments);
            //     } else {
            //         return Factory.updateCallExpression(node, target, arguments);
            //     }
            // }
            return super.transformNode(node);
        }

        private transformNewExpression(node: NewExpression): LeftHandSideExpression {
            // if (hasAwaitOrYield(node)) {
            //     return Factory.updateNewExpression(
            //         node,
            //         cacheExpression(Visitor.visit(node.expression, visitNode, state), state),
            //         Visitor.visitNodes(node.arguments, visitNode, state, hasAwaitOrYield, cacheExpression));
            // }
            return super.transformNode(node);
        }

        private transformTaggedTemplateExpression(node: TaggedTemplateExpression): LeftHandSideExpression {
            // if (hasAwaitOrYield(node.template)) {
            //     return Factory.updateTaggedTemplateExpression(
            //         node,
            //         cacheExpression(Visitor.visit(node.tag, visitNode, state), state),
            //         Visitor.visit(node.template, visitNode, state));
            // }
            return super.transformNode(node);
        }

        private transformTemplateExpression(node: TemplateExpression): TemplateExpression {
            // if (hasAwaitOrYield(node)) {
            //     return Factory.updateTemplateExpression(
            //         node,
            //         node.head,
            //         Visitor.visitNodes(node.templateSpans, visitNode, state, hasAwaitOrYield, cacheTemplateSpan));
            // }
            return super.transformNode(node);
        }

        private transformParenthesizedExpression(node: ParenthesizedExpression): LeftHandSideExpression {
            // if (hasAwaitOrYield(node)) {
            //     return rewriteParenthesizedExpression(node, state);
            // }
            return super.transformNode(node);
        }

        private transformFunctionDeclaration(node: FunctionDeclaration): FunctionDeclaration {
            this.statements.push(visit(node, this.previous));
            return;
        }

        private transformVariableStatement(node: VariableStatement): Statement {
            this.transformVariableDeclarationList(node.declarationList);
            return undefined;
        }

        private transformVariableDeclarationList(node: VariableDeclarationList) {
            let declarations = node.declarations;
            for (let declaration of declarations) {
                this.transformVariableDeclaration(declaration);
            }
        }

        private transformVariableDeclaration(node: VariableDeclaration) {
            let name = node.name;
            if (isBindingPattern(name)) {
                // var declarations = BindingElementRewriter.rewrite(<BindingElement>node, state.locals);
                // var result = rewriteVariableDeclarations(node, declarations, state);
                // rewriteExpression(result, state);
                // return;               
            }
            else {
                this.hoistVariable(factory.cloneIdentifier(name));
                let initializer = visit(node.initializer, this);
                if (initializer) {
                    this.writeLocation(node);
                    this.emit(OpCode.Assign, name, initializer);
                }
            }
        }

        private transformVariableDeclarationListOrExpression(node: VariableDeclarationList | Expression): VariableDeclarationList | Expression {
            // if (node.kind === SyntaxKind.VariableDeclarationList) {
            //     return rewriteVariableDeclarationList(<VariableDeclarationList>node, state);
            // }
            return super.transformNode(node);
        }

        private transformIfStatement(node: IfStatement): Statement {
            // if (hasAwaitOrYield(node.thenStatement) || hasAwaitOrYield(node.elseStatement)) {
            //     rewriteIfStatement(node, state);
            //     return;
            // }
            return super.transformNode(node);
        }

        private transformDoStatement(node: DoStatement): Statement {
            // if (hasAwaitOrYield(node)) {
            //     rewriteDoStatement(node, state);
            //     return;
            // }

            // var { builder } = state;
            // GeneratorFunctionBuilder.beginScriptContinueBlock(state.builder, getLabelNames(node));
            // node = Visitor.fallback(node, visitNode, state);
            
            // GeneratorFunctionBuilder.endScriptContinueBlock(builder);
            // return node;
            return super.transformNode(node);
        }

        private transformWhileStatement(node: WhileStatement): WhileStatement {
            // if (hasAwaitOrYield(node)) {
            //     rewriteWhileStatement(node, state);
            //     return;
            // }

            // var { builder } = state;
            // GeneratorFunctionBuilder.beginScriptContinueBlock(builder, getLabelNames(node));
            // node = Visitor.fallback(node, visitNode, state);
            // GeneratorFunctionBuilder.endScriptContinueBlock(builder);
            // return node;
            return super.transformNode(node);
        }

        private transformForStatement(node: ForStatement): ForStatement {
            // if (hasAwaitOrYield(node.condition) || hasAwaitOrYield(node.iterator) || hasAwaitOrYield(node.statement)) {
            //     rewriteForStatement(node, state);
            //     return;
            // }

            // var { builder } = state;
            // GeneratorFunctionBuilder.beginScriptContinueBlock(builder, getLabelNames(node));
            // node = Factory.updateForStatement(
            //     node,
            //     Visitor.visit(node.initializer, visitVariableDeclarationListOrExpression, state),
            //     Visitor.visit(node.condition, visitNode, state),
            //     Visitor.visit(node.iterator, visitNode, state),
            //     Visitor.visit(node.statement, visitNode, state));
            // GeneratorFunctionBuilder.endScriptContinueBlock(builder);
            // return node;
            return super.transformNode(node);
        }

        private transformForInStatement(node: ForInStatement): ForInStatement {
            // if (hasAwaitOrYield(node.statement)) {
            //     rewriteForInStatement(node, state);
            //     return;
            // }

            // var { builder } = state;
            // GeneratorFunctionBuilder.beginScriptContinueBlock(builder, getLabelNames(node));
            // node = Factory.updateForInStatement(
            //     node,
            //     Visitor.visit(node.initializer, visitVariableDeclarationListOrExpression, state),
            //     Visitor.visit(node.expression, visitNode, state),
            //     Visitor.visit(node.statement, visitNode, state));
            // GeneratorFunctionBuilder.endScriptContinueBlock(builder);
            // return node;
            return super.transformNode(node);
        }

        private transformBreakStatement(node: BreakOrContinueStatement): Statement {
            // var label = GeneratorFunctionBuilder.findBreakTarget(state.builder, node.label && node.label.text);
            // if (label > 0) {
            //     GeneratorFunctionBuilder.writeLocation(state.builder, node);
            //     return GeneratorFunctionBuilder.createInlineBreak(state.builder, label);
            // }
            return super.transformNode(node);
        }

        private transformContinueStatement(node: BreakOrContinueStatement): Statement {
            // var label = GeneratorFunctionBuilder.findContinueTarget(state.builder, node.label && node.label.text);
            // if (label > 0) {
            //     GeneratorFunctionBuilder.writeLocation(state.builder, node);
            //     return GeneratorFunctionBuilder.createInlineBreak(state.builder, label);
            // }
            return super.transformNode(node);
        }

        private transformReturnStatement(node: ReturnStatement): Statement {
            // var expression = Visitor.visit(node.expression, visitNode, state);
            // GeneratorFunctionBuilder.writeLocation(state.builder, node);
            // return GeneratorFunctionBuilder.createInlineReturn(state.builder, expression);
            return super.transformNode(node);
        }

        private transformSwitchStatement(node: SwitchStatement): Statement {
            // if (forEach(node.clauses, hasAwaitOrYield)) {
            //     rewriteSwitchStatement(node, state);
            //     return;
            // }

            // var { builder } = state;
            // GeneratorFunctionBuilder.beginScriptBreakBlock(builder, getLabelNames(node), /*requireLabel*/ false);
            // node = Visitor.fallback(node, visitNode, state);
            // GeneratorFunctionBuilder.endScriptBreakBlock(builder);
            // return node;
            return super.transformNode(node);
        }

        private transformWithStatement(node: WithStatement): Statement {
            // if (hasAwaitOrYield(node.statement)) {
            //     rewriteWithStatement(node, state);
            //     return;
            // }
            // return Visitor.fallback(node, visitNode, state);
            return super.transformNode(node);
        }

        private transformLabeledStatement(node: LabeledStatement): Statement {
            // if (hasAwaitOrYield(node.statement)) {
            //     rewriteLabeledStatement(node, state);
            //     return;
            // }

            // var { builder } = state;
            // GeneratorFunctionBuilder.beginScriptBreakBlock(builder, getLabelNames(node), /*requireLabel*/ true);
            // node = Visitor.fallback(node, visitNode, state);
            // GeneratorFunctionBuilder.endScriptBreakBlock(builder);
            // return node;
            return super.transformNode(node);
        }

        private transformTryStatement(node: TryStatement): TryStatement {
            // if (hasAwaitOrYield(node)) {
            //     rewriteTryStatement(node, state);
            //     return;
            // }
            // return Visitor.fallback(node, visitNode, state);
            return super.transformNode(node);
        }
        
        private containsYield(node: Node) {
            return needsTransform(node, TransformFlags.ContainsYield);
        }

        // expression caching
        // @internal
        public cacheExpression(node: Expression): Identifier {
            let local = this.declareLocal();
            this.emit(OpCode.Assign, local, node);
            return local;
        }
        
        // @internal
        public cacheObjectLiteralElement(node: ObjectLiteralElement) {
            return node;
        }

        // function cacheObjectLiteralElement(node: ObjectLiteralElement, state: RewriterState): ObjectLiteralElement {
        //     switch (node.kind) {
        //         case SyntaxKind.PropertyAssignment:
        //             return cachePropertyAssignment(<PropertyAssignment>node, state);

        //         case SyntaxKind.ShorthandPropertyAssignment:
        //             return cacheShorthandPropertyAssignment(<ShorthandPropertyAssignment>node, state);

        //         default:
        //             return node;
        //     }
        // }

        // function cachePropertyAssignment(node: PropertyAssignment, state: RewriterState): ObjectLiteralElement {
        //     return Factory.updatePropertyAssignment(node, node.name, cacheExpression(node.initializer, state));
        // }

        // function cacheShorthandPropertyAssignment(node: ShorthandPropertyAssignment, state: RewriterState): ObjectLiteralElement {
        //     return Factory.createPropertyAssignment(Factory.createIdentifier(node.name.text), cacheExpression(node.name, state));
        // }

        // function cacheTemplateSpan(node: TemplateSpan, state: RewriterState): TemplateSpan {
        //     return Factory.updateTemplateSpan(node, cacheExpression(node.expression, state), node.literal);
        // }

        // function rewriteVariableDeclarations(parent: Node, declarations: VariableDeclaration[], state: RewriterState): Expression {
        //     var builder = state.builder;
        //     var mergedAssignment: Expression;
        //     for (var i = 0; i < declarations.length; i++) {
        //         var node = declarations[i];
        //         if (hasAwaitOrYield(node)) {
        //             if (mergedAssignment) {
        //                 GeneratorFunctionBuilder.emit(builder, OpCode.Statement, Factory.createExpressionStatement(mergedAssignment));
        //                 mergedAssignment = undefined;
        //             }
        //         }
        //         var rewritten = rewriteVariableDeclaration(node, state);
        //         if (rewritten) {
        //             if (mergedAssignment) {
        //                 mergedAssignment = Factory.createBinaryExpression(
        //                     SyntaxKind.CommaToken,
        //                     mergedAssignment,
        //                     rewritten);
        //             }
        //             else {
        //                 mergedAssignment = rewritten;
        //             }
        //         }
        //     }
        //     if (parent.kind === SyntaxKind.VariableDeclarationList && parent.parent.kind === SyntaxKind.ForInStatement) {
        //         if (mergedAssignment) {
        //             GeneratorFunctionBuilder.emit(builder, OpCode.Statement, Factory.createExpressionStatement(mergedAssignment));
        //             mergedAssignment = undefined;
        //         }

        //         var declaration = declarations[0];
        //         return <Identifier>declaration.name;
        //     }
        //     return mergedAssignment;
        // }        

        // function rewriteParenthesizedExpression(node: ParenthesizedExpression, state: RewriterState): LeftHandSideExpression {
        //     var expression = Visitor.visit(node.expression, visitNode, state);
        //     return Factory.makeLeftHandSideExpression(expression);
        // }

        // function rewriteExpressionStatement(node: ExpressionStatement, state: RewriterState): void {
        //     var builder = state.builder;
        //     var expression = Visitor.visit(node.expression, visitNode, state);
        //     if (!isAwaitOrYield(node.expression)) {
        //         GeneratorFunctionBuilder.writeLocation(builder, node);
        //         GeneratorFunctionBuilder.emit(builder, OpCode.Statement, expression);
        //     }
        // }

        // function rewriteIfStatement(node: IfStatement, state: RewriterState): void {
        //     var builder = state.builder;
        //     var resumeLabel = GeneratorFunctionBuilder.defineLabel(builder);
        //     if (node.elseStatement) {
        //         var elseLabel = GeneratorFunctionBuilder.defineLabel(builder);
        //     }
        //     GeneratorFunctionBuilder.emit(builder, OpCode.BreakWhenFalse, elseLabel || resumeLabel, Visitor.visit(node.expression, visitNode, state));
        //     rewriteBlockOrStatement(node.thenStatement, state);
        //     if (node.elseStatement) {
        //         GeneratorFunctionBuilder.emit(builder, OpCode.Break, resumeLabel);
        //         GeneratorFunctionBuilder.markLabel(builder, elseLabel);
        //         rewriteBlockOrStatement(node.elseStatement, state);
        //     }
        //     GeneratorFunctionBuilder.markLabel(builder, resumeLabel);
        // }

        // function rewriteDoStatement(node: DoStatement, state: RewriterState): void {
        //     var builder = state.builder;
        //     var bodyLabel = GeneratorFunctionBuilder.defineLabel(builder);
        //     var conditionLabel = GeneratorFunctionBuilder.defineLabel(builder);
        //     var endLabel = GeneratorFunctionBuilder.beginContinueBlock(builder, conditionLabel, getLabelNames(node));
        //     GeneratorFunctionBuilder.markLabel(builder, bodyLabel);
        //     rewriteBlockOrStatement(node.statement, state);
        //     GeneratorFunctionBuilder.markLabel(builder, conditionLabel);
        //     GeneratorFunctionBuilder.emit(builder, OpCode.BreakWhenTrue, bodyLabel, Visitor.visit(node.expression, visitNode, state));
        //     GeneratorFunctionBuilder.endContinueBlock(builder);
        // }

        // function rewriteWhileStatement(node: WhileStatement, state: RewriterState): void {
        //     var builder = state.builder;
        //     var conditionLabel = GeneratorFunctionBuilder.defineLabel(builder);
        //     var bodyLabel = GeneratorFunctionBuilder.defineLabel(builder);
        //     var endLabel = GeneratorFunctionBuilder.beginContinueBlock(builder, conditionLabel, getLabelNames(node));
        //     GeneratorFunctionBuilder.markLabel(builder, conditionLabel);
        //     GeneratorFunctionBuilder.emit(builder, OpCode.BreakWhenFalse, endLabel, Visitor.visit(node.expression, visitNode, state));
        //     rewriteBlockOrStatement(node.statement, state);
        //     GeneratorFunctionBuilder.emit(builder, OpCode.Break, conditionLabel);
        //     GeneratorFunctionBuilder.endContinueBlock(builder);
        // }

        // function rewriteForStatement(node: ForStatement, state: RewriterState): void {
        //     var builder = state.builder;
        //     var conditionLabel = GeneratorFunctionBuilder.defineLabel(builder);
        //     var iteratorLabel = GeneratorFunctionBuilder.defineLabel(builder);
        //     var endLabel = GeneratorFunctionBuilder.beginContinueBlock(builder, iteratorLabel, getLabelNames(node));
        //     if (node.initializer) {
        //         var initializer = <Expression>visitVariableDeclarationListOrExpression(node.initializer, state);
        //         GeneratorFunctionBuilder.writeLocation(builder, node.initializer);
        //         GeneratorFunctionBuilder.emit(builder, OpCode.Statement, Factory.createExpressionStatement(initializer));
        //     }
        //     GeneratorFunctionBuilder.markLabel(builder, conditionLabel);
        //     if (node.condition) {
        //         GeneratorFunctionBuilder.emit(builder, OpCode.BreakWhenFalse, endLabel, Visitor.visit(node.condition, visitNode, state));
        //     }
        //     rewriteBlockOrStatement(node.statement, state);
        //     GeneratorFunctionBuilder.markLabel(builder, iteratorLabel);
        //     if (node.iterator) {
        //         GeneratorFunctionBuilder.emit(builder, OpCode.Statement, Factory.createExpressionStatement(Visitor.visit(node.iterator, visitNode, state)));
        //     }
        //     GeneratorFunctionBuilder.emit(builder, OpCode.Break, conditionLabel);
        //     GeneratorFunctionBuilder.endContinueBlock(builder);
        // }

        // function rewriteForInStatement(node: ForInStatement, state: RewriterState): void {
        //     var builder = state.builder;
        //     var variable = <Expression>visitVariableDeclarationListOrExpression(node.initializer, state);
        //     while (variable.kind === SyntaxKind.BinaryExpression) {
        //         variable = (<BinaryExpression>variable).left;
        //     }
        //     var keysLocal = GeneratorFunctionBuilder.declareLocal(builder);
        //     var tempLocal = GeneratorFunctionBuilder.declareLocal(builder);
        //     var conditionLabel = GeneratorFunctionBuilder.defineLabel(builder);
        //     var iteratorLabel = GeneratorFunctionBuilder.defineLabel(builder);
        //     var endLabel = GeneratorFunctionBuilder.beginContinueBlock(builder, iteratorLabel, getLabelNames(node));
        //     var initializeKeysExpression = Factory.createBinaryExpression(SyntaxKind.EqualsToken, keysLocal, Factory.createArrayLiteralExpression([]));
        //     GeneratorFunctionBuilder.emit(builder, OpCode.Statement, Factory.createExpressionStatement(initializeKeysExpression));
        //     var keysLengthExpression = Factory.createPropertyAccessExpression(keysLocal, Factory.createIdentifier("length"));
        //     var keysPushExpression = Factory.createElementAccessExpression(keysLocal, keysLengthExpression);
        //     var assignKeyExpression = Factory.createBinaryExpression(SyntaxKind.EqualsToken, keysPushExpression, tempLocal);
        //     var assignKeyStatement = Factory.createExpressionStatement(assignKeyExpression);
        //     var expression = cacheExpression(Factory.makeLeftHandSideExpression(Visitor.visit(node.expression, visitNode, state)), state);
        //     var forTempInExpressionStatement = Factory.createForInStatement(tempLocal, expression, assignKeyStatement);
        //     GeneratorFunctionBuilder.emit(builder, OpCode.Statement, forTempInExpressionStatement);
        //     var initializeTempExpression = Factory.createBinaryExpression(SyntaxKind.EqualsToken, tempLocal, Factory.createNumericLiteral(0));
        //     GeneratorFunctionBuilder.emit(builder, OpCode.Statement, Factory.createExpressionStatement(initializeTempExpression));
        //     var conditionExpression = Factory.createBinaryExpression(SyntaxKind.LessThanToken, tempLocal, keysLengthExpression);
        //     GeneratorFunctionBuilder.markLabel(builder, conditionLabel);
        //     GeneratorFunctionBuilder.emit(builder, OpCode.BreakWhenFalse, endLabel, conditionExpression);
        //     var readKeyExpression = Factory.createElementAccessExpression(keysLocal, tempLocal);
        //     var hasKeyExpression = Factory.createBinaryExpression(SyntaxKind.InKeyword, readKeyExpression, expression);
        //     GeneratorFunctionBuilder.emit(builder, OpCode.BreakWhenFalse, iteratorLabel, hasKeyExpression);
        //     var assignVariableExpression = Factory.createBinaryExpression(SyntaxKind.EqualsToken, variable, readKeyExpression);
        //     GeneratorFunctionBuilder.writeLocation(builder, node.initializer);
        //     GeneratorFunctionBuilder.emit(builder, OpCode.Statement, Factory.createExpressionStatement(assignVariableExpression, variable));
        //     rewriteBlockOrStatement(node.statement, state);
        //     GeneratorFunctionBuilder.markLabel(builder, iteratorLabel);
        //     var incrementTempExpression = Factory.createPostfixUnaryExpression(SyntaxKind.PlusPlusToken, tempLocal);
        //     GeneratorFunctionBuilder.writeLocation(builder, node.initializer);
        //     GeneratorFunctionBuilder.emit(builder, OpCode.Statement, Factory.createExpressionStatement(incrementTempExpression, variable));
        //     GeneratorFunctionBuilder.emit(builder, OpCode.Break, conditionLabel);
        //     GeneratorFunctionBuilder.endContinueBlock(builder);
        // }

        // function rewriteSwitchStatement(node: SwitchStatement, state: RewriterState): void {
        //     var builder = state.builder;
        //     var defaultClauseIndex: number = -1;
        //     var endLabel = GeneratorFunctionBuilder.beginBreakBlock(builder, getLabelNames(node), /*requireLabel*/ false);

        //     // map clauses to labels
        //     var clauseHasStatements: boolean[] = [];
        //     var clauseLabelMap: number[] = [];
        //     var clauseLabels: Label[] = [endLabel];
        //     for (var clauseIndex = node.clauses.length - 1; clauseIndex >= 0; clauseIndex--) {
        //         var clause = node.clauses[clauseIndex];
        //         if (clause.kind === SyntaxKind.DefaultClause) {
        //             if (defaultClauseIndex === -1) {
        //                 defaultClauseIndex = clauseIndex;
        //             }
        //         }
        //         clauseHasStatements[clauseIndex] = !!(clause.statements && clause.statements.length);
        //         if (clauseHasStatements[clauseIndex]) {
        //             clauseLabelMap[clauseIndex] = clauseLabels.length;
        //             clauseLabels.push(GeneratorFunctionBuilder.defineLabel(builder));
        //         } else {
        //             clauseLabelMap[clauseIndex] = clauseLabels.length - 1;
        //         }
        //     }

        //     var expression = cacheExpression(Visitor.visit(node.expression, visitNode, state), state);

        //     // emit switch cases (but not statements)                
        //     var lastClauseOffset = 0;
        //     for (var clauseIndex = 0; clauseIndex < node.clauses.length; clauseIndex++) {
        //         var clause = node.clauses[clauseIndex];
        //         if (clause.kind === SyntaxKind.CaseClause) {
        //             var caseClause = <CaseClause>clause;
        //             if (hasAwaitOrYield(caseClause.expression)) {
        //                 emitPartialSwitchStatement();
        //                 lastClauseOffset = clauseIndex;
        //             }
        //         }
        //     }

        //     emitPartialSwitchStatement();

        //     // emit default case (if any, but not statements)
        //     if (defaultClauseIndex > -1) {
        //         var defaultClauseLabel = clauseLabels[clauseLabelMap[defaultClauseIndex]];
        //         GeneratorFunctionBuilder.writeLocation(builder, node.clauses[defaultClauseIndex]);
        //         GeneratorFunctionBuilder.emit(builder, OpCode.Break, defaultClauseLabel);
        //     } else {
        //         GeneratorFunctionBuilder.emit(builder, OpCode.Break, endLabel);
        //     }

        //     // emit switch states and statements
        //     for (var clauseIndex = 0; clauseIndex < node.clauses.length; clauseIndex++) {
        //         if (!clauseHasStatements[clauseIndex]) {
        //             continue;
        //         }
        //         var clause = node.clauses[clauseIndex];
        //         var clauseLabel = clauseLabels[clauseLabelMap[clauseIndex]];
        //         GeneratorFunctionBuilder.markLabel(builder, clauseLabel);
        //         rewriteStatements(clause.statements, state);
        //     }

        //     GeneratorFunctionBuilder.endBreakBlock(builder);

        //     function emitPartialSwitchStatement(): void {
        //         var clauses: CaseOrDefaultClause[] = [];
        //         if (lastClauseOffset < clauseIndex) {
        //             var clause = node.clauses[lastClauseOffset];
        //             if (clause.kind === SyntaxKind.CaseClause) {
        //                 var caseClause = <CaseClause>clause;
        //                 if (hasAwaitOrYield(caseClause.expression)) {
        //                     var clauseExpression = Visitor.visit(caseClause.expression, visitNode, state);
        //                     var clauseLabel = clauseLabels[clauseLabelMap[lastClauseOffset]];
        //                     GeneratorFunctionBuilder.writeLocation(builder, caseClause.expression);
        //                     var breakStatement = GeneratorFunctionBuilder.createInlineBreak(builder, clauseLabel);
        //                     clauses.push(Factory.createCaseClause(clauseExpression, [breakStatement]));
        //                     lastClauseOffset++;
        //                 }
        //             }
        //         }

        //         while (lastClauseOffset < clauseIndex) {
        //             var clause = node.clauses[lastClauseOffset];
        //             var clauseLabel = clauseLabels[clauseLabelMap[lastClauseOffset]];
        //             if (clause.kind === SyntaxKind.CaseClause) {
        //                 var caseClause = <CaseClause>clause;
        //                 GeneratorFunctionBuilder.writeLocation(builder, caseClause.expression);
        //                 var inlineBreak = GeneratorFunctionBuilder.createInlineBreak(builder, clauseLabel);
        //                 clauses.push(Factory.createCaseClause(Visitor.visit(caseClause.expression, visitNode, state), [inlineBreak]));
        //             }
        //             lastClauseOffset++;
        //         }

        //         if (clauses.length) {
        //             var switchStatement = Factory.createSwitchStatement(expression, clauses, node);
        //             GeneratorFunctionBuilder.emit(builder, OpCode.Statement, switchStatement);
        //         }
        //     }
        // }

        // function rewriteWithStatement(node: WithStatement, state: RewriterState): void {
        //     var builder = state.builder;
        //     GeneratorFunctionBuilder.beginWithBlock(builder, cacheExpression(Visitor.visit(node.expression, visitNode, state), state));
        //     rewriteBlockOrStatement(node.statement, state);
        //     GeneratorFunctionBuilder.endWithBlock(builder);
        // }

        // function rewriteLabeledStatement(node: LabeledStatement, state: RewriterState): void {
        //     var builder = state.builder;
        //     if (!isLabeledOrIterationOrSwitchStatement(node.statement)) {
        //         GeneratorFunctionBuilder.beginBreakBlock(builder, getLabelNames(node), /*requireLabel*/ true);
        //     }
        //     rewriteBlockOrStatement(node.statement, state);
        //     if (!isLabeledOrIterationOrSwitchStatement(node.statement)) {
        //         GeneratorFunctionBuilder.endBreakBlock(builder);
        //     }
        // }

        // function rewriteTryStatement(node: TryStatement, state: RewriterState): void {
        //     var builder = state.builder;
        //     var endLabel = GeneratorFunctionBuilder.beginExceptionBlock(builder);
        //     rewriteBlock(node.tryBlock, state);
        //     if (node.catchClause) {
        //         var variable = GeneratorFunctionBuilder.declareLocal(builder, /*name*/ undefined, /*globallyUnique*/ true);
                
        //         // rename the symbol for the catch clause
        //         if (node.catchClause.symbol) {
        //             state.locals.resolver.renameSymbol(node.catchClause.symbol, variable.text);
        //         }

        //         GeneratorFunctionBuilder.beginCatchBlock(builder, variable);
        //         rewriteBlock(node.catchClause.block, state);
        //     }
        //     if (node.finallyBlock) {
        //         GeneratorFunctionBuilder.beginFinallyBlock(builder);
        //         rewriteBlock(node.finallyBlock, state);
        //     }
        //     GeneratorFunctionBuilder.endExceptionBlock(builder);
        // }
        
        private getExpressionCachingTransform(): ExpressionCacheControl {
            return this.expressionCacheControl 
                || (this.expressionCacheControl = new ExpressionCacheControl(this));
        }

        private writeLocation(location: TextRange): void {
            this.pendingLocation = location;
        }
        
        private readLocation(): TextRange {
            let location = this.pendingLocation;
            this.pendingLocation = undefined;
            return location;
        }
        
        private createUniqueIdentifier(baseName?: string): Identifier {
            let name = this.transformResolver.makeUniqueName(baseName);
            return factory.createIdentifier(name);
        }
        
        private declareLocal(baseName?: string): Identifier {
            let local = this.createUniqueIdentifier(baseName);
            this.hoistVariable(local);
            return local;
        }
        
        private hoistVariable(node: Identifier): void {
            if (!this.hoistedVariables) {
                this.hoistedVariables = [];
                this.statements.push(
                    factory.createVariableStatement(
                        factory.createVariableDeclarationList(this.hoistedVariables)
                    )
                );
            }
            
            this.hoistedVariables.push(factory.createVariableDeclaration2(node));
        }
        
        private hoistFunctionDeclaration(node: FunctionDeclaration): void {
            if (!this.hoistedDeclarations) {
                this.hoistedDeclarations = [];
            }
            
            this.hoistedDeclarations.push(node);
        }
        
        private defineLabel(): number {
            if (!this.labels) {
                this.labels = [];
            }
            
            let label = this.nextLabelId++;
            this.labels[label] = -1;
            return label;
        }
        
        private markLabel(label: number): void {
            Debug.assert(!!this.labels, "No labels were defined.");
            this.labels[label] = this.operations ? this.operations.length : 0;
        }
        
        private beginBlock(block: BlockScope): number {
            if (!this.blocks) {
                this.blocks = [];
                this.blockActions = [];
                this.blockOffsets = [];
                this.blockStack = [];
            }
            
            let blockActionIndex = this.blockActions.length;
            this.blockActions[blockActionIndex] = BlockAction.Open;
            this.blockOffsets[blockActionIndex] = this.operations ? this.operations.length : 0;
            this.blocks[blockActionIndex] = block;
            this.blockStack.push(block);
            return blockActionIndex;
        }
        
        private endBlock(): BlockScope {
            Debug.assert(!!this.blocks, "beginBlock was never called.");
            let block = this.blockStack.pop();
            let blockActionIndex = this.blockActions.length;
            this.blockActions[blockActionIndex] = BlockAction.Close;
            this.blockOffsets[blockActionIndex] = this.operations ? this.operations.length : 0;
            this.blocks[blockActionIndex] = block;
            return block;
        }
        
        private peekBlock(): BlockScope {
            if (this.blockStack) {
                return this.blockStack[this.blockStack.length - 1];
            }
            
            return undefined;
        }
        
        private peekBlockKind(): BlockKind {
            let block = this.peekBlock();
            return block ? block.kind : undefined;
        }
        
        private beginWithBlock(expression: Identifier): void {
            let startLabel = this.defineLabel();
            let endLabel = this.defineLabel();
            let block: WithBlock = {
                kind: BlockKind.With,
                expression,
                startLabel,
                endLabel
            };
            this.markLabel(startLabel);
            this.beginBlock(block);
        }
        
        private endWithBlock(): void {
            Debug.assert(this.peekBlockKind() === BlockKind.With, "Unbalanced generated blocks.");
            let block = <WithBlock>this.endBlock();
            this.markLabel(block.endLabel);
        }
        
        private beginExceptionBlock(): number {
            let startLabel = this.defineLabel();
            let endLabel = this.defineLabel();
            let block: ExceptionBlock = {
                kind: BlockKind.Exception,
                state: ExceptionBlockState.Try,
                startLabel,
                endLabel
            };
            this.markLabel(startLabel);
            this.emit(OpCode.Nop);
            this.hasProtectedRegions = true;
            return endLabel;
        }

        private beginCatchBlock(variable: Identifier): void {
            Debug.assert(this.peekBlockKind() === BlockKind.Exception, "Incorrect generated block.");

            let block = <ExceptionBlock>this.peekBlock();
            Debug.assert(block.state < ExceptionBlockState.Catch, "Wrong order of exception block clauses.");

            let endLabel = block.endLabel;
            this.emit(OpCode.Break, endLabel);

            let catchLabel = this.defineLabel();
            this.markLabel(catchLabel);
            block.state = ExceptionBlockState.Catch;
            block.catchVariable = variable;
            block.catchLabel = catchLabel;

            let errorProperty = factory.createPropertyAccessExpression2(this.state, factory.createIdentifier("error"));
            let assignExpression = factory.createBinaryExpression2(SyntaxKind.EqualsToken, variable, errorProperty);
            this.emit(OpCode.Statement, assignExpression);
            this.emit(OpCode.Nop);
        }
        
        private beginFinallyBlock(): void {
            Debug.assert(this.peekBlockKind() === BlockKind.Exception, "Incorrect generated block.");

            let block = <ExceptionBlock>this.peekBlock();
            Debug.assert(block.state < ExceptionBlockState.Finally, "Wrong order of exception block clauses.");

            let endLabel = block.endLabel;
            this.emit(OpCode.Break, endLabel);

            let finallyLabel = this.defineLabel();
            this.markLabel(finallyLabel);
            block.state = ExceptionBlockState.Finally;
            block.finallyLabel = finallyLabel;
        }
        
        private endExceptionBlock(): void {
            Debug.assert(this.peekBlockKind() === BlockKind.Exception, "Unbalanced generated blocks.");
            let block = <ExceptionBlock>this.endBlock();
            let state = block.state;
            if (state < ExceptionBlockState.Finally) {
                this.emit(OpCode.Break, block.endLabel);
            }
            else {
                this.emit(OpCode.Endfinally);
            }

            this.markLabel(block.endLabel);
            block.state = ExceptionBlockState.Done;
        }

        private beginScriptContinueBlock(labelText: string[]): void {
            let block: ContinueBlock = {
                kind: BlockKind.ScriptContinue,
                labelText: labelText,
                breakLabel: -1,
                continueLabel: -1
            };
            this.beginBlock(block);
        }

        private endScriptContinueBlock(): void {
            Debug.assert(this.peekBlockKind() === BlockKind.ScriptContinue, "Unbalanced generated blocks.");
            this.endBlock();
        }

        private beginScriptBreakBlock(labelText: string[], requireLabel: boolean): void {
            let block: BreakBlock = {
                kind: BlockKind.ScriptBreak,
                labelText: labelText,
                breakLabel: -1,
                requireLabel
            };
            this.beginBlock(block);
        }

        private endScriptBreakBlock(): void {
            Debug.assert(this.peekBlockKind() === BlockKind.ScriptBreak, "Unbalanced generated blocks.");
            this.endBlock();
        }

        private beginContinueBlock(continueLabel: number, labelText: string[]): number {
            let breakLabel = this.defineLabel();
            let block: ContinueBlock = {
                kind: BlockKind.Continue,
                labelText: labelText,
                breakLabel: breakLabel,
                continueLabel: continueLabel
            };
            this.beginBlock(block);
            return breakLabel;
        }

        private endContinueBlock(): void {
            Debug.assert(this.peekBlockKind() === BlockKind.Continue, "Unbalanced generated blocks.");
            let block = <BreakBlock>this.endBlock();
            let breakLabel = block.breakLabel;
            if (breakLabel > 0) {
                this.markLabel(breakLabel);
            }
        }

        private beginBreakBlock(labelText: string[], requireLabel: boolean): number {
            let breakLabel = this.defineLabel();
            let block: BreakBlock = {
                kind: BlockKind.Break,
                labelText: labelText,
                breakLabel: breakLabel,
                requireLabel
            };
            this.beginBlock(block);
            return breakLabel;
        }

        private endBreakBlock(): void {
            Debug.assert(this.peekBlockKind() === BlockKind.Break, "Unbalanced generated blocks.");
            let block = <BreakBlock>this.endBlock();
            let breakLabel = block.breakLabel;
            if (breakLabel > 0) {
                this.markLabel(breakLabel);
            }
        }
        
        private findBreakTarget(labelText?: string): number {
            if (this.blocks) {
                for (let i = this.blockStack.length - 1; i >= 0; i--) {
                    let block = this.blockStack[i];
                    if (supportsBreak(block)) {
                        if ((!labelText && !block.requireLabel) || block.labelText && block.labelText.indexOf(labelText) !== -1) {
                            return block.breakLabel;
                        }
                    }
                }
            }
            
            return undefined;
        }

        private findContinueTarget(labelText?: string): number {
            if (this.blocks) {
                for (let i = this.blockStack.length - 1; i >= 0; i--) {
                    let block = this.blockStack[i];
                    if (supportsContinue(block)) {
                        if (!labelText || block.labelText && block.labelText.indexOf(labelText) !== -1) {
                            return block.continueLabel;
                        }
                    }
                }
            }
            
            return undefined;
        }
        
        private emit(code: OpCode): void;
        private emit(code: OpCode, label: number): void;
        private emit(code: OpCode, label: number, condition: Expression): void;
        private emit(code: OpCode, node: Statement): void;
        private emit(code: OpCode, node: Expression): void;
        private emit(code: OpCode, left: Expression, right: Expression): void;
        private emit(code: OpCode, ...args: any[]): void {
            switch (code) {
                case OpCode.Break:
                case OpCode.BreakWhenFalse:
                case OpCode.BreakWhenTrue:
                case OpCode.Nop:
                case OpCode.Assign:
                case OpCode.Statement:
                case OpCode.Return:
                case OpCode.Throw:
                case OpCode.Endfinally:
                case OpCode.Yield:
                    break;

                default:
                    Debug.fail("Unexpected OpCode.");
                    return;
            }

            if (code === OpCode.Statement) {
                var node = args[0];
                if (!node) {
                    return;
                }
            }

            if (!this.operations) {
                this.operations = [];
                this.operationArguments = [];
                this.operationLocations = [];
            }

            if (!this.labels) {
                // mark entry point
                this.markLabel(this.defineLabel());
            }

            let location = this.readLocation();
            let operationIndex = this.operations.length;
            this.operations[operationIndex] = code;
            this.operationArguments[operationIndex] = args;
            this.operationLocations[operationIndex] = location;
        }
        
        private createLabelExpression(label: number): Expression {
            if (label > 0) {
                let labelExpression = <GeneratedLabel>factory.createNumericLiteral();
                labelExpression.label = label;
                if (!this.generatedLabels) {
                    this.generatedLabels = [];
                }
                
                this.generatedLabels.push(labelExpression);
                return labelExpression;
            }
            
            return factory.createOmittedExpression();
        }
        
        private createInlineBreak(label: number): ReturnStatement {
            Debug.assert(label > 0, `Invalid label: ${label}`);
            let returnExpression = factory.createArrayLiteralExpression([this.breakOpCode, this.createLabelExpression(label)]);
            return factory.createReturnStatement(returnExpression);
        }
        
        private createInlineReturn(expression: Expression): ReturnStatement {
            return factory.createReturnStatement(
                expression
                    ? factory.createArrayLiteralExpression([this.returnOpCode, expression])
                    : factory.createArrayLiteralExpression([this.returnOpCode])
            );
        }
        
        private writeBodyStatements(): void {
            if (this.hasProtectedRegions) {
                this.initializeProtectedRegions();
            }
            
            if (this.operations) {
                for (this.operationIndex = 0; this.operationIndex < this.operations.length; this.operationIndex++) {
                    this.writeOperation(
                        this.operations[this.operationIndex],
                        this.operationArguments[this.operationIndex],
                        this.operationLocations[this.operationIndex]);
                }
            }
            
            this.flushFinalLabel();
            
            if (this.caseClauses) {
                this.currentStatements = [
                    factory.createSwitchStatement(
                        this.stateLabel,
                        factory.createCaseBlock(this.caseClauses)
                    )
                ];
            }
        }
        
        private initializeProtectedRegions(): void {
            let trysArray = factory.createArrayLiteralExpression([]);
            let assignTrys = factory.createBinaryExpression2(SyntaxKind.EqualsToken, this.stateTrys, trysArray);
            this.writeStatement(assignTrys);
            this.flushLabel();
        }

        private flushLabel(): void {
            if (!this.currentStatements) {
                return;
            }

            this.appendLabel(/*markLabelEnd*/ !this.lastOperationWasAbrupt);
            this.lastOperationWasAbrupt = false;
            this.lastOperationWasCompletion = false;
            this.labelNumber++;
        }

        private flushFinalLabel(): void {
            if (!this.lastOperationWasCompletion) {
                this.tryEnterLabel();
                this.writeReturn();
            }

            if (this.currentStatements && this.caseClauses) {
                this.appendLabel(/*markLabelEnd*/ false);
            }
        }
        
        private appendLabel(markLabelEnd: boolean): void {
            if (!this.caseClauses) {
                this.caseClauses = [];
            }

            if (this.currentStatements) {
                if (this.withBlockStack) {
                    for (var i = this.withBlockStack.length - 1; i >= 0; i--) {
                        let withBlock = this.withBlockStack[i];
                        this.currentStatements = [
                            factory.createWithStatement(withBlock.expression, factory.createBlock(this.currentStatements))
                        ];
                    }
                }
                if (this.currentExceptionBlock) {
                    let { startLabel, catchLabel, finallyLabel, endLabel } = this.currentExceptionBlock;
                    let labelsArray = factory.createArrayLiteralExpression([
                        this.createLabelExpression(startLabel),
                        this.createLabelExpression(catchLabel),
                        this.createLabelExpression(finallyLabel),
                        this.createLabelExpression(endLabel)
                    ]);
                    let pushMethod = factory.createPropertyAccessExpression2(this.stateTrys, factory.createIdentifier("push"));
                    let callExpression = factory.createCallExpression2(pushMethod, [labelsArray]);
                    this.currentStatements.unshift(factory.createExpressionStatement(callExpression));
                    this.currentExceptionBlock = undefined;
                }
                if (markLabelEnd) {
                    let nextLabelNumberExpression = factory.createNumericLiteral(String(this.labelNumber + 1));
                    let labelAssign = factory.createBinaryExpression2(SyntaxKind.EqualsToken, this.stateLabel, nextLabelNumberExpression);
                    this.currentStatements.push(factory.createExpressionStatement(labelAssign));
                }
            }

            let labelNumberExpression = factory.createNumericLiteral(String(this.labelNumber));
            let clause = factory.createCaseClause(labelNumberExpression, this.currentStatements || []);
            this.caseClauses.push(clause);
            this.currentStatements = undefined;
        }

        private tryEnterLabel(): void {
            if (!this.labels) {
                return;
            }

            for (let label = 0; label < this.labels.length; label++) {
                if (this.labels[label] === this.operationIndex) {
                    this.flushLabel();
                    if (!this.labelNumbers) {
                        this.labelNumbers = [];
                    }
                    
                    this.labelNumbers[label] = this.labelNumber;
                }
            }
        }

        private tryEnterOrLeaveBlock(): void {
            if (this.blocks) {
                for (; this.blockIndex < this.blockActions.length && this.blockOffsets[this.blockIndex] <= this.operationIndex; this.blockIndex++) {
                    let block = this.blocks[this.blockIndex];
                    let blockAction = this.blockActions[this.blockIndex];
                    if (blockAction === BlockAction.Open && isExceptionBlock(block)) {
                        if (!this.exceptionBlockStack) {
                            this.exceptionBlockStack = [];
                        }
                        if (!this.statements) {
                            this.statements = [];
                        }
                        this.exceptionBlockStack.push(this.currentExceptionBlock);
                        this.currentExceptionBlock = block;
                    }
                    else if (blockAction === BlockAction.Close && isExceptionBlock(block)) {
                        this.currentExceptionBlock = this.exceptionBlockStack.pop();
                    }
                    else if (blockAction === BlockAction.Open && isWithBlock(block)) {
                        if (!this.withBlockStack) {
                            this.withBlockStack = [];
                        }
                        this.withBlockStack.push(block);
                    }
                    else if (blockAction === BlockAction.Close && isWithBlock(block)) {
                        this.withBlockStack.pop();
                    }
                }
            }
        }

        // operations
        private writeOperation(operation: OpCode, operationArguments: any[], operationLocation: TextRange): void {
            this.tryEnterLabel();
            this.tryEnterOrLeaveBlock();

            // early termination, nothing else to process in this label
            if (this.lastOperationWasAbrupt) {
                return;
            }

            this.lastOperationWasAbrupt = false;
            this.lastOperationWasCompletion = false;
            switch (operation) {
                case OpCode.Nop: 
                    return;
                case OpCode.Statement: 
                    return this.writeStatement(operationArguments[0]);
                case OpCode.Assign: 
                    return this.writeAssign(operationArguments[0], operationArguments[1], operationLocation);
                case OpCode.Break: 
                    return this.writeBreak(operationArguments[0], operationLocation);
                case OpCode.BreakWhenTrue: 
                    return this.writeBreakWhenTrue(operationArguments[0], operationArguments[1], operationLocation);
                case OpCode.BreakWhenFalse: 
                    return this.writeBreakWhenFalse(operationArguments[0], operationArguments[1], operationLocation);
                case OpCode.Yield: 
                    return this.writeYield(operationArguments[0], operationLocation);
                case OpCode.YieldStar:
                    return this.writeYieldStar(operationArguments[0], operationLocation)
                case OpCode.Return: 
                    return this.writeReturn(operationArguments[0], operationLocation);
                case OpCode.Throw: 
                    return this.writeThrow(operationArguments[0], operationLocation);
                case OpCode.Endfinally: 
                    return this.writeEndfinally();
            }
        }

        private writeStatement(node: Node): void {
            if (isExpression(node)) {
                node = factory.createExpressionStatement(<Expression>node);
            }
            
            if (!this.currentStatements) {
                this.currentStatements = [];
            }
            
            this.currentStatements.push(<Statement>node);
        }

        private writeAssign(left: Expression, right: Expression, operationLocation?: TextRange): void {
            this.writeStatement(
                factory.createExpressionStatement(
                    factory.setTextRange(
                        factory.createBinaryExpression2(SyntaxKind.EqualsToken, left, right),
                        operationLocation
                    )
                )
            );
        }

        private writeThrow(expression: Expression, operationLocation?: TextRange): void {
            this.lastOperationWasAbrupt = true;
            this.lastOperationWasCompletion = true;
            this.writeStatement(
                factory.setTextRange(
                    factory.createThrowStatement(expression),
                    operationLocation
                )
            );
        }

        private writeReturn(expression?: Expression, operationLocation?: TextRange): void {
            this.lastOperationWasAbrupt = true;
            this.lastOperationWasCompletion = true;
            this.writeStatement(
                factory.setTextRange(
                    factory.createReturnStatement(
                        expression 
                            ? factory.createArrayLiteralExpression([this.returnOpCode, expression]) 
                            : factory.createArrayLiteralExpression([this.returnOpCode])
                    ),
                    operationLocation
                )
            );
        }

        private writeBreak(label: number, operationLocation?: TextRange): void {
            this.lastOperationWasAbrupt = true;
            this.writeStatement(
                factory.setTextRange(
                    factory.createReturnStatement(
                        factory.createArrayLiteralExpression([
                            this.breakOpCode,
                            this.createLabelExpression(label)
                        ])
                    ),
                    operationLocation
                )
            );
        }

        private writeBreakWhenTrue(label: number, condition: Expression, operationLocation?: TextRange): void {
            this.writeStatement(
                factory.createIfStatement(
                    condition,
                    factory.setTextRange(
                        factory.createReturnStatement(
                            factory.createArrayLiteralExpression([
                                this.breakOpCode,
                                this.createLabelExpression(label)
                            ])
                        ),
                        operationLocation
                    )
                )
            );
        }

        private writeBreakWhenFalse(label: number, condition: Expression, operationLocation?: TextRange): void {
            this.writeStatement(
                factory.createIfStatement(
                    factory.createPrefixUnaryExpression(
                        SyntaxKind.ExclamationToken,
                        factory.createParenthesizedExpression(condition)
                    ),
                    factory.setTextRange(
                        factory.createReturnStatement(
                            factory.createArrayLiteralExpression([
                                this.breakOpCode,
                                this.createLabelExpression(label)
                            ])
                        ),
                        operationLocation
                    )
                )
            );
        }

        private writeYield(expression: Expression, operationLocation?: TextRange): void {
            this.lastOperationWasAbrupt = true;
            this.writeStatement(
                factory.setTextRange(
                    factory.createReturnStatement(
                        expression 
                            ? factory.createArrayLiteralExpression([this.yieldOpCode, expression])
                            : factory.createArrayLiteralExpression([this.yieldOpCode])
                    ),
                    operationLocation
                )
            );
        }
        
        private writeYieldStar(expression: Expression, operationLocation?: TextRange): void {
            this.lastOperationWasAbrupt = true;
            this.writeStatement(
                factory.setTextRange(
                    factory.createReturnStatement(
                        factory.createArrayLiteralExpression([this.yieldStarOpCode, expression])
                    ),
                    operationLocation
                )
            );
        }

        private writeEndfinally(): void {
            this.lastOperationWasAbrupt = true;
            this.writeStatement(
                factory.createReturnStatement(
                    factory.createArrayLiteralExpression([this.endFinallyOpCode])
                )
            );
        }
    }
}