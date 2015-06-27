/// <reference path="../transform.ts" />
namespace ts.transform {
    export function toES5(resolver: TransformResolver, statements: NodeArray<Statement>): NodeArray<Statement> {
        return visitNodes(statements, new ES5Transformer(resolver));
    }
    
    export class ES5Transformer extends Transformer {
        public shouldTransformNode(node: Node) {
            return needsTransform(node, TransformFlags.ThisNodeNeedsTransformToES5);            
        }
        
        public shouldTransformChildrenOfNode(node: Node) {
            return needsTransform(node, TransformFlags.SubtreeNeedsTransformToES5);
        }

        public transformNode(node: Node): Node {
            switch (node.kind) {
                case SyntaxKind.FunctionExpression:
                case SyntaxKind.FunctionDeclaration:
                    return this.transformFunctionLikeDeclaration(<FunctionLikeDeclaration>node);
            }
            
            return visitChildren(node, this);
        }
        
        private transformFunctionLikeDeclaration(node: FunctionLikeDeclaration): FunctionLikeDeclaration {
            let transformer = new ES5FunctionTransformer(this);
            return transformer.transform(node);
        }
    }
    
    export class ES5FunctionTransformer extends Transformer {
        public parameters: ParameterDeclaration[];
        public statements: Statement[] = [];
        
        constructor(previous: ES5Transformer) {
            super(previous.transformResolver, previous, TransformerScope.Function);
        }
        
        public transform(node: FunctionLikeDeclaration): FunctionLikeDeclaration {
            // If any parameters containing binding patterns, initializers, or a rest argument
            // we need to transform the parameter list
            if (node.transformFlags & TransformFlags.ThisParameterNeedsTransform) {
                this.parameters = [];
                visitNodes(node.parameters, this);
            }
            else {
                this.parameters = node.parameters;
            }

            // If any arrow function captures the 'this' of this function, we need
            // to add a statement to capture 'this' as '_this'
            if (node.transformFlags & TransformFlags.CaptureThis) {
                this.statements.push(
                    factory.createVariableStatement2(
                        factory.createIdentifier("_this"),
                        factory.createIdentifier("this")
                    )
                );
            }
            
            // If the function is a generator, we need to transform the body
            if (node.asteriskToken) {
                this.transformGeneratorBody(<Block>node.body);
            }
            else if (node.kind === SyntaxKind.ArrowFunction) {
                this.transformArrowFunctionBody(node.body);
            }

            // Create the return value
            let newNode: FunctionLikeDeclaration;
            switch (node.kind) {
                case SyntaxKind.ArrowFunction:
                case SyntaxKind.FunctionExpression:
                    return factory.createFunctionExpression4(
                        <Identifier>node.name,
                        this.parameters,
                        this.statements);

                case SyntaxKind.FunctionDeclaration:
                    return factory.createFunctionDeclaration3(
                        <Identifier>node.name,
                        this.parameters,
                        this.statements);
                        
                case SyntaxKind.MethodDeclaration:
                    // NOTE: need to handle this...
            }
            
            return newNode;
        }

        private transformGeneratorBody(node: Block) {
            let transformer = new ES5GeneratorBodyTransformer(this.previous, this.statements);
            return transformer.transform(node);
        }
        
        private transformArrowFunctionBody(body: Block | Expression) {
            let offset = this.statements.length;
            if (body.kind === SyntaxKind.Block) {
                let statements = visitNodes((<Block>body).statements, this);
                for (let statement of statements) {
                    this.statements.splice(offset++, 0, statement);
                }
            }
            else {
                let statement = factory.createReturnStatement(
                    visit(<Expression>body, this)
                );                    
                this.statements.splice(offset, 0, statement);
            }
        }
    }

    // export module BindingElementRewriter {
    //     interface RewriterState {
    //         isDeclaration: boolean;
    //         root: BindingElement;
    //         locals: Locals;
    //         value?: Expression;
    //         variableDeclarations?: VariableDeclaration[];
    //     }

    //     export function rewrite(root: BindingElement, locals: Locals, value?: Expression): VariableDeclaration[] {
    //         var isDeclaration = root.kind === SyntaxKind.VariableDeclaration && !(getCombinedNodeFlags(root) & NodeFlags.Export) || root.kind === SyntaxKind.Parameter;
    //         var state: RewriterState = {
    //             isDeclaration,
    //             root,
    //             locals,
    //             value
    //         };
    //         Visitor.visit(root, visitNode, state);
    //         return state.variableDeclarations;
    //     }

