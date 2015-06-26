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
                /*name*/ undefined,
                /*typeParameters*/ undefined,
                /*parameters*/ parameters,
                /*type*/ undefined,
                /*body*/ body);
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
    }
}
