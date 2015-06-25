var typescript_1 = require("./typescript");
var columnWrap = 150;
var emptyArray = [];
var kindPattern = /@kind\s*\(\s*SyntaxKind\.(\w+)\s*\)/g;
var indentStrings = ["", "    "];
var options = typescript_1.getDefaultCompilerOptions();
options.noLib = true;
options.noResolve = true;
var host = typescript_1.createCompilerHost(options);
var file = host.getCanonicalFileName(typescript_1.sys.resolvePath(typescript_1.combinePaths(__dirname, "../src/compiler/types.ts")));
var program = typescript_1.createProgram([file], options, host);
var checker = program.getTypeChecker();
var sourceFile = program.getSourceFile(file);
var writer;
var nodeSymbol;
var declarationSymbol;
var nodeArraySymbol;
var modifiersArraySymbol;
var syntaxKindSymbol;
var syntaxKindType;
var syntaxKindSymbols;
var syntax = [];
var subtypesOfNode = [];
var memberExcludes = {
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
    "JSDocFunctionType": ["decorators", "modifiers", "name", "typeParameters"]
};
var memberOrderOverrides = {
    "*": ["decorators", "modifiers"],
    "MethodSignature": ["name", "questionToken"],
    "DoStatement": ["statement", "expression"],
    "FunctionExpression": ["decorators", "modifiers", "asteriskToken", "name", "typeParameters", "parameters", "type"],
    "ArrowFunction": ["decorators", "modifiers", "typeParameters", "parameters", "type"],
    "FunctionDeclaration": ["decorators", "modifiers", "asteriskToken", "name", "typeParameters", "parameters", "type"],
    "Constructor": ["decorators", "modifiers", "parameters", "type", "body"],
    "MethodDeclaration": ["decorators", "modifiers", "asteriskToken", "name", "typeParameters", "parameters", "type", "body"],
    "GetAccessor": ["decorators", "modifiers", "asteriskToken", "name", "parameters", "type", "body"],
    "SetAccessor": ["decorators", "modifiers", "asteriskToken", "name", "parameters", "type", "body"]
};
discoverSymbols();
discoverSyntaxNodes();
generateFactory();
function discoverSymbols() {
    visit(sourceFile);
    function visit(node) {
        switch (node.kind) {
            case 230 /* SourceFile */:
            case 208 /* ModuleDeclaration */:
            case 209 /* ModuleBlock */:
                typescript_1.forEachChild(node, visit);
                break;
            case 205 /* InterfaceDeclaration */:
                visitInterfaceDeclaration(node);
                break;
            case 207 /* EnumDeclaration */:
                visitEnumDeclaration(node);
                break;
        }
    }
    function visitInterfaceDeclaration(node) {
        var name = node.name;
        var text = name.getText();
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
    function visitEnumDeclaration(node) {
        var name = node.name;
        var text = name.getText();
        if (text === "SyntaxKind") {
            syntaxKindSymbol = checker.getSymbolAtLocation(name);
            syntaxKindType = checker.getTypeAtLocation(name);
        }
    }
}
function discoverSyntaxNodes() {
    visit(sourceFile);
    syntax.sort(function (a, b) {
        var aValue = checker.getConstantValue(a.kind.declarations[0]);
        var bValue = checker.getConstantValue(b.kind.declarations[0]);
        return aValue - bValue;
    });
    function visit(node) {
        switch (node.kind) {
            case 230 /* SourceFile */:
            case 208 /* ModuleDeclaration */:
            case 209 /* ModuleBlock */:
                typescript_1.forEachChild(node, visit);
                break;
            case 205 /* InterfaceDeclaration */:
                visitInterfaceDeclaration(node);
                break;
            case 206 /* TypeAliasDeclaration */:
                visitTypeAliasDeclaration(node);
                break;
        }
    }
    function visitInterfaceDeclaration(node) {
        var kinds = getKinds(node);
        if (!kinds)
            return;
        var name = node.name;
        var symbol = checker.getSymbolAtLocation(name);
        if (symbol) {
            createSyntaxNodes(symbol, kinds);
        }
    }
    function visitTypeAliasDeclaration(node) {
        var kinds = getKinds(node);
        if (!kinds)
            return;
        var name = node.name;
        var symbol = checker.getSymbolAtLocation(name);
        if (symbol) {
            createSyntaxNodes(symbol, kinds);
        }
    }
    function createSyntaxNodes(symbol, kinds) {
        var isDeclaration = isSubtypeOf(symbol.declarations[0], declarationSymbol);
        for (var _i = 0; _i < kinds.length; _i++) {
            var kind = kinds[_i];
            var hasChildren = false;
            var type = checker.getDeclaredTypeOfSymbol(symbol);
            var minArgumentCount = 0;
            var exclusions = memberExcludes[kind.name] || memberExcludes["*"];
            var members = [];
            for (var _a = 0, _b = checker.getPropertiesOfType(type); _a < _b.length; _a++) {
                var property = _b[_a];
                if (exclusions.indexOf(property.name) >= 0) {
                    continue;
                }
                if (property.name === "decorators" || property.name === "modifiers") {
                    if (!isDeclaration || symbol.name === "TypeParameterDeclaration")
                        continue;
                }
                else if (property.name === "questionToken") {
                    if (symbol.name === "FunctionExpression" || symbol.name === "FunctionDeclaration" || symbol.name === "ArrowFunction") {
                        continue;
                    }
                }
                else if (property.parent === nodeSymbol || property.name === "parent") {
                    continue;
                }
                var typeNode = getTypeNodeForProperty(property);
                if (!typeNode) {
                    continue;
                }
                var typeSymbol = isTypeReferenceNode(typeNode) ? checker.getSymbolAtLocation(typeNode.typeName) : undefined;
                var isOptional = !!property.declarations[0].questionToken;
                var isFactoryParam = isFactoryParamProperty(property);
                var propertyIsNodeArray = isNodeArray(typeNode);
                var propertyIsModifiersArray = !propertyIsNodeArray && isModifiersArray(typeNode);
                var propertyIsNode = !propertyIsNodeArray && !propertyIsModifiersArray && isSubtypeOf(typeNode, nodeSymbol);
                var isChild = propertyIsNodeArray || propertyIsModifiersArray || propertyIsNode;
                if (isFactoryParam || isChild) {
                    if (isChild)
                        hasChildren = true;
                    members.push({
                        symbol: property,
                        typeNode: typeNode,
                        typeSymbol: typeSymbol,
                        isOptional: isOptional,
                        isFactoryParam: isFactoryParam,
                        isNodeArray: propertyIsNodeArray,
                        isModifiersArray: propertyIsModifiersArray,
                        isNode: propertyIsNode,
                        isChild: isChild
                    });
                    if (!isOptional) {
                        minArgumentCount = members.length;
                    }
                }
            }
            var overrides = memberOrderOverrides[kind.name] || memberOrderOverrides["*"];
            var indices = members.map(function (_, i) { return i; });
            indices.sort(function (a, b) {
                var aMember = members[a];
                var bMember = members[b];
                var aOverride = overrides.indexOf(aMember.symbol.name);
                var bOverride = overrides.indexOf(bMember.symbol.name);
                if (aOverride >= 0) {
                    return bOverride >= 0 ? aOverride - bOverride : -1;
                }
                else if (bOverride >= 0) {
                    return +1;
                }
                return a - b;
            });
            var result = indices.map(function (i) { return members[i]; });
            var syntaxNode = { kind: kind, symbol: symbol, type: type, members: result, hasChildren: hasChildren, minArgumentCount: minArgumentCount };
            syntax.push(syntaxNode);
        }
    }
    function getTypeNodeForProperty(property) {
        return property.declarations[0].type;
    }
    function isTypeReferenceNode(node) {
        return node ? node.kind === 144 /* TypeReference */ : false;
    }
    function isUnionTypeNode(node) {
        return node ? node.kind === 151 /* UnionType */ : false;
    }
    function isInterfaceDeclaration(node) {
        return node ? node.kind === 205 /* InterfaceDeclaration */ : false;
    }
    function isTypeAliasDeclaration(node) {
        return node ? node.kind === 206 /* TypeAliasDeclaration */ : false;
    }
    function isExpressionWithTypeArguments(node) {
        return node ? node.kind === 179 /* ExpressionWithTypeArguments */ : false;
    }
    function isNodeArray(typeNode) {
        return isTypeReferenceNode(typeNode) ? checker.getSymbolAtLocation(typeNode.typeName) === nodeArraySymbol : false;
    }
    function isModifiersArray(typeNode) {
        return isTypeReferenceNode(typeNode) ? checker.getSymbolAtLocation(typeNode.typeName) === modifiersArraySymbol : false;
    }
    function isSubtypeOf(node, superTypeSymbol) {
        if (isInterfaceDeclaration(node)) {
            if (node.heritageClauses) {
                for (var _i = 0, _a = node.heritageClauses[0].types; _i < _a.length; _i++) {
                    var superType = _a[_i];
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
            for (var _b = 0, _c = node.types; _b < _c.length; _b++) {
                var constituentType = _c[_b];
                if (isSubtypeOf(constituentType, superTypeSymbol)) {
                    return true;
                }
            }
        }
        else {
            var typeSymbol = isTypeReferenceNode(node) ? checker.getSymbolAtLocation(node.typeName)
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
    function isFactoryParamProperty(property) {
        for (var _i = 0, _a = property.declarations; _i < _a.length; _i++) {
            var decl = _a[_i];
            if (forEachCommentRange(decl, hasFactoryParamAnnotation)) {
                return true;
            }
        }
        return false;
    }
    function hasFactoryParamAnnotation(range) {
        var text = sourceFile.text;
        var comment = text.substring(range.pos, range.end);
        return comment.indexOf("@factoryparam") >= 0;
    }
    function getKinds(node) {
        var kinds;
        forEachCommentRange(node, readKinds);
        return kinds;
        function readKinds(range) {
            var text = sourceFile.text;
            var comment = text.substring(range.pos, range.end);
            var match;
            while (match = kindPattern.exec(comment)) {
                if (!kinds) {
                    kinds = [];
                }
                var symbol = typescript_1.getProperty(syntaxKindSymbol.exports, match[1]);
                if (symbol) {
                    kinds.push(symbol);
                }
            }
        }
    }
    function forEachCommentRange(node, cbNode) {
        if (node) {
            var leadingCommentRanges = typescript_1.getLeadingCommentRanges(sourceFile.text, node.pos);
            if (leadingCommentRanges) {
                for (var _i = 0; _i < leadingCommentRanges.length; _i++) {
                    var range = leadingCommentRanges[_i];
                    var result = cbNode(range);
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
    writer = typescript_1.createTextWriter(host.getNewLine());
    writer.write("// <auto-generated />");
    writer.writeLine();
    writer.write("/// <reference path=\"parser.ts\" />");
    writer.writeLine();
    writer.write("/// <reference path=\"factory.ts\" />");
    writer.writeLine();
    writer.write("namespace ts {");
    writer.writeLine();
    writer.increaseIndent();
    writer.write("export namespace factory {");
    writer.writeLine();
    writer.increaseIndent();
    writeFactoryHelperFunctions();
    writeCreateAndUpdateFunctions();
    writer.decreaseIndent();
    writer.write("}");
    writer.writeLine();
    writeVisitorFunction();
    writer.decreaseIndent();
    writer.write("}");
    writer.writeLine();
    typescript_1.sys.writeFile(typescript_1.sys.resolvePath(typescript_1.combinePaths(__dirname, "../src/compiler/factory.generated.ts")), writer.getText());
    function writeFactoryHelperFunctions() {
        writer.rawWrite("        function setModifiers(node: Node, modifiers: ModifiersArray) {\n            if (modifiers) {\n                node.flags |= modifiers.flags;\n                node.modifiers = modifiers;\n            }\n        }\n        function updateFrom<T extends Node>(oldNode: T, newNode: T): T {\n            let flags = oldNode.flags;\n            if (oldNode.modifiers) {\n                flags &= oldNode.modifiers.flags;\n            }\n            \n            if (newNode.modifiers) {\n                flags |= newNode.modifiers.flags;\n            }\n            \n            newNode.flags = flags;\n            newNode.pos = oldNode.pos;\n            newNode.end = oldNode.end;\n            newNode.parent = oldNode.parent;\n            return newNode;\n        }");
        writer.writeLine();
    }
    function writeCreateAndUpdateFunctions() {
        for (var _i = 0; _i < syntax.length; _i++) {
            var syntaxNode = syntax[_i];
            writeCreateFunction(syntaxNode);
            writeUpdateFunction(syntaxNode);
        }
    }
    function writeCreateFunction(syntaxNode) {
        if (syntaxNode.kind.name === "SourceFile") {
            return;
        }
        writer.write("export function create" + syntaxNode.kind.name + "(");
        var indented = false;
        for (var i = 0; i < syntaxNode.members.length; ++i) {
            if (i > 0) {
                writer.write(", ");
            }
            var member = syntaxNode.members[i];
            var paramText = (member.symbol.name === "arguments" ? "_arguments" : member.symbol.name) + "?: " + member.typeNode.getText();
            if (writer.getColumn() >= columnWrap - paramText.length) {
                writer.writeLine();
                if (!indented) {
                    indented = true;
                    writer.increaseIndent();
                }
            }
            writer.write(paramText);
        }
        var returnTypeText = "): " + syntaxNode.symbol.name + " {";
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
            writer.write("let node = createNode<" + syntaxNode.symbol.name + ">(SyntaxKind." + syntaxNode.kind.name + ");");
            writer.writeLine();
            if (syntaxNode.members.length > 1) {
                writer.write("if (arguments.length) {");
                writer.writeLine();
                writer.increaseIndent();
            }
            for (var _i = 0, _a = syntaxNode.members; _i < _a.length; _i++) {
                var member = _a[_i];
                if (member.isModifiersArray) {
                    writer.write("setModifiers(node, modifiers);");
                }
                else {
                    writer.write("node." + member.symbol.name + " = " + (member.symbol.name === "arguments" ? "_arguments" : member.symbol.name) + ";");
                }
                writer.writeLine();
            }
            if (syntaxNode.members.length > 1) {
                writer.decreaseIndent();
                writer.write("}");
                writer.writeLine();
            }
            writer.write("return node;");
            writer.writeLine();
        }
        else {
            writer.write("return createNode<" + syntaxNode.symbol.name + ">(SyntaxKind." + syntaxNode.kind.name + ");");
            writer.writeLine();
        }
        writer.decreaseIndent();
        writer.write("}");
        writer.writeLine();
    }
    function writeUpdateFunction(syntaxNode) {
        if (!syntaxNode.hasChildren || syntaxNode.kind.name === "SourceFile") {
            return;
        }
        writer.write("export function update" + syntaxNode.kind.name + "(node: " + syntaxNode.symbol.name);
        var indented = false;
        for (var i = 0; i < syntaxNode.members.length; ++i) {
            var member = syntaxNode.members[i];
            if (member.isFactoryParam) {
                continue;
            }
            writer.write(", ");
            var paramText = (member.symbol.name === "arguments" ? "_arguments" : member.symbol.name) + ": " + member.typeNode.getText();
            if (writer.getColumn() >= columnWrap - paramText.length) {
                writer.writeLine();
                if (!indented) {
                    indented = true;
                    writer.increaseIndent();
                }
            }
            writer.write(paramText);
        }
        var returnTypeText = "): " + syntaxNode.symbol.name + " {";
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
        writer.write("if (");
        for (var i = 0; i < syntaxNode.members.length; ++i) {
            var member = syntaxNode.members[i];
            if (member.isFactoryParam) {
                continue;
            }
            if (i > 0) {
                writer.write(" || ");
            }
            var conditionText = (member.symbol.name === "arguments" ? "_arguments" : member.symbol.name) + " !== node." + member.symbol.name;
            if (writer.getColumn() >= columnWrap - conditionText.length) {
                writer.writeLine();
                if (!indented) {
                    indented = true;
                    writer.increaseIndent();
                }
            }
            writer.write(conditionText);
        }
        writer.write(") {");
        writer.writeLine();
        if (indented) {
            writer.decreaseIndent();
            indented = false;
        }
        writer.increaseIndent();
        writer.write("let newNode = create" + syntaxNode.kind.name + "(");
        for (var i = 0; i < syntaxNode.members.length; ++i) {
            if (i > 0) {
                writer.write(", ");
            }
            var member = syntaxNode.members[i];
            if (member.isFactoryParam) {
                writer.write("node." + member.symbol.name);
            }
            else {
                writer.write(member.symbol.name === "arguments" ? "_arguments" : member.symbol.name);
            }
        }
        writer.write(");");
        writer.writeLine();
        writer.write("return updateFrom(node, newNode);");
        writer.writeLine();
        writer.decreaseIndent();
        writer.write("}");
        writer.writeLine();
        writer.write("return node;");
        writer.writeLine();
        writer.decreaseIndent();
        writer.write("}");
        writer.writeLine();
    }
    function writeVisitorFunction() {
        writer.write("export function transformFallback<TNode extends Node>(node: TNode, cbNode: Transformer, state?: any): TNode;");
        writer.writeLine();
        writer.write("export function transformFallback(node: Node, cbNode: Transformer, state?: any): Node {");
        writer.writeLine();
        writer.increaseIndent();
        writer.write("if (!node || !cbNode) return node;");
        writer.writeLine();
        writer.write("switch (node.kind) {");
        writer.writeLine();
        writer.increaseIndent();
        for (var _i = 0; _i < syntax.length; _i++) {
            var syntaxNode = syntax[_i];
            if (!syntaxNode.hasChildren || syntaxNode.kind.name === "SourceFile") {
                continue;
            }
            writer.write("case SyntaxKind." + syntaxNode.kind.name + ":");
            writer.writeLine();
            writer.increaseIndent();
            writer.write("return factory.update" + syntaxNode.kind.name + "(");
            writer.writeLine();
            writer.increaseIndent();
            writer.write("<" + syntaxNode.symbol.name + ">node");
            for (var _a = 0, _b = syntaxNode.members; _a < _b.length; _a++) {
                var member = _b[_a];
                writer.write(", ");
                writer.writeLine();
                if (member.isNodeArray) {
                    writer.write("transformNodes((<" + syntaxNode.symbol.name + ">node)." + member.symbol.name + ", cbNode, state)");
                }
                else if (member.isModifiersArray) {
                    writer.write("<ModifiersArray>transformNodes((<" + syntaxNode.symbol.name + ">node)." + member.symbol.name + ", cbNode, state)");
                }
                else {
                    writer.write("transform((<" + syntaxNode.symbol.name + ">node)." + member.symbol.name + ", cbNode, state)");
                }
            }
            writer.write(");");
            writer.writeLine();
            writer.decreaseIndent();
            writer.decreaseIndent();
        }
        writer.write("default:");
        writer.writeLine();
        writer.increaseIndent();
        writer.write("return node;");
        writer.writeLine();
        writer.decreaseIndent();
        writer.decreaseIndent();
        writer.write("}");
        writer.writeLine();
        writer.decreaseIndent();
        writer.write('}');
        writer.writeLine();
    }
}
//# sourceMappingURL=file:///C:/dev/TypeScript/scripts/processTypes.js.map