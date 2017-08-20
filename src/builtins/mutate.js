"use strict";

const t                = require("tcomb");
const {State}          = require("../base/statementTypes");
const {toJs, manyToJs} = require("../base/toJs");
const createBuilder    = require("../base/createBuilder");
const defineBuiltin    = require("../base/defineBuiltin");

//const builtinsByName =
//          defineBuiltin("set!", [["ref", State], ["to", State]],
//                        function(i) {
//                          return toJs(this.ref, i) + " = " + toJs(this.to, i);
//                        });

let mutators = {
  "set!": defineBuiltin("set!",
                        [["ref", State], ["to", State]],
                        function(i) {
                          return toJs(this.ref, i) + " = " + toJs(this.to, i);
                        })
  //"/": infixOperator("Division", "/"),
  //"+": infixOperator("Plus", "+"),
  //"-": infixOperator("Minus", "-"),
  //"%": infixOperator("Modulo", "%")
};

function exportsFromBuiltins(mutators) {

  let keys = Object.keys(mutators);

  let unionType;
  switch (keys.length) {
    case 0:
      throw new Error("Zero entries for builtin exports.")

    case 1:
      unionType = mutators[keys[0]].union;
      break;

    default:
      unionType = t.union(keys.map(k => mutators[k].union), "NumericInfixOps");
  }

  let empties = Object.keys(mutators)
                      .reduce((o, k) => {
                        o[k] = mutators[k].empty;
                        return o;
                      }, {});

  return {
    empties: empties,
    union  : unionType
  };
}

module.exports = exportsFromBuiltins(mutators);
