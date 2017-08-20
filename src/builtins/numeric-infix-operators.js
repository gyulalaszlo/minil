"use strict";

const t                = require("tcomb");
const {State}          = require("../base/statementTypes");
const {toJs, manyToJs} = require("../base/toJs");
const createBuilder    = require("../base/createBuilder");
const defineBuiltin    = require("../base/defineBuiltin");

function infixOperator(name, jsForm) {
  let T = t.struct({
                     args: t.list(State)
                   }, {
                     name        : "infix/" + name,
                     defaultProps: {args: []}
                   });

  T.prototype.append = function(what) {
    return T.update(this, {args: {$push: [what]}});
  };

  T.prototype.toJs = function(i) {
    return '(' + manyToJs(this.args, {indent: i, joiner: ' ' + jsForm + ' '}) + ')';
  };

  return {
    union: T,
    empty: T({})
  };
}

let numericInfixOps = {
  "*": infixOperator("Multiply", "*"),
  "/": infixOperator("Division", "/"),
  "+": infixOperator("Plus", "+"),
  "-": infixOperator("Minus", "-"),
  "%": infixOperator("Modulo", "%"),
};

let unionType = t.union(Object.keys(numericInfixOps)
                              .map(k => numericInfixOps[k].union),
                        "NumericInfixOps");

let empties = Object.keys(numericInfixOps)
    .reduce((o, k) => {
      o[k] = numericInfixOps[k].empty;
      return o;
    }, {});

module.exports = {
  empties: empties,
  union  : unionType
};

//defineBuiltin("*",
//                           [
//                             ["key", State],
//                             ["from", State]
//                           ],
//                           function(i) {
//                             return toJs(this.from, i) + "[" +
//                                 toJs(this.key, i) + "]";
//                           });
