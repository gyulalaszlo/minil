"use strict";
const t = require("tcomb");

const {groupsOf} = require("./arrayHelpers");

let Token = t.struct({
                       $type : t.String,
                       $value: t.Any
                     }, "Token");

function tokenType(token) { return Token(token).$type; }

function tokenValue(token) { return Token(token).$value; }

let TokenList     = t.list(Token);
let SequenceToken = t.refinement(Token, t => TokenList.is(t.$value),
                                 "SequenceToken");
let ParenToken    = t.refinement(SequenceToken, t => t.$type === "paren",
                                 "ParenToken");
let SquareToken   = t.refinement(SequenceToken, t => t.$type === "square",
                                 "SquareToken");

let AtomToken = t.refinement(Token, t => t.$type === "atom", "AtomToken");
let PairToken = t.refinement(Token, t => t.$type === "pair", "PairToken");

function preprocessUsingMacros(macros, t) {
  if (ParenToken.is(t) && AtomToken.is(t.$value[0])) {
    let name       = t.$value[0].$value;
    let maybeMacro = macros[name];
    if (maybeMacro) {
      return preProcessRawTokens(maybeMacro(t.$value));
    }
  }

  return t;
}

const DEFAULT_MACROS = {
  "let": function(ts) {
    t.assert(ts.length > 2, "No (let) body");

    let bindings = groupsOf(2, SquareToken(ts[1]).$value)
        .reduceRight(function(s, [name, val]) {
          return [
            ParenToken({
                         $type : "paren",
                         $value: TokenList([
                           {$type: "atom", $value: "with-local"},
                           name,
                           val,
                           ...s])
                       })];
        }, ts.slice(2));

    return bindings[0];
  }
};

// Ensure all tokens are of proper type
function preProcessRawTokens(raw) {
  let {$type, $value} = raw;
  switch (raw.$type) {
    case "paren":
      return preprocessUsingMacros(DEFAULT_MACROS, Token(
          {$type, $value: $value.map(preProcessRawTokens)}));
    case "square":
    case "curly":
      return Token({$type, $value: $value.map(preProcessRawTokens)});
    default:
      return Token(raw);
  }
}

module.exports = {
  Token,
  TokenList,
  SequenceToken,
  ParenToken,
  SquareToken,
  AtomToken,
  PairToken,

  preProcessRawTokens
};