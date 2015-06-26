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
        
        export function createInlineFunctionExpressionEvaluation(parameters: ParameterDeclaration[], bodyStatements: Statement[], _arguments: Expression[]) {
            return factory.createCallExpression2(
                factory.createParenthesizedExpression(
                    factory.createFunctionExpression3(
                        /*parameters*/ parameters,
                        /*body*/ factory.createBlock(bodyStatements))),
                /*_arguments*/ _arguments);
        }
        
        export function createParameter2(name: Identifier) {
            return factory.createParameter(
                /*decorators*/ undefined,
                /*modifiers*/ undefined,
                /*dotDotDotToken*/ undefined,
                name);
        }
        
        export function createVariableStatement2(name: Identifier, initializer?: Expression) {
            return factory.createVariableStatement(
                factory.createVariableDeclarationList([
                    factory.createVariableDeclaration2(name, initializer)
                ]));
        }
        
        export function createVariableDeclaration2(name: Identifier, initializer?: Expression) {
            return factory.createVariableDeclaration(
                /*decorators*/ undefined,
                /*modifiers*/ undefined,
                name,
                /*type*/ undefined,
                initializer);
        }
        
        export function createCallExpression2(expression: LeftHandSideExpression, _arguments?: Expression[]) {
            return factory.createCallExpression(
                expression,
                /*typeArguments*/ undefined,
                factory.createNodeArray(_arguments));
        }
        
        export function createFunctionDeclaration2(name: Identifier, parameters: ParameterDeclaration[], body: Block) {
            return factory.createFunctionDeclaration(
                /*decorators*/ undefined,
                /*modifiers*/ undefined,
                /*asteriskToken*/ undefined,
                /*name*/ name,
                /*typeParameters*/ undefined,
                /*parameters*/ parameters,
                /*type*/ undefined,
                /*body*/ body);
        }

        export function createFunctionDeclaration3(name: Identifier, parameters: ParameterDeclaration[], body: Statement[]) {
            return factory.createFunctionDeclaration2(
                name,
                parameters,
                factory.createBlock(body || []));
        }
        
        export function createFunctionExpression2(name: Identifier, parameters: ParameterDeclaration[], body: Block) {
            return factory.createFunctionExpression(
                /*decorators*/ undefined,
                /*modifiers*/ undefined,
                /*asteriskToken*/ undefined,
                /*name*/ undefined,
                /*typeParameters*/ undefined,
                /*parameters*/ parameters,
                /*type*/ undefined,
                /*body*/ body);
        }
        
        export function createFunctionExpression3(parameters: ParameterDeclaration[], body: Block) {
            return factory.createFunctionExpression2(
                /*name*/ undefined,
                parameters,
                body);
        }

        export function createFunctionExpression4(name: Identifier, parameters: ParameterDeclaration[], body: Statement[]) {
            return factory.createFunctionExpression2(
                name,
                parameters,
                factory.createBlock(body || []));
        }

        export function createFunctionExpression5(parameters: ParameterDeclaration[], body: Statement[]) {
            return factory.createFunctionExpression2(
                /*name*/ undefined,
                parameters,
                factory.createBlock(body || []));
        }
        
        export function createPropertyAccessExpression2(expression: LeftHandSideExpression, propertyName: Identifier) {
            return factory.createPropertyAccessExpression(
                expression,
                factory.createNode(SyntaxKind.DotToken),
                propertyName);
        }
        
        export function createNumericLiteral2(value: number): LiteralExpression {
            return factory.createNumericLiteral(String(value));
        }
        
        export function createBinaryExpression2(operator: SyntaxKind, left: Expression, right: Expression) {
            return factory.createBinaryExpression(
                left,
                factory.createNode(operator),
                right
            );
        }

        export function setTextRange<TNode extends Node>(node: TNode, range: TextRange): TNode {
            if (!node || !range) {
                return node;
            }
            
            node.pos = range.pos;
            node.end = range.end;
            return node;
        }

        // export function createVoidZero(location?: TextRange, flags?: NodeFlags): VoidExpression {
        //     return createVoidExpression(createNumericLiteral(0, location, flags), location, flags);
        // }

        // export function makeLeftHandSideExpression(expression: Expression): LeftHandSideExpression {
        //     if (isLeftHandSideExpression(expression)) {
        //         return <LeftHandSideExpression>expression;
        //     }

        //     return createParenthesizedExpression(expression);
        // }

        // export function createPropertyOrElementAccessExpression(expression: LeftHandSideExpression, propName: Identifier | LiteralExpression): LeftHandSideExpression {
        //     if (propName.kind !== SyntaxKind.Identifier) {
        //         return createElementAccessExpression(expression, propName);
        //     }
        //     return createPropertyAccessExpression(expression, <Identifier>propName);
        // }
        
        // export function getExpressionForEntityName(name: EntityName): LeftHandSideExpression {
        //     if (!name) {
        //         return finishNode(beginNode<LeftHandSideExpression>(SyntaxKind.NullKeyword));
        //     }

        //     if (name.kind === SyntaxKind.Identifier) {
        //         return createIdentifier((<Identifier>name).text);
        //     }
        //     else {
        //         return createPropertyAccessExpression(getExpressionForEntityName((<QualifiedName>name).left), createIdentifier((<QualifiedName>name).right.text));
        //     }
        // }
    }
}
