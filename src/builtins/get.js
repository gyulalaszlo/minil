"use strict";

const t                = require("tcomb");
const {State}          = require("../base/statementTypes");
const {toJs, manyToJs} = require("../base/toJs");
const createBuilder    = require("../base/createBuilder");
const defineBuiltin    = require("../base/defineBuiltin");


module.exports = defineBuiltin("at",
               [
                 ["key", State],
                 ["from", State]
               ],
               function(i) {
                 return toJs(this.from, i) + "[" + toJs(this.key, i) + "]";
               });

