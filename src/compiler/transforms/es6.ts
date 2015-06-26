/// <reference path="../transform.ts" />
namespace ts.transform {
    export function toES6(resolver: TransformResolver, statements: NodeArray<Statement>): NodeArray<Statement> {
        return visitNodes(statements, new ES6Transformer(resolver));
    }
    
    /* @internal */
    export class ES6Transformer extends Transformer {
        public shouldTransformNode(node: Node) {
            // return !!(node.transformFlags & TransformFlags.ThisNodeNeedsTransformToES6);
            return false;
        }

        public shouldTransformChildrenOfNode(node: Node) {
            // return !!(node.transformFlags & TransformFlags.SubtreeNeedsTransformToES6);
            return false;
        }
    }

    // export module AsyncFunctionRewriter {
    //     export function rewrite<TNode extends FunctionLikeDeclaration>(node: TNode, promiseConstructor: EntityName, locals: Locals, compilerOptions: CompilerOptions): TNode {
    //         var resolve = Locals.createUniqueIdentifier(locals, "_resolve");
    //         var generatorFunctionBody = Factory.createBlock(rewriteBody(node.body));
    //         var generatorFunction = Factory.createFunctionExpression(/*name*/ undefined, [], generatorFunctionBody);
    //         generatorFunction.asteriskToken = Factory.createTokenNode(SyntaxKind.AsteriskToken);

    //         var bodyStatements: Statement[] = [];
    //         var generator = createGenerator(generatorFunctionBody, bodyStatements, locals, compilerOptions);
    //         var awaiterCallExpression = Factory.createCallExpression(Factory.createIdentifier("__awaiter"), [generator]);
    //         var resolveCallExpression = Factory.createCallExpression(resolve, [awaiterCallExpression]);
    //         var resolveCallStatement = Factory.createExpressionStatement(resolveCallExpression);
    //         var initFunctionBody = Factory.createBlock([resolveCallStatement]);
    //         var initFunctionExpression = Factory.createFunctionExpression(/*name*/ undefined, [Factory.createParameterDeclaration(resolve)], initFunctionBody);
    //         var newPromiseExpression = Factory.createNewExpression(Factory.getExpressionForEntityName(promiseConstructor), [initFunctionExpression]);
    //         var bodyReturnStatement = Factory.createReturnStatement(newPromiseExpression);
    //         bodyStatements.push(bodyReturnStatement);

    //         var block = Factory.createBlock(bodyStatements);
    //         var func = <TNode>Factory.updateFunctionLikeDeclaration(node, node.name, block, node.parameters);
    //         func.id = node.id;
    //         func.parent = node.parent;
    //         return func;
    //     }

    //     function rewriteBody(body: Block | Expression): NodeArray<Statement> {
    //         if (body.kind === SyntaxKind.Block) {
    //             return Visitor.visitNodes((<Block>body).statements, visitNode);
    //         } else {
    //             return Factory.createNodeArray<Statement>([
    //                 Factory.createReturnStatement(Visitor.visit(<Expression>body, visitNode))
    //             ]);
    //         }
    //     }

    //     function createGenerator(body: Block, statements: Statement[], locals: Locals, compilerOptions: CompilerOptions): Expression {
    //         var generatorFunction = Factory.createFunctionExpression(/*name*/ undefined, [], body);
    //         generatorFunction.asteriskToken = Factory.createTokenNode(SyntaxKind.AsteriskToken);

    //         if (compilerOptions.target < ScriptTarget.ES6) {
    //             generatorFunction = GeneratorFunctionRewriter.rewrite(generatorFunction, locals);
    //             body = <Block>generatorFunction.body;
                
    //             var generator: Expression;
    //             for (var i = 0; i < body.statements.length; i++) {
    //                 var statement = body.statements[i];
    //                 if (statement.kind === SyntaxKind.FunctionDeclaration ||
    //                     statement.kind === SyntaxKind.VariableStatement) {
    //                     statements.push(statement);
    //                 }
    //                 else if (statement.kind === SyntaxKind.ReturnStatement) {
    //                     generator = (<ReturnStatement>statement).expression;
    //                 }
    //             }

    //             return generator;
    //         }
    //         else {
    //             return Factory.createCallExpression(generatorFunction, []);
    //         }
    //     }

    //     function visitNode(node: Node): Node {
    //         switch (node.kind) {
    //             case SyntaxKind.AwaitExpression:
    //                 return visitAwaitExpression(<AwaitExpression>node);

    //             case SyntaxKind.ExpressionStatement:
    //                 return visitExpressionStatement(<ExpressionStatement>node);

    //             case SyntaxKind.ArrowFunction:
    //             case SyntaxKind.FunctionExpression:
    //             case SyntaxKind.FunctionDeclaration:
    //             case SyntaxKind.GetAccessor:
    //             case SyntaxKind.SetAccessor:
    //             case SyntaxKind.MethodDeclaration:
    //                 return node;

    //             default:
    //                 return Visitor.fallback(node, visitNode);
    //         }
    //     }

    //     function visitAwaitExpression(node: AwaitExpression): UnaryExpression {
    //         var expression = Visitor.visit(node.expression, visitNode);
    //         var yieldExpression = Factory.createYieldExpression(expression, /*asteriskToken*/ undefined, node);
    //         return Factory.makeLeftHandSideExpression(yieldExpression);
    //     }

    //     function visitExpressionStatement(node: ExpressionStatement): Statement {
    //         var expression = Visitor.visit(node.expression, visitNode);
    //         if (nodeIsGenerated(expression) && expression.kind === SyntaxKind.ParenthesizedExpression) {
    //             expression = (<ParenthesizedExpression>expression).expression;
    //         }
    //         return Factory.updateExpressionStatement(node, expression);
    //     }
    // }
}