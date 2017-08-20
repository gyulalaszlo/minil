"use strict";

const t          = require("tcomb");
const Statements = require("../base/statementTypes");

const {State, AppendToStateFn, BlockExitType, kNO_EXIT, kRETURN} = Statements;

const JsConvertible = t.interface({
                                    toJs: t.func([t.String], t.String)
                                  }, {strict: false});

const DEFAULT_OPTIONS = {
  indent    : 0,
  returnType: kNO_EXIT,
  joiner    : " ",
  prefix    : "",
  postfix   : ""
};

const OutToken = function() {
  let T = t.struct({
                     tags: t.list(t.String),
                     text: t.String
                   }, {
                     name        : "OutToken",
                     defaultProps: {tags: []}
                   });

  let TokenList = t.list(T, "TokenList");
  let Tokens    = t.struct({
                             tokens: TokenList
                           }, {
                             name        : "OutTokens",
                             defaultProps: {
                               tokens: []
                             }
                           });
  Tokens.empty = Tokens({});

  Tokens.concat = t.func([Tokens, Tokens], Tokens, "Tokens.concat()").of(function(a, b) {
    return Tokens({tokens: a.tokens.concat(b.tokens)});
  }, true);

  const ChildTokensFrom      = t.struct({path: t.list(t.String)}, {
    name        : "ChildTokensFrom",
    defaultProps: {path: []}
  });
  const TemplateSpecEntry    = t.union([ChildTokensFrom, T],
                                       "TemplateSpecEntry");
  const TemplateSpec         = t.list(TemplateSpecEntry, "TemplateSpec");
  TemplateSpecEntry.dispatch = function(x) {
    if (t.list(t.String).is(x.path)) {
      return ChildTokensFrom;
    } else if (t.String.is(x.text)) {
      return T;
    }
  };

  function _childTokensFrom(v, opts) {
    if (t.Array.is(v)) {
      return manyToJs(v, opts);
    }
    return toJs(v, opts);
  }

  function _tokensTemplate(tpl = []) {
    let fns = TemplateSpec(tpl).map(function(step) {
      return t.match(
          step,

          T, t => (_ => Tokens({tokens:[t]})),

          ChildTokensFrom, function({path: p}) {
            return function(v, opts={}) {
              let vv = v;
              for (let i = 0; i < p.length; ++i) {
                vv = vv[p[i]];
              }

              return _childTokensFrom(vv, opts)
            };
          }
      );
    });

    return function applyTemplate(v) {
      let tokenList = fns.reduce((m, f) => {
        return m.concat(f(v));
      }, []);
      console.log("%j", tokenList)
      return tokenList.reduce((m,a)=>Tokens.concat(m,a), Tokens.empty);
    };

  }

  Tokens.template = t.func([TemplateSpec], t.Function).of(_tokensTemplate);

  const TextAndTags = t.tuple([t.String, t.list(t.String)]);

  Tokens.append    = t.func([t.list(TextAndTags), Tokens], Tokens)
                      .of(function _appendWithTags(tagsTextPairs, tokens) {
                        let newTokens = tagsTextPairs.map(
                            function([text, tags]) {
                              return T({tags: tags, text: text});
                            });

                        return Tokens.concat(tokens, newTokens);

                      }, true);

  return Tokens;
}();

function toJsOptionsFrom(opts = {}) {
  t.assert(t.Object.is(opts), "opts not an object");
  return Object.assign(DEFAULT_OPTIONS, opts);

}

// -----------------------------------

function debugString(v, context = "", MAX_JSON_LEN = 60) {
  let str = JSON.stringify(v);
  if (str.length > MAX_JSON_LEN) {
    str = str.substr(0, MAX_JSON_LEN) + " ...";
  }
  let valCons = t.getTypeName(v.__proto__.constructor);
  return `[ ${context} ]: ${valCons}: ${str}`;

}

function addErrorContext(context, op, ...args) {
  try {
    return op(...args);
  } catch (e) {
    let msg = args.map(
        (v, i) => "\n\t\t" + debugString(v, `arg#${i + 1}`))
                  .join("");
    e.message += `\n\t-> in ${context}:${msg}`;
    throw e;
  }

}

// -----------------------------------
function attemptToJs(v, o) {
  let opts = toJsOptionsFrom(o);
  let s    = opts.prefix + v.toJs(o) + opts.postfix;
  let out  = OutToken({});
  return out;
  return trimEnds(setIndentForLines(opts.indent, linesOf(s)).join("\n"));
}

function toJs(v, o = DEFAULT_OPTIONS) {
  return addErrorContext("toJs()", attemptToJs, v, o);
}

// -----------------------------------

function attemptManyToJs(v, opts) {
  opts      = Object.assign(DEFAULT_OPTIONS, opts);
  let lines = v.map(vv => toJs(vv, opts));

  return trimEnds(setIndentForLines(opts.indent, lines)
                      .join(opts.joiner));
}

const manyToJs =
          t.func([t.list(State), t.Object], OutToken, "manyToJs")
           .of(function _manyToJs(v, opts = DEFAULT_OPTIONS) {
             let out  = OutToken({});
             return out;

             return addErrorContext("manyToJs()", attemptManyToJs, v, opts);
             //opts      = Object.assign(DEFAULT_OPTIONS, opts);
             //let lines = v.map(vv => toJs(vv, opts));
             //
             //return trimEnds(setIndentForLines(opts.indent, lines)
             //                    .join(opts.joiner));
           }, true);

function setIndentForLines(indentWidth, lines, indentStr = "    ") {
  //if (indentWidth <= 0) return lines;
  let indent = indentStr.repeat(t.Integer(indentWidth));
  return t.Array(lines).map(l => indent + l.trim());
}

function linesOf(str) {
  return str.split(/[\r\n]/);
}

// like String.trim(), but does not remove newline / line-break chars
function trimEnds(str) {
  return str.replace(/^[\t ]+|[\t ]+$/g, "");
}

function _prefixLines(prefix, str, lineEnd = "\n") {
  const _prefixLine = l => (l.length ? (prefix + l) : l);
  return linesOf(str)
      .map(_prefixLine)
      .join(lineEnd)
      .replace(/^[\t ]+|[\t ]+$/g, "");
}

module.exports = {
  toJs, manyToJs, prefixLines: _prefixLines,
  OutToken
};