/// <reference path="../transform.ts" />
namespace ts.transform {
    export function toES5(resolver: TransformResolver, statements: NodeArray<Statement>): NodeArray<Statement> {
        return visitNodes(statements, new ES5Transformer(resolver));
    }
    
    export class ES5Transformer extends Transformer {
        public shouldTransformNode(node: Node) {
            return !!(node.transformFlags & TransformFlags.ThisNodeNeedsES5Transform);
        }
        
        public shouldTransformChildrenOfNode(node: Node) {
            return !!(node.transformFlags & TransformFlags.ThisNodeOrAnySubNodesNeedsES5TransformMask);
        }        

        public transformNode(node: Node): Node {
            switch (node.kind) {
                case SyntaxKind.ArrowFunction:
                case SyntaxKind.FunctionExpression:
                case SyntaxKind.FunctionDeclaration:
                    return this.transformFunctionLikeDeclaration(<FunctionLikeDeclaration>node);
            }
            
            return visitChildren(node, this);
        }
        
        private transformFunctionLikeDeclaration(node: FunctionLikeDeclaration): FunctionLikeDeclaration {
            let transformer = new ES5FunctionTransformer(this);
            return transformer.transformFunctionLikeDeclaration(node);
        }
    }
    
    export class ES5FunctionTransformer extends ES5Transformer {
        public parameters: ParameterDeclaration[];
        public statements: Statement[] = [];
        
        constructor(previous: ES5Transformer) {
            super(previous.transformResolver, previous, TransformerScope.Function);
        }
        
        public transform(node: FunctionLikeDeclaration): FunctionLikeDeclaration {
            // If any parameters containing binding patterns, initializers, or a rest argument
            // we need to transform the parameter list
            if (node.transformFlags & TransformFlags.FunctionParameterMask) {
                this.parameters = [];
                visitNodes(node.parameters, this);
            }
            else {
                this.parameters = node.parameters;
            }

            // If any arrow function captures the 'this' of this function, we need
            // to add a statement to capture 'this' as '_this'
            if (node.transformFlags & TransformFlags.ThisNodeNeedsCapturedThis) {
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
            let transformer = new ES5GeneratorBodyTransformer(this);
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
}