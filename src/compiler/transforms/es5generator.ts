/// <reference path="es5.ts" />

namespace ts.transform {
    const enum OpCode {
        Statement,              // A regular javascript statement
        Assign,                 // An assignment
        Break,                  // A break instruction used to jump to a label
        BrTrue,                 // A break instruction used to jump to a label if a condition evaluates to true
        BrFalse,                // A break instruction used to jump to a label if a condition evaluates to false
        Yield,                  // A completion instruction for the `yield` keyword
        YieldStar,              // A completion instruction for the `yield*` keyword
        Return,                 // A completion instruction for the `return` keyword
        Throw,                  // A completion instruction for the `throw` keyword
        Endfinally              // Marks the end of a `finally` block
    }

    enum BlockAction {
        Open,
        Close,
    }

    enum BlockKind {
        Exception,
        ScriptBreak,
        Break,
        ScriptContinue,
        Continue
    }

    enum ExceptionBlockState {
        Try,
        Catch,
        Finally,
        Done
    }

    interface BlockScope {
        kind: BlockKind;
    }

    interface ExceptionBlock extends BlockScope {
        state: ExceptionBlockState;
        startLabel: number;
        catchVariable?: Identifier;
        catchLabel?: number;
        finallyLabel?: number;
        endLabel: number;
    }

    interface BreakBlock extends BlockScope {
        breakLabel: number;
        labelText?: string[];
        requireLabel?: boolean;
    }

    interface ContinueBlock extends BreakBlock {
        continueLabel: number;
    }
    
    export class ES5GeneratorBodyTransformer extends ES5Transformer {
        public statements: Statement[];

        // // generator phase 1 transform state
        // generatorState?: Identifier;
        // generatorBlocks?: BlockScope[];
        // generatorBlockStack?: BlockScope[];
        // generatorBlockActions?: BlockAction[];
        // generatorBlockOffsets?: number[];
        // generatorHasProtectedRegions?: boolean;
        // generatorNextLabelId?: number;
        // generatorLabelNumbers?: number[];
        // generatorLabels?: number[];
        // generatorOperations?: OpCode[];
        // generatorOperationArguments?: any[][];
        
        // // generator phase 2 transform state
        // generatorBlockIndex?: number;
        // generatorLabelNumber?: number;
        // generatorLastOperationWasAbrupt?: boolean;
        // generatorLastOperationWasCompletion?: boolean;
        // generatorCaseClauses?: CaseClause[];
        // generatorCurrentCaseStatements?: Statement[];
        
        constructor(previous: ES5FunctionTransformer) {
            super(previous.transformResolver, previous, TransformerScope.Function);
            this.statements = previous.statements;
        }
        
        public transform(body: Block) {
            
        }
    }
    
    //     function transformGeneratorBody(body: Block, transformer: FunctionTransformer): void {
    //         // Set up state for the generator transform
    //         transformer.transformNode = transformGeneratorTopLevelNode;
    //         transformer.removeMissingNodes = true; 
    //         transformer.generatorState = factory.createIdentifier(transformResolver.makeUniqueName("state"));
    //         transformer.generatorCaseClauses = [];
    //         transformer.generatorNextLabelId = 1;
            
    //         // Append the call to __generator
    //         transformer.statements.push(
    //             factory.createReturnStatement(
    //                 factory.createCallExpression2(
    //                     factory.createIdentifier("__generator"),
    //                     [
    //                         factory.createFunctionExpression5(
    //                             [
    //                                 factory.createParameter2(transformer.generatorState)
    //                             ], 
    //                             [
    //                                 factory.createSwitchStatement(
    //                                     factory.createPropertyAccessExpression2(
    //                                         transformer.generatorState,
    //                                         factory.createIdentifier("label")
    //                                     ),
    //                                     factory.createCaseBlock(transformer.generatorCaseClauses)
    //                                 )
    //                             ]
    //                         )
    //                     ]
    //                 )
    //             )
    //         );
            
    //         // Phase 1 - translate the body of the generator function into labels and operations
    //         visit(body, transformer);
            
    //         // Phase 2 - translate labels and operations into case blocks
    //         transformer.generatorBlockIndex = 0;
    //         transformer.generatorLabelNumber = 0;
            
    //         if (transformer.generatorHasProtectedRegions) {
    //             initializeProtectedRegions(transformer);
    //         }
            
    //         if (transformer.generatorOperations) {
    //             for (var operationIndex = 0; operationIndex < transformer.generatorOperations.length; operationIndex++) {
    //                 writeOperation(
    //                     transformer,
    //                     transformer.generatorOperations[operationIndex],
    //                     transformer.generatorOperationArguments[operationIndex]);
    //             }
    //         }

    //         flushFinalLabel(transformer);
    //     }

    //     function emit(transformer: FunctionTransformer, code: OpCode, ...args: any[]): void {
    //     }
        
    //     function initializeProtectedRegions(transformer: FunctionTransformer) {
    //     }
        
    //     function writeOperation(transformer: FunctionTransformer, operation: OpCode, operationArguments: any[]) {
    //     }
        
    //     function flushFinalLabel(transformer: FunctionTransformer) {
    //     }

    //     function transformGeneratorTopLevelNode(node: Node, transformer: FunctionTransformer) {
    //         transformer.transformNode = transformGeneratorNode;
    //         transformer.removeMissingNodes = false;
            
    //         let topNode = transformerTransformNode(transformer.previous, node);
    //         if (topNode) {
    //             if (isDeclaration(node)) {
    //                 transformer.statements.push(<Statement>topNode);
    //             }
    //             else {
    //                 transformer.generatorCurrentCaseStatements.push(<Statement>topNode);
    //             }
    //         }
            
    //         transformer.removeMissingNodes = true;
    //         transformer.transformNode = transformGeneratorTopLevelNode;
    //     }
        
    //     function transformGeneratorNode(node: Node, transformer: FunctionTransformer) {
    //         return transformerTransformNode(transformer.previous, node);
    //     }
        
    //     function shouldTransformGeneratorNode(node: Node, transformer: FunctionTransformer) {
    //         return isDeclaration(node)
    //             || node.transformFlags & TransformFlags.ThisNodeOrAnySubNodesContainsYield
    //             || transformerShouldTransformNode(transformer.previous, node);
    //     }
    // }
}