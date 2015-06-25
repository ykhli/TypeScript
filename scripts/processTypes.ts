declare var __dirname: string;

import { 
    getDefaultCompilerOptions, 
    createProgram, 
    sys, 
    createCompilerHost, 
    forEachChild, 
    getLeadingCommentRanges,
    computeLineStarts,
    createTextWriter,
    combinePaths,
    SyntaxKind,
    Node,
    CommentRange,
    EmitTextWriter,
    SourceFile,
    Declaration,
    InterfaceDeclaration,
    TypeAliasDeclaration,
    EnumDeclaration,
    EnumMember,
    PropertyDeclaration,
    TypeNode,
    TypeReferenceNode,
    UnionTypeNode,
    ExpressionWithTypeArguments,
    SymbolFlags,
    Symbol,
    TypeFlags,
    Type,
    TypeReference,
    InterfaceType,
    Map,
    getProperty
} from "./typescript";

import * as ts from "./typescript";

interface SyntaxNode {
    kind?: Symbol;
    symbol?: Symbol;
    type?: Type;
    members?: SyntaxMember[];
    hasChildren?: boolean;
    minArgumentCount?: number;
}

interface SyntaxMember {
    symbol?: Symbol;
    typeNode?: TypeNode;
    typeSymbol?: Symbol;
    isFactoryParam?: boolean;
    isOptional?: boolean;
    isNode?: boolean;
    isNodeArray?: boolean;
    isModifiersArray?: boolean;
    isChild?: boolean;
}

interface MemberNameMap {
    [name: string]: string[];
}

let columnWrap = 150;
let emptyArray: any[] = [];
let kindPattern = /@kind\s*\(\s*SyntaxKind\.(\w+)\s*\)/g;
let indentStrings: string[] = ["", "    "];
let options = getDefaultCompilerOptions();
options.noLib = true;
options.noResolve = true;

let host = createCompilerHost(options);
let file = host.getCanonicalFileName(sys.resolvePath(combinePaths(__dirname, "../src/compiler/types.ts")));
let program = createProgram([file], options, host);
let checker = program.getTypeChecker();
let sourceFile = program.getSourceFile(file);
let writer: EmitTextWriter;

let nodeSymbol: Symbol;
let declarationSymbol: Symbol;
let nodeArraySymbol: Symbol;
let modifiersArraySymbol: Symbol;
let syntaxKindSymbol: Symbol;
let syntaxKindType: Type;
let syntaxKindSymbols: Map<Symbol>;
let syntax: SyntaxNode[] = [];
let subtypesOfNode: boolean[] = [];
let memberExcludes: MemberNameMap = {
    "*": [],
    "TypeLiteral": ["decorators", "modifiers", "name"],
    "CallSignature": ["decorators", "modifiers", "name"],
    "ConstructSignature": ["decorators", "modifiers", "name"],
    "IndexSignature": ["typeParameters", "name"],
    "FunctionType": ["decorators", "modifiers", "name"],
    "ConstructorType": ["decorators", "modifiers", "name"],
    "PropertySignature": ["decorators", "modifiers", "initializer"],
    "MethodSignature": ["decorators", "modifiers", "asteriskToken", "body"],
    "MethodDeclaration": ["questionToken"],
    "GetAccessor": ["typeParameters", "questionToken", "asteriskToken"],
    "SetAccessor": ["typeParameters", "questionToken", "asteriskToken"],
    "Constructor": ["asteriskToken", "questionToken", "typeParameters", "name"],
    "BindingElement": ["decorators", "modifiers"],
    "ObjectLiteralExpression": ["decorators", "modifiers", "name"],
    "ArrowFunction": ["asteriskToken", "name"],
    "ImportSpecifier": ["decorators", "modifiers"],
    "ExportSpecifier": ["decorators", "modifiers"],
    "ExportAssignment": ["name"],
    "ExportDeclaration": ["name"],
    "MissingDeclaration": ["name"],
    "PropertyAssignment": ["decorators", "modifiers"],
    "ShorthandPropertyAssignment": ["decorators", "modifiers"],
    "EnumMember": ["decorators", "modifiers"],
    "JSDocRecordType": ["decorators", "modifiers", "name"],
    "JSDocRecordMember": ["decorators", "modifiers", "questionToken", "initializer"],
    "JSDocFunctionType": ["decorators", "modifiers", "name", "typeParameters"],
};
let memberOrderOverrides: MemberNameMap = {
    "*": ["decorators", "modifiers"],
    "MethodSignature": ["name", "questionToken"],
    "DoStatement": ["statement", "expression"],
    "FunctionExpression": ["decorators", "modifiers", "asteriskToken", "name", "typeParameters", "parameters", "type"],
    "ArrowFunction": ["decorators", "modifiers", "typeParameters", "parameters", "type"],
    "FunctionDeclaration": ["decorators", "modifiers", "asteriskToken", "name", "typeParameters", "parameters", "type"],
    "Constructor": ["decorators", "modifiers", "parameters", "type", "body"],
    "MethodDeclaration": ["decorators", "modifiers", "asteriskToken", "name", "typeParameters", "parameters", "type", "body"],
    "GetAccessor": ["decorators", "modifiers", "asteriskToken", "name", "parameters", "type", "body"],
    "SetAccessor": ["decorators", "modifiers", "asteriskToken", "name", "parameters", "type", "body"],
};