    //     function visitNode(node: Node, state: RewriterState): Node {
    //         switch (node.kind) {
    //             case SyntaxKind.Parameter:
    //             case SyntaxKind.VariableDeclaration:
    //             case SyntaxKind.BindingElement:
    //                 return visitBindingElement(<BindingElement>node, state);
    //             case SyntaxKind.ObjectBindingPattern:
    //                 return visitObjectBindingPattern(<BindingPattern>node, state);
    //             case SyntaxKind.ArrayBindingPattern:
    //                 return visitArrayBindingPattern(<BindingPattern>node, state);
    //             case SyntaxKind.Identifier:
    //                 return visitIdentifier(<Identifier>node, state);
    //             default:
    //                 return node;
    //         }
    //     }

    //     function visitBindingElement(node: BindingElement, state: RewriterState): BindingElement {
    //         var { value, locals } = state, saveValue = value;

    //         if (node.initializer) {
    //             // Combine value and initializer
    //             value = value ? Locals.getValueOrDefault(locals, value, node.initializer, writeDeclaration, state) : node.initializer;
    //         }
    //         else if (!value) {
    //             // Use 'void 0' in absence of value and initializer
    //             value = Factory.createVoidZero();
    //         }

    //         state.value = value;
    //         Visitor.visit(node.name, visitNode, state);
    //         state.value = saveValue;
    //         return node;
    //     }

    //     function visitObjectBindingPattern(node: BindingPattern, state: RewriterState): BindingPattern {
    //         var { value, locals } = state, saveValue = value;

    //         var elements = node.elements;
    //         if (elements.length !== 1) {
    //             // For anything but a single element destructuring we need to generate a temporary
    //             // to ensure value is evaluated exactly once.
    //             value = Locals.ensureIdentifier(locals, value, writeDeclaration, state);
    //         }

    //         for (var i = 0; i < elements.length; i++) {
    //             var element = elements[i];
    //             var propName = element.propertyName || <Identifier>element.name;

    //             // Rewrite element to a declaration with an initializer that fetches property
    //             state.value = Factory.createPropertyOrElementAccessExpression(Factory.makeLeftHandSideExpression(value), propName);
    //             Visitor.visit(element, visitNode, state);
    //         }

    //         state.value = saveValue;
    //         return node;
    //     }

    //     function visitArrayBindingPattern(node: BindingPattern, state: RewriterState): BindingPattern {
    //         var { value, locals } = state, saveValue = value;

    //         var elements = node.elements;
    //         if (elements.length !== 1) {
    //             // For anything but a single element destructuring we need to generate a temporary
    //             // to ensure value is evaluated exactly once.
    //             value = Locals.ensureIdentifier(locals, value, writeDeclaration, state);
    //         }

    //         for (var i = 0; i < elements.length; i++) {
    //             var element = elements[i];
    //             if (element.kind !== SyntaxKind.OmittedExpression) {
    //                 if (!element.dotDotDotToken) {
    //                     // Rewrite element to a declaration that accesses array element at index i
    //                     state.value = Factory.createElementAccessExpression(Factory.makeLeftHandSideExpression(value), Factory.createNumericLiteral(i));
    //                     Visitor.visit(element, visitNode, state);
    //                 }
    //                 else if (i === elements.length - 1) {
    //                     value = Locals.ensureIdentifier(locals, value, writeDeclaration, state);
    //                     var name = <Identifier>element.name;
    //                     var sliceExpression = Factory.createPropertyAccessExpression(Factory.makeLeftHandSideExpression(value), Factory.createIdentifier("slice"));
    //                     var callExpression = Factory.createCallExpression(sliceExpression, [Factory.createNumericLiteral(i)]);
    //                     writeAssignment(name, callExpression, state);
    //                 }
    //             }
    //         }

    //         state.value = saveValue;
    //         return node;
    //     }

    //     function visitIdentifier(node: Identifier, state: RewriterState): Identifier {
    //         var { value } = state;
    //         writeAssignment(node, value, state);
    //         return node;
    //     }

    //     function writeDeclaration(left: Identifier, right: Expression, state: RewriterState): void {
    //         var { isDeclaration, locals } = state;
    //         if (!isDeclaration) {
    //             Locals.recordVariable(locals, left);
    //         }
    //         writeAssignment(left, right, state);
    //     }

