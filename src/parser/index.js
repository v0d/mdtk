"use strict";

module.exports = function (mdtk) {
    var options = mdtk.options;

    var md = require("markdown-it")({
        html: true,
        linkify: true,
        typographer: true,
        highlight: require("./highlight")
    });

    md.use(require("./atrule"));
    md.use(require("./srcmap"));

    md.use(require("markdown-it-attrs"));
    md.use(require("markdown-it-anchor"));
    md.use(require("markdown-it-table-of-contents"));

    if (options.plantuml) {
        md.use(require("markdown-it-plantuml"));
    }

    if (options.vega) {
        md.use(require("./vega"));
    }

    md.use(require("./handlebars"), {
        vars: options.vars,
        include: options.include
    });

    md.use(require("./hr"));

    if (options.containers) {
        md.use(require("./containers"));
    }

    return md;
};