"use strict";

const t = require('tcomb');
const createBuilder = require('./createBuilder');

function _defineBuiltin(name, fields, toJsFn) {

  const fieldNames = fields.map(v => v[0]);
  const fieldTypes = fields.map(v => v[1]);
  function _set(k, v, o) {
    o[k] = v;
    return o;
  }
  const T = t.struct(fields.reduce((o,[k,t])=> _set(k,t,o), {}), "builtins/" + name);

  T.prototype.toJs = toJsFn;

  function construct(...args) {
    return T(args.reduce((o,arg,i)=> _set(fieldNames[i], arg, o), {}));
  }

  return createBuilder(fieldTypes, T, construct);

}


module.exports = _defineBuiltin;