    //     function writeAssignment(left: Identifier, right: Expression, state: RewriterState): void {
    //         var { variableDeclarations = [], root } = state;
    //         var variableDeclaration = Factory.createVariableDeclaration(left, right);
    //         if (root.kind === SyntaxKind.VariableDeclaration && left.parent &&
    //             (left.parent.kind === SyntaxKind.VariableDeclaration || left.parent.kind === SyntaxKind.BindingElement)) {
    //             if (getCombinedNodeFlags(left.parent) & NodeFlags.Export) {
    //                 variableDeclaration.parent = (<VariableDeclaration>state.root).parent;
    //                 variableDeclaration.flags |= NodeFlags.Export;
    //             }
    //         }

    //         variableDeclarations.push(variableDeclaration);
    //         state.variableDeclarations = variableDeclarations;
    //     }
    // }

    // export module DestructuringAssignmentRewriter {
    //     interface RewriterState {
    //         root: BinaryExpression;
    //         locals: Locals;
    //         value?: Expression;
    //         mergedAssignments?: BinaryExpression;
    //     }

    //     export function rewrite(root: BinaryExpression, locals: Locals): BinaryExpression {
    //         var value = root.right;
    //         var state: RewriterState = {
    //             root,
    //             locals,
    //             value
    //         };

    //         var target = getLeftHandSideOfDestructuringAssignment(root);
    //         if (root.parent.kind !== SyntaxKind.ExpressionStatement) {
    //             value = Locals.ensureIdentifier(locals, value, writeDeclaration, state);
    //         }

    //         state.value = value;
    //         Visitor.visit(target, visitNode, state);

    //         var { mergedAssignments } = state;
    //         if (root.parent.kind !== SyntaxKind.ExpressionStatement) {
    //             mergedAssignments = Factory.createBinaryExpression(
    //                 SyntaxKind.CommaToken,
    //                 mergedAssignments,
    //                 value);
    //         }

    //         return mergedAssignments;
    //     }

    //     function getLeftHandSideOfDestructuringAssignment(node: BinaryExpression): Expression {
    //         if (node.operator === SyntaxKind.EqualsToken) {
    //             var left = node.left;
    //             while (left.kind === SyntaxKind.ParenthesizedExpression) {
    //                 left = (<ParenthesizedExpression>left).expression;
    //             }
    //             switch (left.kind) {
    //                 case SyntaxKind.ObjectLiteralExpression:
    //                 case SyntaxKind.ArrayLiteralExpression:
    //                     return left;
    //             }
    //         }
    //     }

    //     function visitNode(node: Node, state: RewriterState): Node {
    //         switch (node.kind) {
    //             case SyntaxKind.BinaryExpression:
    //                 return visitBinaryExpression(<BinaryExpression>node, state);

    //             case SyntaxKind.ObjectLiteralExpression:
    //                 return visitObjectLiteralExpression(<ObjectLiteralExpression>node, state);

    //             case SyntaxKind.ArrayLiteralExpression:
    //                 return visitArrayLiteralExpression(<ArrayLiteralExpression>node, state);
    //         }

    //         var { value } = state;
    //         writeAssignment(<Expression>node, value, state);
    //         return node;
    //     }

    //     function visitClassElement(node: Node, state: RewriterState): Node {
    //         switch (node.kind) {
    //             case SyntaxKind.PropertyAssignment:
    //             case SyntaxKind.ShorthandPropertyAssignment:
    //                 return visitPropertyAssignment(<PropertyAssignment>node, state);

    //             default:
    //                 // TODO(andersh): Computed property support
    //                 return node;
    //         }
    //     }

    //     function visitBinaryExpression(node: BinaryExpression, state: RewriterState): Node {
    //         var { value, locals } = state, saveValue = value;

    //         if (node.operator === SyntaxKind.EqualsToken) {
    //             value = Locals.getValueOrDefault(locals, value, node.right, writeDeclaration, state);
    //             state.value = value;
    //             Visitor.visit(node.left, visitNode, state);
    //         }

    //         state.value = saveValue;
    //         return node;
    //     }

    //     function visitObjectLiteralExpression(node: ObjectLiteralExpression, state: RewriterState): Node {
    //         var { value, locals } = state, saveValue = value;

    //         var properties = node.properties;
    //         if (properties.length !== 1) {
    //             // For anything but a single element destructuring we need to generate a temporary
    //             // to ensure value is evaluated exactly once.
    //             value = Locals.ensureIdentifier(locals, value, writeDeclaration, state);
    //         }

    //         state.value = value;
    //         Visitor.visitNodes(properties, visitClassElement, state);
    //         state.value = saveValue;
    //         return node;
    //     }

