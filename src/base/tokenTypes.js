"use strict";
const t = require("tcomb");

const {groupsOf} = require("./arrayHelpers");

let Token = t.struct({
                       $type : t.String,
                       $value: t.Any
                     }, "Token");

let TokenList     = t.list(Token);
let SequenceToken =
        t.refinement(Token, t => TokenList.is(t.$value),
                     "SequenceToken");

let ParenToken  = t.refinement(SequenceToken, t => t.$type === "paren",
                               "ParenToken");
let SquareToken = t.refinement(SequenceToken, t => t.$type === "square",
                               "SquareToken");

let AtomToken = t.refinement(Token, t => t.$type === "atom", "AtomToken");
let PairToken = t.refinement(Token, t => t.$type === "pair", "PairToken");

function preprocessUsingMacros(state, macros, t) {
  console.log("preprocess =", state);

  if (ParenToken.is(t) && AtomToken.is(t.$value[0])) {
    let name       = t.$value[0].$value;
    let maybeMacro = macros[name];
    if (maybeMacro) {
      let transformed = maybeMacro(t.$value);
      let newState    = preProcessRawToken(state, transformed);

      return newState;
    }
  }
  state.push(t);
  return state;

}

const Macros = {};

function processLetMacro(ts) {
  t.assert(ts.length > 2, "No (let) body");

  let bindings = groupsOf(2, SquareToken(ts[1]).$value)
      .reduceRight(function(s, [name, val]) {
        let $value = TokenList([
                                 {$type: "atom", $value: "with-local"},
                                 name, val, ...s]);
        return [ParenToken({$type: "paren", $value})];
      }, ts.slice(2));

  return bindings[0];
}

const DEFAULT_MACROS = {
  "let": processLetMacro
};

function preProcessRawTokenList({$type, $value}) {
  return Token({$type, $value: $value.reduce(preProcessRawToken, [])});
}

// Ensure all tokens are of proper type
function preProcessRawToken(state, raw) {
  console.log({state, raw});
  const macros = Object.assign({
                                 "paren"  : DEFAULT_MACROS,
                                 "square" : {},
                                 "curly"  : {},
                                 "comment": {},
                                 "atom"   : {},
                                 "int"    : {},
                                 "string" : {}
                               }, {});

  function witAppended(state, what) {
    //console.log("witAppended", what)
    //const preProcessed = preprocessUsingMacros(state, macros[what.$type],
    // what);
    return preprocessUsingMacros(state, macros[what.$type], what);
    //state.push(preProcessed);
    //return state;
  }

  switch (raw.$type) {
    case "paren":
      //return witAppended(state, preprocessUsingMacros(DEFAULT_MACROS,
      //                                                preProcessRawTokenList(
      //                                                    raw)));
    case "square":
    case "curly":
      return witAppended(state, preProcessRawTokenList(raw));

    case "comment":
      return state;
    default:
      return witAppended(state, Token(raw));
  }
}

function preProcess(tokens) {
  return tokens.filter(t => t.$type !== "comment")
               .reduce(preProcessRawToken, []);
}

module.exports = {
  Token,
  TokenList,
  SequenceToken,
  ParenToken,
  SquareToken,
  AtomToken,
  PairToken,

  preProcessRawTokens: preProcess
};