
import { Observable } from 'rxjs';
import { Configuration } from 'webpack';

import { BuilderContext, createBuilder } from '@angular-devkit/architect';
import {
    BrowserBuilderOptions, BrowserBuilderOutput, executeBrowserBuilder
} from '@angular-devkit/build-angular';
import { json } from '@angular-devkit/core';

import { applyCustomAngularPluginOptions } from './transformer';

export function buildCustomWebpackBrowser(options: BrowserBuilderOptions, context: BuilderContext): Observable<BrowserBuilderOutput> {
    return executeBrowserBuilder(options, context, {
        webpackConfiguration: (config: Configuration) => {
            applyCustomAngularPluginOptions(config, options);
            return config;
        }
    });
}

export default createBuilder<json.JsonObject & BrowserBuilderOptions>(buildCustomWebpackBrowser);