    //     function visitPropertyAssignment(node: PropertyAssignment, state: RewriterState): Node {
    //         var { value } = state, saveValue = value;
    //         var propName = <Identifier>node.name;

    //         state.value = Factory.createPropertyOrElementAccessExpression(Factory.makeLeftHandSideExpression(value), propName);
    //         Visitor.visit(node.initializer || propName, visitNode, state);
    //         state.value = saveValue;
    //         return node;
    //     }

    //     function visitArrayLiteralExpression(node: ArrayLiteralExpression, state: RewriterState): Node {
    //         var { value, locals } = state, saveValue = value;

    //         var elements = node.elements;
    //         if (elements.length !== 1) {
    //             // For anything but a single element destructuring we need to generate a temporary
    //             // to ensure value is evaluated exactly once.
    //             value = Locals.ensureIdentifier(state.locals, value, writeDeclaration, state);
    //         }

    //         for (var i = 0; i < elements.length; i++) {
    //             var e = elements[i];
    //             if (e.kind !== SyntaxKind.OmittedExpression) {
    //                 if (e.kind !== SyntaxKind.SpreadElementExpression) {
    //                     state.value = Factory.createElementAccessExpression(Factory.makeLeftHandSideExpression(value), Factory.createNumericLiteral(i));
    //                     Visitor.visit(e, visitNode, state);
    //                 }
    //                 else if (i === elements.length - 1) {
    //                     value = Locals.ensureIdentifier(state.locals, value, writeDeclaration, state);
    //                     var sliceExpression = Factory.createPropertyAccessExpression(Factory.makeLeftHandSideExpression(value), Factory.createIdentifier("slice"));
    //                     var callExpression = Factory.createCallExpression(sliceExpression, [Factory.createNumericLiteral(i)]);
    //                     writeAssignment(<Identifier>(<SpreadElementExpression>e).expression, callExpression, state);
    //                 }                   
    //             }
    //         }

    //         state.value = saveValue;
    //         return node;
    //     }

    //     function visitIdentifier(node: Identifier, state: RewriterState): Node {
    //         var { value } = state;
    //         writeAssignment(node, value, state);
    //         return node;
    //     }

    //     function writeDeclaration(left: Identifier, right: Expression, state: RewriterState): void {
    //         var { locals } = state;
    //         Locals.recordVariable(locals, left);
    //         writeAssignment(left, right, state);
    //     }

    //     function writeAssignment(left: Expression, right: Expression, state: RewriterState): void {
    //         var { mergedAssignments } = state;
    //         var assignmentExpression = Factory.createBinaryExpression(SyntaxKind.EqualsToken, left, right);
    //         if (mergedAssignments) {
    //             mergedAssignments = Factory.createBinaryExpression(
    //                 SyntaxKind.CommaToken,
    //                 mergedAssignments,
    //                 assignmentExpression);
    //         }
    //         else {
    //             mergedAssignments = assignmentExpression;
    //         }

    //         state.mergedAssignments = mergedAssignments;
    //     }
    // }

    // export module SpreadElementRewriter {
    //     export function rewrite(elements: NodeArray<Expression>): LeftHandSideExpression {
    //         var segments: Expression[];
    //         var length = elements.length;
    //         var start = 0;

    //         for (var i = 0; i < length; i++) {
    //             var element = elements[i];
    //             if (element.kind === SyntaxKind.SpreadElementExpression) {
    //                 if (!segments) {
    //                     segments = [];
    //                 }
    //                 if (i > start) {
    //                     segments.push(Factory.createArrayLiteralExpression(elements.slice(start, i)));
    //                 }
    //                 segments.push((<SpreadElementExpression>element).expression);
    //                 start = i + 1;
    //             }
    //         }

    //         if (!segments) {
    //             return undefined;
    //         }

    //         if (start < length) {
    //             segments.push(Factory.createArrayLiteralExpression(elements.slice(start, length)));
    //         }

    //         // Rewrite using the pattern <segment0>.concat(<segment1>, <segment2>, ...)
    //         if (segments.length === 1) {
    //             return Factory.makeLeftHandSideExpression(segments[0]);
    //         }

    //         var head = Factory.makeLeftHandSideExpression(segments.shift());
    //         var concatExpression = Factory.createPropertyAccessExpression(head, Factory.createIdentifier("concat"));
    //         var callExpression = Factory.createCallExpression(concatExpression, segments);
    //         return callExpression;
    //     }
    // }
}