discoverSymbols();
discoverSyntaxNodes();
generateFactory();

function discoverSymbols() {
    visit(sourceFile);
    
    function visit(node: Node) {
        switch (node.kind) {
            case SyntaxKind.SourceFile:
            case SyntaxKind.ModuleDeclaration:
            case SyntaxKind.ModuleBlock:
                forEachChild(node, visit);
                break;
                
            case SyntaxKind.InterfaceDeclaration:
                visitInterfaceDeclaration(<InterfaceDeclaration>node);
                break;
                
            case SyntaxKind.EnumDeclaration:
                visitEnumDeclaration(<EnumDeclaration>node);
                break;
        }
    }
    
    function visitInterfaceDeclaration(node: InterfaceDeclaration) {
        let name = node.name;
        let text = name.getText();
        if (text === "Node") {
            nodeSymbol = checker.getSymbolAtLocation(name);
        }
        else if (text === "NodeArray") {
            nodeArraySymbol = checker.getSymbolAtLocation(name);
        }
        else if (text === "ModifiersArray") {
            modifiersArraySymbol = checker.getSymbolAtLocation(name);
        }
        else if (text === "Declaration") {
            declarationSymbol = checker.getSymbolAtLocation(name);
        }
    }
    
    function visitEnumDeclaration(node: EnumDeclaration) {
        let name = node.name;
        let text = name.getText();
        if (text === "SyntaxKind") {
            syntaxKindSymbol = checker.getSymbolAtLocation(name);
            syntaxKindType = checker.getTypeAtLocation(name);
        }
    }
}

