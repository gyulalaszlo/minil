"use strict";
const t = require("tcomb");

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

// Ensure all tokens are of proper type
function preProcessRawTokens(raw) {
  let {$type, $value} = raw;
  switch (raw.$type) {
    case "square":
    case "paren":
    case "curly":
      return Token({$type, $value: $value.map(preProcessRawTokens)});
    default:
      return Token(raw);
  }
}

module.exports = {
  Token, TokenList, SequenceToken, ParenToken, SquareToken, AtomToken, PairToken,

  preProcessRawTokens
};