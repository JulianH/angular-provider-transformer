"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const architect_1 = require("@angular-devkit/architect");
const build_angular_1 = require("@angular-devkit/build-angular");
const transformer_1 = require("./transformer");
function buildCustomWebpackBrowser(options, context) {
    return build_angular_1.executeBrowserBuilder(options, context, {
        webpackConfiguration: (config) => {
            transformer_1.applyCustomAngularPluginOptions(config, options);
            return config;
        }
    });
}
exports.buildCustomWebpackBrowser = buildCustomWebpackBrowser;
exports.default = architect_1.createBuilder(buildCustomWebpackBrowser);