function discoverSyntaxNodes() {
    visit(sourceFile);
    
    syntax.sort((a, b) => {
        let aValue = checker.getConstantValue(<EnumMember>a.kind.declarations[0]);
        let bValue = checker.getConstantValue(<EnumMember>b.kind.declarations[0]);
        return aValue - bValue;
    }); 
    
    function visit(node: Node) {
        switch (node.kind) {
            case SyntaxKind.SourceFile:
            case SyntaxKind.ModuleDeclaration:
            case SyntaxKind.ModuleBlock:
                forEachChild(node, visit);
                break;
                
            case SyntaxKind.InterfaceDeclaration:
                visitInterfaceDeclaration(<InterfaceDeclaration>node);
                break;
                
            case SyntaxKind.TypeAliasDeclaration:
                visitTypeAliasDeclaration(<TypeAliasDeclaration>node);
                break;
        }
    }
    
    function visitInterfaceDeclaration(node: InterfaceDeclaration) {
        let kinds = getKinds(node);
        if (!kinds) return;
        
        let name = node.name;
        let symbol = checker.getSymbolAtLocation(name);
        if (symbol) {
            createSyntaxNodes(symbol, kinds);
        }
    }
    
    function visitTypeAliasDeclaration(node: TypeAliasDeclaration) {
        let kinds = getKinds(node);
        if (!kinds) return;
        
        let name = node.name;
        let symbol = checker.getSymbolAtLocation(name);
        if (symbol) {
            createSyntaxNodes(symbol, kinds);
        }
    }
    
    function createSyntaxNodes(symbol: Symbol, kinds: Symbol[]) {
        let isDeclaration = isSubtypeOf(symbol.declarations[0], declarationSymbol);
        for (let kind of kinds) {
            let hasChildren = false;
            let type = checker.getDeclaredTypeOfSymbol(symbol);
            let minArgumentCount = 0;
            var exclusions = memberExcludes[kind.name] || memberExcludes["*"];
            var members: SyntaxMember[] = [];
            for (let property of checker.getPropertiesOfType(type)) {
                if (exclusions.indexOf(property.name) >= 0) {
                    continue;
                }
                
                if (property.name === "decorators" || property.name === "modifiers") {
                    if (!isDeclaration || symbol.name === "TypeParameterDeclaration") continue;
                }
                else if (property.name === "questionToken") {
                    if (symbol.name === "FunctionExpression" || symbol.name === "FunctionDeclaration" || symbol.name === "ArrowFunction") {
                        continue;
                    }
                }
                else if ((<any>property).parent === nodeSymbol || property.name === "parent") {
                    continue;
                }
                
                let typeNode = getTypeNodeForProperty(property);
                if (!typeNode) {
                    continue;
                }
                
                let typeSymbol = isTypeReferenceNode(typeNode) ? checker.getSymbolAtLocation(typeNode.typeName) : undefined;
                let isOptional = !!(<PropertyDeclaration>property.declarations[0]).questionToken;
                let isFactoryParam = isFactoryParamProperty(property);
                let propertyIsNodeArray = isNodeArray(typeNode);
                let propertyIsModifiersArray = !propertyIsNodeArray && isModifiersArray(typeNode);
                let propertyIsNode = !propertyIsNodeArray && !propertyIsModifiersArray && isSubtypeOf(typeNode, nodeSymbol);
                let isChild = propertyIsNodeArray || propertyIsModifiersArray || propertyIsNode;
                if (isFactoryParam || isChild) {
                    if (isChild) hasChildren = true;
                    members.push({ 
                        symbol: property,
                        typeNode,
                        typeSymbol,
                        isOptional,
                        isFactoryParam,
                        isNodeArray: propertyIsNodeArray,
                        isModifiersArray: propertyIsModifiersArray,
                        isNode: propertyIsNode, 
                        isChild,
                    });
                    
                    if (!isOptional) {
                        minArgumentCount = members.length;
                    }
                }
            }
            
            var overrides = memberOrderOverrides[kind.name] || memberOrderOverrides["*"];
            let indices = members.map((_, i) => i);
            indices.sort((a, b) => {
                let aMember = members[a];
                let bMember = members[b];
                let aOverride = overrides.indexOf(aMember.symbol.name);
                let bOverride = overrides.indexOf(bMember.symbol.name);
                if (aOverride >= 0) {
                    return bOverride >= 0 ? aOverride - bOverride : -1;
                }
                else if (bOverride >= 0) {
                    return +1;
                }
                
                return a - b;
            });
            
            let result = indices.map(i => members[i]);
            let syntaxNode: SyntaxNode = { kind, symbol, type, members: result, hasChildren, minArgumentCount };
            syntax.push(syntaxNode);
        }
    }
    
    function getTypeNodeForProperty(property: Symbol) {
        return (<PropertyDeclaration>property.declarations[0]).type;
    }
    
    function isTypeReferenceNode(node: Node): node is TypeReferenceNode {
        return node ? node.kind === SyntaxKind.TypeReference : false;
    }
    
    function isUnionTypeNode(node: Node): node is UnionTypeNode {
        return node ? node.kind === SyntaxKind.UnionType : false;
    }
    
    function isInterfaceDeclaration(node: Node): node is InterfaceDeclaration {
        return node ? node.kind === SyntaxKind.InterfaceDeclaration : false;
    }

    function isTypeAliasDeclaration(node: Node): node is TypeAliasDeclaration {
        return node ? node.kind === SyntaxKind.TypeAliasDeclaration : false;
    }
    
    function isExpressionWithTypeArguments(node: Node): node is ExpressionWithTypeArguments {
        return node ? node.kind === SyntaxKind.ExpressionWithTypeArguments : false;
    }
    
    function isNodeArray(typeNode: TypeNode): boolean {
        return isTypeReferenceNode(typeNode) ? checker.getSymbolAtLocation(typeNode.typeName) === nodeArraySymbol : false;
    }
    
    function isModifiersArray(typeNode: TypeNode): boolean {
        return isTypeReferenceNode(typeNode) ? checker.getSymbolAtLocation(typeNode.typeName) === modifiersArraySymbol : false;
    }
    
    function isSubtypeOf(node: TypeNode | Declaration, superTypeSymbol: Symbol): boolean {
        if (isInterfaceDeclaration(node)) {
            if (node.heritageClauses) {
                for (let superType of node.heritageClauses[0].types) {
                    if (isSubtypeOf(superType, superTypeSymbol)) {
                        return true;
                    }
                }
            }
        }
        else if (isTypeAliasDeclaration(node)) {
            return isSubtypeOf(node.type, superTypeSymbol);
        }
        else if (isUnionTypeNode(node)) {
            for (let constituentType of node.types) {
                if (isSubtypeOf(constituentType, superTypeSymbol)) {
                    return true;
                }
            }
        }
        else {
            let typeSymbol = isTypeReferenceNode(node) ? checker.getSymbolAtLocation(node.typeName) 
                : isExpressionWithTypeArguments(node) ? checker.getSymbolAtLocation(node.expression) 
                : undefined;
                
            if (!typeSymbol) {
                return false;
            }
            else if (typeSymbol === superTypeSymbol) {
                return true;
            }
            
            return isSubtypeOf(typeSymbol.declarations[0], superTypeSymbol);
        }
        
        return false;
    }
    
    function isFactoryParamProperty(property: Symbol) {
        for (let decl of property.declarations) {
            if (forEachCommentRange(decl, hasFactoryParamAnnotation)) {
                return true;
            }
        }
        
        return false;
    }
    
    function hasFactoryParamAnnotation(range: CommentRange) {
        let text = sourceFile.text;
        let comment = text.substring(range.pos, range.end);
        return comment.indexOf("@factoryparam") >= 0;
    }

    function getKinds(node: Node) {
        let kinds: Symbol[];
        forEachCommentRange(node, readKinds);
        return kinds;
        
        function readKinds(range: CommentRange) {
            let text = sourceFile.text;
            let comment = text.substring(range.pos, range.end);
            let match: RegExpExecArray;
            while (match = kindPattern.exec(comment)) {
                if (!kinds) {
                    kinds = [];
                }
                
                let symbol = getProperty(syntaxKindSymbol.exports, match[1]);
                if (symbol) {
                    kinds.push(symbol);
                }
            }
        }
    }

    function forEachCommentRange<T>(node: Node, cbNode: (range: CommentRange) => T): T {
        if (node) {
            let leadingCommentRanges = getLeadingCommentRanges(sourceFile.text, node.pos);
            if (leadingCommentRanges) {
                for (let range of leadingCommentRanges) {
                    let result = cbNode(range);
                    if (result) {
                        return result;
                    }
                }
            }
        }
        
        return undefined;
    }
}

