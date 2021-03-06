"use strict";

const path = require("path");
const debug = require("debug")("mdtk/markdown-it/postprocess/resolve");
const {resolve} = require("../utils");

const IS_URL = /^[^:]+:\/\//;

module.exports = function (mdtk, tokens) {
    debug("start");
    const resolver = new Resolver(mdtk.options.include, mdtk.dependencyManager);
    for (let i = 0, len = tokens.length; i < len; i++) {
        resolver.resolve(tokens[i]);
        if (Array.isArray(tokens[i].children)) {
            for (let j = 0, clen = tokens[i].children.length; j < clen; j++) {
                resolver.resolve(tokens[i].children[j]);
            }
        }
    }
    debug("done");
    return tokens;
};

/**
 * Assets referenced using the @css, @js (etc...) extensions are resolved relative
 * to the markdown fragment or to any of the include paths.
 *
 * The Resolver processes the token stream to declare the resulting dependencies
 * in such a way that all referenced assets use a path relative to the include path,
 * under the "assets/" prefix.
 *
 * For example:
 * 
 * includeA/a/b/c.js
 * includeB/a/d/e.js
 *
 * Will resolve to the following URLs:
 * 
 * assets/a/b/c.js
 * assets/a/d/e.js
 */
class Resolver {
    constructor(search, deps) {
        this.search = search;
        this.deps = deps;
    }

    resolve(token) {
        debug("resolveToken", token);
        if (token.tag === "img") {
            this.resolveImgToken(token);
        } else if (token.type === "css") {
            this.resolveLinkToken(token);
        } else if (token.type === "script_open") {
            this.resolveScriptToken(token);
        } else if (token.spec) {
            this.resolveVega(token);
        }
        this.resolveKnownAttributes(token);
    }

    resolveKnownAttributes(token) {
        var bkg = token.attrGet("data-background");
        if (bkg && token.src) {
            bkg = this._resolve(token.src, bkg);
            token.attrSet("data-background", bkg);
        }
    }

    resolveImgToken(token) {
        let src = token.attrGet("src");
        let relSrc = this._resolve(token.src, src);
        token.attrSet("src", relSrc);
    }

    resolveLinkToken(token) {
        let href = token.attrGet("href");
        let relHref = this._resolve(token.src, href);
        token.attrSet("href", relHref);

        let rel = token.attrGet("rel");
        if (rel === "stylesheet") {
            const fs = require("fs");
            const absHref = this.normalize(token.src, href);
            if (absHref) {
                var contents = fs.readFileSync(absHref, "utf-8");
                contents.replace(/url\(([^)]+)\)/g, (_, ref) => {
                    return this._resolve(absHref, ref);
                });
            }
        }
    }

    resolveScriptToken(token) {
        let src = token.attrGet("src");
        let relSrc = this._resolve(token.src, src);
        token.attrSet("src", relSrc);
    }

    resolveVega(token) {
        if (token.spec) {
            var signals = {};
            function walk(spec) {
                Object.keys(spec)
                    .forEach(k => {
                        let v = spec[k];
                        if (k === "signals") {
                            v.forEach(signal => {
                                signals[signal.name] = signal;
                            });
                        } else if (k === "url") {
                            if (typeof v === "object") {
                                if (v.signal && signals[v.signal]) {
                                    let signal = signals[v.signal];
                                    if (signal.value) {
                                        spec.url = signal.value;
                                    }
                                }
                            }
                            spec.url = this.normalize(token.src, spec.url);
                        } else if (v && typeof v === "object") {
                            walk.call(this, v);
                        }
                    });
            }
            walk.call(this, token.spec);
        }
    }

    _resolve(fragmentPath, ref) {
        debug("resolve", fragmentPath, ref);

        if (IS_URL.test(ref)) {
            return ref;
        }

        if (path.isAbsolute(ref)) {
            return ref;
        }

        let absPath = this.normalize(fragmentPath, ref);

        if (!absPath) {
            console.error("failed to resolve [%s] (in %s)", ref, fragmentPath);
            return ref;
        }

        // We want a URL that is relative to the include path that
        // contains the asset.
        let root = this.search
            .filter(dir => absPath.startsWith(dir))
            .shift();
        let relPath = path.relative(root, absPath);

        return this.deps.root(root, "assets")(relPath);
    }

    normalize(fragmentPath, ref) {
        debug("normalize", fragmentPath, ref);
        if (IS_URL.test(ref)) {
            return ref;
        }

        if (path.isAbsolute(ref)) {
            return ref;
        }

        let fragmentDir = path.dirname(fragmentPath);
        return resolve(ref, fragmentDir, ...this.search);
    }
}
