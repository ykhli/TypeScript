/// <reference path="../transform.ts" />
namespace ts.transform {
    interface GeneratedLabel extends LiteralExpression {
        label?: number;
    }
    
    // The kind of generated operation to be written
    export const enum OpCode {
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
    
    export class StatementBuilder extends Transformer {
        // phase 1 builder state
        private state: string;
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
        private hoistedDeclarations: Node[];
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

        protected resumeFromYield() {
            return factory.createCallExpression2(
				factory.createPropertyAccessExpression2(
					factory.createIdentifier(this.getState()), 
					factory.createIdentifier("sent")
				)
			);
        }
        
        protected writeLocation(location: TextRange): void {
            this.pendingLocation = location;
        }
        
        protected readLocation(): TextRange {
            let location = this.pendingLocation;
            this.pendingLocation = undefined;
            return location;
        }
        
        protected createUniqueIdentifier(baseName?: string): Identifier {
            let name = this.transformResolver.makeUniqueName(baseName);
            return factory.createIdentifier(name);
        }
        
        protected declareLocal(baseName?: string): Identifier {
            let local = this.createUniqueIdentifier(baseName);
            this.hoistVariable(local);
            return local;
        }
        
        protected hoistVariable(node: Identifier): void {
            if (!this.hoistedVariables) {
                this.hoistedVariables = [];
            }
            
            this.hoistedVariables.push(factory.createVariableDeclaration2(node));
        }
        
        protected hoistFunctionDeclaration(node: FunctionDeclaration): void {
            if (!this.hoistedDeclarations) {
                this.hoistedDeclarations = [];
            }
            
            this.hoistedDeclarations.push(node);
        }
        
        protected defineLabel(): number {
            if (!this.labels) {
                this.labels = [];
            }
            
            let label = this.nextLabelId++;
            this.labels[label] = -1;
            return label;
        }
        
        protected markLabel(label: number): void {
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
        
        protected beginWithBlock(expression: Identifier): void {
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
        
        protected endWithBlock(): void {
            Debug.assert(this.peekBlockKind() === BlockKind.With, "Unbalanced generated blocks.");
            let block = <WithBlock>this.endBlock();
            this.markLabel(block.endLabel);
        }
        
        protected beginExceptionBlock(): number {
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

        protected beginCatchBlock(variable: Identifier): void {
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

            let errorProperty = factory.createPropertyAccessExpression2(
                factory.createIdentifier(this.getState()), 
                factory.createIdentifier("error"));
            let assignExpression = factory.createBinaryExpression2(SyntaxKind.EqualsToken, variable, errorProperty);
            this.emit(OpCode.Statement, assignExpression);
            this.emit(OpCode.Nop);
        }
        
        protected beginFinallyBlock(): void {
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
        
        protected endExceptionBlock(): void {
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

        protected beginScriptContinueBlock(labelText: string[]): void {
            let block: ContinueBlock = {
                kind: BlockKind.ScriptContinue,
                labelText: labelText,
                breakLabel: -1,
                continueLabel: -1
            };
            this.beginBlock(block);
        }

        protected endScriptContinueBlock(): void {
            Debug.assert(this.peekBlockKind() === BlockKind.ScriptContinue, "Unbalanced generated blocks.");
            this.endBlock();
        }

        protected beginScriptBreakBlock(labelText: string[], requireLabel: boolean): void {
            let block: BreakBlock = {
                kind: BlockKind.ScriptBreak,
                labelText: labelText,
                breakLabel: -1,
                requireLabel
            };
            this.beginBlock(block);
        }

        protected endScriptBreakBlock(): void {
            Debug.assert(this.peekBlockKind() === BlockKind.ScriptBreak, "Unbalanced generated blocks.");
            this.endBlock();
        }

        protected beginContinueBlock(continueLabel: number, labelText: string[]): number {
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

        protected endContinueBlock(): void {
            Debug.assert(this.peekBlockKind() === BlockKind.Continue, "Unbalanced generated blocks.");
            let block = <BreakBlock>this.endBlock();
            let breakLabel = block.breakLabel;
            if (breakLabel > 0) {
                this.markLabel(breakLabel);
            }
        }

        protected beginBreakBlock(labelText: string[], requireLabel: boolean): number {
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

        protected endBreakBlock(): void {
            Debug.assert(this.peekBlockKind() === BlockKind.Break, "Unbalanced generated blocks.");
            let block = <BreakBlock>this.endBlock();
            let breakLabel = block.breakLabel;
            if (breakLabel > 0) {
                this.markLabel(breakLabel);
            }
        }
        
        protected findBreakTarget(labelText?: string): number {
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

        protected findContinueTarget(labelText?: string): number {
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
        
        protected emit(code: OpCode): void;
        protected emit(code: OpCode, label: number): void;
        protected emit(code: OpCode, label: number, condition: Expression): void;
        protected emit(code: OpCode, node: Statement): void;
        protected emit(code: OpCode, node: Expression): void;
        protected emit(code: OpCode, left: Expression, right: Expression): void;
        protected emit(code: OpCode, ...args: any[]): void {
            switch (code) {
                case OpCode.Nop:
                case OpCode.Assign:
                case OpCode.Statement:
                case OpCode.Throw:
                case OpCode.Break:
                case OpCode.BreakWhenFalse:
                case OpCode.BreakWhenTrue:
                case OpCode.Return:
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
        
        protected createLabelExpression(label: number): Expression {
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
        
        protected createInlineBreak(label: number): ReturnStatement {
            Debug.assert(label > 0, `Invalid label: ${label}`);
            let breakOpCode = factory.createNumericLiteral2(3, "break");
            let returnExpression = factory.createArrayLiteralExpression([
                breakOpCode, 
                this.createLabelExpression(label)
            ]);
            return factory.createReturnStatement(returnExpression);
        }
        
        protected createInlineReturn(expression: Expression): ReturnStatement {
            let returnOpCode = factory.createNumericLiteral2(2, "return");
            return factory.createReturnStatement(
                expression
                    ? factory.createArrayLiteralExpression([returnOpCode, expression])
                    : factory.createArrayLiteralExpression([returnOpCode])
            );
        }
        
        protected writeStatements(statements: Statement[]): void {
            if (this.hasProtectedRegions) {
                this.initializeProtectedRegions();
                this.hasProtectedRegions = false;
            }
            
            if (this.operations) {
                for (this.operationIndex = 0; this.operationIndex < this.operations.length; this.operationIndex++) {
                    this.writeOperation(
                        this.operations[this.operationIndex],
                        this.operationArguments[this.operationIndex],
                        this.operationLocations[this.operationIndex]);
                }
                
                this.operations = undefined;
                this.operationArguments = undefined;
                this.operationLocations = undefined;
            }
            
            this.flushFinalLabel();
            
            this.lastOperationWasAbrupt = false;
            this.lastOperationWasCompletion = false;            
            if (this.generatedLabels) {
                for (let generatedLabel of this.generatedLabels) {
                    generatedLabel.text = String(this.labelNumbers[generatedLabel.label]);
                }
                
                this.generatedLabels = undefined;
            }
            
            if (this.labels) {
                this.nextLabelId = 1;
                this.labels = undefined;
            }
            
            if (this.labelNumbers) {
                this.labelNumber = 0;
                this.labelNumbers = undefined;
            }
            
            if (this.blocks) {
                this.blockIndex = 0;
                this.blocks = undefined;
                this.blockStack = undefined;
                this.blockActions = undefined;
                this.blockOffsets = undefined;
            }
            
            this.exceptionBlockStack = undefined;
            this.currentExceptionBlock = undefined;
            this.withBlockStack = undefined;
            this.pendingLocation = undefined;
            
            if (this.caseClauses || this.currentStatements) {
                if (this.caseClauses) {
                    this.currentStatements = [
                        factory.createSwitchStatement(
                            factory.createPropertyAccessExpression2(
                                factory.createIdentifier(this.getState()),
                                factory.createIdentifier("label")
                            ),
                            factory.createCaseBlock(this.caseClauses)
                        )
                    ];
                    
                    this.state = undefined;
                    this.caseClauses = undefined;
                }
                
                statements.push(
                    factory.createReturnStatement(
                        factory.createCallExpression2(
                            factory.createIdentifier("__generator"),
                            [
                                factory.createFunctionExpression5(
                                    [
                                        factory.createParameter2(
                                            factory.createIdentifier(this.getState())
                                        )
                                    ],
                                    this.currentStatements
                                )
                            ]
                        )
                    )
                );

                this.currentStatements = undefined;
            }
            
            if (this.hoistedVariables) {
                statements.push(
                    factory.createVariableStatement(
                        factory.createVariableDeclarationList(this.hoistedVariables)
                    )
                )
                
                this.hoistedVariables = undefined;
            }
            
            if (this.hoistedDeclarations) {
                for (let declaration of this.hoistedDeclarations) {
                    statements.push(<Statement>declaration);
                }
                
                this.hoistedDeclarations = undefined;
            }
        }
        
        private initializeProtectedRegions(): void {
            let trysArray = factory.createArrayLiteralExpression([]);
            let assignTrys = factory.createBinaryExpression2(SyntaxKind.EqualsToken, 
                factory.createPropertyAccessExpression2(
				factory.createIdentifier(this.getState()), 
				factory.createIdentifier("trys")
			), trysArray);
            this.writeStatement(assignTrys);
            this.flushLabel();
        }

        private getState() {
            return this.state || (this.state = this.transformResolver.makeUniqueName("state"));
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
                    let pushMethod = factory.createPropertyAccessExpression2(
                        factory.createPropertyAccessExpression2(
            				factory.createIdentifier(this.getState()), 
            				factory.createIdentifier("trys")
            			), 
                        factory.createIdentifier("push"));
                    let callExpression = factory.createCallExpression2(pushMethod, [labelsArray]);
                    this.currentStatements.unshift(factory.createExpressionStatement(callExpression));
                    this.currentExceptionBlock = undefined;
                }
                if (markLabelEnd) {
                    let nextLabelNumberExpression = factory.createNumericLiteral(String(this.labelNumber + 1));
                    let labelAssign = factory.createBinaryExpression2(
                        SyntaxKind.EqualsToken, 
                        factory.createPropertyAccessExpression2(
                            factory.createIdentifier(this.getState()),
                            factory.createIdentifier("label")
                        ), 
                        nextLabelNumberExpression);
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
                        if (!this.currentStatements) {
                            this.currentStatements = [];
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
                    this.createInlineReturn(expression),
                    operationLocation
                )
            );
        }

        private writeBreak(label: number, operationLocation?: TextRange): void {
            this.lastOperationWasAbrupt = true;
            this.writeStatement(
                factory.setTextRange(
                    this.createInlineBreak(label),
                    operationLocation
                )
            );
        }

        private writeBreakWhenTrue(label: number, condition: Expression, operationLocation?: TextRange): void {
            this.writeStatement(
                factory.createIfStatement(
                    condition,
                    factory.setTextRange(
                        this.createInlineBreak(label),
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
                        this.createInlineBreak(label),
                        operationLocation
                    )
                )
            );
        }

        private writeYield(expression: Expression, operationLocation?: TextRange): void {
            let yieldOpCode = factory.createNumericLiteral2(4, "yield");
            this.lastOperationWasAbrupt = true;
            this.writeStatement(
                factory.setTextRange(
                    factory.createReturnStatement(
                        expression 
                            ? factory.createArrayLiteralExpression([yieldOpCode, expression])
                            : factory.createArrayLiteralExpression([yieldOpCode])
                    ),
                    operationLocation
                )
            );
        }
        
        private writeYieldStar(expression: Expression, operationLocation?: TextRange): void {
            let yieldStarOpCode = factory.createNumericLiteral2(5, "yieldstar");
            this.lastOperationWasAbrupt = true;
            this.writeStatement(
                factory.setTextRange(
                    factory.createReturnStatement(
                        factory.createArrayLiteralExpression([yieldStarOpCode, expression])
                    ),
                    operationLocation
                )
            );
        }

        private writeEndfinally(): void {
            let endFinallyOpCode = factory.createNumericLiteral2(7, "endfinally");
            this.lastOperationWasAbrupt = true;
            this.writeStatement(
                factory.createReturnStatement(
                    factory.createArrayLiteralExpression([endFinallyOpCode])
                )
            );
        }
    }
}