function generateFactory() {
    writer = createTextWriter(host.getNewLine());
    writer.write(`// <auto-generated />`);
    writer.writeLine();
    writer.write(`/// <reference path="parser.ts" />`);
    writer.writeLine();
    writer.write(`/// <reference path="factory.ts" />`);
    writer.writeLine();
    writer.write(`namespace ts {`);
    writer.writeLine();
    writer.increaseIndent();
    writer.write(`export namespace factory {`);
    writer.writeLine();
    writer.increaseIndent();
    writeFactoryHelperFunctions();
    writeCreateAndUpdateFunctions();
    writer.decreaseIndent();
    writer.write(`}`);
    writer.writeLine();
    writeVisitorFunction();
    writer.decreaseIndent();
    writer.write(`}`);
    writer.writeLine();
    
    sys.writeFile(sys.resolvePath(combinePaths(__dirname, "../src/compiler/factory.generated.ts")), writer.getText());
    
    function writeFactoryHelperFunctions() {
        writer.rawWrite(`        function setModifiers(node: Node, modifiers: ModifiersArray) {
            if (modifiers) {
                node.flags |= modifiers.flags;
                node.modifiers = modifiers;
            }
        }
        function updateFrom<T extends Node>(oldNode: T, newNode: T): T {
            let flags = oldNode.flags;
            if (oldNode.modifiers) {
                flags &= oldNode.modifiers.flags;
            }
            
            if (newNode.modifiers) {
                flags |= newNode.modifiers.flags;
            }
            
            newNode.flags = flags;
            newNode.pos = oldNode.pos;
            newNode.end = oldNode.end;
            newNode.parent = oldNode.parent;
            return newNode;
        }`);
        writer.writeLine();
    }
    
    function writeCreateAndUpdateFunctions() {
        for (let syntaxNode of syntax) {
            writeCreateFunction(syntaxNode);
            writeUpdateFunction(syntaxNode);
        }
    }
    
    function writeCreateFunction(syntaxNode: SyntaxNode) {
        if (syntaxNode.kind.name === "SourceFile") {
            return;
        }
        
        writer.write(`export function create${syntaxNode.kind.name}(`);
        
        let indented = false;
        for (let i = 0; i < syntaxNode.members.length; ++i) {
            if (i > 0) {
                writer.write(`, `);
            }
            
            let member = syntaxNode.members[i];
            let paramText = `${member.symbol.name === "arguments" ? "_arguments" : member.symbol.name}?: ${member.typeNode.getText()}`;
            
            if (writer.getColumn() >= columnWrap - paramText.length) {
                writer.writeLine();
                if (!indented) {
                    indented = true;
                    writer.increaseIndent();
                }
            }
            
            writer.write(paramText);
        }
        
        let returnTypeText = `): ${syntaxNode.symbol.name} {`;
        
        if (writer.getColumn() >= columnWrap - returnTypeText.length) {
            writer.writeLine();
            if (!indented) {
                indented = true;
                writer.increaseIndent();
            }
        }
        
        writer.write(returnTypeText);
        writer.writeLine();
        if (indented) {
            writer.decreaseIndent();
            indented = false;
        }
        
        writer.increaseIndent();
        if (syntaxNode.members.length) {
            writer.write(`let node = createNode<${syntaxNode.symbol.name}>(SyntaxKind.${syntaxNode.kind.name});`);
            writer.writeLine();
            if (syntaxNode.members.length > 1) {
                writer.write(`if (arguments.length) {`);
                writer.writeLine();
                writer.increaseIndent();
            }
            
            for (let member of syntaxNode.members) {
                if (member.isModifiersArray) {
                    writer.write(`setModifiers(node, modifiers);`);
                }
                else {
                    writer.write(`node.${member.symbol.name} = ${member.symbol.name === "arguments" ? "_arguments" : member.symbol.name};`);
                }
                
                writer.writeLine();
            }
            
            if (syntaxNode.members.length > 1) {
                writer.decreaseIndent();
                writer.write(`}`);
                writer.writeLine();
            }
        
            writer.write(`return node;`);
            writer.writeLine();
        }
        else {
            writer.write(`return createNode<${syntaxNode.symbol.name}>(SyntaxKind.${syntaxNode.kind.name});`);
            writer.writeLine();
        }

        writer.decreaseIndent();
        writer.write(`}`);
        writer.writeLine();
    }
    
    function writeUpdateFunction(syntaxNode: SyntaxNode) {
        if (!syntaxNode.hasChildren || syntaxNode.kind.name === "SourceFile") {
            return;
        }
        
        writer.write(`export function update${syntaxNode.kind.name}(node: ${syntaxNode.symbol.name}`);

        let indented = false;
        for (let i = 0; i < syntaxNode.members.length; ++i) {
            let member = syntaxNode.members[i];
            if (member.isFactoryParam) {
                continue;
            }
            
            writer.write(`, `);
            
            let paramText = `${member.symbol.name === "arguments" ? "_arguments" : member.symbol.name}: ${member.typeNode.getText()}`;
            if (writer.getColumn() >= columnWrap - paramText.length) {
                writer.writeLine();
                if (!indented) {
                    indented = true;
                    writer.increaseIndent();
                }
            }

            writer.write(paramText);
        }

        let returnTypeText = `): ${syntaxNode.symbol.name} {`;
        if (writer.getColumn() >= columnWrap - returnTypeText.length) {
            writer.writeLine();
            if (!indented) {
                indented = true;
                writer.increaseIndent();
            }
        }
        
        writer.write(returnTypeText);
        writer.writeLine();
        if (indented) {
            writer.decreaseIndent();
            indented = false;
        }
        
        writer.increaseIndent();
        
        writer.write(`if (`);
        for (let i = 0; i < syntaxNode.members.length; ++i) {
            let member = syntaxNode.members[i];
            if (member.isFactoryParam) {
                continue;
            }
            
            if (i > 0) {
                writer.write(` || `);
            }
            
            let conditionText = `${member.symbol.name === "arguments" ? "_arguments" : member.symbol.name} !== node.${member.symbol.name}`;
            if (writer.getColumn() >= columnWrap - conditionText.length) {
                writer.writeLine();
                if (!indented) {
                    indented = true;
                    writer.increaseIndent();
                }
            }

            writer.write(conditionText);
        }

        writer.write(`) {`);
        writer.writeLine();
        if (indented) {
            writer.decreaseIndent();
            indented = false;
        }
        
        writer.increaseIndent();
        
        writer.write(`let newNode = create${syntaxNode.kind.name}(`);
        
        for (let i = 0; i < syntaxNode.members.length; ++i) {
            if (i > 0) {
                writer.write(`, `);
            }
            
            let member = syntaxNode.members[i];
            if (member.isFactoryParam) {
                writer.write(`node.${member.symbol.name}`);
            }
            else {
                writer.write(member.symbol.name === "arguments" ? "_arguments" : member.symbol.name);
            }
        }

        writer.write(`);`);
        writer.writeLine();
        
        writer.write(`return updateFrom(node, newNode);`);
        writer.writeLine();
        
        writer.decreaseIndent();
        writer.write(`}`);
        writer.writeLine();
        
        writer.write(`return node;`);
        writer.writeLine();

        writer.decreaseIndent();
        writer.write(`}`);
        writer.writeLine();
    }

    function writeVisitorFunction() {
        writer.write(`export function transformFallback<TNode extends Node>(node: TNode, transformer: Transformer): TNode;`);
        writer.writeLine();
        writer.write(`export function transformFallback(node: Node, transformer: Transformer): Node {`);
        writer.writeLine();
        writer.increaseIndent();

        writer.write(`if (!shouldTransformChildrenOfNode(node, transformer)) return node;`);
        writer.writeLine();
        
        writer.write(`switch (node.kind) {`);
        writer.writeLine();
        writer.increaseIndent();
        
        for (let syntaxNode of syntax) {
            if (!syntaxNode.hasChildren || syntaxNode.kind.name === "SourceFile") {
                continue;
            }
            
            writer.write(`case SyntaxKind.${syntaxNode.kind.name}:`);
            writer.writeLine();
            writer.increaseIndent();
            
            writer.write(`return factory.update${syntaxNode.kind.name}(`);
            writer.writeLine();
            writer.increaseIndent();
            writer.write(`<${syntaxNode.symbol.name}>node`);
            
            for (let member of syntaxNode.members) {
                writer.write(`, `);
                writer.writeLine();
                if (member.isNodeArray) {
                    writer.write(`transformNodes((<${syntaxNode.symbol.name}>node).${member.symbol.name}, transformer)`);
                }
                else if (member.isModifiersArray) {
                    writer.write(`<ModifiersArray>transformNodes((<${syntaxNode.symbol.name}>node).${member.symbol.name}, transformer)`);
                }
                else {
                    writer.write(`transform((<${syntaxNode.symbol.name}>node).${member.symbol.name}, transformer)`);
                }
            }
            
            writer.write(`);`);
            writer.writeLine();
            writer.decreaseIndent();
            writer.decreaseIndent();
        }
        
        writer.write(`default:`);
        writer.writeLine();
        writer.increaseIndent();
        writer.write(`return node;`);
        writer.writeLine();
        writer.decreaseIndent();        
        writer.decreaseIndent();
        writer.write(`}`);
        writer.writeLine();
        
        writer.decreaseIndent();
        writer.write('}');
        writer.writeLine();
    }
}