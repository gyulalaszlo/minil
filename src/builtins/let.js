"use strict";

const t = require("tcomb");
const {State, AtomState}   = require("../base/statementTypes");
const {BlockState} =  require('../base/block');

function tupleBuilderTypes(baseName, stepTypeExtensions, stepFns) {

  let steps                 = [t.struct({}, `${baseName}/0`)];
  steps[0].prototype.append = stepFns[0];
  let last                  = stepFns.reduce(function(previousType, stepFn, i) {
    let extensionsThisRound      = stepTypeExtensions[i];
    let stepType                 = previousType.extend(extensionsThisRound,
                                                       `${baseName}/${i + 1}`);
    previousType.prototype.$next = stepType;
    stepType.prototype.append    = stepFns[i + 1];
    stepType.prototype.kind      = i;

    steps.push(stepType);
    return stepType;
  }, steps[0]);
  steps.last                = last;
  return steps;
}

const LetStates = tupleBuilderTypes(
    "Builtins.Let",
    [{name: t.String}, {value: State}],
    [
      function(what) {
        if (!AtomState.is(what)) {
          throw new Error("First argument for `let` must be an atom");
        }
        return this.$next({name: what.atom});
      },
      function(what) {
        return BlockState({locals: [{name: this.name, value: what}]});
      }

    ]);




module.exports = LetStates;