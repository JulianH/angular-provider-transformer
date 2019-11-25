import * as ts from 'typescript';

interface CustomLayerDefinition {
    replace: string;
    with: {
        className: string;
        import: string;
    };
}

const customLayerSpecifications: CustomLayerDefinition[] = [{
    replace: 'Service1',
    with: {
        className: 'Service2',
        import: './service2'
    }
}];

/**
 * main exported function which applies the custom transformer to the AngularCompilerPlugin
 */
export function applyCustomAngularPluginOptions(webpackConfig: any, options: any): void {
    if (!webpackConfig.plugins || !Array.isArray(webpackConfig.plugins)) {
        return;
    }
    const angularCompilerPlugin: any = webpackConfig.plugins.find((plugin: any) => plugin && plugin.constructor && plugin.constructor.name === 'AngularCompilerPlugin');
    if (!angularCompilerPlugin) {
        return;
    }
    // adding the tranformer method in the beginning of the typescript before-compile transformers
    angularCompilerPlugin._transformers = [customLayerTransformer, ...angularCompilerPlugin._transformers];
}

/**
 * typescript transformer entry point
 */
function customLayerTransformer(context: ts.TransformationContext): any {
    return (rootNode: ts.SourceFile) => {
        const newImports: ts.ImportDeclaration[] = [];
        function visit(node: ts.Node): ts.Node {
            if (ts.isClassDeclaration(node)) {
                const decorators: any = ts.visitNodes(node.decorators, (decorator: ts.Decorator) => visitClassDeclaration(decorator, newImports));

                // apply the updated decorator
                return ts.updateClassDeclaration(
                    node,
                    decorators,
                    node.modifiers,
                    node.name,
                    node.typeParameters,
                    node.heritageClauses,
                    node.members
                );
            }
            return ts.visitEachChild(node, visit, context);
        }

        /**
         * if new imports are specified, then add them to be beginning of the statements
         */
        const updated: ts.SourceFile = ts.visitNode(rootNode, visit);
        if (newImports.length > 0) {
            return ts.updateSourceFileNode(updated, [...newImports, ...updated.statements]);
        } else {
            return updated;
        }
    };
}

/**
 * called for each class declaration. Updates the decorator by replacing the providers array
 */
function visitClassDeclaration(decorator: ts.Decorator, newImports: ts.ImportDeclaration[]): ts.Decorator {
    if (!isComponentDecorator(decorator)) {
        return decorator;
    } else if (!ts.isCallExpression(decorator.expression)) {
        return decorator;
    }

    const decoratorFactory: ts.CallExpression = decorator.expression;
    const args: ts.NodeArray<ts.Expression> = decoratorFactory.arguments;
    if (args.length !== 1 || !ts.isObjectLiteralExpression(args[0])) {
        // Unsupported component metadata
        return decorator;
    }

    const objectExpression: ts.ObjectLiteralExpression = args[0] as ts.ObjectLiteralExpression;
    const replacements: ts.Expression[] = [];

    // visit all component decorator properties
    let properties: ts.NodeArray<ts.ObjectLiteralElementLike> = ts.visitNodes(
        objectExpression.properties,
        (propertyNode: ts.ObjectLiteralElementLike) => visitComponentMetadata(propertyNode, replacements, newImports)
    );

    if (replacements.length > 0) {
        // create a new providers Component decorator property with all the new provider replacements
        const providers: ts.PropertyAssignment = ts.createPropertyAssignment(
            ts.createIdentifier('providers'),
            ts.createArrayLiteral(replacements)
        );

        // replace Component decorator properties with updated ones
        properties = ts.createNodeArray([...properties, providers]);
    }

    return ts.updateDecorator(
        decorator,
        ts.updateCall(
            decoratorFactory,
            decoratorFactory.expression,
            decoratorFactory.typeArguments,
            [ts.updateObjectLiteral(objectExpression, properties)]
        )
    );
}

/**
 * each Component decorator object entry is visited here
 */
