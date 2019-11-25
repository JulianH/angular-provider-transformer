"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ts = require("typescript");
const customLayerSpecifications = [{
        replace: 'Service1',
        with: {
            className: 'Service2',
            import: './service2'
        }
    }];
function applyCustomAngularPluginOptions(webpackConfig, options) {
    if (!webpackConfig.plugins || !Array.isArray(webpackConfig.plugins)) {
        return;
    }
    const angularCompilerPlugin = webpackConfig.plugins.find((plugin) => plugin && plugin.constructor && plugin.constructor.name === 'AngularCompilerPlugin');
    if (!angularCompilerPlugin) {
        return;
    }
    angularCompilerPlugin._transformers = [customLayerTransformer, ...angularCompilerPlugin._transformers];
}
exports.applyCustomAngularPluginOptions = applyCustomAngularPluginOptions;
function customLayerTransformer(context) {
    return (rootNode) => {
        const newImports = [];
        function visit(node) {
            if (ts.isClassDeclaration(node)) {
                const decorators = ts.visitNodes(node.decorators, (decorator) => visitClassDeclaration(decorator, newImports));
                return ts.updateClassDeclaration(node, decorators, node.modifiers, node.name, node.typeParameters, node.heritageClauses, node.members);
            }
            return ts.visitEachChild(node, visit, context);
        }
        const updated = ts.visitNode(rootNode, visit);
        if (newImports.length > 0) {
            return ts.updateSourceFileNode(updated, [...newImports, ...updated.statements]);
        }
        else {
            return updated;
        }
    };
}
function visitClassDeclaration(decorator, newImports) {
    if (!isComponentDecorator(decorator)) {
        return decorator;
    }
    else if (!ts.isCallExpression(decorator.expression)) {
        return decorator;
    }
    const decoratorFactory = decorator.expression;
    const args = decoratorFactory.arguments;
    if (args.length !== 1 || !ts.isObjectLiteralExpression(args[0])) {
        return decorator;
    }
    const objectExpression = args[0];
    const replacements = [];
    let properties = ts.visitNodes(objectExpression.properties, (propertyNode) => visitComponentMetadata(propertyNode, replacements, newImports));
    if (replacements.length > 0) {
        const providers = ts.createPropertyAssignment(ts.createIdentifier('providers'), ts.createArrayLiteral(replacements));
        properties = ts.createNodeArray([...properties, providers]);
    }
    return ts.updateDecorator(decorator, ts.updateCall(decoratorFactory, decoratorFactory.expression, decoratorFactory.typeArguments, [ts.updateObjectLiteral(objectExpression, properties)]));
}
function visitComponentMetadata(node, replacements, newImports) {
    if (!ts.isPropertyAssignment(node) || ts.isComputedPropertyName(node.name) || !ts.isArrayLiteralExpression(node.initializer)) {
        return node;
    }
    const name = node.name.text;
    if (name === 'providers') {
        const expressions = ts.visitNodes(node.initializer.elements, (providerEntry) => createOverriddenProviderEntry(providerEntry, newImports));
        replacements.push(...expressions);
        return undefined;
    }
    return node;
}
function isComponentDecorator(node) {
    if (!ts.isDecorator(node)) {
        return false;
    }
    else if (!ts.isCallExpression(node.expression)) {
        return false;
    }
    else if (ts.isIdentifier(node.expression.expression)) {
        return node.expression.expression.text === 'Component' || node.expression.expression.text === 'Directive';
    }
    else {
        return false;
    }
}
function createOverriddenProviderEntry(providerEntry, newImports) {
    if (ts.isIdentifier(providerEntry)) {
        return ts.createObjectLiteral([
            ts.createPropertyAssignment('provide', providerEntry),
            ts.createPropertyAssignment('useClass', getCustomLayerImplementation(providerEntry, newImports))
        ]);
    }
    else if (ts.isObjectLiteralExpression(providerEntry)) {
        const provideValue = providerEntry.properties.find((property) => property.name.getText() === 'provide');
        const useClassValue = providerEntry.properties.find((property) => property.name.getText() === 'useClass');
        if (provideValue && useClassValue && ts.isPropertyAssignment(useClassValue)) {
            return ts.createObjectLiteral([
                provideValue,
                ts.createPropertyAssignment('useClass', getCustomLayerImplementation(useClassValue.initializer, newImports))
            ]);
        }
    }
    return providerEntry;
}
function getCustomLayerImplementation(classIdentifier, newImports) {
    if (!ts.isIdentifier(classIdentifier)) {
        return classIdentifier;
    }
    const customLayerImplementation = customLayerSpecifications.find((entry) => entry.replace === classIdentifier.text);
    if (!customLayerImplementation) {
        return classIdentifier;
    }
    const newIdentifier = ts.createIdentifier(customLayerImplementation.with.className);
    const namedImports = ts.createNamedImports([ts.createImportSpecifier(undefined, newIdentifier)]);
    const importClause = ts.createImportClause(undefined, namedImports);
    const newNode = ts.createImportDeclaration(undefined, undefined, importClause, ts.createLiteral(customLayerImplementation.with.import));
    newImports.push(newNode);
    console.log('%s %s replace \x1b[33m%s\x1b[0m -> \x1b[32m%s\x1b[0m', 'Appying custom layer on file', classIdentifier.getSourceFile().fileName, classIdentifier.text, newIdentifier.text);
    return newIdentifier;
}
