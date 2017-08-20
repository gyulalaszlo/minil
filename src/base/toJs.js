"use strict";

const t = require("tcomb");

const JsConvertible = t.interface({
                                    toJs: t.func([t.String], t.String)
                                  }, {strict: false});

function toJs(v, indent = "") {
  try {
    let s = v.toJs("");
    return _prefixLines(indent, s);
  } catch (e) {
    let debugValue   = JSON.stringify(v);
    let MAX_JSON_LEN = 60;
    if (debugValue.length > MAX_JSON_LEN) {
      debugValue = debugValue.substr(0, MAX_JSON_LEN) + " ...";
    }
    let valCons = t.getTypeName(v.__proto__.constructor);
    e.message += `\n\t-> \`${valCons} :: toJs()\`: ${debugValue}`;
    throw e;
  }
}

function manyToJs(v, opts)
{
  let {
        indent          = "",
        joiner          = "",
        incrementIndent = "",
        prefix          = "",
        postfix         = ""
      }           = opts;
  let localIndent = incrementIndent;
  let lines       = v.map(vv => toJs(vv, localIndent))
                     .map(vv => prefix + vv + postfix)
                     .join(joiner);
  return _prefixLines(indent, lines);
}

function _prefixLines(prefix, str, lineEnd = "\n") {
  let lines         = str.split(/[\r\n]/);
  const _prefixLine = l => (l.length ? (prefix + l) : l);
  return lines
      .map(_prefixLine)
      .join(lineEnd)
      .replace(/[\t ]+$/, '')
      .replace(/^[\t ]+/, '');
}

module.exports = {
  toJs, manyToJs
};