function visitComponentMetadata(node: ts.ObjectLiteralElementLike, replacements: ts.Expression[], newImports: ts.ImportDeclaration[]): ts.VisitResult<ts.Node> {
    if (!ts.isPropertyAssignment(node) || ts.isComputedPropertyName(node.name) || !ts.isArrayLiteralExpression(node.initializer)) {
        return node;
    }

    const name: string = node.name.text;
    if (name === 'providers') {
        /**
         * in case of the providers array, we override the existing one by creating a new list of providers by visiting all existing entries
         */
        const expressions: ts.NodeArray<ts.Expression> = ts.visitNodes(
            node.initializer.elements,
            (providerEntry: ts.Expression) => createOverriddenProviderEntry(providerEntry, newImports));
        replacements.push(...expressions);
        return undefined; // delete the providers entry, the replacements gets then assigned 1 level up
    }
    return node;
}

/**
 * type guard which checks if the given node is an Decorator
 */
function isComponentDecorator(node: ts.Node): node is ts.Decorator {
    if (!ts.isDecorator(node)) {
        return false;
    } else if (!ts.isCallExpression(node.expression)) {
        return false;
    } else if (ts.isIdentifier(node.expression.expression)) {
        return node.expression.expression.text === 'Component' || node.expression.expression.text === 'Directive';
    } else {
        return false;
    }
}

/**
 * takes an provider array entry and
 * - convert it to a StaticProvider representation
 * - apply the custom layer replacement on it
 * @param providerEntry the current representation of an provider array entry
 */
function createOverriddenProviderEntry(providerEntry: ts.Expression, newImports: ts.ImportDeclaration[]): ts.Expression {
    // provide: [Service]
    if (ts.isIdentifier(providerEntry)) {
        return ts.createObjectLiteral([
            ts.createPropertyAssignment('provide', providerEntry),
            ts.createPropertyAssignment('useClass', getCustomLayerImplementation(providerEntry, newImports))
        ]);
    } else if (ts.isObjectLiteralExpression(providerEntry)) {
        // provide: [{provide: Service, useClass: AnotherService}]
        const provideValue: ts.ObjectLiteralElementLike = providerEntry.properties.find((property: ts.ObjectLiteralElementLike) => property.name.getText() === 'provide');
        const useClassValue: ts.ObjectLiteralElementLike = providerEntry.properties.find((property: ts.ObjectLiteralElementLike) => property.name.getText() === 'useClass');
        if (provideValue && useClassValue && ts.isPropertyAssignment(useClassValue)) {
            return ts.createObjectLiteral([
                provideValue,
                ts.createPropertyAssignment('useClass', getCustomLayerImplementation(useClassValue.initializer, newImports))
            ]);
        }
    }

    return providerEntry;
}

/**
 * returns the custom layer implementation of a given identifier, returns the default if no custom layer specific is found.
 * creates also an import declaration in the source file, based on the custom layer specification
 * @param classIdentifier the default implementation
 */
function getCustomLayerImplementation(classIdentifier: ts.Expression, newImports: ts.ImportDeclaration[]): ts.Expression {
    if (!ts.isIdentifier(classIdentifier)) {
        return classIdentifier;
    }
    const customLayerImplementation: CustomLayerDefinition = customLayerSpecifications.find((entry: CustomLayerDefinition) => entry.replace === classIdentifier.text);
    if (!customLayerImplementation) {
        return classIdentifier;
    }

    // creating a new import declation: import { CustomLayerImplementation } from '@app/customLayer/...';
    const newIdentifier: ts.Identifier = ts.createIdentifier(customLayerImplementation.with.className);
    const namedImports: ts.NamedImports = ts.createNamedImports([ts.createImportSpecifier(undefined, newIdentifier)]);
    const importClause: ts.ImportClause = ts.createImportClause(undefined, namedImports);
    const newNode: ts.ImportDeclaration = ts.createImportDeclaration(undefined, undefined, importClause, ts.createLiteral(customLayerImplementation.with.import));
    newImports.push(newNode);

    console.log('%s %s replace \x1b[33m%s\x1b[0m -> \x1b[32m%s\x1b[0m',
        'Appying custom layer on file',
        classIdentifier.getSourceFile().fileName,
        classIdentifier.text,
        newIdentifier.text
    );
    return newIdentifier;
}
